// Claude Plugin Manager - Backend Server
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const PORT = 3456;
const SETTINGS_PATH = path.join(process.env.USERPROFILE || process.env.HOME, '.claude', 'settings.json');

// Import Security Routes (Task 1-12)
const SecurityRoutes = require('./lib/security/routes/security');
const securityRoutes = new SecurityRoutes();

// Plugin metadata for categorization and descriptions
const PLUGIN_METADATA = {
    // Language tags
    'python': ['Python', 'Backend'],
    'javascript': ['JavaScript', 'Frontend'],
    'typescript': ['TypeScript', 'Frontend'],
    'go': ['Go', 'Backend', 'Systems'],
    'rust': ['Rust', 'Systems', 'Performance'],
    'java': ['Java', 'Backend', 'Enterprise'],

    // Category tags
    'lsp': ['IDE', 'Language Server'],
    'frontend': ['Frontend', 'UI'],
    'backend': ['Backend', 'API'],
    'devops': ['DevOps', 'Infrastructure'],
    'cloud': ['Cloud', 'Infrastructure'],
    'database': ['Database', 'Data'],
    'test': ['Testing', 'Quality'],
    'security': ['Security', 'Safety'],
    'performance': ['Performance', 'Optimization'],
    'ml': ['Machine Learning', 'AI'],
    'mobile': ['Mobile', 'Cross-Platform']
};

// Read settings file
function readSettings() {
    try {
        const data = fs.readFileSync(SETTINGS_PATH, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading settings:', error);
        return { enabledPlugins: {} };
    }
}

// Write settings file
function writeSettings(settings) {
    try {
        fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error('Error writing settings:', error);
        return false;
    }
}

// Validate plugin name (prevent command injection)
function isValidPluginName(name) {
    return /^[a-zA-Z0-9_-]+$/.test(name);
}

// Parse plugin ID
function parsePluginId(fullId) {
    const parts = fullId.split('@');
    return {
        name: parts[0],
        marketplace: parts[1] || 'unknown',
        fullId: fullId
    };
}

// Generate tags for plugin
function generateTags(pluginName, marketplace) {
    const tags = [];
    const nameLower = pluginName.toLowerCase();

    // Language detection
    for (const [lang, langTags] of Object.entries(PLUGIN_METADATA)) {
        if (nameLower.includes(lang)) {
            tags.push(...langTags);
        }
    }

    // LSP detection
    if (nameLower.includes('lsp')) tags.push('IDE', 'Language Server');

    // Category detection
    if (nameLower.includes('frontend') || nameLower.includes('react') || nameLower.includes('vue')) {
        tags.push('Frontend', 'UI');
    }
    if (nameLower.includes('backend') || nameLower.includes('api')) {
        tags.push('Backend', 'API');
    }
    if (nameLower.includes('devops') || nameLower.includes('deployment') || nameLower.includes('cicd')) {
        tags.push('DevOps', 'Automation');
    }
    if (nameLower.includes('kubernetes') || nameLower.includes('k8s') || nameLower.includes('cloud')) {
        tags.push('Cloud', 'Infrastructure');
    }
    if (nameLower.includes('database') || nameLower.includes('sql')) {
        tags.push('Database', 'Data');
    }
    if (nameLower.includes('test') || nameLower.includes('tdd')) {
        tags.push('Testing', 'Quality');
    }
    if (nameLower.includes('security') || nameLower.includes('audit')) {
        tags.push('Security', 'Safety');
    }
    if (nameLower.includes('performance') || nameLower.includes('optimization')) {
        tags.push('Performance', 'Speed');
    }
    if (nameLower.includes('ml') || nameLower.includes('machine') || nameLower.includes('ai')) {
        tags.push('AI', 'ML');
    }
    if (nameLower.includes('mobile') || nameLower.includes('flutter') || nameLower.includes('ios')) {
        tags.push('Mobile', 'App');
    }

    // Integration detection
    if (['github', 'gitlab', 'slack', 'linear', 'asana', 'firebase', 'stripe'].some(s => nameLower.includes(s))) {
        tags.push('Integration', 'Tools');
    }

    // Marketplace tag
    tags.push(marketplace);

    return [...new Set(tags)]; // Remove duplicates
}

// Get plugin description (simplified)
function getPluginDescription(pluginName) {
    const descriptions = {
        // LSP servers
        'pyright-lsp': 'Python language server with type checking',
        'typescript-lsp': 'TypeScript/JavaScript language server',
        'rust-analyzer-lsp': 'Rust language server',
        'gopls-lsp': 'Go language server',
        'clangd-lsp': 'C/C++ language server',
        'jdtls-lsp': 'Java language server',
        'csharp-lsp': 'C# language server',
        'swift-lsp': 'Swift language server',
        'lua-lsp': 'Lua language server',
        'php-lsp': 'PHP language server',

        // Development tools
        'code-review': 'Automated code review with AI',
        'frontend-design': 'Frontend design and UI development',
        'feature-dev': 'Feature development workflows',
        'commit-commands': 'Git commit helpers',
        'pr-review-toolkit': 'Pull request review tools',

        // Integrations
        'github': 'GitHub integration',
        'gitlab': 'GitLab integration',
        'slack': 'Slack notifications and integration',
        'linear': 'Linear project management',
        'asana': 'Asana task management',
        'firebase': 'Firebase development tools',
        'stripe': 'Stripe payment integration',
        'supabase': 'Supabase backend tools',

        // Specialized
        'hookify': 'Custom hooks and automation',
        'agent-sdk-dev': 'Agent SDK development',
        'plugin-dev': 'Plugin development tools',
        'ralph-loop': 'Advanced workflow automation',
        'playwright': 'Browser automation and testing',
        'context7': 'Enhanced context management',
        'greptile': 'Advanced code search',
        'laravel-boost': 'Laravel development tools',
        'serena': 'Development assistant'
    };

    return descriptions[pluginName] || 'Claude Code plugin';
}

// Get all plugins
async function getPlugins() {
    const settings = readSettings();
    const enabledPlugins = settings.enabledPlugins || {};

    const plugins = Object.keys(enabledPlugins).map(fullId => {
        const parsed = parsePluginId(fullId);
        const enabled = enabledPlugins[fullId] === true;

        return {
            id: fullId,
            name: parsed.name,
            displayName: parsed.name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
            marketplace: parsed.marketplace,
            enabled: enabled,
            description: getPluginDescription(parsed.name),
            tags: generateTags(parsed.name, parsed.marketplace)
        };
    });

    return plugins;
}

// Execute Claude CLI command
async function execClaude(command) {
    try {
        const { stdout, stderr } = await execPromise(`claude ${command}`);
        return { success: true, output: stdout, error: stderr };
    } catch (error) {
        return { success: false, output: error.stdout || '', error: error.stderr || error.message };
    }
}

// API Routes
async function handleRequest(req, res) {
    // Enable CORS (restrict to localhost only)
    const allowedOrigins = ['http://localhost:3456', 'http://127.0.0.1:3456'];
    const origin = req.headers.origin;
    
    // Block requests from unauthorized origins for state-changing methods (CSRF protection)
    if (req.method !== 'GET' && origin && !allowedOrigins.includes(origin)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Origin not allowed' }));
        return;
    }
    
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    const url = req.url;
    const method = req.method;

    try {
        // GET /api/plugins - List all plugins
        if (method === 'GET' && url === '/api/plugins') {
            const plugins = await getPlugins();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ plugins }));
            return;
        }

        // POST /api/plugins/:id/toggle - Toggle plugin
        if (method === 'POST' && url.match(/^\/api\/plugins\/[^/]+\/toggle$/)) {
            const pluginId = decodeURIComponent(url.split('/')[3]);
            const settings = readSettings();

            if (settings.enabledPlugins[pluginId] !== undefined) {
                settings.enabledPlugins[pluginId] = !settings.enabledPlugins[pluginId];
                writeSettings(settings);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } else {
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'Plugin not found' }));
            }
            return;
        }

        // POST /api/plugins/:id/enable - Enable plugin
        if (method === 'POST' && url.match(/^\/api\/plugins\/[^/]+\/enable$/)) {
            const pluginId = decodeURIComponent(url.split('/')[3]);
            const settings = readSettings();

            if (settings.enabledPlugins[pluginId] !== undefined) {
                settings.enabledPlugins[pluginId] = true;
                writeSettings(settings);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } else {
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'Plugin not found' }));
            }
            return;
        }

        // POST /api/plugins/:id/disable - Disable plugin
        if (method === 'POST' && url.match(/^\/api\/plugins\/[^/]+\/disable$/)) {
            const pluginId = decodeURIComponent(url.split('/')[3]);
            const settings = readSettings();

            if (settings.enabledPlugins[pluginId] !== undefined) {
                settings.enabledPlugins[pluginId] = false;
                writeSettings(settings);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } else {
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'Plugin not found' }));
            }
            return;
        }

        // POST /api/plugins/enable-all - Enable all plugins
        if (method === 'POST' && url === '/api/plugins/enable-all') {
            const settings = readSettings();

            Object.keys(settings.enabledPlugins).forEach(key => {
                settings.enabledPlugins[key] = true;
            });

            writeSettings(settings);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
            return;
        }

        // POST /api/plugins/disable-all - Disable all plugins
        if (method === 'POST' && url === '/api/plugins/disable-all') {
            const settings = readSettings();

            Object.keys(settings.enabledPlugins).forEach(key => {
                settings.enabledPlugins[key] = false;
            });

            writeSettings(settings);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
            return;
        }

        // POST /api/plugins/:id/update - Update plugin
        if (method === 'POST' && url.match(/^\/api\/plugins\/[^/]+\/update$/)) {
            const pluginId = decodeURIComponent(url.split('/')[3]);
            const parsed = parsePluginId(pluginId);

            // Validate plugin name to prevent command injection
            if (!isValidPluginName(parsed.name)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid plugin name' }));
                return;
            }

            const result = await execClaude(`plugin update ${parsed.name}`);

            res.writeHead(result.success ? 200 : 500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
            return;
        }

        // DELETE /api/plugins/:id - Uninstall plugin
        if (method === 'DELETE' && url.match(/^\/api\/plugins\/[^/]+$/)) {
            const pluginId = decodeURIComponent(url.split('/')[3]);
            const parsed = parsePluginId(pluginId);

            // Validate plugin name to prevent command injection
            if (!isValidPluginName(parsed.name)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid plugin name' }));
                return;
            }

            const result = await execClaude(`plugin uninstall ${parsed.name}`);

            if (result.success) {
                const settings = readSettings();
                delete settings.enabledPlugins[pluginId];
                writeSettings(settings);
            }

            res.writeHead(result.success ? 200 : 500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
            return;
        }

        // POST /api/plugins/update-all - Update all plugins
        if (method === 'POST' && url === '/api/plugins/update-all') {
            const result = await execClaude('plugin marketplace update');

            res.writeHead(result.success ? 200 : 500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
            return;
        }

        // POST /api/plugins/save - Save configuration
        if (method === 'POST' && url === '/api/plugins/save') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: 'Configuration saved' }));
            return;
        }

        // GET /api/skills - List all skills
        if (method === 'GET' && url === '/api/skills') {
            // Return mock skills data (Claude CLI not reliable in server context)
            const skills = [
                { name: 'commit', displayName: '/commit', location: 'managed', description: 'Generate commit messages' },
                { name: 'create-pr', displayName: '/create-pr', location: 'managed', description: 'Create pull requests' },
                { name: 'code-review', displayName: '/code-review', location: 'managed', description: 'Review code changes' },
                { name: 'write-tests', displayName: '/write-tests', location: 'managed', description: 'Generate tests' },
                { name: 'refactor', displayName: '/refactor', location: 'managed', description: 'Refactor code' },
                { name: 'add-comments', displayName: '/add-comments', location: 'managed', description: 'Add code comments' }
            ];

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ skills }));
            return;
        }

        // GET /api/commands - List all commands
        if (method === 'GET' && url === '/api/commands') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                commands: [
                    { name: 'help', description: 'Show help information' },
                    { name: 'version', description: 'Show version information' },
                    { name: 'plugin', description: 'Manage plugins' },
                    { name: 'skill', description: 'Manage skills' },
                    { name: 'agent', description: 'Manage agents' },
                    { name: 'mcp', description: 'Manage MCP servers' }
                ]
            }));
            return;
        }

        // GET /api/agents - List all agents
        if (method === 'GET' && url === '/api/agents') {
            // Return mock agents data (Claude CLI not reliable in server context)
            const agents = [
                { id: 'agent-1', name: 'Backend Developer', type: 'custom', description: 'Backend development specialist' },
                { id: 'agent-2', name: 'Frontend Developer', type: 'custom', description: 'Frontend development specialist' },
                { id: 'agent-3', name: 'DevOps Engineer', type: 'custom', description: 'DevOps and infrastructure' },
                { id: 'agent-4', name: 'Data Scientist', type: 'custom', description: 'Data analysis and ML' }
            ];

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ agents }));
            return;
        }

        // GET /api/marketplace/extensions - Marketplace extensions
        if (method === 'GET' && url === '/api/marketplace/extensions') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                extensions: [
                    {
                        id: 'example-extension',
                        name: 'Example Extension',
                        description: 'This is an example extension',
                        version: '1.0.0',
                        isInstalled: false
                    }
                ],
                message: 'Marketplace extensions'
            }));
            return;
        }

        // Security API Routes (Task 1-12)
        if (url.startsWith('/api/security')) {
            return await securityRoutes.handleRoute(req, res, url, method);
        }

        // Serve static files (HTML, CSS, JS)
        if (method === 'GET') {
            const filePath = url === '/' ? 'index.html' : url.substring(1);
            const fullPath = path.join(__dirname, filePath);

            // Security: prevent directory traversal
            if (!fullPath.startsWith(__dirname)) {
                res.writeHead(403);
                res.end(JSON.stringify({ error: 'Forbidden' }));
                return;
            }

            // Check if file exists
            try {
                const stat = fs.statSync(fullPath);

                if (stat.isDirectory()) {
                    res.writeHead(403);
                    res.end(JSON.stringify({ error: 'Cannot serve directory' }));
                    return;
                }

                // Determine content type
                const ext = path.extname(fullPath).toLowerCase();
                const contentTypes = {
                    '.html': 'text/html',
                    '.css': 'text/css',
                    '.js': 'application/javascript',
                    '.json': 'application/json',
                    '.png': 'image/png',
                    '.jpg': 'image/jpeg',
                    '.gif': 'image/gif',
                    '.svg': 'image/svg+xml',
                    '.ico': 'image/x-icon'
                };

                const contentType = contentTypes[ext] || 'application/octet-stream';

                // Read and serve file
                const content = fs.readFileSync(fullPath);
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(content);
                return;

            } catch (error) {
                if (error.code === 'ENOENT') {
                    res.writeHead(404);
                    res.end(JSON.stringify({ error: 'File not found' }));
                } else {
                    res.writeHead(500);
                    res.end(JSON.stringify({ error: 'Internal server error' }));
                }
                return;
            }
        }

        // 404 for non-GET requests or other cases
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));

    } catch (error) {
        console.error('Error handling request:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
    }
}

// Create server
const server = http.createServer(handleRequest);

server.listen(PORT, () => {
    console.log(`\n🚀 Claude Plugin Manager Server is running!`);
    console.log(`\n📡 Server: http://localhost:${PORT}`);
    console.log(`📂 Settings: ${SETTINGS_PATH}`);
    console.log(`\n💡 Open http://localhost:${PORT} in your browser\n`);
});

// Handle errors
server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`\n❌ Port ${PORT} is already in use. Please close other applications or choose a different port.\n`);
    } else {
        console.error('\n❌ Server error:', error.message, '\n');
    }
    process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\n👋 Shutting down server...\n');
    server.close(() => {
        console.log('✅ Server closed\n');
        process.exit(0);
    });
});
