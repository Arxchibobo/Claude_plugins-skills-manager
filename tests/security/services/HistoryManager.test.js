/**
 * Unit tests for HistoryManager service
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

const HistoryManager = require('../../../lib/security/services/HistoryManager');
const ScanResult = require('../../../lib/security/models/ScanResult');
const ReviewResult = require('../../../lib/security/models/ReviewResult');

describe('HistoryManager', () => {
  let manager;
  let testDir;

  beforeEach(async () => {
    // Create temporary test directory
    testDir = path.join(os.tmpdir(), `history-test-${Date.now()}`);
    manager = new HistoryManager({
      historyDir: testDir,
      maxRecords: 5 // Use smaller limit for testing
    });
  });

  afterEach(async () => {
    // Cleanup test directory
    try {
      const files = await fs.readdir(testDir);
      for (const file of files) {
        await fs.unlink(path.join(testDir, file));
      }
      await fs.rmdir(testDir);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('constructor', () => {
    test('should create instance with default config', () => {
      const instance = new HistoryManager();
      assert.ok(instance.config.maxRecords);
      assert.ok(instance.config.historyDir);
      assert.ok(instance.config.historyFile);
    });

    test('should accept custom config', () => {
      const customConfig = {
        maxRecords: 20,
        historyDir: '/custom/path'
      };
      const instance = new HistoryManager(customConfig);
      assert.strictEqual(instance.config.maxRecords, 20);
      assert.strictEqual(instance.config.historyDir, '/custom/path');
    });
  });

  describe('save', () => {
    test('should save ScanResult to history', async () => {
      const scanResult = new ScanResult({
        id: 'scan_test_001',
        type: 'scan-result',
        status: 'completed'
      });

      const savedId = await manager.save(scanResult);

      assert.strictEqual(savedId, 'scan_test_001');

      // Verify history entry exists
      const history = await manager.load();
      assert.strictEqual(history.length, 1);
      assert.strictEqual(history[0].id, 'scan_test_001');
      assert.strictEqual(history[0].type, 'scan-result');
    });

    test('should save ReviewResult to history', async () => {
      const reviewResult = new ReviewResult({
        id: 'review_test_001',
        type: 'code-review',
        status: 'completed'
      });

      await manager.save(reviewResult);

      const history = await manager.load();
      assert.strictEqual(history.length, 1);
      assert.strictEqual(history[0].type, 'code-review');
    });

    test('should add new records to the beginning', async () => {
      const result1 = new ScanResult({ id: 'scan_1', status: 'completed' });
      const result2 = new ScanResult({ id: 'scan_2', status: 'completed' });

      await manager.save(result1);
      await manager.save(result2);

      const history = await manager.load();
      assert.strictEqual(history[0].id, 'scan_2'); // Most recent first
      assert.strictEqual(history[1].id, 'scan_1');
    });

    test('should throw error for invalid result', async () => {
      await assert.rejects(
        () => manager.save(null),
        /Result must be an object/
      );

      await assert.rejects(
        () => manager.save({}),
        /Result must have an id field/
      );
    });

    test('should add timestamp if not present', async () => {
      const scanResult = new ScanResult({
        id: 'scan_timestamp_test',
        status: 'completed'
      });
      delete scanResult.timestamp; // Remove timestamp

      await manager.save(scanResult);

      const loaded = await manager.loadResult('scan_timestamp_test');
      assert.ok(loaded.timestamp);
      assert.ok(new Date(loaded.timestamp).getTime() > 0);
    });
  });

  describe('FIFO strategy', () => {
    test('should enforce max records limit', async () => {
      // Save 6 results (max is 5)
      for (let i = 1; i <= 6; i++) {
        const result = new ScanResult({
          id: `scan_${i}`,
          status: 'completed'
        });
        await manager.save(result);
      }

      // Should only have 5 records
      const history = await manager.load();
      assert.strictEqual(history.length, 5);

      // Should have the most recent 5 (scan_2 to scan_6)
      const ids = history.map(h => h.id);
      assert.ok(ids.includes('scan_6'));
      assert.ok(ids.includes('scan_5'));
      assert.ok(ids.includes('scan_4'));
      assert.ok(ids.includes('scan_3'));
      assert.ok(ids.includes('scan_2'));
      assert.ok(!ids.includes('scan_1')); // Oldest removed
    });

    test('should delete result files for removed records', async () => {
      // Save 6 results
      for (let i = 1; i <= 6; i++) {
        const result = new ScanResult({
          id: `scan_fifo_${i}`,
          status: 'completed'
        });
        await manager.save(result);
      }

      // Check that scan_fifo_1 file was deleted
      const filePath = path.join(testDir, 'scan_fifo_1.json');
      await assert.rejects(
        () => fs.access(filePath),
        /ENOENT/ // File not found
      );

      // Check that scan_fifo_6 file exists
      const latestFilePath = path.join(testDir, 'scan_fifo_6.json');
      await fs.access(latestFilePath); // Should not throw
    });
  });

  describe('load', () => {
    test('should load all history records', async () => {
      // Create test data
      await manager.save(new ScanResult({ id: 'scan_1', status: 'completed' }));
      await manager.save(new ReviewResult({ id: 'review_1', status: 'completed' }));

      const history = await manager.load();

      assert.strictEqual(history.length, 2);
    });

    test('should filter by type', async () => {
      await manager.save(new ScanResult({ id: 'scan_1', status: 'completed' }));
      await manager.save(new ReviewResult({ id: 'review_1', status: 'completed' }));
      await manager.save(new ScanResult({ id: 'scan_2', status: 'completed' }));

      const scans = await manager.load({ type: 'security-scan' });
      const reviews = await manager.load({ type: 'code-review' });

      assert.strictEqual(scans.length, 2);
      assert.strictEqual(reviews.length, 1);
    });

    test('should filter by status', async () => {
      await manager.save(new ScanResult({ id: 'scan_1', status: 'completed' }));
      await manager.save(new ScanResult({ id: 'scan_2', status: 'failed' }));
      await manager.save(new ScanResult({ id: 'scan_3', status: 'completed' }));

      const completed = await manager.load({ status: 'completed' });
      const failed = await manager.load({ status: 'failed' });

      assert.strictEqual(completed.length, 2);
      assert.strictEqual(failed.length, 1);
    });

    test('should apply limit', async () => {
      for (let i = 1; i <= 5; i++) {
        await manager.save(new ScanResult({ id: `scan_${i}`, status: 'completed' }));
      }

      const limited = await manager.load({ limit: 3 });

      assert.strictEqual(limited.length, 3);
    });

    test('should combine filters', async () => {
      await manager.save(new ScanResult({ id: 'scan_1', status: 'completed' }));
      await manager.save(new ScanResult({ id: 'scan_2', status: 'failed' }));
      await manager.save(new ReviewResult({ id: 'review_1', status: 'completed' }));
      await manager.save(new ScanResult({ id: 'scan_3', status: 'completed' }));

      const filtered = await manager.load({
        type: 'security-scan',
        status: 'completed',
        limit: 1
      });

      assert.strictEqual(filtered.length, 1);
      assert.strictEqual(filtered[0].type, 'security-scan');
      assert.strictEqual(filtered[0].status, 'completed');
    });
  });

  describe('loadResult', () => {
    test('should load full result data', async () => {
      const scanResult = new ScanResult({
        id: 'scan_full_test',
        status: 'completed'
      });
      scanResult.addIssue({
        id: 'issue_1',
        severity: 'high',
        title: 'Test Issue',
        file: 'test.js',
        description: 'Test description'
      });

      await manager.save(scanResult);

      const loaded = await manager.loadResult('scan_full_test');

      assert.strictEqual(loaded.id, 'scan_full_test');
      assert.strictEqual(loaded.issues.length, 1);
      assert.strictEqual(loaded.issues[0].title, 'Test Issue');
    });

    test('should throw error for invalid ID', async () => {
      await assert.rejects(
        () => manager.loadResult(null),
        /Result ID must be a non-empty string/
      );

      await assert.rejects(
        () => manager.loadResult(''),
        /Result ID must be a non-empty string/
      );
    });

    test('should throw error for non-existent ID', async () => {
      await assert.rejects(
        () => manager.loadResult('nonexistent_id'),
        /Result not found/
      );
    });
  });

  describe('delete', () => {
    test('should delete result from history', async () => {
      await manager.save(new ScanResult({ id: 'scan_delete_test', status: 'completed' }));

      // Verify exists
      let history = await manager.load();
      assert.strictEqual(history.length, 1);

      // Delete
      const deleted = await manager.delete('scan_delete_test');
      assert.strictEqual(deleted, true);

      // Verify deleted
      history = await manager.load();
      assert.strictEqual(history.length, 0);
    });

    test('should delete result file', async () => {
      await manager.save(new ScanResult({ id: 'scan_delete_file', status: 'completed' }));

      await manager.delete('scan_delete_file');

      // Check file deleted
      const filePath = path.join(testDir, 'scan_delete_file.json');
      await assert.rejects(
        () => fs.access(filePath),
        /ENOENT/
      );
    });

    test('should return false for non-existent ID', async () => {
      const deleted = await manager.delete('nonexistent_id');
      assert.strictEqual(deleted, false);
    });

    test('should throw error for invalid ID', async () => {
      await assert.rejects(
        () => manager.delete(null),
        /Result ID must be a non-empty string/
      );
    });
  });

  describe('getStats', () => {
    test('should return statistics', async () => {
      await manager.save(new ScanResult({ id: 'scan_1', status: 'completed' }));
      await manager.save(new ScanResult({ id: 'scan_2', status: 'failed' }));
      await manager.save(new ReviewResult({ id: 'review_1', status: 'completed' }));

      const stats = await manager.getStats();

      assert.strictEqual(stats.total, 3);
      assert.strictEqual(stats.byType['security-scan'], 2);
      assert.strictEqual(stats.byType['code-review'], 1);
      assert.strictEqual(stats.byStatus['completed'], 2);
      assert.strictEqual(stats.byStatus['failed'], 1);
    });

    test('should handle empty history', async () => {
      const stats = await manager.getStats();

      assert.strictEqual(stats.total, 0);
      assert.deepStrictEqual(stats.byType, {});
      assert.deepStrictEqual(stats.byStatus, {});
    });
  });

  describe('clear', () => {
    test('should clear all history', async () => {
      // Add some data
      await manager.save(new ScanResult({ id: 'scan_1', status: 'completed' }));
      await manager.save(new ReviewResult({ id: 'review_1', status: 'completed' }));

      // Verify data exists
      let history = await manager.load();
      assert.strictEqual(history.length, 2);

      // Clear
      await manager.clear();

      // Verify cleared
      history = await manager.load();
      assert.strictEqual(history.length, 0);
    });

    test('should delete all result files', async () => {
      await manager.save(new ScanResult({ id: 'scan_clear_1', status: 'completed' }));
      await manager.save(new ScanResult({ id: 'scan_clear_2', status: 'completed' }));

      await manager.clear();

      // Check files deleted
      const files = await fs.readdir(testDir);
      const jsonFiles = files.filter(f => f.endsWith('.json') && f !== 'history.json');
      assert.strictEqual(jsonFiles.length, 0);
    });
  });

  describe('updateConfig', () => {
    test('should update configuration', () => {
      const newConfig = { maxRecords: 15 };
      manager.updateConfig(newConfig);

      assert.strictEqual(manager.config.maxRecords, 15);
    });

    test('should merge with existing config', () => {
      const originalDir = manager.config.historyDir;
      manager.updateConfig({ maxRecords: 15 });

      assert.strictEqual(manager.config.maxRecords, 15);
      assert.strictEqual(manager.config.historyDir, originalDir);
    });

    test('should update history path', () => {
      const newDir = path.normalize('/new/test/path');
      manager.updateConfig({ historyDir: newDir });

      assert.ok(manager.getHistoryPath().startsWith(newDir));
    });
  });
});
