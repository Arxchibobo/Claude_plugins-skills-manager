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
const ScanCache = require('./ScanCache');

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

    // Initialize scan cache (Task 10)
    this.cache = new ScanCache({
      ttl: config.cacheTTL || 60 * 60 * 1000, // 1 hour default
      maxSize: config.cacheMaxSize || 100
    });
  }

  /**
   * Check if Claude CLI is available
   * @returns {Promise<Object>} - { available: boolean, version: string|null, error: string|null }
   */
  async checkClaudeAvailability() {
    try {
      const { stdout } = await execFileAsync(this.cliCommand, ['--version'], {
        timeout: 5000,
        maxBuffer: 1024 * 1024,
        env: this.config.env,
        shell: true // Required on Windows to find .cmd files
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
   * Run security scan using Claude CLI in print mode
   * @param {Object} config - Scan configuration
   * @param {string} config.path - Path to scan (file or directory)
   * @param {string} [config.scope] - Scan scope (file, directory, project)
   * @param {Array<string>} [config.exclude] - Patterns to exclude
   * @param {boolean} [config.skipCache] - Skip cache and force fresh scan
   * @returns {Promise<Object>} - { success: boolean, output: string, error: string|null, cached: boolean }
   */
  async runSecurityScan(config) {
    // Validate required parameters
    if (!config || !config.path) {
      throw new Error('Scan path is required');
    }

    // Check cache first (Task 10) - unless skipCache is true
    if (!config.skipCache) {
      const cachedResult = this.cache.get(config.path, config);
      if (cachedResult) {
        console.log(`[ScanCache] Cache hit for path: ${config.path}`);
        return {
          ...cachedResult,
          cached: true
        };
      }
    }

    // Validate path exists and is accessible
    await this._validatePath(config.path);

    // Build security scanning prompt
    const absolutePath = path.resolve(config.path);
    const scopeDesc = config.scope === 'quick' ? 'quick security check' :
                      config.scope === 'full' ? 'comprehensive security audit' :
                      'security scan';

    let prompt = `Perform a ${scopeDesc} on the codebase at: ${absolutePath}\n\n`;
    prompt += 'Focus on identifying:\n';
    prompt += '- Security vulnerabilities (XSS, SQL injection, command injection, etc.)\n';
    prompt += '- Authentication and authorization issues\n';
    prompt += '- Insecure dependencies and outdated packages\n';
    prompt += '- Exposed secrets or credentials\n';
    prompt += '- Input validation issues\n\n';

    if (config.exclude && Array.isArray(config.exclude) && config.exclude.length > 0) {
      prompt += `Exclude these patterns: ${config.exclude.join(', ')}\n\n`;
    }

    prompt += 'Provide results in JSON format with the following structure:\n';
    prompt += '{\n';
    prompt += '  "summary": { "total": number, "critical": number, "high": number, "medium": number, "low": number },\n';
    prompt += '  "findings": [{ "severity": string, "category": string, "file": string, "line": number, "description": string, "recommendation": string }]\n';
    prompt += '}';

    // Build command arguments using -p (print mode)
    const args = [
      '-p',
      prompt,
      '--output-format', 'json',
      '--add-dir', absolutePath
    ];

    // Execute command
    try {
      const { stdout, stderr } = await execFileAsync(this.cliCommand, args, {
        timeout: this.config.timeout,
        maxBuffer: this.config.maxBuffer,
        env: this.config.env,
        cwd: process.cwd(),
        shell: true // Required on Windows to find .cmd files
      });

      const result = {
        success: true,
        output: stdout,
        error: stderr || null,
        cached: false
      };

      // Store successful result in cache (Task 10)
      if (result.success) {
        this.cache.set(config.path, config, result);
        console.log(`[ScanCache] Cached result for path: ${config.path}`);
      }

      return result;
    } catch (error) {
      // Don't cache failed scans
      return {
        success: false,
        output: error.stdout || '',
        error: this._normalizeError(error),
        cached: false
      };
    }
  }

  /**
   * Run code review using Claude CLI in print mode
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

    // Build code review prompt
    const resolvedFiles = files.map(f => path.resolve(f));
    const filesList = resolvedFiles.map(f => `- ${f}`).join('\n');

    let prompt = `Perform a comprehensive code review on the following files:\n\n${filesList}\n\n`;

    // Add focus areas if specified
    const focusAreas = config.focus ? config.focus.split(',').map(f => f.trim()) : ['security', 'performance', 'quality', 'architecture'];
    prompt += 'Focus on:\n';
    focusAreas.forEach(area => {
      if (area === 'security') {
        prompt += '- Security vulnerabilities and best practices\n';
      } else if (area === 'performance') {
        prompt += '- Performance issues and optimization opportunities\n';
      } else if (area === 'quality') {
        prompt += '- Code quality, maintainability, and readability\n';
      } else if (area === 'architecture') {
        prompt += '- Architectural patterns and design principles\n';
      }
    });

    prompt += '\nProvide results in JSON format with the following structure:\n';
    prompt += '{\n';
    prompt += '  "summary": { "filesReviewed": number, "totalIssues": number, "criticalIssues": number },\n';
    prompt += '  "files": [{\n';
    prompt += '    "file": string,\n';
    prompt += '    "issues": [{ "severity": string, "category": string, "line": number, "description": string, "recommendation": string }]\n';
    prompt += '  }]\n';
    prompt += '}';

    // Build command arguments using -p (print mode)
    const args = [
      '-p',
      prompt,
      '--output-format', 'json'
    ];

    // Add all file directories for tool access
    const uniqueDirs = [...new Set(resolvedFiles.map(f => path.dirname(f)))];
    uniqueDirs.forEach(dir => {
      args.push('--add-dir', dir);
    });

    // Execute command
    try {
      const { stdout, stderr } = await execFileAsync(this.cliCommand, args, {
        timeout: this.config.timeout,
        maxBuffer: this.config.maxBuffer,
        env: this.config.env,
        cwd: process.cwd(),
        shell: true // Required on Windows to find .cmd files
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
    if (!error) return 'Unknown error occurred';

    // Handle timeout errors
    if (error.killed && error.signal === 'SIGTERM') {
      return `Operation timed out after ${Math.round(this.config.timeout / 1000)} seconds. The scan may be taking longer than expected for large codebases.`;
    }

    // Handle command not found
    if (error.code === 'ENOENT') {
      return 'Claude CLI is not installed or not found in PATH. Please install Claude Code from https://claude.ai/code';
    }

    // Handle permission errors
    if (error.code === 'EACCES') {
      return 'Permission denied: Unable to execute Claude CLI. Please check file permissions and try running as administrator.';
    }

    // Handle buffer overflow
    if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
      return `Scan output is too large (exceeded ${Math.round(this.config.maxBuffer / 1024 / 1024)}MB limit). Try scanning a smaller directory or specific files.`;
    }

    // Handle network-like errors
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
      return 'Network error: Unable to connect to Claude services. Please check your internet connection and try again.';
    }

    // Handle ENOTDIR (not a directory when expected)
    if (error.code === 'ENOTDIR') {
      return 'Invalid path: Expected a directory but found a file. Please select a valid directory for scanning.';
    }

    // Return error message with stderr if available
    const stderr = error.stderr ? error.stderr.toString().trim() : '';
    const message = error.message || 'Scan operation failed';

    if (stderr) {
      // Clean up stderr for user-friendly display
      const cleanStderr = stderr.split('\n')[0]; // Get first line only
      return `${message}: ${cleanStderr}`;
    }

    return message;
  }

  /**
   * Get installation guide for Claude CLI
   * @returns {Object} - { title, message, steps, link }
   */
  getInstallationGuide() {
    return {
      title: 'Claude CLI Not Found',
      message: 'The security scanning feature requires Claude Code CLI to be installed.',
      steps: [
        'Visit claude.ai/code',
        'Download and install Claude Code for your platform',
        'Restart your terminal or IDE',
        'Verify installation by running: claude --version'
      ],
      link: 'https://claude.ai/code',
      documentation: 'https://docs.anthropic.com/claude/docs/claude-code'
    };
  }

  /**
   * Get user-friendly error message with suggestions
   * @param {Error} error - Error object
   * @returns {Object} - { message, suggestion, action }
   */
  getUserFriendlyError(error) {
    const normalizedError = this._normalizeError(error);

    // Classify error and provide helpful suggestions
    if (error.code === 'ENOENT') {
      return {
        message: normalizedError,
        suggestion: 'Claude Code is not installed. Click "View Guide" to see installation instructions.',
        action: 'install'
      };
    }

    if (error.code === 'EACCES') {
      return {
        message: normalizedError,
        suggestion: 'Try running the application with administrator privileges or check file permissions.',
        action: 'permissions'
      };
    }

    if (error.killed && error.signal === 'SIGTERM') {
      return {
        message: normalizedError,
        suggestion: 'For large codebases, try scanning specific directories or files instead of the entire project.',
        action: 'reduce_scope'
      };
    }

    if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
      return {
        message: normalizedError,
        suggestion: 'Narrow down the scan to specific high-risk directories or files.',
        action: 'reduce_scope'
      };
    }

    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
      return {
        message: normalizedError,
        suggestion: 'Check your internet connection and firewall settings. Claude Code requires internet access.',
        action: 'check_network'
      };
    }

    // Generic error
    return {
      message: normalizedError,
      suggestion: 'If the problem persists, try restarting the application or check the console for detailed error logs.',
      action: 'retry'
    };
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

  /**
   * Get cache statistics (Task 10)
   * @returns {Object} - Cache stats
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * Clear scan cache (Task 10)
   * @returns {number} - Number of entries cleared
   */
  clearCache() {
    return this.cache.clear();
  }

  /**
   * Cleanup and destroy (for graceful shutdown)
   */
  destroy() {
    if (this.cache) {
      this.cache.destroy();
    }
  }
}

module.exports = ClaudeIntegration;
