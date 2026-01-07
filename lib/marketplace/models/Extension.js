/**
 * Extension Model
 *
 * Represents a Claude Code extension (plugin, skill, command, or agent)
 * from the GitHub marketplace.
 */

class Extension {
  /**
   * Create an Extension from GitHub repository data
   * @param {object} repoData - GitHub repository object
   * @param {object} options - Additional options
   */
  constructor(repoData, options = {}) {
    // Validate repoData
    if (!repoData) {
      throw new Error('repoData is required');
    }

    // Use optional chaining for safe property access
    const ownerLogin = repoData.owner?.login || 'unknown';
    const repoName = repoData.name || 'unknown';

    this.id = options.id || `${ownerLogin}/${repoName}`;
    this.type = options.type || this._detectType(repoData);
    this.name = repoName;
    this.displayName = options.displayName || this._formatDisplayName(repoName);
    this.version = options.version || 'unknown';
    this.description = repoData.description || '';
    this.author = ownerLogin;
    this.repository = repoData.html_url || '';
    this.icon = options.icon || null;
    this.stars = repoData.stargazers_count ?? 0;
    this.downloads = options.downloads ?? 0;
    this.lastUpdated = repoData.updated_at || null;
    this.isOfficial = options.isOfficial ?? false;
    this.isFeatured = options.isFeatured ?? false;
    this.featuredOrder = options.featuredOrder || null;
    this.isInstalled = options.isInstalled ?? false;
    this.installedVersion = options.installedVersion || null;
    this.hasUpdate = options.hasUpdate ?? false;
    this.permissions = options.permissions || [];
    this.keywords = repoData.topics || [];
    this.readme = options.readme || null;
    this.qualityScore = options.qualityScore || null;
    this.qualityMetrics = options.qualityMetrics || null;
    this.checksum = options.checksum || null;
    this.releaseUrl = options.releaseUrl || null;
  }

  /**
   * Detect extension type from repository topics
   * @private
   * @param {object} repoData - GitHub repository data
   * @returns {string} - Extension type
   */
  _detectType(repoData) {
    const topics = repoData.topics || [];

    if (topics.includes('claude-code-plugin')) return 'plugin';
    if (topics.includes('claude-code-skill')) return 'skill';
    if (topics.includes('claude-code-command')) return 'command';
    if (topics.includes('claude-code-agent')) return 'agent';

    // Fallback: try to detect from name
    const name = repoData.name.toLowerCase();
    if (name.includes('plugin')) return 'plugin';
    if (name.includes('skill')) return 'skill';
    if (name.includes('command')) return 'command';
    if (name.includes('agent')) return 'agent';

    return 'plugin'; // Default fallback
  }

  /**
   * Format display name from repository name
   * @private
   * @param {string} repoName - Repository name
   * @returns {string} - Formatted display name
   */
  _formatDisplayName(repoName) {
    // Convert kebab-case or snake_case to Title Case
    return repoName
      .replace(/[-_]/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Convert to plain object for serialization
   * @returns {object} - Plain object representation
   */
  toJSON() {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      displayName: this.displayName,
      version: this.version,
      description: this.description,
      author: this.author,
      repository: this.repository,
      icon: this.icon,
      stars: this.stars,
      downloads: this.downloads,
      lastUpdated: this.lastUpdated,
      isOfficial: this.isOfficial,
      isFeatured: this.isFeatured,
      featuredOrder: this.featuredOrder,
      isInstalled: this.isInstalled,
      installedVersion: this.installedVersion,
      hasUpdate: this.hasUpdate,
      permissions: this.permissions,
      keywords: this.keywords,
      readme: this.readme,
      qualityScore: this.qualityScore,
      qualityMetrics: this.qualityMetrics,
      checksum: this.checksum,
      releaseUrl: this.releaseUrl
    };
  }

  /**
   * Create Extension from plain object
   * @static
   * @param {object} obj - Plain object
   * @returns {Extension} - Extension instance
   */
  static fromJSON(obj) {
    // Create a fake repo data object for constructor
    const repoData = {
      name: obj.name,
      owner: { login: obj.author },
      description: obj.description,
      html_url: obj.repository,
      stargazers_count: obj.stars,
      updated_at: obj.lastUpdated,
      topics: obj.keywords
    };

    return new Extension(repoData, {
      id: obj.id,
      type: obj.type,
      displayName: obj.displayName,
      version: obj.version,
      icon: obj.icon,
      downloads: obj.downloads,
      isOfficial: obj.isOfficial,
      isFeatured: obj.isFeatured,
      featuredOrder: obj.featuredOrder,
      isInstalled: obj.isInstalled,
      installedVersion: obj.installedVersion,
      hasUpdate: obj.hasUpdate,
      permissions: obj.permissions,
      readme: obj.readme,
      qualityScore: obj.qualityScore,
      qualityMetrics: obj.qualityMetrics,
      checksum: obj.checksum,
      releaseUrl: obj.releaseUrl
    });
  }

  /**
   * Create Extension array from GitHub search results
   * @static
   * @param {Array} searchResults - GitHub search results
   * @param {object} options - Options for all extensions
   * @returns {Array<Extension>} - Array of Extension instances
   */
  static fromSearchResults(searchResults, options = {}) {
    return searchResults.map(repo => new Extension(repo, options));
  }
}

module.exports = Extension;
