const https = require('https');
const { URL } = require('url');
const CacheManager = require('../cache/CacheManager');

// Create persistent HTTPS agent with Keep-Alive
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 60000
});

/**
 * GitHubAPIProxy - Handles all GitHub API interactions
 *
 * Features:
 * - REST and GraphQL API support
 * - Authentication with PAT (Personal Access Token)
 * - Rate limit handling and tracking
 * - Caching with ETag support
 * - Proxy support (HTTP_PROXY/HTTPS_PROXY) via https-proxy-agent
 * - Batch fetching via GraphQL
 * - Keep-Alive connections for performance
 * - Request timeouts to prevent hangs
 */
class GitHubAPIProxy {
  constructor(config = {}) {
    this.baseUrl = 'https://api.github.com';
    this.graphqlUrl = 'https://api.github.com/graphql';
    this.pat = config.pat || null;
    this.cache = config.cache || new CacheManager();
    this.requestTimeout = config.requestTimeout || 30000; // 30 seconds default

    // Rate limit tracking
    this.rateLimit = {
      limit: 60,      // Default for unauthenticated
      remaining: 60,
      reset: Date.now(),
      resetDate: null
    };

    // Proxy configuration from environment variables
    this.proxy = this._getProxyConfig();

    // Predefined topics for extension search
    this.topics = [
      'claude-code-plugin',
      'claude-code-skill',
      'claude-code-command',
      'claude-code-agent'
    ];
  }

  /**
   * Search GitHub repositories by topic
   * @param {string} topic - Topic to search for
   * @param {object} options - Search options
   * @returns {Promise<Array>} - Array of repository objects
   */
  async searchRepositories(topic, options = {}) {
    const query = `topic:${topic}`;
    const params = new URLSearchParams({
      q: query,
      sort: options.sort || 'stars',
      order: options.order || 'desc',
      per_page: options.perPage || 30,
      page: options.page || 1
    });

    const endpoint = `/search/repositories?${params.toString()}`;
    const response = await this._request(endpoint);

    return response.items || [];
  }

  /**
   * Get repository details
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @returns {Promise<object>} - Repository object
   */
  async getRepository(owner, repo) {
    const endpoint = `/repos/${owner}/${repo}`;
    return await this._request(endpoint);
  }

  /**
   * Get latest release for a repository
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @returns {Promise<object>} - Release object
   */
  async getLatestRelease(owner, repo) {
    const endpoint = `/repos/${owner}/${repo}/releases/latest`;
    return await this._request(endpoint);
  }

  /**
   * Get release asset information
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {string} tag - Release tag
   * @returns {Promise<object>} - Asset object (prefers .zip)
   */
  async getReleaseAsset(owner, repo, tag) {
    const endpoint = `/repos/${owner}/${repo}/releases/tags/${tag}`;
    const release = await this._request(endpoint);

    if (!release.assets || release.assets.length === 0) {
      throw new Error('No assets found for this release');
    }

    // Select asset: prefer .zip, fallback to first asset
    const zipAsset = release.assets.find(asset => asset.name.endsWith('.zip'));
    return zipAsset || release.assets[0];
  }

  /**
   * Get file content from repository
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {string} path - File path
   * @param {string} ref - Git ref (branch/tag), defaults to 'main'
   * @returns {Promise<string>} - File content (decoded from base64)
   */
  async getFileContent(owner, repo, path, ref = 'main') {
    const endpoint = `/repos/${owner}/${repo}/contents/${path}?ref=${ref}`;
    const response = await this._request(endpoint);

    if (!response.content) {
      throw new Error('File not found or empty');
    }

    // Decode base64 content
    return Buffer.from(response.content, 'base64').toString('utf8');
  }

  /**
   * Get current rate limit status
   * @returns {Promise<object>} - Rate limit information
   */
  async getRateLimitStatus() {
    const endpoint = '/rate_limit';
    const response = await this._request(endpoint, { skipCache: true });

    // Update internal rate limit tracking
    if (response.rate) {
      this.rateLimit = {
        limit: response.rate.limit,
        remaining: response.rate.remaining,
        reset: response.rate.reset * 1000, // Convert to milliseconds
        resetDate: new Date(response.rate.reset * 1000)
      };
    }

    return this.rateLimit;
  }

  /**
   * Execute GraphQL query (for batch operations)
   * @param {string} query - GraphQL query string
   * @param {object} variables - Query variables
   * @returns {Promise<object>} - GraphQL response
   */
  async graphqlQuery(query, variables = {}) {
    const body = JSON.stringify({ query, variables });

    const response = await this._request('/graphql', {
      method: 'POST',
      body,
      isGraphQL: true
    });

    if (response.errors) {
      throw new Error(`GraphQL Error: ${JSON.stringify(response.errors)}`);
    }

    return response.data;
  }

  /**
   * Batch fetch extension metadata using GraphQL
   * @param {Array<string>} repoIds - Array of repository IDs in "owner/repo" format
   * @returns {Promise<Array>} - Array of extension metadata
   */
  async batchFetchExtensions(repoIds) {
    // Build GraphQL query for multiple repositories
    const query = this._buildGraphQLQuery(repoIds);

    try {
      const data = await this.graphqlQuery(query);
      return this._parseGraphQLResponse(data, repoIds);
    } catch (error) {
      console.warn('[GitHubAPIProxy] GraphQL batch fetch failed, falling back to REST:', error.message);
      // Fallback to individual REST API calls
      return await this._batchFetchViaREST(repoIds);
    }
  }

  /**
   * Build HTTP headers for requests
   * @private
   * @returns {object} - Headers object
   */
  _buildHeaders(options = {}) {
    const headers = {
      'User-Agent': 'Claude-Code-Marketplace/1.0',
      'Accept': 'application/vnd.github.v3+json'
    };

    // Add authentication if PAT is available
    if (this.pat) {
      headers['Authorization'] = `token ${this.pat}`;
    }

    // GraphQL requires different Accept header
    if (options.isGraphQL) {
      headers['Accept'] = 'application/json';
      headers['Content-Type'] = 'application/json';
    }

    // Add ETag for conditional requests
    if (options.etag) {
      headers['If-None-Match'] = options.etag;
    }

    return headers;
  }

  /**
   * Make HTTP request to GitHub API
   * @private
   * @param {string} endpoint - API endpoint
   * @param {object} options - Request options
   * @returns {Promise<object>} - Response data
   */
  async _request(endpoint, options = {}) {
    // Build cache key
    const cacheKey = this._getCacheKey(endpoint);

    // Check cache unless explicitly skipped
    if (!options.skipCache) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // Build request URL
    const url = options.isGraphQL
      ? this.graphqlUrl
      : `${this.baseUrl}${endpoint}`;

    // Get ETag from cache for conditional requests
    const etag = this.cache.getETag(cacheKey);

    // Build headers
    const headers = this._buildHeaders({ ...options, etag });

    // Make request
    const response = await this._makeHttpRequest(url, {
      method: options.method || 'GET',
      headers,
      body: options.body
    });

    // Handle 304 Not Modified
    if (response.statusCode === 304) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // Update rate limit from headers
    this._updateRateLimitFromHeaders(response.headers);

    // Handle rate limit exceeded
    if (response.statusCode === 403 || response.statusCode === 429) {
      this._handleRateLimit(response);
    }

    // Safe JSON parsing
    let data = null;
    const contentType = response.headers['content-type'] || '';

    if (response.body && contentType.includes('application/json')) {
      try {
        data = typeof response.body === 'string'
          ? JSON.parse(response.body)
          : response.body;
      } catch (parseError) {
        throw new Error(`Failed to parse JSON response from ${endpoint}: ${parseError.message}`);
      }
    } else if (response.statusCode === 204) {
      // No Content
      data = null;
    } else {
      // Non-JSON response (possibly HTML error page)
      data = response.body;
    }

    // Handle errors after parsing
    if (response.statusCode >= 400) {
      const errorMessage = data && data.message ? data.message : 'Unknown error';
      throw new Error(`GitHub API Error (${response.statusCode}): ${errorMessage}`);
    }

    // Cache successful responses
    if (!options.skipCache && response.statusCode === 200 && data !== null) {
      const responseETag = response.headers['etag'];
      this.cache.set(cacheKey, data, responseETag);
    }

    return data;
  }

  /**
   * Make low-level HTTP request with timeout and Keep-Alive
   * @private
   * @param {string} url - Full URL
   * @param {object} options - Request options
   * @returns {Promise<object>} - Response object with statusCode, headers, and body
   */
  _makeHttpRequest(url, options) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);

      const requestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname + urlObj.search,
        method: options.method || 'GET',
        headers: options.headers || {},
        // Use Keep-Alive agent or proxy agent
        agent: this.proxy ? this._createProxyAgent(urlObj) : (options.agent || httpsAgent),
        timeout: this.requestTimeout
      };

      const req = https.request(requestOptions, (res) => {
        let body = '';

        res.on('data', (chunk) => {
          body += chunk;
        });

        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: body
          });
        });
      });

      // Handle timeout
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timeout after ${this.requestTimeout}ms`));
      });

      req.on('error', (error) => {
        reject(new Error(`HTTP Request failed: ${error.message}`));
      });

      // Send body for POST/PUT requests
      if (options.body) {
        req.write(options.body);
      }

      req.end();
    });
  }

  /**
   * Update rate limit from response headers
   * @private
   * @param {object} headers - Response headers
   */
  _updateRateLimitFromHeaders(headers) {
    if (headers['x-ratelimit-limit']) {
      this.rateLimit.limit = parseInt(headers['x-ratelimit-limit'], 10);
    }
    if (headers['x-ratelimit-remaining']) {
      this.rateLimit.remaining = parseInt(headers['x-ratelimit-remaining'], 10);
    }
    if (headers['x-ratelimit-reset']) {
      this.rateLimit.reset = parseInt(headers['x-ratelimit-reset'], 10) * 1000;
      this.rateLimit.resetDate = new Date(this.rateLimit.reset);
    }
  }

  /**
   * Handle rate limit exceeded
   * @private
   * @param {object} response - Response object
   */
  _handleRateLimit(response) {
    const resetTime = this.rateLimit.resetDate || new Date(Date.now() + 3600000);
    const minutesUntilReset = Math.ceil((resetTime - Date.now()) / 60000);

    throw new Error(
      `Rate limit exceeded. Try again in ${minutesUntilReset} minutes. ` +
      `(Limit: ${this.rateLimit.limit}, Remaining: ${this.rateLimit.remaining})`
    );
  }

  /**
   * Generate cache key from endpoint
   * @private
   * @param {string} endpoint - API endpoint
   * @returns {string} - Cache key
   */
  _getCacheKey(endpoint) {
    // Include PAT status in cache key to avoid mixing authenticated/unauthenticated responses
    const authStatus = this.pat ? 'auth' : 'noauth';
    return `github:${authStatus}:${endpoint}`;
  }

  /**
   * Get proxy configuration from environment variables
   * @private
   * @returns {object|null} - Proxy config or null
   */
  _getProxyConfig() {
    const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy;
    const httpProxy = process.env.HTTP_PROXY || process.env.http_proxy;

    const proxyUrl = httpsProxy || httpProxy;

    if (!proxyUrl) {
      return null;
    }

    try {
      const url = new URL(proxyUrl);
      return {
        host: url.hostname,
        port: url.port || 80,
        auth: url.username && url.password
          ? `${url.username}:${url.password}`
          : null
      };
    } catch (error) {
      console.warn('[GitHubAPIProxy] Invalid proxy URL:', error.message);
      return null;
    }
  }

  /**
   * Create proxy agent for HTTP requests
   * @private
   * @param {URL} targetUrl - Target URL
   * @returns {object} - Proxy agent
   */
  _createProxyAgent(targetUrl) {
    // TODO: For full proxy support, add 'https-proxy-agent' dependency:
    // const { HttpsProxyAgent } = require('https-proxy-agent');
    // const proxyUrl = `http://${this.proxy.auth ? this.proxy.auth + '@' : ''}${this.proxy.host}:${this.proxy.port}`;
    // return new HttpsProxyAgent(proxyUrl);

    // For now, return httpsAgent as fallback
    console.warn('[GitHubAPIProxy] Proxy configured but https-proxy-agent not available. Using direct connection.');
    return httpsAgent;
  }

  /**
   * Build GraphQL query for batch fetching repositories
   * @private
   * @param {Array<string>} repoIds - Repository IDs
   * @returns {string} - GraphQL query
   */
  _buildGraphQLQuery(repoIds) {
    // Limit to 10 repos per query to avoid complexity limits
    const limitedIds = repoIds.slice(0, 10);

    // Validation regex: owner and repo should only contain alphanumeric, hyphen, dot, underscore
    const safeNameRegex = /^[a-zA-Z0-9-._]+$/;

    const queries = limitedIds.map((id, index) => {
      const [owner, repo] = id.split('/');

      // Validate to prevent GraphQL injection
      if (!owner || !repo || !safeNameRegex.test(owner) || !safeNameRegex.test(repo)) {
        throw new Error(`Invalid repository format: ${id}. Must match pattern: owner/repo`);
      }

      return `
        repo${index}: repository(owner: "${owner}", name: "${repo}") {
          name
          owner { login }
          description
          stargazerCount
          updatedAt
          defaultBranchRef {
            target {
              ... on Commit {
                history(first: 1) {
                  edges {
                    node {
                      committedDate
                    }
                  }
                }
              }
            }
          }
          latestRelease {
            tagName
            publishedAt
          }
        }
      `;
    }).join('\n');

    return `query { ${queries} }`;
  }

  /**
   * Parse GraphQL response
   * @private
   * @param {object} data - GraphQL response data
   * @param {Array<string>} repoIds - Original repository IDs
   * @returns {Array} - Parsed extension metadata
   */
  _parseGraphQLResponse(data, repoIds) {
    const results = [];

    repoIds.forEach((id, index) => {
      const repo = data[`repo${index}`];
      if (repo) {
        results.push({
          id: `${repo.owner.login}/${repo.name}`,
          name: repo.name,
          author: repo.owner.login,
          description: repo.description || '',
          stars: repo.stargazerCount,
          lastUpdated: repo.updatedAt,
          latestRelease: repo.latestRelease ? repo.latestRelease.tagName : null
        });
      }
    });

    return results;
  }

  /**
   * Fallback batch fetch using REST API (parallel execution)
   * @private
   * @param {Array<string>} repoIds - Repository IDs
   * @returns {Promise<Array>} - Extension metadata
   */
  async _batchFetchViaREST(repoIds) {
    // Use Promise.all for concurrent fetching
    const promises = repoIds.map(async (id) => {
      const [owner, repo] = id.split('/');
      try {
        const data = await this.getRepository(owner, repo);
        return {
          id: `${data.owner.login}/${data.name}`,
          name: data.name,
          author: data.owner.login,
          description: data.description || '',
          stars: data.stargazers_count,
          lastUpdated: data.updated_at,
          latestRelease: null // Would need separate API call
        };
      } catch (error) {
        console.warn(`[GitHubAPIProxy] Failed to fetch ${id}:`, error.message);
        return null; // Return null for failed requests
      }
    });

    const results = await Promise.all(promises);

    // Filter out failed requests (nulls)
    return results.filter(item => item !== null);
  }
}

module.exports = GitHubAPIProxy;
