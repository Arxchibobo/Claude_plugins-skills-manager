/**
 * Unit tests for ResultParser service
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs').promises;

const ResultParser = require('../../../lib/security/services/ResultParser');
const ScanResult = require('../../../lib/security/models/ScanResult');
const ReviewResult = require('../../../lib/security/models/ReviewResult');

describe('ResultParser', () => {
  let parser;

  beforeEach(() => {
    parser = new ResultParser();
  });

  describe('_detectFormat', () => {
    test('should detect JSON format from object start', () => {
      const jsonOutput = '{"issues": []}';
      const format = parser._detectFormat(jsonOutput);
      assert.strictEqual(format, 'json');
    });

    test('should detect JSON format from array start', () => {
      const jsonOutput = '[{"issue": "test"}]';
      const format = parser._detectFormat(jsonOutput);
      assert.strictEqual(format, 'json');
    });

    test('should detect markdown format for non-JSON', () => {
      const markdownOutput = '## Security Issues\n- Issue 1';
      const format = parser._detectFormat(markdownOutput);
      assert.strictEqual(format, 'markdown');
    });

    test('should default to markdown for empty input', () => {
      const format = parser._detectFormat('');
      assert.strictEqual(format, 'markdown');
    });

    test('should default to markdown for invalid JSON', () => {
      const invalidJson = '{invalid json';
      const format = parser._detectFormat(invalidJson);
      assert.strictEqual(format, 'markdown');
    });
  });

  describe('_normalizeSeverity', () => {
    test('should normalize standard severity levels', () => {
      assert.strictEqual(parser._normalizeSeverity('critical'), 'critical');
      assert.strictEqual(parser._normalizeSeverity('high'), 'high');
      assert.strictEqual(parser._normalizeSeverity('medium'), 'medium');
      assert.strictEqual(parser._normalizeSeverity('low'), 'low');
    });

    test('should normalize alternative severity names', () => {
      assert.strictEqual(parser._normalizeSeverity('severe'), 'critical');
      assert.strictEqual(parser._normalizeSeverity('error'), 'high');
      assert.strictEqual(parser._normalizeSeverity('warning'), 'medium');
      assert.strictEqual(parser._normalizeSeverity('info'), 'low');
      assert.strictEqual(parser._normalizeSeverity('moderate'), 'medium');
    });

    test('should be case insensitive', () => {
      assert.strictEqual(parser._normalizeSeverity('CRITICAL'), 'critical');
      assert.strictEqual(parser._normalizeSeverity('High'), 'high');
      assert.strictEqual(parser._normalizeSeverity('MEDIUM'), 'medium');
    });

    test('should default to low for unknown severity', () => {
      assert.strictEqual(parser._normalizeSeverity('unknown'), 'low');
      assert.strictEqual(parser._normalizeSeverity(''), 'low');
      assert.strictEqual(parser._normalizeSeverity(null), 'low');
    });
  });

  describe('_normalizePriority', () => {
    test('should normalize standard priority levels', () => {
      assert.strictEqual(parser._normalizePriority('P0'), 'P0');
      assert.strictEqual(parser._normalizePriority('P1'), 'P1');
      assert.strictEqual(parser._normalizePriority('P2'), 'P2');
      assert.strictEqual(parser._normalizePriority('P3'), 'P3');
    });

    test('should normalize alternative priority names', () => {
      assert.strictEqual(parser._normalizePriority('critical'), 'P0');
      assert.strictEqual(parser._normalizePriority('blocker'), 'P0');
      assert.strictEqual(parser._normalizePriority('high'), 'P1');
      assert.strictEqual(parser._normalizePriority('important'), 'P1');
      assert.strictEqual(parser._normalizePriority('medium'), 'P2');
      assert.strictEqual(parser._normalizePriority('normal'), 'P2');
      assert.strictEqual(parser._normalizePriority('low'), 'P3');
      assert.strictEqual(parser._normalizePriority('minor'), 'P3');
    });

    test('should be case insensitive', () => {
      assert.strictEqual(parser._normalizePriority('p0'), 'P0');
      assert.strictEqual(parser._normalizePriority('CRITICAL'), 'P0');
      assert.strictEqual(parser._normalizePriority('High'), 'P1');
    });

    test('should default to P2 for unknown priority', () => {
      assert.strictEqual(parser._normalizePriority('unknown'), 'P2');
      assert.strictEqual(parser._normalizePriority(''), 'P2');
      assert.strictEqual(parser._normalizePriority(null), 'P2');
    });
  });

  describe('parseScanResult - JSON format', () => {
    test('should parse valid JSON scan output', () => {
      const jsonOutput = JSON.stringify({
        issues: [
          {
            id: 'issue_1',
            severity: 'high',
            file: 'server.js',
            line: 42,
            column: 10,
            description: 'Potential SQL injection',
            rule: 'security/sql-injection'
          },
          {
            id: 'issue_2',
            severity: 'medium',
            file: 'api.js',
            line: 15,
            description: 'Missing input validation'
          }
        ]
      });

      const result = parser.parseScanResult(jsonOutput);

      assert.ok(result instanceof ScanResult);
      assert.strictEqual(result.issues.length, 2);
      assert.strictEqual(result.issues[0].severity, 'high');
      assert.strictEqual(result.issues[0].file, 'server.js');
      assert.strictEqual(result.issues[0].line, 42);
      assert.strictEqual(result.issues[1].severity, 'medium');
    });

    test('should normalize severity in JSON output', () => {
      const jsonOutput = JSON.stringify({
        issues: [
          { severity: 'error', file: 'test.js', description: 'Error' },
          { severity: 'warning', file: 'test.js', description: 'Warning' },
          { severity: 'info', file: 'test.js', description: 'Info' }
        ]
      });

      const result = parser.parseScanResult(jsonOutput);

      assert.strictEqual(result.issues[0].severity, 'high'); // error -> high
      assert.strictEqual(result.issues[1].severity, 'medium'); // warning -> medium
      assert.strictEqual(result.issues[2].severity, 'low'); // info -> low
    });

    test('should handle missing optional fields in JSON', () => {
      const jsonOutput = JSON.stringify({
        issues: [
          {
            severity: 'high',
            description: 'Issue without file/line'
          }
        ]
      });

      const result = parser.parseScanResult(jsonOutput);

      assert.strictEqual(result.issues.length, 1);
      assert.strictEqual(result.issues[0].file, 'unknown');
      assert.strictEqual(result.issues[0].line, 0);
      assert.ok(result.issues[0].id); // Should generate ID
    });

    test('should extract metadata from JSON', () => {
      const jsonOutput = JSON.stringify({
        issues: [],
        metadata: {
          scanTime: 1234567890,
          tool: 'security-scanner'
        }
      });

      const result = parser.parseScanResult(jsonOutput);

      assert.ok(result.metadata);
      assert.strictEqual(result.metadata.scanTime, 1234567890);
      assert.strictEqual(result.metadata.tool, 'security-scanner');
    });

    test('should throw error for invalid JSON', () => {
      const invalidJson = '{invalid json}';

      assert.throws(() => {
        parser.parseScanResult(invalidJson, { format: 'json' });
      }, /Failed to parse JSON output/);
    });
  });

  describe('parseScanResult - Markdown format', () => {
    test('should parse markdown formatted issues', () => {
      const markdownOutput = `
## Security Issues

- [high] server.js:42 - Potential SQL injection
- [medium] api.js:15 - Missing input validation
- [low] utils.js:8 - Code smell
      `.trim();

      const result = parser.parseScanResult(markdownOutput, { format: 'markdown' });

      assert.ok(result instanceof ScanResult);
      assert.strictEqual(result.issues.length, 3);
      assert.strictEqual(result.issues[0].severity, 'high');
      assert.strictEqual(result.issues[0].file, 'server.js');
      assert.strictEqual(result.issues[0].line, 42);
    });

    test('should handle alternative markdown patterns', () => {
      const markdownOutput = `
## Issues

- server.js:10:5 - [critical] Buffer overflow risk
- api.js:20:1 - [error] Unhandled exception
      `.trim();

      const result = parser.parseScanResult(markdownOutput, { format: 'markdown' });

      assert.strictEqual(result.issues.length, 2);
      assert.strictEqual(result.issues[0].severity, 'critical');
      assert.strictEqual(result.issues[0].column, 5);
      assert.strictEqual(result.issues[1].severity, 'high'); // error -> high
    });

    test('should handle empty markdown output', () => {
      const result = parser.parseScanResult('', { format: 'markdown' });

      assert.ok(result instanceof ScanResult);
      assert.strictEqual(result.issues.length, 0);
    });
  });

  describe('parseScanResult - Auto format detection', () => {
    test('should auto-detect JSON format', () => {
      const jsonOutput = JSON.stringify({ issues: [] });
      const result = parser.parseScanResult(jsonOutput); // No format specified

      assert.ok(result instanceof ScanResult);
    });

    test('should auto-detect markdown format', () => {
      const markdownOutput = '## Issues\n- [high] test.js:1 - Test';
      const result = parser.parseScanResult(markdownOutput); // No format specified

      assert.ok(result instanceof ScanResult);
      assert.strictEqual(result.issues.length, 1);
    });
  });

  describe('parseReviewResult - JSON format', () => {
    test('should parse valid JSON review output', () => {
      const jsonOutput = JSON.stringify({
        files: ['server.js', 'api.js'],
        scores: {
          architecture: 85,
          quality: 78,
          security: 92,
          performance: 88
        },
        findings: [
          {
            id: 'finding_1',
            priority: 'P0',
            category: 'Security',
            title: 'SQL Injection Risk',
            file: 'server.js',
            line: 42
          },
          {
            id: 'finding_2',
            priority: 'P1',
            category: 'Architecture',
            title: 'Tight Coupling'
          }
        ]
      });

      const result = parser.parseReviewResult(jsonOutput);

      assert.ok(result instanceof ReviewResult);
      assert.deepStrictEqual(result.files, ['server.js', 'api.js']);
      assert.strictEqual(result.scores.architecture, 85);
      assert.strictEqual(result.scores.quality, 78);
      assert.strictEqual(result.findings.length, 2);
      assert.strictEqual(result.findings[0].priority, 'P0');
    });

    test('should normalize priority in JSON output', () => {
      const jsonOutput = JSON.stringify({
        findings: [
          { priority: 'critical', category: 'Security', title: 'Critical issue' },
          { priority: 'high', category: 'Quality', title: 'High priority' },
          { priority: 'low', category: 'Performance', title: 'Low priority' }
        ]
      });

      const result = parser.parseReviewResult(jsonOutput);

      assert.strictEqual(result.findings[0].priority, 'P0'); // critical -> P0
      assert.strictEqual(result.findings[1].priority, 'P1'); // high -> P1
      assert.strictEqual(result.findings[2].priority, 'P3'); // low -> P3
    });

    test('should handle missing scores in JSON', () => {
      const jsonOutput = JSON.stringify({
        findings: []
      });

      const result = parser.parseReviewResult(jsonOutput);

      assert.strictEqual(result.scores.architecture, 0);
      assert.strictEqual(result.scores.quality, 0);
      assert.strictEqual(result.scores.security, 0);
      assert.strictEqual(result.scores.performance, 0);
    });
  });

  describe('parseReviewResult - Markdown format', () => {
    test('should parse markdown formatted review', () => {
      const markdownOutput = `
# Code Review Results

Architecture: 85
Quality: 78
Security: 92
Performance: 88

## Findings

- [P0] Security: SQL Injection Risk
- [P1] Architecture: Tight Coupling
- [P2] Quality: Missing tests
      `.trim();

      const result = parser.parseReviewResult(markdownOutput, { format: 'markdown' });

      assert.ok(result instanceof ReviewResult);
      assert.strictEqual(result.scores.architecture, 85);
      assert.strictEqual(result.scores.quality, 78);
      assert.strictEqual(result.findings.length, 3);
    });

    test('should handle alternative score formats', () => {
      const markdownOutput = `
Architecture score: 90
quality: 85
SECURITY: 95
      `.trim();

      const result = parser.parseReviewResult(markdownOutput, { format: 'markdown' });

      assert.strictEqual(result.scores.architecture, 90);
      assert.strictEqual(result.scores.quality, 85);
      assert.strictEqual(result.scores.security, 95);
    });

    test('should handle empty markdown review', () => {
      const result = parser.parseReviewResult('', { format: 'markdown' });

      assert.ok(result instanceof ReviewResult);
      assert.strictEqual(result.findings.length, 0);
    });
  });

  describe('parseReviewResult - Auto format detection', () => {
    test('should auto-detect JSON format', () => {
      const jsonOutput = JSON.stringify({ scores: {}, findings: [] });
      const result = parser.parseReviewResult(jsonOutput); // No format specified

      assert.ok(result instanceof ReviewResult);
    });

    test('should auto-detect markdown format', () => {
      const markdownOutput = '## Review\nArchitecture: 80';
      const result = parser.parseReviewResult(markdownOutput); // No format specified

      assert.ok(result instanceof ReviewResult);
    });
  });
});
