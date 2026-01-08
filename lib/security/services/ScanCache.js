/**
 * ScanCache - Memory-based cache for security scan results
 *
 * Implements LRU (Least Recently Used) caching strategy with TTL expiration
 * to avoid redundant scans and improve performance.
 *
 * Features:
 * - TTL-based expiration (default 1 hour)
 * - Size-limited cache (default 100 entries)
 * - LRU eviction when cache is full
 * - Cache key based on path and scan configuration
 *
 * Performance characteristics:
 * - Get: O(1)
 * - Set: O(1)
 * - Memory usage: ~1-5MB per 100 entries (depends on scan result size)
 */

const crypto = require('crypto');

/**
 * Default cache configuration
 */
const DEFAULT_CONFIG = {
  ttl: 60 * 60 * 1000, // 1 hour in milliseconds
  maxSize: 100, // Maximum number of cached entries
  cleanupInterval: 5 * 60 * 1000 // Run cleanup every 5 minutes
};

/**
 * Cache entry structure
 * @typedef {Object} CacheEntry
 * @property {*} value - Cached scan result
 * @property {number} timestamp - When entry was created (ms)
 * @property {number} accessCount - Number of times accessed
 * @property {number} lastAccess - Last access timestamp (ms)
 */

/**
 * ScanCache class
 */
class ScanCache {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cache = new Map(); // Key -> CacheEntry
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      expirations: 0
    };

    // Start periodic cleanup
    this.cleanupTimer = setInterval(() => {
      this._cleanup();
    }, this.config.cleanupInterval);

    // Prevent cleanup timer from blocking Node.js exit
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Generate cache key from scan path and config
   * @param {string} path - Scan path
   * @param {Object} config - Scan configuration
   * @returns {string} - Cache key
   */
  generateKey(path, config) {
    // Normalize path
    const normalizedPath = path.toLowerCase().replace(/\\/g, '/');

    // Ensure config is an object
    const safeConfig = config || {};

    // Create config hash (exclude format, include only scan-affecting params)
    const configHash = crypto.createHash('md5')
      .update(JSON.stringify({
        path: normalizedPath,
        scope: safeConfig.scope || 'full',
        exclude: safeConfig.exclude || []
      }))
      .digest('hex');

    return `scan:${configHash}`;
  }

  /**
   * Get cached scan result
   * @param {string} path - Scan path
   * @param {Object} config - Scan configuration
   * @returns {*|null} - Cached result or null if not found/expired
   */
  get(path, config) {
    const key = this.generateKey(path, config);
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if entry has expired
    const age = Date.now() - entry.timestamp;
    if (age > this.config.ttl) {
      this.cache.delete(key);
      this.stats.misses++;
      this.stats.expirations++;
      return null;
    }

    // Update access statistics
    entry.accessCount++;
    entry.lastAccess = Date.now();

    this.stats.hits++;
    return entry.value;
  }

  /**
   * Store scan result in cache
   * @param {string} path - Scan path
   * @param {Object} config - Scan configuration
   * @param {*} value - Scan result to cache
   */
  set(path, config, value) {
    // Check if cache is full
    if (this.cache.size >= this.config.maxSize) {
      this._evictLRU();
    }

    const key = this.generateKey(path, config);

    const entry = {
      value,
      timestamp: Date.now(),
      accessCount: 0,
      lastAccess: Date.now()
    };

    this.cache.set(key, entry);
  }

  /**
   * Check if a scan result exists in cache
   * @param {string} path - Scan path
   * @param {Object} config - Scan configuration
   * @returns {boolean}
   */
  has(path, config) {
    const key = this.generateKey(path, config);
    const entry = this.cache.get(key);

    if (!entry) {
      return false;
    }

    // Check expiration
    const age = Date.now() - entry.timestamp;
    if (age > this.config.ttl) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Clear entire cache
   */
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    return size;
  }

  /**
   * Get cache statistics
   * @returns {Object} - Cache stats
   */
  getStats() {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0
      ? (this.stats.hits / totalRequests * 100).toFixed(2)
      : 0;

    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: `${hitRate}%`,
      evictions: this.stats.evictions,
      expirations: this.stats.expirations
    };
  }

  /**
   * Evict least recently used entry
   * @private
   */
  _evictLRU() {
    let oldestKey = null;
    let oldestAccess = Infinity;

    // Find entry with oldest lastAccess timestamp
    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccess < oldestAccess) {
        oldestAccess = entry.lastAccess;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;
    }
  }

  /**
   * Remove expired entries
   * @private
   */
  _cleanup() {
    const now = Date.now();
    const expiredKeys = [];

    for (const [key, entry] of this.cache.entries()) {
      const age = now - entry.timestamp;
      if (age > this.config.ttl) {
        expiredKeys.push(key);
      }
    }

    expiredKeys.forEach(key => {
      this.cache.delete(key);
      this.stats.expirations++;
    });

    if (expiredKeys.length > 0) {
      console.log(`[ScanCache] Cleaned up ${expiredKeys.length} expired entries`);
    }
  }

  /**
   * Stop cleanup timer (for graceful shutdown)
   */
  destroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}

module.exports = ScanCache;
