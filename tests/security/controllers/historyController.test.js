/**
 * Unit tests for historyController
 */

const { test, describe, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

// Import controller
const historyController = require('../../../lib/security/controllers/historyController');
const HistoryManager = require('../../../lib/security/services/HistoryManager');
const ScanResult = require('../../../lib/security/models/ScanResult');
const ReviewResult = require('../../../lib/security/models/ReviewResult');

describe('historyController', () => {
  let mockReq;
  let mockRes;
  let testDir;
  let historyManager;

  beforeEach(async () => {
    // Create temporary test directory
    testDir = path.join(os.tmpdir(), `history-controller-test-${Date.now()}`);

    // Create a test history manager instance
    historyManager = new HistoryManager({
      historyDir: testDir,
      maxRecords: 5
    });

    // Add some test data
    const scanResult1 = new ScanResult({ id: 'scan_test_1', status: 'completed' });
    const scanResult2 = new ScanResult({ id: 'scan_test_2', status: 'failed' });
    const reviewResult1 = new ReviewResult({ id: 'review_test_1', status: 'completed' });

    await historyManager.save(scanResult1);
    await historyManager.save(scanResult2);
    await historyManager.save(reviewResult1);

    // Reset mocks before each test
    mockReq = {
      body: {},
      params: {},
      query: {}
    };

    mockRes = {
      status: mock.fn(function(code) {
        this.statusCode = code;
        return this;
      }),
      json: mock.fn(function(data) {
        this.data = data;
        return this;
      }),
      statusCode: 200,
      data: null
    };
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

  describe('getHistory', () => {
    test('should return all history records', async () => {
      mockReq.query = {};

      await historyController.getHistory(mockReq, mockRes);

      assert.strictEqual(mockRes.statusCode, 200);
      assert.ok(mockRes.data.records);
      assert.ok(Array.isArray(mockRes.data.records));
      assert.strictEqual(mockRes.data.total, mockRes.data.records.length);
    });

    test('should filter by type', async () => {
      mockReq.query = { type: 'security-scan' };

      await historyController.getHistory(mockReq, mockRes);

      assert.strictEqual(mockRes.statusCode, 200);
      assert.ok(mockRes.data.records);
      // All records should be security-scan type
      const allScans = mockRes.data.records.every(r => r.type === 'security-scan');
      assert.ok(allScans || mockRes.data.records.length === 0);
    });

    test('should return 400 for invalid type', async () => {
      mockReq.query = { type: 'invalid-type' };

      await historyController.getHistory(mockReq, mockRes);

      assert.strictEqual(mockRes.statusCode, 400);
      assert.ok(mockRes.data.error);
    });

    test('should filter by status', async () => {
      mockReq.query = { status: 'completed' };

      await historyController.getHistory(mockReq, mockRes);

      assert.strictEqual(mockRes.statusCode, 200);
      assert.ok(mockRes.data.records);
      // All records should be completed status
      const allCompleted = mockRes.data.records.every(r => r.status === 'completed');
      assert.ok(allCompleted || mockRes.data.records.length === 0);
    });

    test('should return 400 for invalid status', async () => {
      mockReq.query = { status: 'invalid-status' };

      await historyController.getHistory(mockReq, mockRes);

      assert.strictEqual(mockRes.statusCode, 400);
      assert.ok(mockRes.data.error);
    });

    test('should apply limit', async () => {
      mockReq.query = { limit: '2' };

      await historyController.getHistory(mockReq, mockRes);

      assert.strictEqual(mockRes.statusCode, 200);
      assert.ok(mockRes.data.records.length <= 2);
    });

    test('should return 400 for invalid limit', async () => {
      mockReq.query = { limit: 'invalid' };

      await historyController.getHistory(mockReq, mockRes);

      assert.strictEqual(mockRes.statusCode, 400);
      assert.ok(mockRes.data.error);
    });

    test('should return 400 for limit out of range', async () => {
      mockReq.query = { limit: '200' };

      await historyController.getHistory(mockReq, mockRes);

      assert.strictEqual(mockRes.statusCode, 400);
      assert.ok(mockRes.data.error);
    });
  });

  describe('getResult', () => {
    test('should return result by id', async () => {
      mockReq.params = { id: 'scan_test_1' };

      await historyController.getResult(mockReq, mockRes);

      assert.strictEqual(mockRes.statusCode, 200);
      assert.ok(mockRes.data.result);
      assert.strictEqual(mockRes.data.result.id, 'scan_test_1');
    });

    test('should return 400 if id is missing', async () => {
      mockReq.params = {};

      await historyController.getResult(mockReq, mockRes);

      assert.strictEqual(mockRes.statusCode, 400);
      assert.ok(mockRes.data.error);
    });

    test('should return 404 for non-existent id', async () => {
      mockReq.params = { id: 'nonexistent_id' };

      await historyController.getResult(mockReq, mockRes);

      assert.strictEqual(mockRes.statusCode, 404);
      assert.ok(mockRes.data.error);
    });
  });

  describe('deleteHistory', () => {
    test('should delete record by id', async () => {
      mockReq.params = { id: 'scan_test_1' };

      await historyController.deleteHistory(mockReq, mockRes);

      assert.strictEqual(mockRes.statusCode, 200);
      assert.strictEqual(mockRes.data.success, true);
      assert.ok(mockRes.data.message);

      // Verify deletion
      const history = await historyManager.load();
      const exists = history.some(r => r.id === 'scan_test_1');
      assert.strictEqual(exists, false);
    });

    test('should return 400 if id is missing', async () => {
      mockReq.params = {};

      await historyController.deleteHistory(mockReq, mockRes);

      assert.strictEqual(mockRes.statusCode, 400);
      assert.ok(mockRes.data.error);
    });

    test('should return 404 for non-existent id', async () => {
      mockReq.params = { id: 'nonexistent_id' };

      await historyController.deleteHistory(mockReq, mockRes);

      assert.strictEqual(mockRes.statusCode, 404);
      assert.ok(mockRes.data.error);
    });
  });

  describe('getStats', () => {
    test('should return statistics', async () => {
      await historyController.getStats(mockReq, mockRes);

      assert.strictEqual(mockRes.statusCode, 200);
      assert.ok(mockRes.data.total !== undefined);
      assert.ok(mockRes.data.byType);
      assert.ok(mockRes.data.byStatus);
      assert.strictEqual(typeof mockRes.data.total, 'number');
    });

    test('should have correct statistics structure', async () => {
      await historyController.getStats(mockReq, mockRes);

      assert.strictEqual(mockRes.statusCode, 200);
      assert.ok(mockRes.data.total >= 0);
      assert.ok(typeof mockRes.data.byType === 'object');
      assert.ok(typeof mockRes.data.byStatus === 'object');
    });
  });

  describe('clearHistory', () => {
    test('should return 400 without confirmation', async () => {
      mockReq.query = {};

      await historyController.clearHistory(mockReq, mockRes);

      assert.strictEqual(mockRes.statusCode, 400);
      assert.ok(mockRes.data.error);
      assert.ok(mockRes.data.error.includes('confirm'));
    });

    test('should clear history with confirmation', async () => {
      mockReq.query = { confirm: 'true' };

      await historyController.clearHistory(mockReq, mockRes);

      assert.strictEqual(mockRes.statusCode, 200);
      assert.strictEqual(mockRes.data.success, true);
      assert.ok(mockRes.data.message);

      // Verify clearing
      const history = await historyManager.load();
      assert.strictEqual(history.length, 0);
    });

    test('should not clear without exact confirmation', async () => {
      mockReq.query = { confirm: 'yes' };

      await historyController.clearHistory(mockReq, mockRes);

      assert.strictEqual(mockRes.statusCode, 400);
      assert.ok(mockRes.data.error);
    });
  });

  describe('error handling', () => {
    test('getHistory should handle errors gracefully', async () => {
      mockReq.query = { type: 'security-scan' };

      await historyController.getHistory(mockReq, mockRes);

      // Should either succeed or return 500
      assert.ok([200, 500].includes(mockRes.statusCode));
      if (mockRes.statusCode === 500) {
        assert.ok(mockRes.data.error);
      }
    });

    test('getResult should handle null id', async () => {
      mockReq.params = { id: null };

      await historyController.getResult(mockReq, mockRes);

      assert.ok(mockRes.statusCode >= 400);
      assert.ok(mockRes.data.error);
    });
  });

  describe('response format', () => {
    test('getHistory should return consistent structure', async () => {
      await historyController.getHistory(mockReq, mockRes);

      assert.strictEqual(mockRes.statusCode, 200);
      assert.ok('records' in mockRes.data);
      assert.ok('total' in mockRes.data);
      assert.ok(Array.isArray(mockRes.data.records));
      assert.strictEqual(typeof mockRes.data.total, 'number');
    });

    test('getResult should return result object', async () => {
      mockReq.params = { id: 'scan_test_1' };

      await historyController.getResult(mockReq, mockRes);

      assert.strictEqual(mockRes.statusCode, 200);
      assert.ok('result' in mockRes.data);
      assert.ok(mockRes.data.result.id);
    });

    test('deleteHistory should return success status', async () => {
      mockReq.params = { id: 'scan_test_2' };

      await historyController.deleteHistory(mockReq, mockRes);

      assert.strictEqual(mockRes.statusCode, 200);
      assert.ok('success' in mockRes.data);
      assert.ok('message' in mockRes.data);
      assert.strictEqual(mockRes.data.success, true);
    });
  });
});
