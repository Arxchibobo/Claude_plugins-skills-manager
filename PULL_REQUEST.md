# Fix: Security Vulnerabilities

## Summary
修复三个安全漏洞：命令注入 (RCE)、CORS 配置过于宽松、路径遍历。

## Changes

### 1. Command Injection Prevention
**问题：** 用户输入的 plugin name 直接拼接到 shell 命令中执行。

**修复：** 添加 `isValidPluginName()` 验证，只允许 `[a-zA-Z0-9_-]`。

### 2. CORS & CSRF Protection
**问题：** `Access-Control-Allow-Origin: *` 允许任何网站访问，且服务器仍会执行请求。

**修复：** 
- 限制 CORS 只允许 localhost
- 对非 GET 请求验证 Origin，拒绝未授权来源

### 3. Path Traversal Prevention
**问题：** 静态文件服务可被 `/../../../etc/passwd` 利用读取系统文件。

**修复：** 验证解析后的路径必须在项目目录内。

## Testing Results

| 测试 | 请求 | 结果 |
|------|------|------|
| 命令注入 | `POST /api/plugins/test;echo HACKED/update` | `{"error":"Invalid plugin name"}` ✅ |
| CSRF | `POST` with `Origin: https://evil.com` | `{"error":"Origin not allowed"}` ✅ |
| 路径遍历 | `GET /../../../etc/passwd` | `File not found` ✅ |
| 正常功能 | `GET /api/plugins` | `{"plugins":[]}` ✅ |

## Files Changed
- `server.js`
- `server-static.js`
