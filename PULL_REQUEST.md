# Security Fixes & New Features

## Summary

本次更新包含安全漏洞修复和新功能开发：
1. 修复 3 个安全漏洞（命令注入、CSRF、路径遍历）
2. 新增 Commands 和 Agents 管理页面

---

## 🔒 Security Fixes

### 1. Command Injection (RCE)
| | |
|---|---|
| **风险等级** | 🔴 Critical |
| **问题** | 用户输入直接拼接到 shell 命令执行 |
| **修复** | 添加 `isValidPluginName()` 白名单验证 |

### 2. CORS & CSRF
| | |
|---|---|
| **风险等级** | 🔴 High |
| **问题** | `Access-Control-Allow-Origin: *` 允许任意网站调用 API |
| **修复** | 限制 localhost + 拦截非法 Origin 的 POST/DELETE |

### 3. Path Traversal
| | |
|---|---|
| **风险等级** | 🟡 Medium |
| **问题** | 静态文件服务可读取系统任意文件 |
| **修复** | 验证路径必须在项目目录内 |

### Security Test Results

```bash
# 命令注入 → 已拦截
curl -X POST "localhost:3456/api/plugins/test;echo HACKED/update"
# {"error":"Invalid plugin name"}

# CSRF → 已拦截  
curl -X POST -H "Origin: https://evil.com" "localhost:3456/api/plugins/x/toggle"
# {"error":"Origin not allowed"}

# 路径遍历 → 已拦截
curl "localhost:3456/../../../etc/passwd"
# File not found
```

---

## ✨ New Features

### Commands Management
- 读取 `~/.claude/commands/*.md`
- 支持查看、创建、编辑、删除
- 路径：`/api/commands`

### Agents Management  
- 读取 `~/.claude/agents/*.md`
- 支持查看、创建、编辑、删除
- 路径：`/api/agents`

### UI Updates
- 新增 Commands Tab
- 新增 Agents Tab
- Modal 支持 Markdown 编辑

---

## Files Changed

| 文件 | 改动 |
|------|------|
| `server-static.js` | +安全修复 +Commands/Agents API |
| `server.js` | +安全修复 |
| `app.js` | +Commands/Agents 前端逻辑 |
| `index.html` | +Commands/Agents Tab UI |

---

## Screenshots

**Commands Tab:**
- 显示 `/leoninit` 等自定义命令
- 支持 View/Edit/Delete 操作

**Agents Tab:**
- 显示自定义 agents
- 支持 New Agent 创建
