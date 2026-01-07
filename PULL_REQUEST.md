# Claude Code Manager - Security Fixes & New Features

## Summary

本次更新包含：
1. 🔒 修复 3 个安全漏洞
2. ✨ 新增 Commands 和 Agents 管理功能
3. 🎨 全新 Dashboard UI 设计

---

## 🔒 Security Fixes

### 1. Command Injection (RCE) - Critical
用户输入直接拼接到 shell 命令 → 添加白名单验证 `[a-zA-Z0-9_-]`

### 2. CORS & CSRF - High  
`Access-Control-Allow-Origin: *` → 限制 localhost + 拦截非法 Origin

### 3. Path Traversal - Medium
静态文件可读取系统文件 → 验证路径在项目目录内

```bash
# 测试结果
curl -X POST "localhost:3456/api/plugins/test;rm -rf/update"  # ❌ Invalid plugin name
curl -X POST -H "Origin: https://evil.com" "localhost:3456/api/plugins/x/toggle"  # ❌ Origin not allowed
```

---

## ✨ New Features

### Commands Management (`~/.claude/commands/*.md`)
- 查看、创建、编辑、删除 slash commands
- API: `GET/POST/DELETE /api/commands/:id`

### Agents Management (`~/.claude/agents/*.md`)
- 查看、创建、编辑、删除 custom agents
- API: `GET/POST/DELETE /api/agents/:id`

---

## 🎨 New Dashboard UI

### Before
```
┌─────────────────────────────────┐
│  Total: 0  Enabled: 0  Disabled: 0  │
│  [Plugins] [Skills] [Commands] [Agents]  │
└─────────────────────────────────┘
```

### After
```
┌──────────┬──────────┬──────────┬──────────┐
│ 🔌 Plugins │ ⚡ Skills │ 📝 Commands │ 🤖 Agents │
│    0      │    0     │     1      │    0     │
│ 0 Enabled │ 0 User   │ Slash cmds │ Custom   │
│ 0 Disabled│ 0 Project│            │ agents   │
└──────────┴──────────┴──────────┴──────────┘
```

**Features:**
- 4 个彩色统计卡片（蓝/绿/紫/橙）
- 点击卡片切换 Tab
- 悬停效果 + 选中高亮
- 响应式布局（4→2→1 列）

---

## Files Changed

| 文件 | 改动 |
|------|------|
| `server-static.js` | 安全修复 + Commands/Agents API |
| `server.js` | 安全修复 |
| `app.js` | Commands/Agents 逻辑 + Dashboard 交互 |
| `index.html` | 新 Dashboard UI + Tab 内容 |
