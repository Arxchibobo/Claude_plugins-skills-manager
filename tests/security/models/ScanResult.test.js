/**
 * Unit tests for ScanResult model
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const ScanResult = require('../../../lib/security/models/ScanResult');

describe('ScanResult', () => {
  describe('constructor', () => {
    test('should create a new ScanResult with default values', () => {
      const result = new ScanResult();

      assert.ok(result.id);
      assert.strictEqual(result.type, 'security-scan');
      assert.ok(result.timestamp);
      assert.deepStrictEqual(result.scope, {});
      assert.strictEqual(result.status, 'pending');
      assert.strictEqual(result.progress, 0);
      assert.deepStrictEqual(result.summary, {
        total: 0,
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        fixed: 0
      });
      assert.deepStrictEqual(result.issues, []);
      assert.strictEqual(result.duration, 0);
      assert.strictEqual(result.error, null);
    });

    test('should create a new ScanResult with provided data', () => {
      const data = {
        id: 'scan_test_123',
        type: 'security-scan',
        timestamp: '2026-01-08T12:00:00Z',
        scope: { type: 'project', path: '/test' },
        status: 'completed',
        progress: 100,
        summary: { total: 5, critical: 1, high: 2, medium: 1, low: 1, fixed: 0 },
        issues: [{ id: 'issue_1', severity: 'high', title: 'Test Issue' }],
        duration: 30.5,
        error: null
      };

      const result = new ScanResult(data);

      assert.strictEqual(result.id, 'scan_test_123');
      assert.strictEqual(result.type, 'security-scan');
      assert.strictEqual(result.timestamp, '2026-01-08T12:00:00Z');
      assert.deepStrictEqual(result.scope, { type: 'project', path: '/test' });
      assert.strictEqual(result.status, 'completed');
      assert.strictEqual(result.progress, 100);
      assert.strictEqual(result.duration, 30.5);
    });
  });

  describe('validate', () => {
    test('should validate a correct ScanResult', () => {
      const result = new ScanResult({
        id: 'scan_test_123',
        type: 'security-scan',
        timestamp: '2026-01-08T12:00:00Z',
        status: 'completed',
        progress: 100,
        summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0, fixed: 0 },
        issues: [],
        duration: 10
      });

      const validation = result.validate();
      assert.strictEqual(validation.valid, true);
      assert.strictEqual(validation.errors.length, 0);
    });

    test('should fail validation for invalid status', () => {
      const result = new ScanResult();
      result.status = 'invalid-status';

      const validation = result.validate();
      assert.strictEqual(validation.valid, false);
      assert.ok(validation.errors.some(e => e.includes('status')));
    });

    test('should fail validation for invalid progress', () => {
      const result = new ScanResult();
      result.progress = 150; // Invalid: > 100

      const validation = result.validate();
      assert.strictEqual(validation.valid, false);
      assert.ok(validation.errors.some(e => e.includes('progress')));
    });

    test('should fail validation for negative duration', () => {
      const result = new ScanResult();
      result.duration = -5;

      const validation = result.validate();
      assert.strictEqual(validation.valid, false);
      assert.ok(validation.errors.some(e => e.includes('duration')));
    });

    test('should fail validation for invalid summary', () => {
      const result = new ScanResult();
      result.summary = { total: -1 }; // Invalid: negative count

      const validation = result.validate();
      assert.strictEqual(validation.valid, false);
      assert.ok(validation.errors.some(e => e.includes('summary')));
    });

    test('should fail validation for non-array issues', () => {
      const result = new ScanResult();
      result.issues = 'not-an-array';

      const validation = result.validate();
      assert.strictEqual(validation.valid, false);
      assert.ok(validation.errors.some(e => e.includes('issues')));
    });
  });

  describe('updateProgress', () => {
    test('should update progress', () => {
      const result = new ScanResult();
      result.status = 'running';

      result.updateProgress(50);
      assert.strictEqual(result.progress, 50);
      assert.strictEqual(result.status, 'running');
    });

    test('should set status to completed when progress reaches 100', () => {
      const result = new ScanResult();
      result.status = 'running';

      result.updateProgress(100);
      assert.strictEqual(result.progress, 100);
      assert.strictEqual(result.status, 'completed');
    });

    test('should ignore invalid progress values', () => {
      const result = new ScanResult();
      result.progress = 50;

      result.updateProgress(150); // Invalid
      assert.strictEqual(result.progress, 50); // Unchanged

      result.updateProgress(-10); // Invalid
      assert.strictEqual(result.progress, 50); // Unchanged
    });
  });

  describe('addIssue', () => {
    test('should add a valid issue', () => {
      const result = new ScanResult();
      const issue = {
        id: 'issue_1',
        severity: 'high',
        title: 'SQL Injection',
        file: 'server.js',
        line: 42
      };

      result.addIssue(issue);
      assert.strictEqual(result.issues.length, 1);
      assert.deepStrictEqual(result.issues[0], issue);
    });

    test('should update summary after adding issue', () => {
      const result = new ScanResult();
      const issue1 = {
        id: 'issue_1',
        severity: 'critical',
        title: 'Test',
        file: 'test.js'
      };
      const issue2 = {
        id: 'issue_2',
        severity: 'high',
        title: 'Test 2',
        file: 'test.js'
      };

      result.addIssue(issue1);
      result.addIssue(issue2);

      assert.strictEqual(result.summary.total, 2);
      assert.strictEqual(result.summary.critical, 1);
      assert.strictEqual(result.summary.high, 1);
    });

    test('should throw error for invalid issue', () => {
      const result = new ScanResult();

      assert.throws(() => {
        result.addIssue(null);
      }, /Issue must be an object/);

      assert.throws(() => {
        result.addIssue({ severity: 'high' }); // Missing required fields
      }, /missing required field/);
    });
  });

  describe('complete', () => {
    test('should mark scan as completed', () => {
      const result = new ScanResult();
      result.complete(25.5);

      assert.strictEqual(result.status, 'completed');
      assert.strictEqual(result.progress, 100);
      assert.strictEqual(result.duration, 25.5);
    });
  });

  describe('fail', () => {
    test('should mark scan as failed with error message', () => {
      const result = new ScanResult();
      result.fail('Scan timeout');

      assert.strictEqual(result.status, 'failed');
      assert.strictEqual(result.error, 'Scan timeout');
    });

    test('should handle Error objects', () => {
      const result = new ScanResult();
      result.fail(new Error('Connection error'));

      assert.strictEqual(result.status, 'failed');
      assert.strictEqual(result.error, 'Connection error');
    });
  });

  describe('toJSON and fromJSON', () => {
    test('should serialize to JSON', () => {
      const result = new ScanResult({
        id: 'scan_test_123',
        type: 'security-scan',
        status: 'completed'
      });

      const json = result.toJSON();
      assert.ok(typeof json === 'object');
      assert.strictEqual(json.id, 'scan_test_123');
      assert.strictEqual(json.type, 'security-scan');
      assert.strictEqual(json.status, 'completed');
    });

    test('should deserialize from JSON', () => {
      const data = {
        id: 'scan_test_123',
        type: 'security-scan',
        timestamp: '2026-01-08T12:00:00Z',
        status: 'completed',
        progress: 100
      };

      const result = ScanResult.fromJSON(data);
      assert.ok(result instanceof ScanResult);
      assert.strictEqual(result.id, 'scan_test_123');
      assert.strictEqual(result.status, 'completed');
    });

    test('should round-trip through JSON', () => {
      const original = new ScanResult({
        id: 'scan_test_123',
        status: 'completed',
        progress: 100
      });

      const json = original.toJSON();
      const restored = ScanResult.fromJSON(json);

      assert.strictEqual(restored.id, original.id);
      assert.strictEqual(restored.status, original.status);
      assert.strictEqual(restored.progress, original.progress);
    });
  });
});
