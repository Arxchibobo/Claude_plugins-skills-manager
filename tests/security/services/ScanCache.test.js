/**
 * Tests for ScanCache service
 *
 * Test coverage:
 * - Cache hit/miss scenarios
 * - TTL expiration
 * - LRU eviction when cache is full
 * - Cache key generation
 * - Statistics tracking
 * - Cleanup functionality
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const ScanCache = require('../../../lib/security/services/ScanCache');

describe('ScanCache', () => {
  let cache;

  beforeEach(() => {
    // Create cache with short TTL and small size for faster testing
    cache = new ScanCache({
      ttl: 1000, // 1 second
      maxSize: 3,
      cleanupInterval: 500 // 0.5 seconds
    });
  });

  afterEach(() => {
    if (cache) {
      cache.destroy();
    }
  });

  describe('Cache Operations', () => {
    it('should store and retrieve scan results', () => {
      const path = '/test/project';
      const config = { scope: 'full' };
      const result = { success: true, output: 'scan output' };

      cache.set(path, config, result);
      const cached = cache.get(path, config);

      assert.deepStrictEqual(cached, result);
    });

    it('should return null for cache miss', () => {
      const cached = cache.get('/nonexistent', {});
      assert.strictEqual(cached, null);
    });

    it('should handle cache hit statistics', () => {
      const path = '/test/project';
      const result = { success: true, output: 'scan output' };

      cache.set(path, {}, result);
      cache.get(path, {}); // hit
      cache.get('/other', {}); // miss

      const stats = cache.getStats();
      assert.strictEqual(stats.hits, 1);
      assert.strictEqual(stats.misses, 1);
    });

    it('should check if entry exists without retrieving', () => {
      const path = '/test/project';
      const result = { success: true, output: 'scan output' };

      assert.strictEqual(cache.has(path, {}), false);

      cache.set(path, {}, result);
      assert.strictEqual(cache.has(path, {}), true);
    });

    it('should clear entire cache', () => {
      cache.set('/path1', {}, { data: 1 });
      cache.set('/path2', {}, { data: 2 });
      cache.set('/path3', {}, { data: 3 });

      const cleared = cache.clear();

      assert.strictEqual(cleared, 3);
      assert.strictEqual(cache.getStats().size, 0);
    });
  });

  describe('Cache Key Generation', () => {
    it('should generate consistent keys for same path and config', () => {
      const key1 = cache.generateKey('/test/project', { scope: 'full' });
      const key2 = cache.generateKey('/test/project', { scope: 'full' });

      assert.strictEqual(key1, key2);
    });

    it('should generate different keys for different paths', () => {
      const key1 = cache.generateKey('/test/project1', {});
      const key2 = cache.generateKey('/test/project2', {});

      assert.notStrictEqual(key1, key2);
    });

    it('should generate different keys for different configs', () => {
      const key1 = cache.generateKey('/test/project', { scope: 'full' });
      const key2 = cache.generateKey('/test/project', { scope: 'quick' });

      assert.notStrictEqual(key1, key2);
    });

    it('should normalize path case and separators', () => {
      const key1 = cache.generateKey('/Test/Project', {});
      const key2 = cache.generateKey('/test/project', {});
      const key3 = cache.generateKey('\\test\\project', {}); // Windows path

      assert.strictEqual(key1, key2);
      assert.strictEqual(key2, key3);
    });

    it('should handle different exclude patterns in key generation', () => {
      const key1 = cache.generateKey('/test', { exclude: ['*.log'] });
      const key2 = cache.generateKey('/test', { exclude: ['*.tmp'] });

      // Keys should be different because exclude patterns affect scan results
      assert.notStrictEqual(key1, key2);
    });
  });

  describe('TTL Expiration', () => {
    it('should expire entries after TTL', async () => {
      const path = '/test/project';
      const result = { success: true, output: 'scan output' };

      cache.set(path, {}, result);
      assert.deepStrictEqual(cache.get(path, {}), result);

      // Wait for TTL to expire (1 second + buffer)
      await new Promise(resolve => setTimeout(resolve, 1100));

      const expired = cache.get(path, {});
      assert.strictEqual(expired, null);

      const stats = cache.getStats();
      assert.ok(stats.expirations > 0);
    });

    it('should not return expired entry via has()', async () => {
      const path = '/test/project';
      const result = { success: true, output: 'scan output' };

      cache.set(path, {}, result);
      assert.strictEqual(cache.has(path, {}), true);

      await new Promise(resolve => setTimeout(resolve, 1100));

      assert.strictEqual(cache.has(path, {}), false);
    });
  });

  describe('LRU Eviction', () => {
    it('should evict least recently used entry when cache is full', async () => {
      // Cache maxSize is 3
      cache.set('/path1', {}, { data: 1 });
      await new Promise(resolve => setTimeout(resolve, 10)); // Small delay for timestamp differentiation

      cache.set('/path2', {}, { data: 2 });
      await new Promise(resolve => setTimeout(resolve, 10));

      cache.set('/path3', {}, { data: 3 });
      await new Promise(resolve => setTimeout(resolve, 10));

      // Access path1 and path2 to update their lastAccess
      cache.get('/path1', {});
      await new Promise(resolve => setTimeout(resolve, 10));

      cache.get('/path2', {});
      await new Promise(resolve => setTimeout(resolve, 10));

      // Add 4th entry - should evict path3 (least recently used)
      cache.set('/path4', {}, { data: 4 });

      assert.deepStrictEqual(cache.get('/path1', {}), { data: 1 }); // still there
      assert.deepStrictEqual(cache.get('/path2', {}), { data: 2 }); // still there
      assert.strictEqual(cache.get('/path3', {}), null); // evicted
      assert.deepStrictEqual(cache.get('/path4', {}), { data: 4 }); // new entry

      const stats = cache.getStats();
      assert.strictEqual(stats.evictions, 1);
    });

    it('should maintain maxSize limit', () => {
      for (let i = 0; i < 10; i++) {
        cache.set(`/path${i}`, {}, { data: i });
      }

      const stats = cache.getStats();
      assert.strictEqual(stats.size, 3); // maxSize
      assert.strictEqual(stats.evictions, 7); // 10 - 3
    });
  });

  describe('Statistics', () => {
    it('should track hit rate correctly', () => {
      cache.set('/path1', {}, { data: 1 });
      cache.set('/path2', {}, { data: 2 });

      // 2 hits, 2 misses
      cache.get('/path1', {});
      cache.get('/path2', {});
      cache.get('/path3', {});
      cache.get('/path4', {});

      const stats = cache.getStats();
      assert.strictEqual(stats.hitRate, '50.00%');
    });

    it('should track access count', () => {
      const path = '/test/project';
      cache.set(path, {}, { data: 1 });

      // Access 3 times
      cache.get(path, {});
      cache.get(path, {});
      cache.get(path, {});

      const stats = cache.getStats();
      assert.strictEqual(stats.hits, 3);
    });

    it('should return complete statistics object', () => {
      cache.set('/path1', {}, { data: 1 });
      cache.get('/path1', {});
      cache.get('/path2', {}); // miss

      const stats = cache.getStats();

      assert.ok('size' in stats);
      assert.ok('maxSize' in stats);
      assert.ok('hits' in stats);
      assert.ok('misses' in stats);
      assert.ok('hitRate' in stats);
      assert.ok('evictions' in stats);
      assert.ok('expirations' in stats);

      assert.strictEqual(stats.size, 1);
      assert.strictEqual(stats.maxSize, 3);
      assert.strictEqual(stats.hits, 1);
      assert.strictEqual(stats.misses, 1);
    });
  });

  describe('Cleanup', () => {
    it('should automatically clean up expired entries', async () => {
      cache.set('/path1', {}, { data: 1 });
      cache.set('/path2', {}, { data: 2 });
      cache.set('/path3', {}, { data: 3 });

      // Wait for TTL + cleanup interval
      await new Promise(resolve => setTimeout(resolve, 1600));

      // All entries should be cleaned up
      const stats = cache.getStats();
      assert.strictEqual(stats.size, 0);
      assert.strictEqual(stats.expirations, 3);
    });

    it('should stop cleanup timer on destroy', () => {
      const timerBefore = cache.cleanupTimer;
      assert.ok(timerBefore);

      cache.destroy();

      assert.strictEqual(cache.cleanupTimer, null);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty path', () => {
      const result = { success: true, output: 'scan output' };
      cache.set('', {}, result);

      const cached = cache.get('', {});
      assert.deepStrictEqual(cached, result);
    });

    it('should handle empty config', () => {
      const path = '/test/project';
      const result = { success: true, output: 'scan output' };

      cache.set(path, {}, result);
      const cached = cache.get(path, {});

      assert.deepStrictEqual(cached, result);
    });

    it('should handle null config', () => {
      const path = '/test/project';
      const result = { success: true, output: 'scan output' };

      cache.set(path, null, result);
      const cached = cache.get(path, null);

      assert.deepStrictEqual(cached, result);
    });

    it('should handle large scan results', () => {
      const path = '/test/project';
      const largeOutput = 'x'.repeat(1024 * 1024); // 1MB string
      const result = { success: true, output: largeOutput };

      cache.set(path, {}, result);
      const cached = cache.get(path, {});

      assert.strictEqual(cached.output.length, largeOutput.length);
    });

    it('should handle special characters in path', () => {
      const path = '/test/project with spaces & special!@#$%^&*()';
      const result = { success: true, output: 'scan output' };

      cache.set(path, {}, result);
      const cached = cache.get(path, {});

      assert.deepStrictEqual(cached, result);
    });
  });

  describe('Memory Management', () => {
    it('should respect maxSize configuration', () => {
      const smallCache = new ScanCache({ maxSize: 2 });

      smallCache.set('/path1', {}, { data: 1 });
      smallCache.set('/path2', {}, { data: 2 });
      smallCache.set('/path3', {}, { data: 3 });

      assert.strictEqual(smallCache.getStats().size, 2);

      smallCache.destroy();
    });

    it('should handle custom TTL configuration', async () => {
      const shortTTLCache = new ScanCache({ ttl: 100 }); // 100ms

      shortTTLCache.set('/path1', {}, { data: 1 });

      await new Promise(resolve => setTimeout(resolve, 150));

      assert.strictEqual(shortTTLCache.get('/path1', {}), null);

      shortTTLCache.destroy();
    });
  });
});
