// Combined Static + API Server for Claude Plugin Manager
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const PORT = 3456;
const SETTINGS_PATH = path.join(process.env.USERPROFILE || process.env.HOME, '.claude', 'settings.json');
const USER_SKILLS_PATH = path.join(process.env.USERPROFILE || process.env.HOME, '.claude', 'skills');
const PROJECT_SKILLS_PATH = path.join(process.cwd(), '.claude', 'skills');

// MIME types
const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.ico': 'image/x-icon'
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
    const languages = {
        'python': ['Python'],
        'javascript': ['JavaScript'],
        'typescript': ['TypeScript'],
        'go': ['Go'],
        'rust': ['Rust'],
        'java': ['Java'],
        'csharp': ['C#'],
        'swift': ['Swift'],
        'lua': ['Lua'],
        'php': ['PHP'],
        'ruby': ['Ruby'],
        'elixir': ['Elixir']
    };

    for (const [lang, langTags] of Object.entries(languages)) {
        if (nameLower.includes(lang)) {
            tags.push(...langTags);
        }
    }

    // Category detection
    if (nameLower.includes('lsp')) tags.push('IDE', 'LSP');
    if (nameLower.includes('frontend') || nameLower.includes('react') || nameLower.includes('vue')) tags.push('Frontend');
    if (nameLower.includes('backend') || nameLower.includes('api')) tags.push('Backend');
    if (nameLower.includes('devops') || nameLower.includes('deployment') || nameLower.includes('cicd')) tags.push('DevOps');
    if (nameLower.includes('kubernetes') || nameLower.includes('k8s') || nameLower.includes('cloud')) tags.push('Cloud');
    if (nameLower.includes('database') || nameLower.includes('sql')) tags.push('Database');
    if (nameLower.includes('test') || nameLower.includes('tdd')) tags.push('Testing');
    if (nameLower.includes('security')) tags.push('Security');
    if (nameLower.includes('performance')) tags.push('Performance');
    if (nameLower.includes('ml') || nameLower.includes('machine') || nameLower.includes('ai')) tags.push('AI/ML');
    if (nameLower.includes('mobile') || nameLower.includes('flutter') || nameLower.includes('ios')) tags.push('Mobile');

    // Integration detection
    if (['github', 'gitlab', 'slack', 'linear', 'asana'].some(s => nameLower.includes(s))) {
        tags.push('Integration');
    }

    return [...new Set(tags)];
}

// Get plugin description
function getPluginDescription(pluginName) {
    const descriptions = {
        'pyright-lsp': 'Python language server with type checking',
        'typescript-lsp': 'TypeScript/JavaScript language server',
        'rust-analyzer-lsp': 'Rust language server with code intelligence',
        'gopls-lsp': 'Go language server',
        'clangd-lsp': 'C/C++ language server',
        'jdtls-lsp': 'Java language server',
        'csharp-lsp': 'C# language server',
        'swift-lsp': 'Swift language server',
        'lua-lsp': 'Lua language server',
        'php-lsp': 'PHP language server',
        'code-review': 'AI-powered automated code review',
        'frontend-design': 'Frontend design and UI development',
        'feature-dev': 'Feature development workflows',
        'commit-commands': 'Git commit helpers and automation',
        'pr-review-toolkit': 'Pull request review tools',
        'github': 'GitHub integration and automation',
        'gitlab': 'GitLab integration',
        'slack': 'Slack notifications and integration',
        'linear': 'Linear project management',
        'asana': 'Asana task management',
        'firebase': 'Firebase development tools',
        'stripe': 'Stripe payment integration',
        'supabase': 'Supabase backend platform',
        'hookify': 'Custom hooks and automation',
        'agent-sdk-dev': 'Agent SDK development tools',
        'plugin-dev': 'Plugin development toolkit',
        'ralph-loop': 'Advanced workflow automation',
        'playwright': 'Browser automation and testing',
        'context7': 'Enhanced context management',
        'greptile': 'Advanced code search engine',
        'laravel-boost': 'Laravel development accelerator',
        'serena': 'Intelligent development assistant'
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

// Parse YAML frontmatter from SKILL.md
function parseSkillMd(skillPath) {
    try {
        const mdPath = path.join(skillPath, 'SKILL.md');
        if (fs.existsSync(mdPath)) {
            const content = fs.readFileSync(mdPath, 'utf8');

            // Parse YAML frontmatter
            const frontmatterMatch = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
            if (frontmatterMatch) {
                const frontmatter = frontmatterMatch[1];
                const metadata = {};

                // Simple YAML parser for name and description
                const lines = frontmatter.split(/\r?\n/);
                for (const line of lines) {
                    const match = line.match(/^(\w+):\s*(.*)$/);
                    if (match) {
                        const key = match[1];
                        const value = match[2].trim();
                        if (value) {
                            metadata[key] = value;
                        }
                    }
                }

                return {
                    name: metadata.name || path.basename(skillPath),
                    description: metadata.description || 'No description available',
                    content: content // Store full content for README
                };
            }
        }
    } catch (error) {
        console.error(`Error reading SKILL.md for ${skillPath}:`, error.message);
    }
    return null;
}

// Read skill.json or SKILL.md file
function readSkillJson(skillPath) {
    // First try SKILL.md (new format)
    const skillMd = parseSkillMd(skillPath);
    if (skillMd) {
        return skillMd;
    }

    // Fallback to skill.json (old format)
    try {
        const jsonPath = path.join(skillPath, 'skill.json');
        if (fs.existsSync(jsonPath)) {
            const data = fs.readFileSync(jsonPath, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error(`Error reading skill.json for ${skillPath}:`, error.message);
    }
    return null;
}

// Get skills from settings.json
function getSettingsSkills() {
    try {
        const settings = readSettings();
        const settingsSkills = settings.skills || [];

        return settingsSkills.map(skill => ({
            id: skill.id || skill.name,
            name: skill.name,
            displayName: skill.name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
            description: skill.description || 'No description available',
            location: skill.location || 'managed',
            source: 'settings',
            version: skill.version || '1.0.0',
            author: skill.author || 'Anthropic',
            tags: skill.tags || []
        }));
    } catch (error) {
        console.error('Error reading skills from settings:', error);
        return [];
    }
}

// Get all skills (from filesystem and settings.json)
async function getSkills() {
    const skills = [];

    // Helper function to scan a skills directory
    function scanSkillsDir(skillsPath, level) {
        if (!fs.existsSync(skillsPath)) {
            return [];
        }

        const entries = fs.readdirSync(skillsPath, { withFileTypes: true });
        const foundSkills = [];

        for (const entry of entries) {
            if (entry.isDirectory()) {
                const skillPath = path.join(skillsPath, entry.name);
                const skillJson = readSkillJson(skillPath);

                if (skillJson) {
                    foundSkills.push({
                        id: entry.name,
                        name: entry.name,
                        displayName: skillJson.name || entry.name,
                        description: skillJson.description || 'No description available',
                        location: level,
                        source: 'filesystem',
                        path: skillPath,
                        version: skillJson.version || '1.0.0',
                        author: skillJson.author || 'Unknown',
                        tags: skillJson.tags || []
                    });
                }
            }
        }

        return foundSkills;
    }

    // Scan user-level skills
    const userSkills = scanSkillsDir(USER_SKILLS_PATH, 'user');
    skills.push(...userSkills);

    // Scan project-level skills
    const projectSkills = scanSkillsDir(PROJECT_SKILLS_PATH, 'project');
    skills.push(...projectSkills);

    // Get skills from settings.json
    const settingsSkills = getSettingsSkills();
    skills.push(...settingsSkills);

    return skills;
}

// Execute Claude CLI command
async function execClaude(command) {
    try {
        const { stdout, stderr } = await execPromise(`claude ${command}`, { timeout: 60000 });
        return { success: true, output: stdout, error: stderr };
    } catch (error) {
        return { success: false, output: error.stdout || '', error: error.stderr || error.message };
    }
}

// Serve static files
function serveStatic(req, res, filePath) {
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('File not found');
            return;
        }

        const ext = path.extname(filePath);
        const contentType = MIME_TYPES[ext] || 'text/plain';

        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
}

// Handle HTTP requests
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
        // API Routes
        if (url.startsWith('/api/')) {
            // GET /api/plugins
            if (method === 'GET' && url === '/api/plugins') {
                const plugins = await getPlugins();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ plugins }));
                return;
            }

            // GET /api/skills
            if (method === 'GET' && url === '/api/skills') {
                const skills = await getSkills();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ skills }));
                return;
            }

            // GET /api/skills/:id
            if (method === 'GET' && url.match(/^\/api\/skills\/[^/]+$/)) {
                const skillId = decodeURIComponent(url.split('/')[3]);
                const skills = await getSkills();
                const skill = skills.find(s => s.id === skillId);

                if (skill) {
                    // Read full skill details including SKILL.md or README.md
                    // Only applicable for filesystem-based skills
                    if (skill.source === 'filesystem' && skill.path) {
                        try {
                            // Try SKILL.md first (new format)
                            const skillMdPath = path.join(skill.path, 'SKILL.md');
                            if (fs.existsSync(skillMdPath)) {
                                skill.readme = fs.readFileSync(skillMdPath, 'utf8');
                            } else {
                                // Fallback to README.md (old format)
                                const readmePath = path.join(skill.path, 'README.md');
                                if (fs.existsSync(readmePath)) {
                                    skill.readme = fs.readFileSync(readmePath, 'utf8');
                                }
                            }
                        } catch (error) {
                            console.error('Error reading skill documentation:', error);
                        }
                    } else if (skill.source === 'settings') {
                        // For settings-based skills, provide a note that they are managed by Claude Code
                        skill.readme = `# ${skill.displayName}\n\n${skill.description}\n\n---\n\n**Location:** ${skill.location}\n**Source:** Claude Code Configuration\n\nThis skill is managed by Claude Code and configured in settings.json.`;
                    }

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(skill));
                } else {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Skill not found' }));
                }
                return;
            }

            // POST /api/plugins/:id/toggle
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

            // POST /api/plugins/:id/enable
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

            // POST /api/plugins/:id/disable
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

            // POST /api/plugins/enable-all
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

            // POST /api/plugins/disable-all
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

            // POST /api/plugins/:id/update
            if (method === 'POST' && url.match(/^\/api\/plugins\/[^/]+\/update$/)) {
                const pluginId = decodeURIComponent(url.split('/')[3]);
                const parsed = parsePluginId(pluginId);
                const result = await execClaude(`plugin update ${parsed.name}`);
                res.writeHead(result.success ? 200 : 500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));
                return;
            }

            // DELETE /api/plugins/:id
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

            // POST /api/plugins/update-all
            if (method === 'POST' && url === '/api/plugins/update-all') {
                const result = await execClaude('plugin marketplace update');
                res.writeHead(result.success ? 200 : 500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));
                return;
            }

            // POST /api/plugins/save
            if (method === 'POST' && url === '/api/plugins/save') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, message: 'Configuration saved' }));
                return;
            }

            // API 404
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'API endpoint not found' }));
            return;
        }

        // Static file serving
        let filePath = __dirname;
        if (url === '/') {
            filePath = path.join(filePath, 'index.html');
        } else {
            filePath = path.join(filePath, url);
        }

        serveStatic(req, res, filePath);

    } catch (error) {
        console.error('Error handling request:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
    }
}

// Create and start server
const server = http.createServer(handleRequest);

server.listen(PORT, () => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀  Claude Plugin Manager`);
    console.log(`${'='.repeat(60)}`);
    console.log(`\n📡 Server running at: http://localhost:${PORT}`);
    console.log(`📂 Settings file: ${SETTINGS_PATH}`);
    console.log(`\n💡 Open http://localhost:${PORT} in your browser to manage plugins`);
    console.log(`\n${'='.repeat(60)}\n`);
});

server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`\n❌ Port ${PORT} is already in use.`);
        console.error(`   Please close other applications or edit server-static.js to use a different port.\n`);
    } else {
        console.error('\n❌ Server error:', error.message, '\n');
    }
    process.exit(1);
});

process.on('SIGINT', () => {
    console.log('\n\n👋 Shutting down server gracefully...\n');
    server.close(() => {
        console.log('✅ Server closed successfully\n');
        process.exit(0);
    });
});
