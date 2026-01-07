const assert = require('assert');
const Extension = require('../../../lib/marketplace/models/Extension');

/**
 * Extension Model Tests
 */

async function runTests() {
  console.log('\n=== Extension Model Tests ===\n');

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
    }
  }

  // Test 1: Create extension from GitHub repo data
  await test('should create extension from GitHub repository data', () => {
    const repoData = {
      name: 'test-plugin',
      owner: { login: 'test-author' },
      description: 'Test plugin description',
      html_url: 'https://github.com/test-author/test-plugin',
      stargazers_count: 150,
      updated_at: '2024-01-01T00:00:00Z',
      topics: ['claude-code-plugin', 'test']
    };

    const extension = new Extension(repoData);

    assert.strictEqual(extension.id, 'test-author/test-plugin');
    assert.strictEqual(extension.type, 'plugin');
    assert.strictEqual(extension.name, 'test-plugin');
    assert.strictEqual(extension.author, 'test-author');
    assert.strictEqual(extension.stars, 150);
  });

  // Test 2: Detect type from topics
  await test('should detect extension type from topics', () => {
    const types = ['plugin', 'skill', 'command', 'agent'];

    types.forEach(type => {
      const repoData = {
        name: 'test-extension',
        owner: { login: 'author' },
        topics: [`claude-code-${type}`],
        html_url: 'https://github.com/author/test'
      };

      const extension = new Extension(repoData);
      assert.strictEqual(extension.type, type);
    });
  });

  // Test 3: Format display name
  await test('should format display name from repository name', () => {
    const testCases = [
      ['test-plugin', 'Test Plugin'],
      ['my_skill', 'My Skill'],
      ['awesome-command', 'Awesome Command'],
      ['simple', 'Simple']
    ];

    testCases.forEach(([input, expected]) => {
      const repoData = {
        name: input,
        owner: { login: 'author' },
        html_url: 'https://github.com/author/test'
      };

      const extension = new Extension(repoData);
      assert.strictEqual(extension.displayName, expected);
    });
  });

  // Test 4: Serialization - toJSON
  await test('should serialize to JSON correctly', () => {
    const repoData = {
      name: 'test-plugin',
      owner: { login: 'test-author' },
      description: 'Test description',
      html_url: 'https://github.com/test-author/test-plugin',
      stargazers_count: 100,
      updated_at: '2024-01-01T00:00:00Z',
      topics: ['claude-code-plugin']
    };

    const extension = new Extension(repoData);
    const json = extension.toJSON();

    assert.strictEqual(typeof json, 'object');
    assert.strictEqual(json.id, 'test-author/test-plugin');
    assert.strictEqual(json.type, 'plugin');
    assert.strictEqual(json.stars, 100);
  });

  // Test 5: Deserialization - fromJSON
  await test('should deserialize from JSON correctly', () => {
    const json = {
      id: 'author/repo',
      type: 'skill',
      name: 'test-skill',
      author: 'author',
      displayName: 'Test Skill',
      version: '1.0.0',
      description: 'Test description',
      repository: 'https://github.com/author/repo',
      stars: 200,
      lastUpdated: '2024-01-01T00:00:00Z',
      keywords: ['claude-code-skill']
    };

    const extension = Extension.fromJSON(json);

    assert.strictEqual(extension.id, 'author/repo');
    assert.strictEqual(extension.type, 'skill');
    assert.strictEqual(extension.version, '1.0.0');
    assert.strictEqual(extension.stars, 200);
  });

  // Test 6: Round-trip serialization
  await test('should maintain data through serialization round-trip', () => {
    const repoData = {
      name: 'test-agent',
      owner: { login: 'test-author' },
      description: 'Test agent',
      html_url: 'https://github.com/test-author/test-agent',
      stargazers_count: 300,
      updated_at: '2024-01-01T00:00:00Z',
      topics: ['claude-code-agent', 'ai']
    };

    const original = new Extension(repoData, { version: '2.0.0' });
    const json = original.toJSON();
    const restored = Extension.fromJSON(json);

    assert.strictEqual(restored.id, original.id);
    assert.strictEqual(restored.type, original.type);
    assert.strictEqual(restored.version, original.version);
    assert.strictEqual(restored.stars, original.stars);
  });

  // Test 7: Create from search results
  await test('should create extension array from search results', () => {
    const searchResults = [
      {
        name: 'plugin-1',
        owner: { login: 'author1' },
        description: 'Plugin 1',
        html_url: 'https://github.com/author1/plugin-1',
        stargazers_count: 50,
        updated_at: '2024-01-01T00:00:00Z',
        topics: ['claude-code-plugin']
      },
      {
        name: 'skill-1',
        owner: { login: 'author2' },
        description: 'Skill 1',
        html_url: 'https://github.com/author2/skill-1',
        stargazers_count: 75,
        updated_at: '2024-01-02T00:00:00Z',
        topics: ['claude-code-skill']
      }
    ];

    const extensions = Extension.fromSearchResults(searchResults);

    assert.strictEqual(extensions.length, 2);
    assert.strictEqual(extensions[0].type, 'plugin');
    assert.strictEqual(extensions[1].type, 'skill');
  });

  // Summary
  console.log('\n=== Test Summary ===');
  console.log(`Total: ${testsRun}`);
  console.log(`Passed: ${testsPassed}`);
  console.log(`Failed: ${testsFailed}`);
  console.log('===================\n');

  process.exit(testsFailed > 0 ? 1 : 0);
}

if (require.main === module) {
  runTests().catch(error => {
    console.error('Test runner failed:', error);
    process.exit(1);
  });
}

module.exports = { runTests };
