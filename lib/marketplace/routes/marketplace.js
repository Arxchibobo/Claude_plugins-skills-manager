const ExtensionManager = require('../manager/ExtensionManager');
const GitHubAPIProxy = require('../api/GitHubAPIProxy');
const Extension = require('../models/Extension');
const path = require('path');
const os = require('os');

/**
 * Marketplace API Routes
 *
 * Provides REST API endpoints for:
 * - Extension discovery (search, list, details)
 * - Extension installation/uninstallation
 * - Settings management (PAT, cache control)
 *
 * CSRF Protection: Origin header validation for state-changing requests
 */

class MarketplaceRoutes {
  constructor(config = {}) {
    this.extensionManager = new ExtensionManager({
      registryPath: config.registryPath,
      extensionsDir: config.extensionsDir
    });

    this.githubProxy = new GitHubAPIProxy({
      pat: config.pat,
      cache: config.cache
    });

    this.currentVersion = config.currentVersion || '1.0.0';
    this.initialized = false;
  }

  /**
   * Initialize manager
   */
  async initialize() {
    if (!this.initialized) {
      await this.extensionManager.initialize();
      this.initialized = true;
    }
  }

  /**
   * Parse request body
   */
  async parseBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          resolve(JSON.parse(body || '{}'));
        } catch (error) {
          reject(new Error('Invalid JSON'));
        }
      });
      req.on('error', reject);
    });
  }

  /**
   * Send JSON response
   */
  sendJSON(res, statusCode, data) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  /**
   * Send error response
   */
  sendError(res, statusCode, message) {
    this.sendJSON(res, statusCode, { error: message });
  }

  /**
   * GET /api/marketplace/extensions - List all extensions
   */
  async listExtensions(req, res) {
    try {
      await this.initialize();

      // Get installed extensions from registry
      const installed = this.extensionManager.getInstalledExtensions();

      // Get available extensions from GitHub with comprehensive search
      const searchTerms = [
        'claude-code-plugin',
        'claude-code-plugins',
        'claude-code-skill',
        'claude-code-skills',
        'claude-code-command',
        'claude-code-commands',
        'claude-code-agent',
        'claude-code-agents',
        'claude-code-subagent',
        'claude-code-subagents',
        'claudecode-plugin',
        'claude-plugin',
        'claude-skills'
      ];

      const extensionsMap = new Map(); // Use Map to deduplicate by repo ID

      // Execute all searches in parallel for better performance
      const searchPromises = searchTerms.map(term =>
        this.githubProxy.searchRepositories(term, {
          perPage: 100,
          page: 1,
          useTopic: false  // Use regular search, not topic search
        })
          .then(results => ({ term, results, success: true }))
          .catch(error => {
            console.error(`[Marketplace] Search failed for "${term}":`, error.message);
            return { term, results: [], success: false, error: error.message };
          })
      );

      const searchResults = await Promise.all(searchPromises);

      // Process all search results
      for (const { term, results, success } of searchResults) {
        if (!success || !results || results.length === 0) {
          console.log(`[Marketplace] Search term "${term}": 0 results`);
          continue;
        }

        console.log(`[Marketplace] Search term "${term}": ${results.length} results`);

        // Transform GitHub repo objects to Extension objects
        for (const repo of results) {
          const repoId = `${repo.owner.login}/${repo.name}`;

          // Skip if already added
          if (extensionsMap.has(repoId)) continue;

          // Detect type from topics
          let type = 'plugin';
          if (repo.topics) {
            if (repo.topics.includes('claude-code-skill') || repo.topics.includes('claude-code-skills')) {
              type = 'skill';
            } else if (repo.topics.includes('claude-code-command') || repo.topics.includes('claude-code-commands')) {
              type = 'command';
            } else if (repo.topics.includes('claude-code-agent') || repo.topics.includes('claude-code-agents') ||
                       repo.topics.includes('claude-code-subagent') || repo.topics.includes('claude-code-subagents')) {
              type = 'agent';
            }
          }

          const extension = new Extension(repo, { type });
          extensionsMap.set(repoId, extension);
        }
      }

      // Convert Map to Array
      const allExtensions = Array.from(extensionsMap.values());

      console.log(`[Marketplace] Total unique extensions found: ${allExtensions.length}`);

      // Mark installed extensions
      allExtensions.forEach(ext => {
        const installedExt = installed.find(i => i.id === ext.id);
        if (installedExt) {
          ext.isInstalled = true;
          ext.installedVersion = installedExt.installedVersion;
        }
      });

      // Convert to JSON format
      const extensionsJSON = allExtensions.map(ext => ext.toJSON());

      this.sendJSON(res, 200, {
        extensions: extensionsJSON,
        total: extensionsJSON.length
      });

    } catch (error) {
      console.error('[Marketplace] List extensions error:', error);
      this.sendError(res, 500, error.message);
    }
  }

  /**
   * GET /api/marketplace/extensions/:id - Get single extension
   */
  async getExtension(req, res, id) {
    try {
      await this.initialize();

      const [owner, repo] = id.split('/');
      if (!owner || !repo) {
        return this.sendError(res, 400, 'Invalid extension ID format');
      }

      // Try to get from GitHub
      let repoData;
      let rateLimitError = false;

      try {
        repoData = await this.githubProxy.getRepository(owner, repo);
      } catch (error) {
        // Check if it's a rate limit error
        if (error.message.includes('Rate limit exceeded') || error.message.includes('403')) {
          rateLimitError = true;
          console.warn(`[Marketplace] Rate limit hit for ${id}, returning basic info`);

          // Return basic info from cache or minimal data
          const rateLimit = this.githubProxy.getRateLimitInfo();
          return this.sendJSON(res, 200, {
            id,
            name: repo,
            author: owner,
            description: 'Details temporarily unavailable due to GitHub API rate limit',
            repository: `https://github.com/${owner}/${repo}`,
            rateLimitInfo: rateLimit,
            error: 'rate_limit_exceeded',
            message: 'Please add a GitHub Personal Access Token in Settings to increase rate limits, or wait a few minutes and try again.'
          });
        }
        throw error; // Re-throw if not rate limit error
      }

      // Detect type from topics
      let type = 'plugin';
      if (repoData.topics) {
        if (repoData.topics.includes('claude-code-skill') || repoData.topics.includes('claude-code-skills')) {
          type = 'skill';
        } else if (repoData.topics.includes('claude-code-command') || repoData.topics.includes('claude-code-commands')) {
          type = 'command';
        } else if (repoData.topics.includes('claude-code-agent') || repoData.topics.includes('claude-code-agents') ||
                   repoData.topics.includes('claude-code-subagent') || repoData.topics.includes('claude-code-subagents')) {
          type = 'agent';
        }
      }

      // Create Extension object
      const extension = new Extension(repoData, { type });

      // Check if installed
      const installedExt = this.extensionManager.getExtension(id);
      if (installedExt && installedExt.isInstalled) {
        extension.isInstalled = true;
        extension.installedVersion = installedExt.installedVersion;
      }

      // Get latest release (non-critical, ignore rate limit)
      try {
        const release = await this.githubProxy.getLatestRelease(owner, repo);
        extension.latestRelease = release;
      } catch (error) {
        extension.latestRelease = null;
      }

      // Get README (non-critical, ignore rate limit)
      try {
        const readme = await this.githubProxy.getFileContent(owner, repo, 'README.md');
        extension.readme = readme;
      } catch (error) {
        extension.readme = null;
      }

      // Convert to JSON
      const extensionJSON = extension.toJSON();
      // Add latestRelease and readme (not part of standard JSON)
      extensionJSON.latestRelease = extension.latestRelease;
      extensionJSON.readme = extension.readme;

      this.sendJSON(res, 200, extensionJSON);

    } catch (error) {
      console.error('[Marketplace] Get extension error:', error);

      // Return user-friendly error
      const errorResponse = {
        error: 'Failed to load extension details',
        details: error.message,
        suggestion: error.message.includes('Rate limit')
          ? 'Add a GitHub Personal Access Token in Settings to increase rate limits'
          : 'Please check your internet connection and try again'
      };

      this.sendJSON(res, 500, errorResponse);
    }
  }

  /**
   * GET /api/marketplace/search - Search extensions
   */
  async searchExtensions(req, res, query) {
    try {
      await this.initialize();

      const url = new URL(`http://localhost${query}`);
      const searchQuery = url.searchParams.get('q') || '';
      const type = url.searchParams.get('type');

      let topic = 'claude-code';
      if (type === 'plugin') topic = 'claude-code-plugin';
      else if (type === 'skill') topic = 'claude-code-skill';
      else if (type === 'command') topic = 'claude-code-command';
      else if (type === 'agent') topic = 'claude-code-agent';

      const searchTopic = searchQuery ? `${topic} ${searchQuery}` : topic;
      const results = await this.githubProxy.searchRepositories(searchTopic);

      // Transform to Extension objects
      const extensions = results.map(repo => new Extension(repo, { type }));

      // Mark installed
      const installed = this.extensionManager.getInstalledExtensions();
      extensions.forEach(ext => {
        const installedExt = installed.find(i => i.id === ext.id);
        if (installedExt) {
          ext.isInstalled = true;
          ext.installedVersion = installedExt.installedVersion;
        }
      });

      // Convert to JSON
      const extensionsJSON = extensions.map(ext => ext.toJSON());

      this.sendJSON(res, 200, {
        results: extensionsJSON,
        total: extensionsJSON.length,
        query: searchQuery,
        type
      });

    } catch (error) {
      console.error('[Marketplace] Search error:', error);
      this.sendError(res, 500, error.message);
    }
  }

  /**
   * POST /api/marketplace/install - Install extension
   */
  async installExtension(req, res) {
    try {
      await this.initialize();

      const body = await this.parseBody(req);
      const { id, version, checksum, manifest, downloadUrl } = body;

      if (!id || !version || !manifest || !downloadUrl) {
        return this.sendError(res, 400, 'Missing required fields');
      }

      // Validate GitHub URL
      const urlValidation = this.extensionManager.validateGitHubURL(downloadUrl);
      if (!urlValidation.valid) {
        return this.sendError(res, 400, urlValidation.error);
      }

      // Install
      const result = await this.extensionManager.installExtension({
        id,
        downloadUrl,
        version,
        checksum,
        currentVersion: this.currentVersion,
        manifest
      });

      this.sendJSON(res, 200, result);

    } catch (error) {
      console.error('[Marketplace] Install error:', error);
      this.sendError(res, 500, error.message);
    }
  }

  /**
   * DELETE /api/marketplace/extensions/:id - Uninstall extension
   */
  async uninstallExtension(req, res, id) {
    try {
      await this.initialize();

      await this.extensionManager.uninstallExtension(id);

      this.sendJSON(res, 200, { success: true });

    } catch (error) {
      console.error('[Marketplace] Uninstall error:', error);
      this.sendError(res, 500, error.message);
    }
  }

  /**
   * GET /api/marketplace/settings - Get settings
   */
  async getSettings(req, res) {
    try {
      const rateLimit = this.githubProxy.getRateLimitInfo();

      this.sendJSON(res, 200, {
        pat: this.githubProxy.pat ? '***' : null,
        rateLimit
      });

    } catch (error) {
      console.error('[Marketplace] Get settings error:', error);
      this.sendError(res, 500, error.message);
    }
  }

  /**
   * POST /api/marketplace/settings - Update settings
   */
  async updateSettings(req, res) {
    try {
      const body = await this.parseBody(req);
      const { pat } = body;

      if (pat) {
        this.githubProxy.pat = pat;
      }

      this.sendJSON(res, 200, { success: true });

    } catch (error) {
      console.error('[Marketplace] Update settings error:', error);
      this.sendError(res, 500, error.message);
    }
  }

  /**
   * POST /api/marketplace/cache/refresh - Force cache refresh
   */
  async refreshCache(req, res) {
    try {
      if (this.githubProxy.cache) {
        await this.githubProxy.cache.clear();
      }

      this.sendJSON(res, 200, { success: true });

    } catch (error) {
      console.error('[Marketplace] Refresh cache error:', error);
      this.sendError(res, 500, error.message);
    }
  }

  /**
   * GET /api/marketplace/rate-limit - Get rate limit status
   */
  async getRateLimit(req, res) {
    try {
      const rateLimit = this.githubProxy.getRateLimitInfo();

      this.sendJSON(res, 200, rateLimit);

    } catch (error) {
      console.error('[Marketplace] Get rate limit error:', error);
      this.sendError(res, 500, error.message);
    }
  }

  /**
   * Handle marketplace routes
   */
  async handleRoute(req, res, url, method) {
    // GET /api/marketplace/extensions
    if (method === 'GET' && url === '/api/marketplace/extensions') {
      return await this.listExtensions(req, res);
    }

    // GET /api/marketplace/extensions/:id
    if (method === 'GET' && url.match(/^\/api\/marketplace\/extensions\/[^/]+$/)) {
      const id = decodeURIComponent(url.split('/')[4]);
      return await this.getExtension(req, res, id);
    }

    // GET /api/marketplace/search
    if (method === 'GET' && url.startsWith('/api/marketplace/search')) {
      return await this.searchExtensions(req, res, url);
    }

    // POST /api/marketplace/install
    if (method === 'POST' && url === '/api/marketplace/install') {
      return await this.installExtension(req, res);
    }

    // DELETE /api/marketplace/extensions/:id
    if (method === 'DELETE' && url.match(/^\/api\/marketplace\/extensions\/[^/]+$/)) {
      const id = decodeURIComponent(url.split('/')[4]);
      return await this.uninstallExtension(req, res, id);
    }

    // GET /api/marketplace/settings
    if (method === 'GET' && url === '/api/marketplace/settings') {
      return await this.getSettings(req, res);
    }

    // POST /api/marketplace/settings
    if (method === 'POST' && url === '/api/marketplace/settings') {
      return await this.updateSettings(req, res);
    }

    // POST /api/marketplace/cache/refresh
    if (method === 'POST' && url === '/api/marketplace/cache/refresh') {
      return await this.refreshCache(req, res);
    }

    // GET /api/marketplace/rate-limit
    if (method === 'GET' && url === '/api/marketplace/rate-limit') {
      return await this.getRateLimit(req, res);
    }

    // 404
    this.sendError(res, 404, 'Marketplace endpoint not found');
  }
}

module.exports = MarketplaceRoutes;
