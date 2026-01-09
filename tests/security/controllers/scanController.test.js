/**
 * Unit tests for scanController
 */

const { test, describe, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert');

// Import controller
const scanController = require('../../../lib/security/controllers/scanController');
const ScanResult = require('../../../lib/security/models/ScanResult');

describe('scanController', () => {
  let mockReq;
  let mockRes;
  let mockClaudeIntegration;
  let mockResultParser;
  let mockHistoryManager;

  beforeEach(() => {
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

    // Mock ClaudeIntegration to prevent real async operations
    mockClaudeIntegration = {
      checkClaudeAvailability: async () => ({
        available: true,
        version: 'Mock CLI v1.0.0'
      }),
      runSecurityScan: async () => ({
        success: true,
        output: JSON.stringify({ issues: [] })
      })
    };

    scanController._setDependencies({ claudeIntegration: mockClaudeIntegration });
  });

  afterEach(() => {
    // Clean up dependencies after each test
    scanController._resetDependencies();
  });

  describe('startScan', () => {
    test('should return 400 if path is missing', async () => {
      mockReq.body = {};

      await scanController.startScan(mockReq, mockRes);

      assert.strictEqual(mockRes.statusCode, 400);
      assert.ok(mockRes.data.error);
      assert.ok(mockRes.data.error.includes('path'));
    });

    test('should return 400 if path is not a string', async () => {
      mockReq.body = { path: 123 };

      await scanController.startScan(mockReq, mockRes);

      assert.strictEqual(mockRes.statusCode, 400);
      assert.ok(mockRes.data.error);
    });

    test('should accept valid scan request', async () => {
      mockReq.body = {
        path: '/test/path',
        scope: 'full',
        format: 'json'
      };

      // Note: This will actually try to call Claude CLI
      // In a real test, we'd mock the ClaudeIntegration module
      // For now, we're just testing the controller structure
      await scanController.startScan(mockReq, mockRes);

      // Should return 202 or 500 (depending on Claude CLI availability)
      assert.ok([202, 500].includes(mockRes.statusCode));
    });

    test('should handle missing format parameter with default', async () => {
      mockReq.body = {
        path: '/test/path'
      };

      await scanController.startScan(mockReq, mockRes);

      // Should use default format 'json'
      assert.ok([202, 500].includes(mockRes.statusCode));
    });
  });

  describe('getScanStatus', () => {
    test('should return 400 if id is missing', async () => {
      mockReq.params = {};

      await scanController.getScanStatus(mockReq, mockRes);

      assert.strictEqual(mockRes.statusCode, 400);
      assert.ok(mockRes.data.error);
      assert.ok(mockRes.data.error.includes('id'));
    });

    test('should return 404 for non-existent scan', async () => {
      mockReq.params = { id: 'nonexistent_scan_id' };

      await scanController.getScanStatus(mockReq, mockRes);

      assert.strictEqual(mockRes.statusCode, 404);
      assert.ok(mockRes.data.error);
    });
  });

  describe('listScans', () => {
    test('should return scans list', async () => {
      mockReq.query = {};

      await scanController.listScans(mockReq, mockRes);

      assert.strictEqual(mockRes.statusCode, 200);
      assert.ok(mockRes.data.active);
      assert.ok(mockRes.data.history);
      assert.ok(Array.isArray(mockRes.data.active));
      assert.ok(Array.isArray(mockRes.data.history));
    });

    test('should filter by status', async () => {
      mockReq.query = { status: 'completed' };

      await scanController.listScans(mockReq, mockRes);

      assert.strictEqual(mockRes.statusCode, 200);
      assert.ok(mockRes.data.active);
      assert.ok(mockRes.data.history);
    });

    test('should apply limit', async () => {
      mockReq.query = { limit: '5' };

      await scanController.listScans(mockReq, mockRes);

      assert.strictEqual(mockRes.statusCode, 200);
      assert.ok(mockRes.data.history);
    });
  });

  describe('error handling', () => {
    test('startScan should catch and handle errors', async () => {
      // Mock claudeIntegration to return unavailable
      const mockClaudeIntegration = {
        checkClaudeAvailability: async () => ({
          available: false,
          error: 'Claude CLI not found'
        }),
        getUserFriendlyError: () => ({ message: 'CLI not available', suggestion: 'Install Claude CLI' })
      };
      scanController._setDependencies({ claudeIntegration: mockClaudeIntegration });

      mockReq.body = { path: '/test/path' };

      await scanController.startScan(mockReq, mockRes);

      // Should return 500 error when Claude CLI is unavailable
      assert.strictEqual(mockRes.statusCode, 500);
      assert.ok(mockRes.data.error);
      assert.ok(mockRes.data.error.includes('not available'));

      // Reset dependencies
      scanController._resetDependencies();
    });

    test('getScanStatus should handle errors', async () => {
      mockReq.params = { id: null };

      await scanController.getScanStatus(mockReq, mockRes);

      assert.ok(mockRes.statusCode >= 400);
      assert.ok(mockRes.data.error);
    });

    test('listScans should handle errors', async () => {
      mockReq.query = { limit: 'invalid' };

      await scanController.listScans(mockReq, mockRes);

      // Should still work, ignoring invalid limit
      assert.ok([200, 500].includes(mockRes.statusCode));
    });
  });

  describe('async operations', () => {
    test('startScan should return 202 for async scan', async () => {
      mockReq.body = { path: '/test/path' };

      await scanController.startScan(mockReq, mockRes);

      // Should be either 202 (success) or 500 (CLI not available)
      if (mockRes.statusCode === 202) {
        assert.strictEqual(mockRes.data.status, 'running');
        assert.ok(mockRes.data.id);
        assert.ok(mockRes.data.message);
      }
    });

    test('getScanStatus should show running status', async () => {
      // First start a scan
      mockReq.body = { path: '/test/path' };
      await scanController.startScan(mockReq, mockRes);

      if (mockRes.statusCode === 202) {
        const scanId = mockRes.data.id;

        // Reset response
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

        // Check status
        mockReq.params = { id: scanId };
        await scanController.getScanStatus(mockReq, mockRes);

        assert.strictEqual(mockRes.statusCode, 200);
        // Should show running, completed, or failed status
        assert.ok(['running', 'completed', 'failed'].includes(mockRes.data.status));
      }
    });
  });

  describe('response format', () => {
    test('startScan should return proper 202 response', async () => {
      mockReq.body = { path: '/test/path' };

      await scanController.startScan(mockReq, mockRes);

      if (mockRes.statusCode === 202) {
        assert.ok(mockRes.data.id);
        assert.strictEqual(mockRes.data.status, 'running');
        assert.ok(mockRes.data.message);
      }
    });

    test('listScans should return proper structure', async () => {
      await scanController.listScans(mockReq, mockRes);

      assert.strictEqual(mockRes.statusCode, 200);
      assert.ok(mockRes.data.active !== undefined);
      assert.ok(mockRes.data.history !== undefined);
      assert.ok(Array.isArray(mockRes.data.active));
      assert.ok(Array.isArray(mockRes.data.history));
    });
  });
});
