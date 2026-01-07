const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const os = require('os');
const Extension = require('../models/Extension');

/**
 * ExtensionManager
 *
 * Manages local extension registry with atomic writes and file locking.
 * Handles installation, uninstallation, and updates of extensions.
 *
 * Features:
 * - Atomic registry writes with file locking
 * - Concurrent access protection
 * - Extension lifecycle management
 * - Security validations
 */
class ExtensionManager {
  /**
   * Create an ExtensionManager
   * @param {object} config - Configuration options
   * @param {string} config.registryPath - Path to registry file
   * @param {string} config.extensionsDir - Directory for installed extensions
   */
  constructor(config = {}) {
    // Use user home directory instead of cwd for security
    const homeDir = os.homedir();
    const baseDir = path.join(homeDir, '.claude');

    this.registryPath = config.registryPath || path.join(
      baseDir,
      'extensions',
      'registry.json'
    );

    this.extensionsDir = config.extensionsDir || path.join(
      baseDir,
      'extensions',
      'installed'
    );

    // Registry state
    this.registry = new Map(); // id -> Extension
    this.isLoaded = false;

    // File locking state
    this.lockPath = `${this.registryPath}.lock`;
    this.lockAcquireTimeout = 5000; // 5 seconds

    // Write queue for atomic operations
    this.isSaving = false;
    this.savePending = false;
  }

  /**
   * Initialize the manager - create directories and load registry
   * @returns {Promise<void>}
   */
  async initialize() {
    // Ensure directories exist
    await this._ensureDirectories();

    // Load existing registry
    await this.loadRegistry();
  }

  /**
   * Ensure required directories exist
   * @private
   */
  async _ensureDirectories() {
    const dirs = [
      path.dirname(this.registryPath),
      this.extensionsDir
    ];

    for (const dir of dirs) {
      try {
        // Use 0o700 for owner-only access to protect sensitive data
        await fsPromises.mkdir(dir, { recursive: true, mode: 0o700 });
      } catch (error) {
        if (error.code !== 'EEXIST') {
          throw new Error(`Failed to create directory ${dir}: ${error.message}`);
        }
      }
    }
  }

  /**
   * Acquire file lock with timeout
   * @private
   * @returns {Promise<void>}
   */
  async _acquireLock() {
    const startTime = Date.now();

    while (Date.now() - startTime < this.lockAcquireTimeout) {
      try {
        // Try to create lock file exclusively
        await fsPromises.writeFile(
          this.lockPath,
          JSON.stringify({ pid: process.pid, timestamp: Date.now() }),
          { flag: 'wx', mode: 0o644 }
        );

        this.isLocked = true;
        return;
      } catch (error) {
        if (error.code === 'EEXIST') {
          // Lock file exists, check if it's stale
          try {
            const lockData = JSON.parse(
              await fsPromises.readFile(this.lockPath, 'utf8')
            );

            const lockAge = Date.now() - lockData.timestamp;

            // If lock is older than 30 seconds, consider it stale
            if (lockAge > 30000) {
              await this._releaseLock();
              continue;
            }
          } catch (readError) {
            // Lock file is corrupted, remove it
            await this._releaseLock();
            continue;
          }

          // Wait and retry
          await new Promise(resolve => setTimeout(resolve, 100));
        } else {
          throw error;
        }
      }
    }

    throw new Error('Failed to acquire registry lock within timeout');
  }

  /**
   * Release file lock
   * @private
   */
  async _releaseLock() {
    try {
      await fsPromises.unlink(this.lockPath);
      this.isLocked = false;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn('[ExtensionManager] Failed to release lock:', error.message);
      }
    }
  }

  /**
   * Load registry from disk
   * @returns {Promise<void>}
   */
  async loadRegistry() {
    try {
      await this._acquireLock();

      try {
        const data = await fsPromises.readFile(this.registryPath, 'utf8');
        const parsed = JSON.parse(data);

        // Validate structure
        if (!parsed.version || !Array.isArray(parsed.extensions)) {
          throw new Error('Invalid registry format');
        }

        // Load extensions into Map
        this.registry.clear();
        for (const extData of parsed.extensions) {
          const extension = Extension.fromJSON(extData);
          this.registry.set(extension.id, extension);
        }

        this.isLoaded = true;
      } catch (error) {
        if (error.code === 'ENOENT') {
          // Registry doesn't exist yet, initialize empty
          this.registry.clear();
          this.isLoaded = true;
        } else {
          throw error;
        }
      }
    } finally {
      await this._releaseLock();
    }
  }

  /**
   * Save registry to disk with atomic write
   * @returns {Promise<void>}
   */
  async saveRegistry() {
    // Queue mechanism to prevent concurrent saves
    if (this.isSaving) {
      this.savePending = true;
      return;
    }

    this.isSaving = true;

    try {
      // Loop to process queued saves without recursion
      while (true) {
        this.savePending = false; // Reset flag before work

        await this._acquireLock();

        try {
          const registryData = {
            version: '1.0.0',
            lastUpdated: new Date().toISOString(),
            extensions: Array.from(this.registry.values()).map(ext => ext.toJSON())
          };

          // Atomic write: write to temp file then rename
          const tempPath = `${this.registryPath}.tmp.${Date.now()}`;

          await fsPromises.writeFile(
            tempPath,
            JSON.stringify(registryData, null, 2),
            { mode: 0o600 }
          );

          // Atomic rename
          await fsPromises.rename(tempPath, this.registryPath);
        } finally {
          await this._releaseLock();
        }

        // If no new save was requested while we were working, break
        if (!this.savePending) {
          break;
        }
      }
    } finally {
      this.isSaving = false;
    }
  }

  /**
   * Get all installed extensions
   * @returns {Array<Extension>}
   */
  getInstalledExtensions() {
    return Array.from(this.registry.values()).filter(ext => ext.isInstalled);
  }

  /**
   * Get extension by ID
   * @param {string} id - Extension ID (owner/repo format)
   * @returns {Extension|null}
   */
  getExtension(id) {
    return this.registry.get(id) || null;
  }

  /**
   * Check if extension is installed
   * @param {string} id - Extension ID
   * @returns {boolean}
   */
  isInstalled(id) {
    const ext = this.registry.get(id);
    return ext ? ext.isInstalled : false;
  }

  /**
   * Add or update extension in registry
   * @param {Extension} extension - Extension object
   * @returns {Promise<void>}
   */
  async addExtension(extension) {
    if (!(extension instanceof Extension)) {
      throw new Error('Invalid extension object');
    }

    // Store previous state for rollback
    const previous = this.registry.get(extension.id);

    // Optimistic update
    this.registry.set(extension.id, extension);

    try {
      await this.saveRegistry();
    } catch (error) {
      // Rollback on failure
      if (previous) {
        this.registry.set(extension.id, previous);
      } else {
        this.registry.delete(extension.id);
      }
      throw new Error(`Failed to save extension: ${error.message}`);
    }
  }

  /**
   * Remove extension from registry
   * @param {string} id - Extension ID
   * @returns {Promise<boolean>} - Returns true if removed, false if not found
   */
  async removeExtension(id) {
    const existed = this.registry.delete(id);

    if (existed) {
      await this.saveRegistry();
    }

    return existed;
  }

  /**
   * Update extension properties
   * @param {string} id - Extension ID
   * @param {object} updates - Properties to update
   * @returns {Promise<Extension|null>}
   */
  async updateExtension(id, updates) {
    const extension = this.registry.get(id);

    if (!extension) {
      return null;
    }

    // Store original state for rollback (shallow clone)
    const originalState = { ...extension };

    // Apply updates
    Object.assign(extension, updates);

    try {
      await this.saveRegistry();
      return extension;
    } catch (error) {
      // Rollback on failure
      Object.assign(extension, originalState);
      throw new Error(`Failed to update extension: ${error.message}`);
    }
  }

  /**
   * Get registry statistics
   * @returns {object}
   */
  getStats() {
    const extensions = Array.from(this.registry.values());

    return {
      total: extensions.length,
      installed: extensions.filter(e => e.isInstalled).length,
      byType: {
        plugin: extensions.filter(e => e.type === 'plugin').length,
        skill: extensions.filter(e => e.type === 'skill').length,
        command: extensions.filter(e => e.type === 'command').length,
        agent: extensions.filter(e => e.type === 'agent').length
      }
    };
  }

  /**
   * Validate extension manifest
   * @param {object} manifest - Manifest object to validate
   * @returns {object} - { valid: boolean, errors: string[] }
   */
  validateManifest(manifest) {
    const errors = [];

    // Validate manifest exists
    if (!manifest || typeof manifest !== 'object') {
      return { valid: false, errors: ['Manifest is not a valid object'] };
    }

    // Required fields validation (Requirement 8.2)
    const requiredFields = ['type', 'name', 'version', 'description', 'author'];

    for (const field of requiredFields) {
      if (!manifest[field] || typeof manifest[field] !== 'string') {
        errors.push(`Required field '${field}' is missing or invalid`);
      }
    }

    // Validate type enum
    if (manifest.type) {
      const validTypes = ['plugin', 'skill', 'command', 'agent'];
      if (!validTypes.includes(manifest.type)) {
        errors.push(`Invalid type '${manifest.type}'. Must be one of: ${validTypes.join(', ')}`);
      }
    }

    // Validate version format (semver)
    if (manifest.version && typeof manifest.version === 'string') {
      const semverRegex = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/;
      if (!semverRegex.test(manifest.version)) {
        errors.push(`Invalid version format '${manifest.version}'. Must follow semver (e.g., 1.0.0)`);
      }
    }

    // Optional fields validation (Requirement 8.3)
    const optionalFields = {
      displayName: 'string',
      icon: 'string',
      repository: 'string',
      entryPoint: 'string'
    };

    for (const [field, expectedType] of Object.entries(optionalFields)) {
      if (manifest[field] !== undefined && typeof manifest[field] !== expectedType) {
        errors.push(`Optional field '${field}' must be a ${expectedType}`);
      }
    }

    // Validate engines object
    if (manifest.engines !== undefined) {
      if (typeof manifest.engines !== 'object' || Array.isArray(manifest.engines)) {
        errors.push('Field \'engines\' must be an object');
      } else if (manifest.engines['claude-code']) {
        // Validate semver range format
        const rangeRegex = /^[\^~>=<*]?[\d.x*-]+(\s*\|\|\s*[\^~>=<*]?[\d.x*-]+)*$/;
        if (!rangeRegex.test(manifest.engines['claude-code'])) {
          errors.push(`Invalid engines.claude-code version range '${manifest.engines['claude-code']}'`);
        }
      }
    }

    // Validate permissions array
    if (manifest.permissions !== undefined) {
      if (!Array.isArray(manifest.permissions)) {
        errors.push('Field \'permissions\' must be an array');
      } else {
        manifest.permissions.forEach((perm, idx) => {
          if (typeof perm !== 'string') {
            errors.push(`Permission at index ${idx} must be a string`);
          }
        });
      }
    }

    // Validate keywords array
    if (manifest.keywords !== undefined) {
      if (!Array.isArray(manifest.keywords)) {
        errors.push('Field \'keywords\' must be an array');
      } else {
        manifest.keywords.forEach((keyword, idx) => {
          if (typeof keyword !== 'string') {
            errors.push(`Keyword at index ${idx} must be a string`);
          }
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Parse and validate manifest file content
   * @param {string} manifestContent - Raw manifest JSON string
   * @returns {object} - { valid: boolean, manifest: object|null, errors: string[] }
   */
  parseManifest(manifestContent) {
    try {
      const manifest = JSON.parse(manifestContent);
      const validation = this.validateManifest(manifest);

      return {
        valid: validation.valid,
        manifest: validation.valid ? manifest : null,
        errors: validation.errors
      };
    } catch (error) {
      return {
        valid: false,
        manifest: null,
        errors: [`Failed to parse JSON: ${error.message}`]
      };
    }
  }

  /**
   * Validate file path to prevent Zip Slip attacks (Requirement 3.7)
   * @param {string} filePath - Extracted file path
   * @param {string} targetDir - Target installation directory
   * @returns {boolean} - True if path is safe
   */
  validateExtractPath(filePath, targetDir) {
    // Normalize paths
    const normalizedTarget = path.resolve(targetDir);
    const normalizedFile = path.resolve(targetDir, filePath);

    // Ensure the resolved path starts with target directory
    return normalizedFile.startsWith(normalizedTarget + path.sep) ||
           normalizedFile === normalizedTarget;
  }

  /**
   * Check version compatibility using semver (Requirement 3.1)
   * @param {string} requiredVersion - Required version range (e.g., "^1.0.0")
   * @param {string} currentVersion - Current application version (e.g., "1.2.0")
   * @returns {boolean} - True if compatible
   */
  checkVersionCompatibility(requiredVersion, currentVersion) {
    // Simple semver range matching
    // Supports: ^1.0.0, ~1.0.0, >=1.0.0, 1.0.0, *

    if (!requiredVersion || requiredVersion === '*') {
      return true;
    }

    const parseVersion = (v) => {
      const match = v.match(/(\d+)\.(\d+)\.(\d+)/);
      if (!match) return null;
      return {
        major: parseInt(match[1]),
        minor: parseInt(match[2]),
        patch: parseInt(match[3])
      };
    };

    const current = parseVersion(currentVersion);
    const required = parseVersion(requiredVersion);

    if (!current || !required) {
      return false;
    }

    // Handle caret (^) - allows changes that do not modify the left-most non-zero digit
    if (requiredVersion.startsWith('^')) {
      if (required.major > 0) {
        return current.major === required.major &&
               (current.minor > required.minor ||
                (current.minor === required.minor && current.patch >= required.patch));
      } else if (required.minor > 0) {
        return current.major === required.major &&
               current.minor === required.minor &&
               current.patch >= required.patch;
      } else {
        return current.major === required.major &&
               current.minor === required.minor &&
               current.patch === required.patch;
      }
    }

    // Handle tilde (~) - allows patch-level changes
    if (requiredVersion.startsWith('~')) {
      return current.major === required.major &&
             current.minor === required.minor &&
             current.patch >= required.patch;
    }

    // Handle >= operator
    if (requiredVersion.startsWith('>=')) {
      return current.major > required.major ||
             (current.major === required.major && current.minor > required.minor) ||
             (current.major === required.major && current.minor === required.minor &&
              current.patch >= required.patch);
    }

    // Exact match
    return current.major === required.major &&
           current.minor === required.minor &&
           current.patch === required.patch;
  }

  /**
   * Check if extension already exists (Requirement 3.2)
   * @param {string} id - Extension ID
   * @returns {object|null} - Existing extension or null
   */
  checkExistingExtension(id) {
    const existing = this.registry.get(id);

    if (existing && existing.isInstalled) {
      return {
        exists: true,
        extension: existing,
        message: `Extension ${id} (v${existing.installedVersion || 'unknown'}) is already installed`
      };
    }

    return null;
  }

  /**
   * Validate GitHub URL to prevent SSRF (Requirement 6.1)
   * @param {string} url - GitHub repository URL
   * @returns {object} - { valid: boolean, owner: string|null, repo: string|null, error: string|null }
   */
  validateGitHubURL(url) {
    try {
      const parsed = new URL(url);

      // Only allow https or http protocols
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        return {
          valid: false,
          owner: null,
          repo: null,
          error: 'Invalid GitHub URL format. Only https:// or http:// protocols are allowed'
        };
      }

      // Only allow github.com
      if (parsed.hostname !== 'github.com') {
        return {
          valid: false,
          owner: null,
          repo: null,
          error: 'Invalid GitHub URL format. Only github.com URLs are allowed'
        };
      }

      // Extract owner and repo from path
      const pathParts = parsed.pathname.split('/').filter(Boolean);

      if (pathParts.length < 2) {
        return {
          valid: false,
          owner: null,
          repo: null,
          error: 'Invalid GitHub URL format. Expected format: https://github.com/owner/repo'
        };
      }

      const owner = pathParts[0];
      const repo = pathParts[1].replace(/\.git$/, ''); // Remove .git suffix if present

      return {
        valid: true,
        owner,
        repo,
        error: null
      };
    } catch (error) {
      return {
        valid: false,
        owner: null,
        repo: null,
        error: `Invalid URL: ${error.message}`
      };
    }
  }

  /**
   * Clear all registry data (for testing)
   * @returns {Promise<void>}
   */
  async clear() {
    this.registry.clear();
    await this.saveRegistry();
  }
}

module.exports = ExtensionManager;
