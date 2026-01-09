/**
 * Unit tests for ClaudeIntegration service
 */

const { test, describe, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs').promises;

// Mock child_process before requiring ClaudeIntegration
const mockExecFile = mock.fn();
const childProcess = require('child_process');
childProcess.execFile = mockExecFile;

const ClaudeIntegration = require('../../../lib/security/services/ClaudeIntegration');

describe('ClaudeIntegration', () => {
  let integration;

  beforeEach(() => {
    integration = new ClaudeIntegration();
    mockExecFile.mock.resetCalls();
  });

  describe('constructor', () => {
    test('should create instance with default config', () => {
      const instance = new ClaudeIntegration();
      assert.strictEqual(instance.getCliCommand(), 'claude');
      assert.ok(instance.config.timeout);
      assert.ok(instance.config.maxBuffer);
    });

    test('should accept custom config', () => {
      const customConfig = { timeout: 60000, maxBuffer: 5000000 };
      const instance = new ClaudeIntegration(customConfig);
      assert.strictEqual(instance.config.timeout, 60000);
      assert.strictEqual(instance.config.maxBuffer, 5000000);
    });
  });

  describe('checkClaudeAvailability', () => {
    test('should return available=true when CLI is found', async () => {
      // Mock successful version check
      mockExecFile.mock.mockImplementation((cmd, args, options, callback) => {
        callback(null, { stdout: 'Claude Code CLI v1.0.0\n', stderr: '' });
      });

      const result = await integration.checkClaudeAvailability();

      assert.strictEqual(result.available, true);
      assert.strictEqual(result.version, 'Claude Code CLI v1.0.0');
      assert.strictEqual(result.error, null);

      // Verify command called correctly
      assert.strictEqual(mockExecFile.mock.calls.length, 1);
      const call = mockExecFile.mock.calls[0];
      assert.strictEqual(call.arguments[0], 'claude');
      assert.deepStrictEqual(call.arguments[1], ['--version']);
    });

    test('should return available=false when CLI not found', async () => {
      // Mock ENOENT error (command not found)
      mockExecFile.mock.mockImplementation((cmd, args, options, callback) => {
        const error = new Error('Command not found');
        error.code = 'ENOENT';
        callback(error);
      });

      const result = await integration.checkClaudeAvailability();

      assert.strictEqual(result.available, false);
      assert.strictEqual(result.version, null);
      assert.ok(result.error.includes('not found'));
    });

    test('should handle timeout errors', async () => {
      // Mock timeout error
      mockExecFile.mock.mockImplementation((cmd, args, options, callback) => {
        const error = new Error('Timeout');
        error.killed = true;
        error.signal = 'SIGTERM';
        callback(error);
      });

      const result = await integration.checkClaudeAvailability();

      assert.strictEqual(result.available, false);
      assert.ok(result.error.includes('timed out'));
    });
  });

  describe('runSecurityScan', () => {
    test('should throw error if path is missing', async () => {
      await assert.rejects(
        () => integration.runSecurityScan({}),
        /Scan path is required/
      );
    });

    test('should throw error if path does not exist', async () => {
      await assert.rejects(
        () => integration.runSecurityScan({ path: '/nonexistent/path' }),
        /Path does not exist/
      );
    });

    test('should build correct command arguments for basic scan', async () => {
      // Create a temporary file to scan
      const tempFile = path.join(__dirname, '../../fixtures/temp-scan-test.js');
      await fs.writeFile(tempFile, '// Test file', 'utf-8');

      // Mock successful scan
      mockExecFile.mock.mockImplementation((cmd, args, options, callback) => {
        callback(null, {
          stdout: JSON.stringify({ issues: [] }),
          stderr: ''
        });
      });

      try {
        await integration.runSecurityScan({ path: tempFile });

        // Verify command structure - using -p (print mode)
        assert.strictEqual(mockExecFile.mock.calls.length, 1);
        const call = mockExecFile.mock.calls[0];
        const args = call.arguments[1];

        assert.strictEqual(args[0], '-p');
        assert.ok(args[1].includes('security')); // Check prompt contains security
        assert.strictEqual(args[2], '--output-format');
        assert.strictEqual(args[3], 'json');
        assert.strictEqual(args[4], '--add-dir');
        assert.ok(path.isAbsolute(args[5]));
      } finally {
        // Cleanup
        await fs.unlink(tempFile).catch(() => {});
      }
    });

    test('should include scope parameter when provided', async () => {
      const tempFile = path.join(__dirname, '../../fixtures/temp-scan-scope.js');
      await fs.writeFile(tempFile, '// Test file', 'utf-8');

      mockExecFile.mock.mockImplementation((cmd, args, options, callback) => {
        callback(null, { stdout: '{}', stderr: '' });
      });

      try {
        await integration.runSecurityScan({
          path: tempFile,
          scope: 'full'
        });

        const call = mockExecFile.mock.calls[0];
        const args = call.arguments[1];

        // Scope is included in the prompt, not as a separate arg
        assert.strictEqual(args[0], '-p');
        assert.ok(args[1].includes('comprehensive security audit'));
      } finally {
        await fs.unlink(tempFile).catch(() => {});
      }
    });

    test('should include exclude patterns when provided', async () => {
      const tempFile = path.join(__dirname, '../../fixtures/temp-scan-exclude.js');
      await fs.writeFile(tempFile, '// Test file', 'utf-8');

      mockExecFile.mock.mockImplementation((cmd, args, options, callback) => {
        callback(null, { stdout: '{}', stderr: '' });
      });

      try {
        await integration.runSecurityScan({
          path: tempFile,
          exclude: ['node_modules', '*.test.js']
        });

        const call = mockExecFile.mock.calls[0];
        const args = call.arguments[1];

        // Exclude patterns are included in the prompt
        assert.strictEqual(args[0], '-p');
        assert.ok(args[1].includes('Exclude these patterns:'));
        assert.ok(args[1].includes('node_modules'));
        assert.ok(args[1].includes('*.test.js'));
      } finally {
        await fs.unlink(tempFile).catch(() => {});
      }
    });

    test('should return success result on successful scan', async () => {
      const tempFile = path.join(__dirname, '../../fixtures/temp-scan-success.js');
      await fs.writeFile(tempFile, '// Test file', 'utf-8');

      const scanOutput = JSON.stringify({ issues: [] });
      mockExecFile.mock.mockImplementation((cmd, args, options, callback) => {
        callback(null, { stdout: scanOutput, stderr: '' });
      });

      try {
        const result = await integration.runSecurityScan({ path: tempFile });

        assert.strictEqual(result.success, true);
        assert.strictEqual(result.output, scanOutput);
        assert.strictEqual(result.error, null);
      } finally {
        await fs.unlink(tempFile).catch(() => {});
      }
    });

    test('should handle CLI execution errors gracefully', async () => {
      const tempFile = path.join(__dirname, '../../fixtures/temp-scan-error.js');
      await fs.writeFile(tempFile, '// Test file', 'utf-8');

      mockExecFile.mock.mockImplementation((cmd, args, options, callback) => {
        const error = new Error('Scan failed');
        error.stdout = '';
        error.stderr = 'Error details';
        callback(error);
      });

      try {
        const result = await integration.runSecurityScan({ path: tempFile });

        assert.strictEqual(result.success, false);
        assert.ok(result.error.includes('Scan failed'));
      } finally {
        await fs.unlink(tempFile).catch(() => {});
      }
    });
  });

  describe('runCodeReview', () => {
    test('should throw error if files are missing', async () => {
      await assert.rejects(
        () => integration.runCodeReview({}),
        /Files to review are required/
      );
    });

    test('should throw error if files array is empty', async () => {
      await assert.rejects(
        () => integration.runCodeReview({ files: [] }),
        /At least one file must be specified/
      );
    });

    test('should accept single file as string', async () => {
      const tempFile = path.join(__dirname, '../../fixtures/temp-review-single.js');
      await fs.writeFile(tempFile, '// Test file', 'utf-8');

      mockExecFile.mock.mockImplementation((cmd, args, options, callback) => {
        callback(null, { stdout: '{}', stderr: '' });
      });

      try {
        await integration.runCodeReview({ files: tempFile });

        const call = mockExecFile.mock.calls[0];
        const args = call.arguments[1];

        // Using -p mode with prompt containing file path
        assert.strictEqual(args[0], '-p');
        assert.ok(args[1].includes('code review'));
        assert.ok(args[1].includes(path.resolve(tempFile)));
      } finally {
        await fs.unlink(tempFile).catch(() => {});
      }
    });

    test('should accept multiple files as array', async () => {
      const tempFile1 = path.join(__dirname, '../../fixtures/temp-review-multi1.js');
      const tempFile2 = path.join(__dirname, '../../fixtures/temp-review-multi2.js');
      await fs.writeFile(tempFile1, '// Test file 1', 'utf-8');
      await fs.writeFile(tempFile2, '// Test file 2', 'utf-8');

      mockExecFile.mock.mockImplementation((cmd, args, options, callback) => {
        callback(null, { stdout: '{}', stderr: '' });
      });

      try {
        await integration.runCodeReview({ files: [tempFile1, tempFile2] });

        const call = mockExecFile.mock.calls[0];
        const args = call.arguments[1];

        // Using -p mode with prompt containing both file paths
        assert.strictEqual(args[0], '-p');
        assert.ok(args[1].includes(path.resolve(tempFile1)));
        assert.ok(args[1].includes(path.resolve(tempFile2)));
      } finally {
        await fs.unlink(tempFile1).catch(() => {});
        await fs.unlink(tempFile2).catch(() => {});
      }
    });

    test('should include focus parameter when provided', async () => {
      const tempFile = path.join(__dirname, '../../fixtures/temp-review-focus.js');
      await fs.writeFile(tempFile, '// Test file', 'utf-8');

      mockExecFile.mock.mockImplementation((cmd, args, options, callback) => {
        callback(null, { stdout: '{}', stderr: '' });
      });

      try {
        await integration.runCodeReview({
          files: tempFile,
          focus: 'security'
        });

        const call = mockExecFile.mock.calls[0];
        const args = call.arguments[1];

        // Focus is included in the prompt
        assert.strictEqual(args[0], '-p');
        assert.ok(args[1].includes('Security vulnerabilities'));
      } finally {
        await fs.unlink(tempFile).catch(() => {});
      }
    });

    test('should build correct command for code review', async () => {
      const tempFile = path.join(__dirname, '../../fixtures/temp-review-cmd.js');
      await fs.writeFile(tempFile, '// Test file', 'utf-8');

      mockExecFile.mock.mockImplementation((cmd, args, options, callback) => {
        callback(null, { stdout: '{}', stderr: '' });
      });

      try {
        await integration.runCodeReview({ files: tempFile });

        const call = mockExecFile.mock.calls[0];
        const args = call.arguments[1];

        // Using -p (print mode) with prompt and --output-format json
        assert.strictEqual(args[0], '-p');
        assert.ok(args[1].includes('code review'));
        assert.strictEqual(args[2], '--output-format');
        assert.strictEqual(args[3], 'json');
        assert.ok(args.includes('--add-dir'));
      } finally {
        await fs.unlink(tempFile).catch(() => {});
      }
    });
  });

  describe('_validatePath', () => {
    test('should throw error for invalid path type', async () => {
      await assert.rejects(
        () => integration._validatePath(null),
        /Invalid path/
      );

      await assert.rejects(
        () => integration._validatePath(123),
        /Invalid path/
      );
    });

    test('should throw error for non-existent path', async () => {
      await assert.rejects(
        () => integration._validatePath('/this/path/does/not/exist'),
        /Path does not exist/
      );
    });

    test('should succeed for existing file', async () => {
      const tempFile = path.join(__dirname, '../../fixtures/temp-validate.js');
      await fs.writeFile(tempFile, '// Test file', 'utf-8');

      try {
        await integration._validatePath(tempFile);
        // Should not throw
        assert.ok(true);
      } finally {
        await fs.unlink(tempFile).catch(() => {});
      }
    });
  });

  describe('_normalizeError', () => {
    test('should handle timeout errors', () => {
      const error = new Error('Timeout');
      error.killed = true;
      error.signal = 'SIGTERM';

      const message = integration._normalizeError(error);
      assert.ok(message.includes('timed out'));
    });

    test('should handle command not found', () => {
      const error = new Error('ENOENT');
      error.code = 'ENOENT';

      const message = integration._normalizeError(error);
      assert.ok(message.includes('not found'));
    });

    test('should handle permission denied', () => {
      const error = new Error('EACCES');
      error.code = 'EACCES';

      const message = integration._normalizeError(error);
      assert.ok(message.includes('Permission denied'));
    });

    test('should handle buffer overflow', () => {
      const error = new Error('Buffer overflow');
      error.code = 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER';

      const message = integration._normalizeError(error);
      assert.ok(message.includes('exceeded'));
    });

    test('should include stderr in error message', () => {
      const error = new Error('CLI error');
      error.stderr = 'Detailed error info';

      const message = integration._normalizeError(error);
      assert.ok(message.includes('Detailed error info'));
    });
  });

  describe('updateConfig', () => {
    test('should update configuration', () => {
      const newConfig = { timeout: 30000 };
      integration.updateConfig(newConfig);

      assert.strictEqual(integration.config.timeout, 30000);
    });

    test('should merge with existing config', () => {
      const originalMaxBuffer = integration.config.maxBuffer;
      integration.updateConfig({ timeout: 30000 });

      assert.strictEqual(integration.config.timeout, 30000);
      assert.strictEqual(integration.config.maxBuffer, originalMaxBuffer);
    });
  });
});
