const assert = require('assert');
const ExtensionManager = require('../../../lib/marketplace/manager/ExtensionManager');
const Extension = require('../../../lib/marketplace/models/Extension');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

/**
 * ExtensionManager Unit Tests
 *
 * Tests cover:
 * - Registry loading and saving with atomic writes
 * - File locking for concurrent access
 * - CRUD operations on extensions
 * - Registry statistics
 */

// Helper to create temp registry
function createTempRegistry() {
  const tempDir = path.join(os.tmpdir(), `test-registry-${Date.now()}-${Math.random().toString(36).substring(7)}`);
  return new ExtensionManager({
    registryPath: path.join(tempDir, 'registry.json'),
    extensionsDir: path.join(tempDir, 'extensions')
  });
}

// Helper to wait
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Test Suite
async function runTests() {
  console.log('\n=== ExtensionManager Unit Tests ===\n');

  let testsRun = 0;
  let testsPassed = 0;
  let testsFailed = 0;

  async function test(name, fn) {
    testsRun++;
    try {
      await fn();
      testsPassed++;
      console.log(`✓ ${name}`);
    } catch (error) {
      testsFailed++;
      console.error(`✗ ${name}`);
      console.error(`  Error: ${error.message}`);
      if (error.stack) {
        console.error(`  Stack: ${error.stack.split('\n').slice(0, 3).join('\n')}`);
      }
    }
  }

  // Test 1: Initialization
  await test('should initialize with default configuration', async () => {
    const manager = new ExtensionManager();

    assert.ok(manager.registryPath.includes('registry.json'));
    assert.ok(manager.extensionsDir.includes('installed'));
    assert.strictEqual(manager.isLoaded, false);
  });

  // Test 2: Create directories
  await test('should create required directories on initialize', async () => {
    const manager = createTempRegistry();

    await manager.initialize();

    // Check that directories were created
    const registryDir = path.dirname(manager.registryPath);
    const registryDirStat = await fs.stat(registryDir);
    const extensionsDirStat = await fs.stat(manager.extensionsDir);

    assert.ok(registryDirStat.isDirectory());
    assert.ok(extensionsDirStat.isDirectory());
  });

  // Test 3: Load empty registry
  await test('should initialize empty registry when file does not exist', async () => {
    const manager = createTempRegistry();

    await manager.initialize();

    assert.strictEqual(manager.isLoaded, true);
    assert.strictEqual(manager.registry.size, 0);
  });

  // Test 4: Save and load registry
  await test('should save and load registry correctly', async () => {
    const manager = createTempRegistry();
    await manager.initialize();

    // Create test extension
    const extension = new Extension({
      name: 'test-plugin',
      owner: { login: 'test-author' },
      description: 'Test plugin',
      html_url: 'https://github.com/test-author/test-plugin',
      stargazers_count: 100,
      topics: ['claude-code-plugin']
    }, { isInstalled: true });

    await manager.addExtension(extension);

    // Create new manager instance and load
    const manager2 = new ExtensionManager({
      registryPath: manager.registryPath,
      extensionsDir: manager.extensionsDir
    });

    await manager2.loadRegistry();

    assert.strictEqual(manager2.registry.size, 1);
    const loaded = manager2.getExtension('test-author/test-plugin');
    assert.ok(loaded);
    assert.strictEqual(loaded.name, 'test-plugin');
    assert.strictEqual(loaded.isInstalled, true);
  });

  // Test 5: File locking
  await test('should prevent concurrent writes with file locking', async () => {
    const manager = createTempRegistry();
    await manager.initialize();

    const extension1 = new Extension({
      name: 'plugin-1',
      owner: { login: 'author' },
      html_url: 'https://github.com/author/plugin-1',
      topics: ['claude-code-plugin']
    });

    const extension2 = new Extension({
      name: 'plugin-2',
      owner: { login: 'author' },
      html_url: 'https://github.com/author/plugin-2',
      topics: ['claude-code-plugin']
    });

    // Start concurrent writes
    const promise1 = manager.addExtension(extension1);
    const promise2 = manager.addExtension(extension2);

    await Promise.all([promise1, promise2]);

    // Reload and verify both extensions are saved
    const manager2 = new ExtensionManager({
      registryPath: manager.registryPath,
      extensionsDir: manager.extensionsDir
    });

    await manager2.loadRegistry();

    assert.strictEqual(manager2.registry.size, 2);
    assert.ok(manager2.getExtension('author/plugin-1'));
    assert.ok(manager2.getExtension('author/plugin-2'));
  });

  // Test 6: Get installed extensions
  await test('should return only installed extensions', async () => {
    const manager = createTempRegistry();
    await manager.initialize();

    const ext1 = new Extension({
      name: 'installed-plugin',
      owner: { login: 'author' },
      html_url: 'https://github.com/author/installed-plugin',
      topics: ['claude-code-plugin']
    }, { isInstalled: true });

    const ext2 = new Extension({
      name: 'not-installed-plugin',
      owner: { login: 'author' },
      html_url: 'https://github.com/author/not-installed-plugin',
      topics: ['claude-code-plugin']
    }, { isInstalled: false });

    await manager.addExtension(ext1);
    await manager.addExtension(ext2);

    const installed = manager.getInstalledExtensions();

    assert.strictEqual(installed.length, 1);
    assert.strictEqual(installed[0].name, 'installed-plugin');
  });

  // Test 7: Check if extension is installed
  await test('should check if extension is installed', async () => {
    const manager = createTempRegistry();
    await manager.initialize();

    const ext = new Extension({
      name: 'test-plugin',
      owner: { login: 'author' },
      html_url: 'https://github.com/author/test-plugin',
      topics: ['claude-code-plugin']
    }, { isInstalled: true });

    await manager.addExtension(ext);

    assert.strictEqual(manager.isInstalled('author/test-plugin'), true);
    assert.strictEqual(manager.isInstalled('author/nonexistent'), false);
  });

  // Test 8: Remove extension
  await test('should remove extension from registry', async () => {
    const manager = createTempRegistry();
    await manager.initialize();

    const ext = new Extension({
      name: 'test-plugin',
      owner: { login: 'author' },
      html_url: 'https://github.com/author/test-plugin',
      topics: ['claude-code-plugin']
    });

    await manager.addExtension(ext);
    assert.strictEqual(manager.registry.size, 1);

    const removed = await manager.removeExtension('author/test-plugin');

    assert.strictEqual(removed, true);
    assert.strictEqual(manager.registry.size, 0);
  });

  // Test 9: Update extension properties
  await test('should update extension properties', async () => {
    const manager = createTempRegistry();
    await manager.initialize();

    const ext = new Extension({
      name: 'test-plugin',
      owner: { login: 'author' },
      html_url: 'https://github.com/author/test-plugin',
      stargazers_count: 100,
      topics: ['claude-code-plugin']
    }, { isInstalled: false });

    await manager.addExtension(ext);

    // Update to mark as installed
    const updated = await manager.updateExtension('author/test-plugin', {
      isInstalled: true,
      installedVersion: '1.0.0'
    });

    assert.ok(updated);
    assert.strictEqual(updated.isInstalled, true);
    assert.strictEqual(updated.installedVersion, '1.0.0');

    // Verify persistence
    const loaded = manager.getExtension('author/test-plugin');
    assert.strictEqual(loaded.isInstalled, true);
  });

  // Test 10: Registry statistics
  await test('should calculate registry statistics', async () => {
    const manager = createTempRegistry();
    await manager.initialize();

    const ext1 = new Extension({
      name: 'plugin-1',
      owner: { login: 'author' },
      html_url: 'https://github.com/author/plugin-1',
      topics: ['claude-code-plugin']
    }, { isInstalled: true });

    const ext2 = new Extension({
      name: 'skill-1',
      owner: { login: 'author' },
      html_url: 'https://github.com/author/skill-1',
      topics: ['claude-code-skill']
    }, { isInstalled: false });

    const ext3 = new Extension({
      name: 'command-1',
      owner: { login: 'author' },
      html_url: 'https://github.com/author/command-1',
      topics: ['claude-code-command']
    }, { isInstalled: true });

    await manager.addExtension(ext1);
    await manager.addExtension(ext2);
    await manager.addExtension(ext3);

    const stats = manager.getStats();

    assert.strictEqual(stats.total, 3);
    assert.strictEqual(stats.installed, 2);
    assert.strictEqual(stats.byType.plugin, 1);
    assert.strictEqual(stats.byType.skill, 1);
    assert.strictEqual(stats.byType.command, 1);
  });

  // Test 11: Atomic write with multiple saves
  await test('should handle queued saves correctly', async () => {
    const manager = createTempRegistry();
    await manager.initialize();

    // Trigger multiple saves rapidly
    const promises = [];
    for (let i = 0; i < 5; i++) {
      const ext = new Extension({
        name: `plugin-${i}`,
        owner: { login: 'author' },
        html_url: `https://github.com/author/plugin-${i}`,
        topics: ['claude-code-plugin']
      });

      promises.push(manager.addExtension(ext));
    }

    await Promise.all(promises);

    // Verify all extensions are saved
    const manager2 = new ExtensionManager({
      registryPath: manager.registryPath,
      extensionsDir: manager.extensionsDir
    });

    await manager2.loadRegistry();

    assert.strictEqual(manager2.registry.size, 5);
  });

  // Test 12: Property Test - Installation Registry Update (Validates Requirement 3.9)
  await test('Property: Installation Registry Update (Requirement 3.9)', async () => {
    const manager = createTempRegistry();
    await manager.initialize();

    const extension = new Extension({
      name: 'test-plugin',
      owner: { login: 'test-author' },
      html_url: 'https://github.com/test-author/test-plugin',
      topics: ['claude-code-plugin']
    });

    // Property: WHEN installation completes successfully,
    // THE Extension_Manager SHALL update the local extension registry

    // Mark as installed
    extension.isInstalled = true;
    extension.installedVersion = '1.0.0';

    await manager.addExtension(extension);

    // Verify immediately
    assert.strictEqual(manager.isInstalled('test-author/test-plugin'), true);

    // Verify persistence (load from disk)
    const manager2 = new ExtensionManager({
      registryPath: manager.registryPath,
      extensionsDir: manager.extensionsDir
    });

    await manager2.loadRegistry();

    const loaded = manager2.getExtension('test-author/test-plugin');
    assert.strictEqual(loaded.isInstalled, true);
    assert.strictEqual(loaded.installedVersion, '1.0.0');
  });

  // Test 13: Property Test - Uninstallation Registry Update (Validates Requirement 4.3)
  await test('Property: Uninstallation Registry Update (Requirement 4.3)', async () => {
    const manager = createTempRegistry();
    await manager.initialize();

    const extension = new Extension({
      name: 'test-plugin',
      owner: { login: 'test-author' },
      html_url: 'https://github.com/test-author/test-plugin',
      topics: ['claude-code-plugin']
    }, { isInstalled: true });

    await manager.addExtension(extension);

    // Property: WHEN uninstallation completes,
    // THE Extension_Manager SHALL update the local extension registry

    // Mark as uninstalled
    await manager.updateExtension('test-author/test-plugin', {
      isInstalled: false,
      installedVersion: null
    });

    // Verify immediately
    assert.strictEqual(manager.isInstalled('test-author/test-plugin'), false);

    // Verify persistence
    const manager2 = new ExtensionManager({
      registryPath: manager.registryPath,
      extensionsDir: manager.extensionsDir
    });

    await manager2.loadRegistry();

    const loaded = manager2.getExtension('test-author/test-plugin');
    assert.strictEqual(loaded.isInstalled, false);
  });

  // Summary
  console.log('\n=== Test Summary ===');
  console.log(`Total: ${testsRun}`);
  console.log(`Passed: ${testsPassed}`);
  console.log(`Failed: ${testsFailed}`);
  console.log('===================\n');

  process.exit(testsFailed > 0 ? 1 : 0);
}

// Run tests
if (require.main === module) {
  runTests().catch(error => {
    console.error('Test runner failed:', error);
    process.exit(1);
  });
}

module.exports = { runTests };
