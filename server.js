// Claude Plugin Manager - Backend Server
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const PORT = 3456;
const SETTINGS_PATH = path.join(process.env.USERPROFILE || process.env.HOME, '.claude', 'settings.json');

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
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
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

            const result = await execClaude(`plugin update ${parsed.name}`);

            res.writeHead(result.success ? 200 : 500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
            return;
        }

        // DELETE /api/plugins/:id - Uninstall plugin
        if (method === 'DELETE' && url.match(/^\/api\/plugins\/[^/]+$/)) {
            const pluginId = decodeURIComponent(url.split('/')[3]);
            const parsed = parsePluginId(pluginId);

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

        // 404
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
