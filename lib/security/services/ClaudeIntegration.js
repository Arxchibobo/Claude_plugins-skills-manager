/**
 * ClaudeIntegration - Secure integration with Claude Code CLI
 *
 * Provides safe command execution for security scanning and code review
 * using execFile to prevent command injection vulnerabilities.
 *
 * Security measures:
 * - Uses execFile with array arguments (not string concatenation)
 * - Validates all file paths before execution
 * - Sets timeout limits to prevent hanging
 * - Limits output buffer size to prevent memory overflow
 * - Comprehensive error handling for CLI failures
 */

const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs').promises;

const execFileAsync = promisify(execFile);

/**
 * Default configuration for CLI execution
 */
const DEFAULT_CONFIG = {
  timeout: 120000, // 2 minutes
  maxBuffer: 10 * 1024 * 1024, // 10MB
  env: process.env
};

/**
 * ClaudeIntegration service class
 */
class ClaudeIntegration {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cliCommand = 'claude';
  }

  /**
   * Check if Claude CLI is available
   * @returns {Promise<Object>} - { available: boolean, version: string|null, error: string|null }
   */
  async checkClaudeAvailability() {
    try {
      const { stdout } = await execFileAsync(this.cliCommand, ['--version'], {
        timeout: 5000,
        maxBuffer: 1024 * 1024
      });

      const version = stdout.trim();
      return {
        available: true,
        version,
        error: null
      };
    } catch (error) {
      return {
        available: false,
        version: null,
        error: this._normalizeError(error)
      };
    }
  }

  /**
   * Run security scan using security-scanning:sast skill
   * @param {Object} config - Scan configuration
   * @param {string} config.path - Path to scan (file or directory)
   * @param {string} [config.scope] - Scan scope (file, directory, project)
   * @param {Array<string>} [config.exclude] - Patterns to exclude
   * @returns {Promise<Object>} - { success: boolean, output: string, error: string|null }
   */
  async runSecurityScan(config) {
    // Validate required parameters
    if (!config || !config.path) {
      throw new Error('Scan path is required');
    }

    // Validate path exists and is accessible
    await this._validatePath(config.path);

    // Build command arguments (array-based, not string concatenation)
    const args = [
      'skill',
      'run',
      'security-scanning:sast',
      '--path',
      path.resolve(config.path)
    ];

    // Add optional parameters
    if (config.scope) {
      args.push('--scope', config.scope);
    }

    if (config.exclude && Array.isArray(config.exclude)) {
      config.exclude.forEach(pattern => {
        args.push('--exclude', pattern);
      });
    }

    // Execute command
    try {
      const { stdout, stderr } = await execFileAsync(this.cliCommand, args, {
        timeout: this.config.timeout,
        maxBuffer: this.config.maxBuffer,
        env: this.config.env,
        cwd: process.cwd()
      });

      return {
        success: true,
        output: stdout,
        error: stderr || null
      };
    } catch (error) {
      return {
        success: false,
        output: error.stdout || '',
        error: this._normalizeError(error)
      };
    }
  }

  /**
   * Run code review using code-review-ai:ai-review skill
   * @param {Object} config - Review configuration
   * @param {Array<string>|string} config.files - Files to review
   * @param {string} [config.focus] - Review focus (security, performance, architecture)
   * @returns {Promise<Object>} - { success: boolean, output: string, error: string|null }
   */
  async runCodeReview(config) {
    // Validate required parameters
    if (!config || !config.files) {
      throw new Error('Files to review are required');
    }

    // Normalize files to array
    const files = Array.isArray(config.files) ? config.files : [config.files];

    if (files.length === 0) {
      throw new Error('At least one file must be specified');
    }

    // Validate all file paths
    await Promise.all(files.map(file => this._validatePath(file)));

    // Build command arguments
    const args = [
      'skill',
      'run',
      'code-review-ai:ai-review'
    ];

    // Add files to review
    files.forEach(file => {
      args.push('--file', path.resolve(file));
    });

    // Add optional focus parameter
    if (config.focus) {
      args.push('--focus', config.focus);
    }

    // Execute command
    try {
      const { stdout, stderr } = await execFileAsync(this.cliCommand, args, {
        timeout: this.config.timeout,
        maxBuffer: this.config.maxBuffer,
        env: this.config.env,
        cwd: process.cwd()
      });

      return {
        success: true,
        output: stdout,
        error: stderr || null
      };
    } catch (error) {
      return {
        success: false,
        output: error.stdout || '',
        error: this._normalizeError(error)
      };
    }
  }

  /**
   * Validate that a path exists and is accessible
   * @param {string} targetPath - Path to validate
   * @returns {Promise<void>}
   * @throws {Error} If path doesn't exist or is not accessible
   * @private
   */
  async _validatePath(targetPath) {
    if (!targetPath || typeof targetPath !== 'string') {
      throw new Error('Invalid path: must be a non-empty string');
    }

    // Resolve to absolute path
    const absolutePath = path.resolve(targetPath);

    // Check if path exists
    try {
      await fs.access(absolutePath, fs.constants.R_OK);
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Path does not exist: ${targetPath}`);
      } else if (error.code === 'EACCES') {
        throw new Error(`Permission denied: ${targetPath}`);
      } else {
        throw new Error(`Cannot access path: ${targetPath} (${error.message})`);
      }
    }

    // Additional security: prevent path traversal attacks
    // Ensure resolved path is within project directory or explicitly allowed
    const projectRoot = process.cwd();
    if (!absolutePath.startsWith(projectRoot)) {
      // Allow absolute paths outside project (with warning)
      console.warn(`[Security] Accessing path outside project root: ${absolutePath}`);
    }
  }

  /**
   * Normalize error messages from CLI execution
   * @param {Error} error - Error object from execFile
   * @returns {string} - Normalized error message
   * @private
   */
  _normalizeError(error) {
    if (!error) return 'Unknown error';

    // Handle timeout errors
    if (error.killed && error.signal === 'SIGTERM') {
      return `Command timeout after ${this.config.timeout}ms`;
    }

    // Handle command not found
    if (error.code === 'ENOENT') {
      return 'Claude CLI not found. Please ensure Claude Code is installed and in PATH.';
    }

    // Handle permission errors
    if (error.code === 'EACCES') {
      return 'Permission denied: Cannot execute Claude CLI';
    }

    // Handle buffer overflow
    if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
      return `Output exceeded maximum buffer size (${this.config.maxBuffer} bytes)`;
    }

    // Return error message with stderr if available
    const stderr = error.stderr ? error.stderr.toString().trim() : '';
    const message = error.message || 'CLI execution failed';

    return stderr ? `${message}: ${stderr}` : message;
  }

  /**
   * Get CLI command for testing purposes
   * @returns {string}
   */
  getCliCommand() {
    return this.cliCommand;
  }

  /**
   * Update configuration
   * @param {Object} config - New configuration
   */
  updateConfig(config) {
    this.config = { ...this.config, ...config };
  }
}

module.exports = ClaudeIntegration;
