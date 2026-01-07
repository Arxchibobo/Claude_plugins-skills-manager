const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const os = require('os');

/**
 * CacheManager - Manages caching of GitHub API responses with disk persistence
 *
 * Features:
 * - In-memory cache for fast access
 * - Disk persistence for cache survival across restarts
 * - TTL-based expiration
 * - Atomic writes to prevent data corruption
 * - ETag support for HTTP conditional requests
 * - Non-blocking async I/O
 * - LRU-like memory protection
 */
class CacheManager {
  constructor(options = {}) {
    this.ttl = options.ttl || 3600000; // 1 hour default (in milliseconds)
    this.storePath = options.storePath || path.join(os.tmpdir(), 'claude-marketplace-cache.json');
    this.memoryCache = new Map();
    this.saveDebounceTimer = null;
    this.saveDebounceDelay = 5000; // Save to disk after 5 seconds of inactivity
    this.maxEntries = options.maxEntries || 10000; // Prevent OOM
    this.isSaving = false; // Lock to prevent overlapping saves
    this.savePending = false; // Track if save was requested while saving

    // Load existing cache from disk (synchronous during initialization is acceptable)
    this._loadFromDiskSync();
  }

  /**
   * Get cached value by key
   * @param {string} key - Cache key
   * @returns {any|null} - Cached value or null if not found/expired
   */
  get(key) {
    if (!this.has(key)) {
      return null;
    }

    const entry = this.memoryCache.get(key);

    // Check if expired
    if (this.isExpired(key)) {
      this.invalidate(key);
      return null;
    }

    return entry.value;
  }

  /**
   * Set cached value with optional ETag
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {string|null} etag - Optional ETag for HTTP conditional requests
   */
  set(key, value, etag = null) {
    // LRU-like protection: if over limit and key doesn't exist, delete oldest
    if (this.memoryCache.size >= this.maxEntries && !this.memoryCache.has(key)) {
      const firstKey = this.memoryCache.keys().next().value;
      this.memoryCache.delete(firstKey);
    }

    const entry = {
      value,
      etag,
      timestamp: Date.now(),
      expiresAt: Date.now() + this.ttl
    };

    this.memoryCache.set(key, entry);
    this._scheduleSaveToDisk();
  }

  /**
   * Check if key exists in cache (even if expired)
   * @param {string} key - Cache key
   * @returns {boolean}
   */
  has(key) {
    return this.memoryCache.has(key);
  }

  /**
   * Check if cached entry has expired
   * @param {string} key - Cache key
   * @returns {boolean}
   */
  isExpired(key) {
    if (!this.has(key)) {
      return true;
    }

    const entry = this.memoryCache.get(key);
    return Date.now() > entry.expiresAt;
  }

  /**
   * Get ETag for a cached key
   * @param {string} key - Cache key
   * @returns {string|null} - ETag or null
   */
  getETag(key) {
    if (!this.has(key)) {
      return null;
    }

    const entry = this.memoryCache.get(key);
    return entry.etag || null;
  }

  /**
   * Invalidate (remove) a cached key
   * @param {string} key - Cache key
   */
  invalidate(key) {
    this.memoryCache.delete(key);
    this._scheduleSaveToDisk();
  }

  /**
   * Clear all cached entries
   */
  clear() {
    this.memoryCache.clear();
    this._scheduleSaveToDisk();
  }

  /**
   * Get cache statistics
   * @returns {object} - Cache stats
   */
  getStats() {
    const entries = Array.from(this.memoryCache.entries());
    const now = Date.now();

    // Avoid spread operator stack overflow for large caches
    let oldest = null;
    let newest = null;
    let expiredCount = 0;

    for (const [, entry] of entries) {
      if (entry.expiresAt < now) {
        expiredCount++;
      }
      if (oldest === null || entry.timestamp < oldest) {
        oldest = entry.timestamp;
      }
      if (newest === null || entry.timestamp > newest) {
        newest = entry.timestamp;
      }
    }

    return {
      totalEntries: entries.length,
      expiredEntries: expiredCount,
      validEntries: entries.length - expiredCount,
      oldestEntry: oldest,
      newestEntry: newest
    };
  }

  /**
   * Load cache from disk on startup (synchronous)
   * @private
   */
  _loadFromDiskSync() {
    try {
      if (fs.existsSync(this.storePath)) {
        const data = fs.readFileSync(this.storePath, 'utf8');
        const parsed = JSON.parse(data);

        // Convert plain object back to Map
        if (parsed && typeof parsed === 'object') {
          Object.entries(parsed).forEach(([key, entry]) => {
            this.memoryCache.set(key, entry);
          });
        }

        // Clean up expired entries on load
        this._cleanupExpired();
      }
    } catch (error) {
      console.warn('[CacheManager] Failed to load cache from disk:', error.message);
      // Start with empty cache if load fails
      this.memoryCache = new Map();
    }
  }

  /**
   * Schedule a debounced save to disk
   * @private
   */
  _scheduleSaveToDisk() {
    // Clear existing timer
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }

    // Schedule new save
    this.saveDebounceTimer = setTimeout(() => {
      this._saveToDiskAsync();
    }, this.saveDebounceDelay);
  }

  /**
   * Persist cache to disk asynchronously (prevents blocking event loop)
   * @private
   */
  async _saveToDiskAsync() {
    // Prevent overlapping saves
    if (this.isSaving) {
      this.savePending = true;
      return;
    }

    this.isSaving = true;

    try {
      // Convert Map to plain object for JSON serialization
      const cacheObject = Object.fromEntries(this.memoryCache);
      const jsonData = JSON.stringify(cacheObject, null, 2);
      const tempPath = `${this.storePath}.tmp`;

      // Write to temporary file with secure permissions (owner read/write only)
      await fsPromises.writeFile(tempPath, jsonData, {
        encoding: 'utf8',
        mode: 0o600
      });

      // Atomic rename
      await fsPromises.rename(tempPath, this.storePath);

    } catch (error) {
      console.error('[CacheManager] Failed to save cache to disk:', error.message);

      // Clean up temp file if it exists
      try {
        const tempPath = `${this.storePath}.tmp`;
        if (fs.existsSync(tempPath)) {
          await fsPromises.unlink(tempPath);
        }
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
    } finally {
      this.isSaving = false;

      // If a change happened while we were writing, schedule another save
      if (this.savePending) {
        this.savePending = false;
        this._scheduleSaveToDisk();
      }
    }
  }

  /**
   * Synchronous save to disk (used for flush/shutdown scenarios)
   * @private
   */
  _saveToDiskSync() {
    try {
      const cacheObject = Object.fromEntries(this.memoryCache);
      const jsonData = JSON.stringify(cacheObject, null, 2);
      const tempPath = `${this.storePath}.tmp`;

      // Write to temporary file with secure permissions
      fs.writeFileSync(tempPath, jsonData, { encoding: 'utf8', mode: 0o600 });

      // Atomic rename
      fs.renameSync(tempPath, this.storePath);
    } catch (error) {
      console.error('[CacheManager] Failed to save cache to disk (sync):', error.message);

      // Clean up temp file if it exists
      const tempPath = `${this.storePath}.tmp`;
      if (fs.existsSync(tempPath)) {
        try {
          fs.unlinkSync(tempPath);
        } catch (cleanupError) {
          // Ignore cleanup errors
        }
      }
    }
  }

  /**
   * Remove expired entries from memory cache
   * @private
   */
  _cleanupExpired() {
    const expiredKeys = [];

    for (const [key] of this.memoryCache) {
      if (this.isExpired(key)) {
        expiredKeys.push(key);
      }
    }

    expiredKeys.forEach(key => this.memoryCache.delete(key));

    if (expiredKeys.length > 0) {
      this._scheduleSaveToDisk();
    }
  }

  /**
   * Flush any pending saves immediately (synchronous for graceful shutdown)
   * Useful for graceful shutdown
   */
  flush() {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = null;
    }
    // Use synchronous version to ensure completion before process exit
    this._saveToDiskSync();
  }
}

module.exports = CacheManager;
