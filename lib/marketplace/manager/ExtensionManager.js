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
   * Clear all registry data (for testing)
   * @returns {Promise<void>}
   */
  async clear() {
    this.registry.clear();
    await this.saveRegistry();
  }
}

module.exports = ExtensionManager;
