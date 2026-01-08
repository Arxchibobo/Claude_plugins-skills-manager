/**
 * Unit tests for ReviewResult model
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const ReviewResult = require('../../../lib/security/models/ReviewResult');

describe('ReviewResult', () => {
  describe('constructor', () => {
    test('should create a new ReviewResult with default values', () => {
      const result = new ReviewResult();

      assert.ok(result.id);
      assert.strictEqual(result.type, 'code-review');
      assert.ok(result.timestamp);
      assert.deepStrictEqual(result.files, []);
      assert.strictEqual(result.status, 'pending');
      assert.deepStrictEqual(result.scores, {
        architecture: 0,
        quality: 0,
        security: 0,
        performance: 0
      });
      assert.deepStrictEqual(result.findings, []);
      assert.strictEqual(result.duration, 0);
      assert.strictEqual(result.error, null);
    });

    test('should create a new ReviewResult with provided data', () => {
      const data = {
        id: 'review_test_123',
        type: 'code-review',
        timestamp: '2026-01-08T12:00:00Z',
        files: ['/path/to/file.js'],
        status: 'completed',
        scores: { architecture: 85, quality: 78, security: 92, performance: 88 },
        findings: [{ id: 'finding_1', priority: 'P1', category: 'Security', title: 'Test Finding' }],
        duration: 18.2,
        error: null
      };

      const result = new ReviewResult(data);

      assert.strictEqual(result.id, 'review_test_123');
      assert.strictEqual(result.type, 'code-review');
      assert.strictEqual(result.timestamp, '2026-01-08T12:00:00Z');
      assert.deepStrictEqual(result.files, ['/path/to/file.js']);
      assert.strictEqual(result.status, 'completed');
      assert.deepStrictEqual(result.scores, { architecture: 85, quality: 78, security: 92, performance: 88 });
      assert.strictEqual(result.duration, 18.2);
    });
  });

  describe('validate', () => {
    test('should validate a correct ReviewResult', () => {
      const result = new ReviewResult({
        id: 'review_test_123',
        type: 'code-review',
        timestamp: '2026-01-08T12:00:00Z',
        files: ['/test.js'],
        status: 'completed',
        scores: { architecture: 85, quality: 78, security: 92, performance: 88 },
        findings: [],
        duration: 10
      });

      const validation = result.validate();
      assert.strictEqual(validation.valid, true);
      assert.strictEqual(validation.errors.length, 0);
    });

    test('should fail validation for invalid status', () => {
      const result = new ReviewResult();
      result.status = 'invalid-status';

      const validation = result.validate();
      assert.strictEqual(validation.valid, false);
      assert.ok(validation.errors.some(e => e.includes('status')));
    });

    test('should fail validation for non-array files', () => {
      const result = new ReviewResult();
      result.files = 'not-an-array';

      const validation = result.validate();
      assert.strictEqual(validation.valid, false);
      assert.ok(validation.errors.some(e => e.includes('files')));
    });

    test('should fail validation for invalid scores', () => {
      const result = new ReviewResult();
      result.scores.architecture = 150; // Invalid: > 100

      const validation = result.validate();
      assert.strictEqual(validation.valid, false);
      assert.ok(validation.errors.some(e => e.includes('architecture')));
    });

    test('should fail validation for negative scores', () => {
      const result = new ReviewResult();
      result.scores.quality = -10;

      const validation = result.validate();
      assert.strictEqual(validation.valid, false);
      assert.ok(validation.errors.some(e => e.includes('quality')));
    });

    test('should fail validation for negative duration', () => {
      const result = new ReviewResult();
      result.duration = -5;

      const validation = result.validate();
      assert.strictEqual(validation.valid, false);
      assert.ok(validation.errors.some(e => e.includes('duration')));
    });

    test('should fail validation for non-array findings', () => {
      const result = new ReviewResult();
      result.findings = 'not-an-array';

      const validation = result.validate();
      assert.strictEqual(validation.valid, false);
      assert.ok(validation.errors.some(e => e.includes('findings')));
    });
  });

  describe('updateScores', () => {
    test('should update scores', () => {
      const result = new ReviewResult();

      result.updateScores({ architecture: 90, quality: 85 });
      assert.strictEqual(result.scores.architecture, 90);
      assert.strictEqual(result.scores.quality, 85);
    });

    test('should throw error for invalid score field', () => {
      const result = new ReviewResult();

      assert.throws(() => {
        result.updateScores({ invalid_field: 80 });
      }, /Invalid score field/);
    });

    test('should throw error for invalid score value', () => {
      const result = new ReviewResult();

      assert.throws(() => {
        result.updateScores({ architecture: 150 }); // > 100
      }, /must be a number between 0 and 100/);

      assert.throws(() => {
        result.updateScores({ quality: -10 }); // < 0
      }, /must be a number between 0 and 100/);
    });

    test('should throw error for non-object scores', () => {
      const result = new ReviewResult();

      assert.throws(() => {
        result.updateScores(null);
      }, /Scores must be an object/);
    });
  });

  describe('addFinding', () => {
    test('should add a valid finding', () => {
      const result = new ReviewResult();
      const finding = {
        id: 'finding_1',
        priority: 'P1',
        category: 'Security',
        title: 'SQL Injection Risk',
        file: 'server.js',
        line: 42
      };

      result.addFinding(finding);
      assert.strictEqual(result.findings.length, 1);
      assert.deepStrictEqual(result.findings[0], finding);
    });

    test('should throw error for invalid finding', () => {
      const result = new ReviewResult();

      assert.throws(() => {
        result.addFinding(null);
      }, /Finding must be an object/);

      assert.throws(() => {
        result.addFinding({ priority: 'P1' }); // Missing required fields
      }, /missing required field/);
    });

    test('should throw error for invalid priority', () => {
      const result = new ReviewResult();
      const finding = {
        id: 'finding_1',
        priority: 'INVALID',
        category: 'Security',
        title: 'Test'
      };

      assert.throws(() => {
        result.addFinding(finding);
      }, /Invalid priority/);
    });

    test('should throw error for invalid category', () => {
      const result = new ReviewResult();
      const finding = {
        id: 'finding_1',
        priority: 'P1',
        category: 'INVALID',
        title: 'Test'
      };

      assert.throws(() => {
        result.addFinding(finding);
      }, /Invalid category/);
    });
  });

  describe('getFindingsByPriority', () => {
    test('should filter findings by priority', () => {
      const result = new ReviewResult();
      result.addFinding({ id: 'f1', priority: 'P0', category: 'Security', title: 'Critical' });
      result.addFinding({ id: 'f2', priority: 'P1', category: 'Architecture', title: 'Important' });
      result.addFinding({ id: 'f3', priority: 'P0', category: 'Quality', title: 'Another Critical' });

      const p0Findings = result.getFindingsByPriority('P0');
      assert.strictEqual(p0Findings.length, 2);
      assert.ok(p0Findings.every(f => f.priority === 'P0'));
    });
  });

  describe('getFindingsByCategory', () => {
    test('should filter findings by category', () => {
      const result = new ReviewResult();
      result.addFinding({ id: 'f1', priority: 'P0', category: 'Security', title: 'SQL Injection' });
      result.addFinding({ id: 'f2', priority: 'P1', category: 'Architecture', title: 'Tight Coupling' });
      result.addFinding({ id: 'f3', priority: 'P2', category: 'Security', title: 'XSS Risk' });

      const securityFindings = result.getFindingsByCategory('Security');
      assert.strictEqual(securityFindings.length, 2);
      assert.ok(securityFindings.every(f => f.category === 'Security'));
    });
  });

  describe('getAverageScore', () => {
    test('should calculate average score', () => {
      const result = new ReviewResult();
      result.updateScores({
        architecture: 80,
        quality: 90,
        security: 70,
        performance: 60
      });

      const average = result.getAverageScore();
      assert.strictEqual(average, 75); // (80 + 90 + 70 + 60) / 4 = 75
    });

    test('should round average score', () => {
      const result = new ReviewResult();
      result.updateScores({
        architecture: 85,
        quality: 78,
        security: 92,
        performance: 88
      });

      const average = result.getAverageScore();
      assert.strictEqual(average, 86); // (85 + 78 + 92 + 88) / 4 = 85.75 => 86
    });
  });

  describe('complete', () => {
    test('should mark review as completed', () => {
      const result = new ReviewResult();
      result.complete(18.2);

      assert.strictEqual(result.status, 'completed');
      assert.strictEqual(result.duration, 18.2);
    });
  });

  describe('fail', () => {
    test('should mark review as failed with error message', () => {
      const result = new ReviewResult();
      result.fail('Review timeout');

      assert.strictEqual(result.status, 'failed');
      assert.strictEqual(result.error, 'Review timeout');
    });

    test('should handle Error objects', () => {
      const result = new ReviewResult();
      result.fail(new Error('CLI error'));

      assert.strictEqual(result.status, 'failed');
      assert.strictEqual(result.error, 'CLI error');
    });
  });

  describe('toJSON and fromJSON', () => {
    test('should serialize to JSON', () => {
      const result = new ReviewResult({
        id: 'review_test_123',
        type: 'code-review',
        status: 'completed',
        scores: { architecture: 85, quality: 78, security: 92, performance: 88 }
      });

      const json = result.toJSON();
      assert.ok(typeof json === 'object');
      assert.strictEqual(json.id, 'review_test_123');
      assert.strictEqual(json.type, 'code-review');
      assert.strictEqual(json.status, 'completed');
      assert.deepStrictEqual(json.scores, { architecture: 85, quality: 78, security: 92, performance: 88 });
    });

    test('should deserialize from JSON', () => {
      const data = {
        id: 'review_test_123',
        type: 'code-review',
        timestamp: '2026-01-08T12:00:00Z',
        status: 'completed',
        scores: { architecture: 85, quality: 78, security: 92, performance: 88 }
      };

      const result = ReviewResult.fromJSON(data);
      assert.ok(result instanceof ReviewResult);
      assert.strictEqual(result.id, 'review_test_123');
      assert.strictEqual(result.status, 'completed');
    });

    test('should round-trip through JSON', () => {
      const original = new ReviewResult({
        id: 'review_test_123',
        status: 'completed',
        scores: { architecture: 85, quality: 78, security: 92, performance: 88 }
      });

      const json = original.toJSON();
      const restored = ReviewResult.fromJSON(json);

      assert.strictEqual(restored.id, original.id);
      assert.strictEqual(restored.status, original.status);
      assert.deepStrictEqual(restored.scores, original.scores);
    });
  });
});
