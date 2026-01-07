// Claude Plugin Manager - Table-based UI with Skills Support

const API_BASE = 'http://localhost:3456';

// Plugins state
let plugins = [];
let currentFilter = 'all';
let searchQuery = '';
let sortColumn = null;
let sortDirection = 'asc';
let selectedPlugins = new Set();

// Skills state
let skills = [];
let skillSearchQuery = '';
let currentTab = 'plugins';

// Commands state
let commands = [];
let commandSearchQuery = '';

// Agents state
let agents = [];
let agentSearchQuery = '';

// Initialize
async function init() {
    try {
        // Set first card as active
        document.querySelector('.stat-card[data-tab="plugins"]').classList.add('active');
        
        await loadPlugins();
        setupEventListeners();
        renderPlugins();
        
        // Load all stats in background
        loadAllStats();
    } catch (error) {
        showToast('Failed to load: ' + error.message, 'error');
    }
}

// Load all stats for dashboard
async function loadAllStats() {
    try {
        // Load skills count
        const skillsRes = await fetch(`${API_BASE}/api/skills`);
        if (skillsRes.ok) {
            const data = await skillsRes.json();
            skills = data.skills;
            document.getElementById('totalSkills').textContent = skills.length;
            document.getElementById('userSkills').textContent = skills.filter(s => s.level === 'user').length;
            document.getElementById('projectSkills').textContent = skills.filter(s => s.level === 'project').length;
        }
        
        // Load commands count
        const commandsRes = await fetch(`${API_BASE}/api/commands`);
        if (commandsRes.ok) {
            const data = await commandsRes.json();
            commands = data.commands;
            document.getElementById('totalCommands').textContent = commands.length;
        }
        
        // Load agents count
        const agentsRes = await fetch(`${API_BASE}/api/agents`);
        if (agentsRes.ok) {
            const data = await agentsRes.json();
            agents = data.agents;
            document.getElementById('totalAgents').textContent = agents.length;
        }
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// Load plugins
async function loadPlugins() {
    try {
        const response = await fetch(`${API_BASE}/api/plugins`);
        if (!response.ok) throw new Error('Cannot connect to server');

        const data = await response.json();
        plugins = data.plugins;

        updateStats();
    } catch (error) {
        console.error('Error loading plugins:', error);
        throw error;
    }
}

// Update statistics
function updateStats() {
    const total = plugins.length;
    const enabled = plugins.filter(p => p.enabled).length;
    const disabled = total - enabled;

    document.getElementById('totalPlugins').textContent = total;
    document.getElementById('enabledPlugins').textContent = enabled;
    document.getElementById('disabledPlugins').textContent = disabled;
}

// Setup event listeners
function setupEventListeners() {
    // Plugins search
    document.getElementById('searchInput').addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase();
        renderPlugins();
    });

    // Skills search
    document.getElementById('skillSearchInput').addEventListener('input', (e) => {
        skillSearchQuery = e.target.value.toLowerCase();
        renderSkills();
    });

    // Commands search
    document.getElementById('commandSearchInput').addEventListener('input', (e) => {
        commandSearchQuery = e.target.value.toLowerCase();
        renderCommands();
    });

    // Agents search
    document.getElementById('agentSearchInput').addEventListener('input', (e) => {
        agentSearchQuery = e.target.value.toLowerCase();
        renderAgents();
    });

    // New command button
    document.getElementById('newCommandBtn').addEventListener('click', () => showEditModal('command', null));

    // New agent button
    document.getElementById('newAgentBtn').addEventListener('click', () => showEditModal('agent', null));

    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            renderPlugins();
        });
    });

    // Action buttons
    document.getElementById('enableAllBtn').addEventListener('click', () => enableAllPlugins());
    document.getElementById('disableAllBtn').addEventListener('click', () => disableAllPlugins());
    document.getElementById('updateAllBtn').addEventListener('click', () => updateAllPlugins());
    document.getElementById('saveBtn').addEventListener('click', () => saveConfig());

    // Modal
    document.getElementById('modalCancel').addEventListener('click', () => hideModal());
}

// Switch tab
function switchTab(tab) {
    currentTab = tab;

    // Update stat cards
    document.querySelectorAll('.stat-card').forEach(card => {
        card.classList.toggle('active', card.dataset.tab === tab);
    });

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });

    if (tab === 'plugins') {
        document.getElementById('pluginsTab').classList.add('active');
    } else if (tab === 'skills') {
        document.getElementById('skillsTab').classList.add('active');
        if (skills.length === 0) {
            loadSkills().then(() => renderSkills());
        }
    } else if (tab === 'commands') {
        document.getElementById('commandsTab').classList.add('active');
        renderCommands();
    } else if (tab === 'agents') {
        document.getElementById('agentsTab').classList.add('active');
        renderAgents();
    }
}

// Load skills
async function loadSkills() {
    try {
        const response = await fetch(`${API_BASE}/api/skills`);
        if (!response.ok) throw new Error('Cannot connect to server');

        const data = await response.json();
        skills = data.skills;

        updateSkillsStats();
    } catch (error) {
        console.error('Error loading skills:', error);
        throw error;
    }
}

// Update skills statistics
function updateSkillsStats() {
    const total = skills.length;
    const userSkills = skills.filter(s => s.level === 'user').length;
    const projectSkills = skills.filter(s => s.level === 'project').length;

    document.getElementById('totalSkills').textContent = total;
    document.getElementById('userSkills').textContent = userSkills;
    document.getElementById('projectSkills').textContent = projectSkills;
}

// Render skills
function renderSkills() {
    const container = document.getElementById('skillsContainer');

    // Filter by search
    let filtered = skills.filter(skill => {
        if (skillSearchQuery) {
            const searchText = `${skill.name} ${skill.displayName} ${skill.description} ${skill.tags.join(' ')}`.toLowerCase();
            if (!searchText.includes(skillSearchQuery)) return false;
        }
        return true;
    });

    // Group by level
    const grouped = {
        user: filtered.filter(s => s.level === 'user'),
        project: filtered.filter(s => s.level === 'project')
    };

    // Render
    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🔍</div>
                <div>No skills found matching your criteria</div>
            </div>
        `;
        return;
    }

    let html = '';

    // User skills
    if (grouped.user.length > 0) {
        html += renderSkillsGroup('User Skills', grouped.user, 'user');
    }

    // Project skills
    if (grouped.project.length > 0) {
        html += renderSkillsGroup('Project Skills', grouped.project, 'project');
    }

    container.innerHTML = html;
}

// Render skills group
function renderSkillsGroup(title, skillsList, level) {
    const levelColor = level === 'user' ? '#3B82F6' : '#10B981';

    let html = `
        <div class="category-section">
            <div class="category-header">
                <div class="category-info">
                    <span class="category-name">${title}</span>
                    <span class="category-badge" style="background: ${levelColor}20; color: ${levelColor};">${skillsList.length}</span>
                </div>
            </div>
            <div class="category-content">
                <table class="plugin-table">
                    <thead>
                        <tr>
                            <th style="width: 250px;">Skill Name</th>
                            <th>Description</th>
                            <th style="width: 100px;">Version</th>
                            <th style="width: 200px;">Tags</th>
                            <th style="width: 120px;">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
    `;

    skillsList.forEach(skill => {
        html += `
            <tr>
                <td>
                    <div class="plugin-name">
                        <div class="plugin-name-text">${skill.displayName}</div>
                        <div class="plugin-id">${skill.id}</div>
                    </div>
                </td>
                <td>
                    <div class="plugin-description">${skill.description}</div>
                </td>
                <td>
                    <span class="status-badge" style="background: ${levelColor}20; color: ${levelColor};">
                        ${skill.version}
                    </span>
                </td>
                <td>
                    <div class="plugin-tags">
                        ${skill.tags.map(tag => `<span class="plugin-tag">${tag}</span>`).join('')}
                    </div>
                </td>
                <td>
                    <div class="action-buttons">
                        <button class="action-btn" onclick="viewSkill('${skill.id}')">View</button>
                    </div>
                </td>
            </tr>
        `;
    });

    html += `
                    </tbody>
                </table>
            </div>
        </div>
    `;

    return html;
}

// View skill details
async function viewSkill(skillId) {
    try {
        const response = await fetch(`${API_BASE}/api/skills/${encodeURIComponent(skillId)}`);
        if (!response.ok) throw new Error('Cannot load skill details');

        const skill = await response.json();

        const modalTitle = document.getElementById('modalTitle');
        const modalBody = document.getElementById('modalBody');
        const modalFooter = document.querySelector('.modal-footer');

        modalTitle.textContent = skill.displayName;
        modalBody.innerHTML = `
            <div style="text-align: left;">
                <p><strong>ID:</strong> ${skill.id}</p>
                <p><strong>Version:</strong> ${skill.version}</p>
                <p><strong>Author:</strong> ${skill.author}</p>
                <p><strong>Level:</strong> ${skill.level}</p>
                <p><strong>Path:</strong> <code style="font-size: 12px;">${skill.path}</code></p>
                <p><strong>Description:</strong></p>
                <p>${skill.description}</p>
                ${skill.tags.length > 0 ? `<p><strong>Tags:</strong> ${skill.tags.join(', ')}</p>` : ''}
                ${skill.readme ? `
                    <hr style="margin: 20px 0; border: none; border-top: 1px solid var(--border-primary);">
                    <details>
                        <summary style="cursor: pointer; font-weight: 600; margin-bottom: 10px;">📖 README</summary>
                        <pre style="background: var(--bg-secondary); padding: 15px; border-radius: 6px; overflow-x: auto; font-size: 13px; line-height: 1.5;">${skill.readme}</pre>
                    </details>
                ` : ''}
            </div>
        `;

        modalFooter.innerHTML = '<button class="btn btn-secondary" id="modalCloseBtn">Close</button>';
        document.getElementById('modalCloseBtn').addEventListener('click', hideModal);

        showModal();
    } catch (error) {
        showToast('Failed to load skill details: ' + error.message, 'error');
    }
}

// Render plugins
function renderPlugins() {
    const container = document.getElementById('pluginContainer');

    // Filter and search
    let filtered = plugins.filter(plugin => {
        // Filter by status
        if (currentFilter === 'enabled' && !plugin.enabled) return false;
        if (currentFilter === 'disabled' && plugin.enabled) return false;

        // Search
        if (searchQuery) {
            const searchText = `${plugin.name} ${plugin.description} ${plugin.marketplace} ${plugin.tags.join(' ')}`.toLowerCase();
            if (!searchText.includes(searchQuery)) return false;
        }

        return true;
    });

    // Group by marketplace
    const grouped = {};
    filtered.forEach(plugin => {
        if (!grouped[plugin.marketplace]) {
            grouped[plugin.marketplace] = [];
        }
        grouped[plugin.marketplace].push(plugin);
    });

    // Render
    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🔍</div>
                <div>No plugins found matching your criteria</div>
            </div>
        `;
        return;
    }

    let html = '';
    Object.keys(grouped).sort().forEach(marketplace => {
        const marketplacePlugins = grouped[marketplace];
        const enabledCount = marketplacePlugins.filter(p => p.enabled).length;

        html += `
            <div class="table-container">
                <div class="category-header" onclick="toggleCategory('${marketplace}')">
                    <div class="category-title-group">
                        <span class="category-toggle">▼</span>
                        <span class="category-title">${marketplace}</span>
                        <span class="category-badge">${enabledCount}/${marketplacePlugins.length}</span>
                    </div>
                    <div class="category-actions" onclick="event.stopPropagation()">
                        <button class="category-btn" onclick="enableCategory('${marketplace}')">Enable All</button>
                        <button class="category-btn" onclick="disableCategory('${marketplace}')">Disable All</button>
                    </div>
                </div>
                <div class="table-wrapper" id="table-${marketplace}">
                    <table>
                        <thead>
                            <tr>
                                <th style="width: 50px;">
                                    <input type="checkbox" class="checkbox" onchange="toggleCategorySelection('${marketplace}', this.checked)">
                                </th>
                                <th class="sortable" onclick="sortTable('${marketplace}', 'name')">Plugin</th>
                                <th class="sortable" onclick="sortTable('${marketplace}', 'description')">Description</th>
                                <th style="width: 200px;">Tags</th>
                                <th class="sortable" onclick="sortTable('${marketplace}', 'enabled')" style="width: 100px;">Status</th>
                                <th style="width: 100px;">Toggle</th>
                                <th style="width: 180px;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${marketplacePlugins.map(plugin => renderPluginRow(plugin)).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// Render single plugin row
function renderPluginRow(plugin) {
    const isSelected = selectedPlugins.has(plugin.id);

    return `
        <tr class="${isSelected ? 'selected' : ''}">
            <td>
                <input type="checkbox"
                       class="checkbox"
                       ${isSelected ? 'checked' : ''}
                       onchange="togglePluginSelection('${plugin.id}', this.checked)">
            </td>
            <td>
                <div class="plugin-name">${plugin.displayName || plugin.name}</div>
                <div class="plugin-marketplace">${plugin.marketplace}</div>
            </td>
            <td>
                <div class="plugin-description" title="${plugin.description || 'No description'}">
                    ${plugin.description || 'No description'}
                </div>
            </td>
            <td>
                <div class="plugin-tags">
                    ${plugin.tags.slice(0, 3).map(tag => `<span class="tag">${tag}</span>`).join('')}
                    ${plugin.tags.length > 3 ? `<span class="tag">+${plugin.tags.length - 3}</span>` : ''}
                </div>
            </td>
            <td>
                <span class="status-badge ${plugin.enabled ? 'enabled' : 'disabled'}">
                    <span class="status-dot"></span>
                    ${plugin.enabled ? 'Enabled' : 'Disabled'}
                </span>
            </td>
            <td>
                <div class="toggle-switch ${plugin.enabled ? 'enabled' : ''}"
                     onclick="togglePlugin('${plugin.id}')"></div>
            </td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn" onclick="updatePlugin('${plugin.id}')">Update</button>
                    <button class="action-btn danger" onclick="uninstallPlugin('${plugin.id}')">Uninstall</button>
                </div>
            </td>
        </tr>
    `;
}

// Toggle category expand/collapse
function toggleCategory(marketplace) {
    const header = event.currentTarget;
    const wrapper = document.getElementById(`table-${marketplace}`);

    header.classList.toggle('collapsed');
    wrapper.classList.toggle('collapsed');
}

// Toggle category selection
function toggleCategorySelection(marketplace, checked) {
    const categoryPlugins = plugins.filter(p => p.marketplace === marketplace);

    categoryPlugins.forEach(plugin => {
        if (checked) {
            selectedPlugins.add(plugin.id);
        } else {
            selectedPlugins.delete(plugin.id);
        }
    });

    renderPlugins();
}

// Toggle plugin selection
function togglePluginSelection(pluginId, checked) {
    if (checked) {
        selectedPlugins.add(pluginId);
    } else {
        selectedPlugins.delete(pluginId);
    }

    renderPlugins();
}

// Sort table
function sortTable(marketplace, column) {
    if (sortColumn === column) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        sortColumn = column;
        sortDirection = 'asc';
    }

    const categoryPlugins = plugins.filter(p => p.marketplace === marketplace);

    categoryPlugins.sort((a, b) => {
        let aVal = a[column];
        let bVal = b[column];

        if (column === 'enabled') {
            aVal = a.enabled ? 1 : 0;
            bVal = b.enabled ? 1 : 0;
        }

        if (typeof aVal === 'string') {
            aVal = aVal.toLowerCase();
            bVal = bVal.toLowerCase();
        }

        if (sortDirection === 'asc') {
            return aVal > bVal ? 1 : -1;
        } else {
            return aVal < bVal ? 1 : -1;
        }
    });

    // Update plugins array
    const otherPlugins = plugins.filter(p => p.marketplace !== marketplace);
    plugins = [...otherPlugins, ...categoryPlugins];

    renderPlugins();
}

// Toggle plugin
async function togglePlugin(pluginId) {
    const plugin = plugins.find(p => p.id === pluginId);
    if (!plugin) return;

    try {
        const response = await fetch(`${API_BASE}/api/plugins/${pluginId}/toggle`, {
            method: 'POST'
        });

        if (!response.ok) throw new Error('Operation failed');

        plugin.enabled = !plugin.enabled;
        updateStats();
        renderPlugins();

        showToast(`${plugin.displayName || plugin.name} ${plugin.enabled ? 'enabled' : 'disabled'}`, 'success');
    } catch (error) {
        showToast('Operation failed: ' + error.message, 'error');
    }
}

// Enable category
async function enableCategory(marketplace) {
    const categoryPlugins = plugins.filter(p => p.marketplace === marketplace);

    for (const plugin of categoryPlugins) {
        if (!plugin.enabled) {
            try {
                await fetch(`${API_BASE}/api/plugins/${plugin.id}/enable`, { method: 'POST' });
                plugin.enabled = true;
            } catch (error) {
                console.error('Error enabling plugin:', error);
            }
        }
    }

    updateStats();
    renderPlugins();
    showToast(`All plugins in ${marketplace} enabled`, 'success');
}

// Disable category
async function disableCategory(marketplace) {
    const categoryPlugins = plugins.filter(p => p.marketplace === marketplace);

    for (const plugin of categoryPlugins) {
        if (plugin.enabled) {
            try {
                await fetch(`${API_BASE}/api/plugins/${plugin.id}/disable`, { method: 'POST' });
                plugin.enabled = false;
            } catch (error) {
                console.error('Error disabling plugin:', error);
            }
        }
    }

    updateStats();
    renderPlugins();
    showToast(`All plugins in ${marketplace} disabled`, 'success');
}

// Enable all plugins
async function enableAllPlugins() {
    showConfirmModal(
        'Enable All Plugins',
        'Are you sure you want to enable all plugins? This may affect performance.',
        async () => {
            try {
                const response = await fetch(`${API_BASE}/api/plugins/enable-all`, {
                    method: 'POST'
                });

                if (!response.ok) throw new Error('Operation failed');

                plugins.forEach(p => p.enabled = true);
                updateStats();
                renderPlugins();
                showToast('All plugins enabled', 'success');
            } catch (error) {
                showToast('Operation failed: ' + error.message, 'error');
            }
        }
    );
}

// Disable all plugins
async function disableAllPlugins() {
    showConfirmModal(
        'Disable All Plugins',
        'Are you sure you want to disable all plugins?',
        async () => {
            try {
                const response = await fetch(`${API_BASE}/api/plugins/disable-all`, {
                    method: 'POST'
                });

                if (!response.ok) throw new Error('Operation failed');

                plugins.forEach(p => p.enabled = false);
                updateStats();
                renderPlugins();
                showToast('All plugins disabled', 'success');
            } catch (error) {
                showToast('Operation failed: ' + error.message, 'error');
            }
        }
    );
}

// Update plugin
async function updatePlugin(pluginId) {
    const plugin = plugins.find(p => p.id === pluginId);
    if (!plugin) return;

    showConfirmModal(
        'Update Plugin',
        `Are you sure you want to update ${plugin.displayName || plugin.name}?`,
        async () => {
            try {
                showToast('Updating, please wait...', 'info');

                const response = await fetch(`${API_BASE}/api/plugins/${pluginId}/update`, {
                    method: 'POST'
                });

                if (!response.ok) throw new Error('Update failed');

                showToast(`${plugin.displayName || plugin.name} updated successfully`, 'success');
            } catch (error) {
                showToast('Update failed: ' + error.message, 'error');
            }
        }
    );
}

// Uninstall plugin
async function uninstallPlugin(pluginId) {
    const plugin = plugins.find(p => p.id === pluginId);
    if (!plugin) return;

    showConfirmModal(
        'Uninstall Plugin',
        `Are you sure you want to uninstall ${plugin.displayName || plugin.name}? This action cannot be undone.`,
        async () => {
            try {
                const response = await fetch(`${API_BASE}/api/plugins/${pluginId}`, {
                    method: 'DELETE'
                });

                if (!response.ok) throw new Error('Uninstall failed');

                plugins = plugins.filter(p => p.id !== pluginId);
                selectedPlugins.delete(pluginId);
                updateStats();
                renderPlugins();
                showToast(`${plugin.displayName || plugin.name} uninstalled`, 'success');
            } catch (error) {
                showToast('Uninstall failed: ' + error.message, 'error');
            }
        }
    );
}

// Update all plugins
async function updateAllPlugins() {
    showConfirmModal(
        'Update All Plugins',
        'Are you sure you want to update all marketplaces and plugins? This may take some time.',
        async () => {
            try {
                showToast('Updating all plugins, please wait...', 'info');

                const response = await fetch(`${API_BASE}/api/plugins/update-all`, {
                    method: 'POST'
                });

                if (!response.ok) throw new Error('Update failed');

                await loadPlugins();
                renderPlugins();
                showToast('All plugins updated successfully', 'success');
            } catch (error) {
                showToast('Update failed: ' + error.message, 'error');
            }
        }
    );
}

// Save configuration
async function saveConfig() {
    try {
        const response = await fetch(`${API_BASE}/api/plugins/save`, {
            method: 'POST'
        });

        if (!response.ok) throw new Error('Save failed');

        showToast('Configuration saved successfully', 'success');
    } catch (error) {
        showToast('Save failed: ' + error.message, 'error');
    }
}

// Show confirmation modal
function showConfirmModal(title, message, onConfirm) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').textContent = message;
    document.getElementById('confirmModal').classList.add('show');

    const confirmBtn = document.getElementById('modalConfirm');
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

    newConfirmBtn.addEventListener('click', () => {
        hideModal();
        onConfirm();
    });
}

// Show modal
function showModal() {
    document.getElementById('confirmModal').classList.add('show');
}

// Hide modal
function hideModal() {
    document.getElementById('confirmModal').classList.remove('show');
}

// Show toast notification
function showToast(message, type = 'info') {
    const icons = {
        success: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>`,
        error: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="15" y1="9" x2="9" y2="15"/>
                  <line x1="9" y1="9" x2="15" y2="15"/>
                </svg>`,
        info: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                 <circle cx="12" cy="12" r="10"/>
                 <line x1="12" y1="16" x2="12" y2="12"/>
                 <line x1="12" y1="8" x2="12.01" y2="8"/>
               </svg>`
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${icons[type]}</span>
        <span>${message}</span>
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', init);

// Load commands
async function loadCommands() {
    try {
        const response = await fetch(`${API_BASE}/api/commands`);
        if (!response.ok) throw new Error('Cannot connect to server');

        const data = await response.json();
        commands = data.commands;
        document.getElementById('totalCommands').textContent = commands.length;
    } catch (error) {
        console.error('Error loading commands:', error);
        throw error;
    }
}

// Render commands
function renderCommands() {
    const container = document.getElementById('commandsContainer');

    let filtered = commands.filter(cmd => {
        if (commandSearchQuery) {
            const searchText = `${cmd.name} ${cmd.description}`.toLowerCase();
            if (!searchText.includes(commandSearchQuery)) return false;
        }
        return true;
    });

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📝</div>
                <div>No commands found</div>
                <div style="margin-top: 10px; color: var(--text-tertiary);">Click "New Command" to create one</div>
            </div>
        `;
        return;
    }

    let html = `
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th style="width: 200px;">Name</th>
                        <th>Description</th>
                        <th style="width: 100px;">Lines</th>
                        <th style="width: 150px;">Actions</th>
                    </tr>
                </thead>
                <tbody>
    `;

    filtered.forEach(cmd => {
        html += `
            <tr>
                <td>
                    <div class="plugin-name">/${cmd.name}</div>
                </td>
                <td>
                    <div class="plugin-description">${cmd.description}</div>
                </td>
                <td>${cmd.lines}</td>
                <td>
                    <div class="action-buttons">
                        <button class="action-btn" onclick="viewCommand('${cmd.id}')">View</button>
                        <button class="action-btn" onclick="editCommand('${cmd.id}')">Edit</button>
                        <button class="action-btn danger" onclick="deleteCommand('${cmd.id}')">Delete</button>
                    </div>
                </td>
            </tr>
        `;
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;
}

// View command
async function viewCommand(commandId) {
    try {
        const response = await fetch(`${API_BASE}/api/commands/${encodeURIComponent(commandId)}`);
        if (!response.ok) throw new Error('Cannot load command');

        const command = await response.json();

        const modalTitle = document.getElementById('modalTitle');
        const modalBody = document.getElementById('modalBody');
        const modalFooter = document.querySelector('.modal-footer');

        modalTitle.textContent = `/${command.name}`;
        modalBody.innerHTML = `
            <div style="text-align: left;">
                <p><strong>Path:</strong> <code style="font-size: 12px;">${command.path}</code></p>
                <hr style="margin: 15px 0; border: none; border-top: 1px solid var(--border-primary);">
                <pre style="background: var(--bg-secondary); padding: 15px; border-radius: 6px; overflow-x: auto; font-size: 13px; line-height: 1.5; max-height: 400px; overflow-y: auto;">${escapeHtml(command.content)}</pre>
            </div>
        `;

        modalFooter.innerHTML = '<button class="btn btn-secondary" id="modalCloseBtn">Close</button>';
        document.getElementById('modalCloseBtn').addEventListener('click', hideModal);

        showModal();
    } catch (error) {
        showToast('Failed to load command: ' + error.message, 'error');
    }
}

// Edit command
async function editCommand(commandId) {
    try {
        const response = await fetch(`${API_BASE}/api/commands/${encodeURIComponent(commandId)}`);
        if (!response.ok) throw new Error('Cannot load command');

        const command = await response.json();
        showEditModal('command', command);
    } catch (error) {
        showToast('Failed to load command: ' + error.message, 'error');
    }
}

// Delete command
function deleteCommand(commandId) {
    showConfirmModal(
        'Delete Command',
        `Are you sure you want to delete /${commandId}?`,
        async () => {
            try {
                const response = await fetch(`${API_BASE}/api/commands/${encodeURIComponent(commandId)}`, {
                    method: 'DELETE'
                });
                if (!response.ok) throw new Error('Delete failed');

                commands = commands.filter(c => c.id !== commandId);
                document.getElementById('totalCommands').textContent = commands.length;
                renderCommands();
                showToast('Command deleted', 'success');
            } catch (error) {
                showToast('Failed to delete: ' + error.message, 'error');
            }
        }
    );
}

// Load agents
async function loadAgents() {
    try {
        const response = await fetch(`${API_BASE}/api/agents`);
        if (!response.ok) throw new Error('Cannot connect to server');

        const data = await response.json();
        agents = data.agents;
        document.getElementById('totalAgents').textContent = agents.length;
    } catch (error) {
        console.error('Error loading agents:', error);
        throw error;
    }
}

// Render agents
function renderAgents() {
    const container = document.getElementById('agentsContainer');

    let filtered = agents.filter(agent => {
        if (agentSearchQuery) {
            const searchText = `${agent.name} ${agent.description}`.toLowerCase();
            if (!searchText.includes(agentSearchQuery)) return false;
        }
        return true;
    });

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🤖</div>
                <div>No agents found</div>
                <div style="margin-top: 10px; color: var(--text-tertiary);">Click "New Agent" to create one</div>
            </div>
        `;
        return;
    }

    let html = `
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th style="width: 200px;">Name</th>
                        <th>Description</th>
                        <th style="width: 100px;">Lines</th>
                        <th style="width: 150px;">Actions</th>
                    </tr>
                </thead>
                <tbody>
    `;

    filtered.forEach(agent => {
        html += `
            <tr>
                <td>
                    <div class="plugin-name">@${agent.name}</div>
                </td>
                <td>
                    <div class="plugin-description">${agent.description}</div>
                </td>
                <td>${agent.lines}</td>
                <td>
                    <div class="action-buttons">
                        <button class="action-btn" onclick="viewAgent('${agent.id}')">View</button>
                        <button class="action-btn" onclick="editAgent('${agent.id}')">Edit</button>
                        <button class="action-btn danger" onclick="deleteAgent('${agent.id}')">Delete</button>
                    </div>
                </td>
            </tr>
        `;
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;
}

// View agent
async function viewAgent(agentId) {
    try {
        const response = await fetch(`${API_BASE}/api/agents/${encodeURIComponent(agentId)}`);
        if (!response.ok) throw new Error('Cannot load agent');

        const agent = await response.json();

        const modalTitle = document.getElementById('modalTitle');
        const modalBody = document.getElementById('modalBody');
        const modalFooter = document.querySelector('.modal-footer');

        modalTitle.textContent = `@${agent.name}`;
        modalBody.innerHTML = `
            <div style="text-align: left;">
                <p><strong>Path:</strong> <code style="font-size: 12px;">${agent.path}</code></p>
                <hr style="margin: 15px 0; border: none; border-top: 1px solid var(--border-primary);">
                <pre style="background: var(--bg-secondary); padding: 15px; border-radius: 6px; overflow-x: auto; font-size: 13px; line-height: 1.5; max-height: 400px; overflow-y: auto;">${escapeHtml(agent.content)}</pre>
            </div>
        `;

        modalFooter.innerHTML = '<button class="btn btn-secondary" id="modalCloseBtn">Close</button>';
        document.getElementById('modalCloseBtn').addEventListener('click', hideModal);

        showModal();
    } catch (error) {
        showToast('Failed to load agent: ' + error.message, 'error');
    }
}

// Edit agent
async function editAgent(agentId) {
    try {
        const response = await fetch(`${API_BASE}/api/agents/${encodeURIComponent(agentId)}`);
        if (!response.ok) throw new Error('Cannot load agent');

        const agent = await response.json();
        showEditModal('agent', agent);
    } catch (error) {
        showToast('Failed to load agent: ' + error.message, 'error');
    }
}

// Delete agent
function deleteAgent(agentId) {
    showConfirmModal(
        'Delete Agent',
        `Are you sure you want to delete @${agentId}?`,
        async () => {
            try {
                const response = await fetch(`${API_BASE}/api/agents/${encodeURIComponent(agentId)}`, {
                    method: 'DELETE'
                });
                if (!response.ok) throw new Error('Delete failed');

                agents = agents.filter(a => a.id !== agentId);
                document.getElementById('totalAgents').textContent = agents.length;
                renderAgents();
                showToast('Agent deleted', 'success');
            } catch (error) {
                showToast('Failed to delete: ' + error.message, 'error');
            }
        }
    );
}

// Show edit modal for command/agent
function showEditModal(type, item) {
    const isNew = !item;
    const title = isNew ? `New ${type.charAt(0).toUpperCase() + type.slice(1)}` : `Edit ${type.charAt(0).toUpperCase() + type.slice(1)}`;
    
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    const modalFooter = document.querySelector('.modal-footer');

    modalTitle.textContent = title;
    modalBody.innerHTML = `
        <div style="text-align: left;">
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: 600;">Name</label>
                <input type="text" id="editName" value="${item ? item.name : ''}" 
                       placeholder="my-${type}" 
                       style="width: 100%; padding: 10px; border: 1px solid var(--border-primary); border-radius: 6px; font-size: 14px;"
                       ${item ? 'disabled' : ''}>
            </div>
            <div>
                <label style="display: block; margin-bottom: 5px; font-weight: 600;">Content (Markdown)</label>
                <textarea id="editContent" 
                          placeholder="Enter ${type} content..."
                          style="width: 100%; height: 300px; padding: 10px; border: 1px solid var(--border-primary); border-radius: 6px; font-size: 13px; font-family: monospace; resize: vertical;">${item ? escapeHtml(item.content) : ''}</textarea>
            </div>
        </div>
    `;

    modalFooter.innerHTML = `
        <button class="btn btn-secondary" id="modalCancelBtn">Cancel</button>
        <button class="btn btn-primary" id="modalSaveBtn">Save</button>
    `;

    document.getElementById('modalCancelBtn').addEventListener('click', hideModal);
    document.getElementById('modalSaveBtn').addEventListener('click', async () => {
        const name = document.getElementById('editName').value.trim();
        const content = document.getElementById('editContent').value;

        if (!name) {
            showToast('Name is required', 'error');
            return;
        }

        if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
            showToast('Name can only contain letters, numbers, - and _', 'error');
            return;
        }

        try {
            const response = await fetch(`${API_BASE}/api/${type}s/${encodeURIComponent(name)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content })
            });

            if (!response.ok) throw new Error('Save failed');

            hideModal();
            showToast(`${type.charAt(0).toUpperCase() + type.slice(1)} saved`, 'success');

            // Reload data
            if (type === 'command') {
                await loadCommands();
                renderCommands();
            } else {
                await loadAgents();
                renderAgents();
            }
        } catch (error) {
            showToast('Failed to save: ' + error.message, 'error');
        }
    });

    showModal();
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
