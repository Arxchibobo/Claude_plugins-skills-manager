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

// Initialize
async function init() {
    try {
        await loadPlugins();
        setupEventListeners();
        renderPlugins();
    } catch (error) {
        showToast('Failed to load: ' + error.message, 'error');
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
    // Tab switching
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

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

    // Update tab buttons
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
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
