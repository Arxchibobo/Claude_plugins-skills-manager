# Security Audit Guide

Claude Code 插件管理器的安全审查功能使用指南。

---

## 📋 目录

- [功能概述](#功能概述)
- [快速开始](#快速开始)
- [前提条件](#前提条件)
- [使用指南](#使用指南)
  - [Web UI 使用](#web-ui-使用)
  - [API 使用](#api-使用)
- [常见问题 (FAQ)](#常见问题-faq)
- [故障排除](#故障排除)
- [高级配置](#高级配置)

---

## 功能概述

安全审查功能提供自动化的代码安全扫描和审查能力，帮助开发者：

- 🔍 **安全扫描**：使用 Claude Code CLI 的 `security-scanning:sast` skill 检测代码中的安全漏洞
- 📊 **结果可视化**：在 Web UI 中查看扫描结果、问题统计和详细信息
- 📜 **历史记录**：保存最近 10 次扫描记录，支持查看和对比
- ⚡ **性能优化**：智能缓存机制，1 小时内相同路径不重复扫描
- 🎯 **灵活配置**：支持全项目扫描、目录扫描、文件扫描

### 核心特性

- **自动化扫描**：一键启动全项目安全扫描
- **实时进度**：扫描过程中实时显示进度和状态
- **问题分级**：按严重性分类（Critical / High / Medium / Low）
- **详细报告**：每个问题包含文件路径、行号、描述和修复建议
- **缓存机制**：避免重复扫描，提升性能
- **错误处理**：友好的错误提示和安装指引

---

## 快速开始

### 1. 安装 Claude Code CLI

安全审查功能依赖 Claude Code CLI，请先确保已安装：

```bash
# 检查 Claude CLI 是否已安装
claude --version

# 如未安装，访问以下链接下载安装
# https://claude.ai/code
```

**支持的平台：**
- Windows（x64）
- macOS（Intel / Apple Silicon）
- Linux（x64 / ARM64）

### 2. 启动插件管理器

```bash
# 克隆仓库
git clone https://github.com/your-org/claude-plugin-manager.git
cd claude-plugin-manager

# 安装依赖
npm install

# 启动服务器
npm start
```

服务器默认运行在 `http://localhost:3456`

### 3. 访问 Security Tab

1. 在浏览器中打开 `http://localhost:3456`
2. 点击顶部导航栏的 **"Security"** 标签
3. 点击 **"Start Full Scan"** 按钮开始扫描

---

## 前提条件

### 必需条件

1. **Claude Code CLI 已安装**
   - 安装方法：访问 [https://claude.ai/code](https://claude.ai/code)
   - 验证安装：运行 `claude --version`

2. **Node.js 环境**
   - 版本要求：Node.js >= 14.0.0
   - 验证版本：运行 `node --version`

3. **插件管理器已启动**
   - 运行 `npm start` 启动服务器
   - 访问 `http://localhost:3456` 确认可用

### 可选条件

- **网络连接**：Claude Code CLI 需要连接到 Anthropic 服务
- **权限**：扫描某些系统文件可能需要管理员权限

---

## 使用指南

### Web UI 使用

#### 启动扫描

1. **全项目扫描**
   ```
   点击 "Start Full Scan" → 自动扫描整个项目
   ```

2. **自定义扫描**（未来支持）
   ```
   选择特定目录或文件 → 配置扫描范围 → 启动扫描
   ```

#### 查看结果

扫描完成后，结果展示包含以下部分：

1. **统计概览**
   - 扫描的文件数
   - 发现的问题总数
   - 按严重性分类的问题数量

2. **问题列表**
   - 严重性标签（Critical / High / Medium / Low）
   - 文件路径和行号
   - 问题描述
   - 点击问题卡片查看详细信息

3. **问题详情弹窗**
   - 完整的问题描述
   - 受影响的代码片段
   - 修复建议和最佳实践
   - 相关文档链接

#### 历史记录

1. 点击 **"History"** 按钮查看历史扫描记录
2. 每条记录显示：
   - 扫描时间
   - 扫描路径
   - 发现的问题数
   - 扫描状态（完成/失败）
3. 点击记录可重新查看详细结果

#### 筛选和排序

- **按严重性筛选**：点击严重性标签筛选特定级别的问题
- **按文件筛选**：输入文件名或路径搜索相关问题
- **排序**：按严重性、文件名、行号排序

### API 使用

#### 1. 检查 CLI 可用性

```bash
GET /api/security/cli-status
```

**响应示例：**
```json
{
  "available": true,
  "version": "1.2.3",
  "error": null
}
```

**不可用时的响应：**
```json
{
  "available": false,
  "version": null,
  "error": "Claude CLI is not installed or not found in PATH",
  "installGuide": {
    "title": "Claude CLI Not Found",
    "message": "The security scanning feature requires Claude Code CLI to be installed.",
    "steps": [
      "Visit claude.ai/code",
      "Download and install Claude Code for your platform",
      "Restart your terminal or IDE",
      "Verify installation by running: claude --version"
    ],
    "link": "https://claude.ai/code"
  }
}
```

#### 2. 启动安全扫描

```bash
POST /api/security/scan
Content-Type: application/json

{
  "path": "/path/to/project",
  "scope": "full",
  "exclude": ["node_modules", "dist"],
  "format": "json"
}
```

**参数说明：**
- `path` (必需)：扫描路径（文件或目录）
- `scope` (可选)：扫描范围（`full` / `quick` / `custom`，默认 `full`）
- `exclude` (可选)：排除的目录或文件模式
- `format` (可选)：输出格式（`json` / `markdown`，默认 `json`）

**响应示例（202 Accepted）：**
```json
{
  "id": "scan_1234567890_abc123",
  "status": "running",
  "message": "Security scan started"
}
```

#### 3. 查询扫描状态

```bash
GET /api/security/scan/:id
```

**进行中的响应（200 OK）：**
```json
{
  "id": "scan_1234567890_abc123",
  "status": "running",
  "path": "/path/to/project",
  "startTime": "2026-01-08T10:30:00Z"
}
```

**完成的响应（200 OK）：**
```json
{
  "id": "scan_1234567890_abc123",
  "status": "completed",
  "result": {
    "id": "scan_1234567890_abc123",
    "type": "security-scan",
    "status": "completed",
    "path": "/path/to/project",
    "summary": {
      "totalIssues": 5,
      "critical": 1,
      "high": 2,
      "medium": 2,
      "low": 0
    },
    "issues": [
      {
        "id": "issue_1",
        "severity": "critical",
        "type": "sql-injection",
        "file": "src/database/query.js",
        "line": 42,
        "description": "Potential SQL injection vulnerability",
        "recommendation": "Use parameterized queries to prevent SQL injection"
      }
    ],
    "timestamp": "2026-01-08T10:30:00Z",
    "cached": false
  }
}
```

**失败的响应（200 OK）：**
```json
{
  "id": "scan_1234567890_abc123",
  "status": "failed",
  "error": "Scan operation timed out after 120 seconds"
}
```

#### 4. 获取历史记录

```bash
GET /api/security/history?type=security-scan&limit=10
```

**响应示例（200 OK）：**
```json
{
  "history": [
    {
      "id": "scan_1234567890_abc123",
      "type": "security-scan",
      "status": "completed",
      "path": "/path/to/project",
      "summary": {
        "totalIssues": 5,
        "critical": 1,
        "high": 2,
        "medium": 2,
        "low": 0
      },
      "timestamp": "2026-01-08T10:30:00Z"
    }
  ]
}
```

#### 5. 删除历史记录

```bash
DELETE /api/security/history/:id
```

**响应示例（200 OK）：**
```json
{
  "success": true,
  "message": "History entry deleted successfully"
}
```

---

## 常见问题 (FAQ)

### Q1: 为什么显示 "Claude CLI is not available"？

**原因：** Claude Code CLI 未安装或未添加到系统 PATH。

**解决方法：**
1. 访问 [https://claude.ai/code](https://claude.ai/code) 下载并安装 Claude Code
2. 重启终端或 IDE
3. 验证安装：`claude --version`
4. 如果仍然无法识别，手动将 Claude CLI 添加到系统 PATH

**Windows 添加 PATH：**
```powershell
# 默认安装路径
$env:PATH += ";C:\Users\YourUsername\AppData\Local\Programs\Claude Code"
```

**macOS/Linux 添加 PATH：**
```bash
# 添加到 ~/.bashrc 或 ~/.zshrc
export PATH="$PATH:/path/to/claude-cli"
```

### Q2: 扫描为什么很慢？

**可能原因：**
- 项目规模大（数千个文件）
- 网络延迟（Claude CLI 需要连接 Anthropic 服务）
- 第一次扫描（缓存未生效）

**优化建议：**
1. **使用缓存**：相同路径 1 小时内会直接返回缓存结果
2. **缩小扫描范围**：
   ```json
   {
     "path": "/path/to/specific-directory",
     "exclude": ["node_modules", "dist", "build", ".git"]
   }
   ```
3. **选择 quick 模式**（未来支持）：
   ```json
   {
     "scope": "quick"
   }
   ```

### Q3: 扫描结果为空？

**可能原因：**
- 扫描的路径不包含可执行代码
- 所有文件被排除规则过滤
- 项目确实没有明显的安全问题（很少见）

**检查方法：**
1. 确认扫描路径正确：`"path": "/path/to/project"`
2. 检查 exclude 规则是否过于宽泛
3. 查看服务器日志确认扫描是否正常执行
4. 尝试扫描已知有问题的示例代码验证功能

### Q4: 如何跳过某些文件或目录？

**方法 1：使用 exclude 参数**
```json
{
  "path": "/path/to/project",
  "exclude": [
    "node_modules",
    "dist",
    "build",
    "*.test.js",
    "**/__tests__/**"
  ]
}
```

**方法 2：在项目根目录创建 `.claudeignore` 文件**（未来支持）
```
# .claudeignore
node_modules/
dist/
*.log
*.test.js
```

### Q5: 扫描结果可以导出吗？

**当前版本：** 通过 API 获取 JSON 格式结果
```bash
GET /api/security/scan/:id
```

**未来版本计划：**
- 导出为 PDF 报告
- 导出为 CSV 或 Excel
- 生成 HTML 静态报告
- 集成到 CI/CD 流程

### Q6: 如何清除缓存？

**方法 1：重启服务器**
```bash
# 停止服务器
Ctrl+C

# 重新启动
npm start
```

**方法 2：调用清除缓存 API**（未来支持）
```bash
DELETE /api/security/cache
```

**方法 3：强制重新扫描**
```json
{
  "path": "/path/to/project",
  "skipCache": true
}
```

### Q7: 可以扫描特定编程语言吗？

**当前版本：** Claude Code CLI 的 SAST skill 支持多种语言：
- JavaScript / TypeScript
- Python
- Java / Kotlin
- C / C++
- Go
- Rust
- Ruby
- PHP
- 等主流语言

**自动识别：** 扫描器会自动识别文件类型并应用对应的安全规则。

### Q8: 误报怎么处理？

**分析误报：**
1. 查看问题详情中的代码上下文
2. 确认是否确实存在安全风险
3. 考虑代码的实际使用场景

**标记误报**（未来支持）：
- 在 UI 中标记问题为 "False Positive"
- 添加注释说明原因
- 该问题在后续扫描中将被忽略

**当前处理方法：**
- 手动记录误报问题
- 在代码中添加注释说明
- 向开发团队反馈改进检测规则

---

## 故障排除

### 问题 1: "Permission denied" 错误

**症状：**
```
Error: Permission denied: /path/to/file
```

**原因：** 当前用户没有读取扫描路径的权限。

**解决方法：**
```bash
# Linux/macOS
sudo chown -R $USER:$USER /path/to/project

# Windows（以管理员身份运行）
icacls /path/to/project /grant Users:F /T
```

或者以管理员权限运行插件管理器。

### 问题 2: "Operation timed out" 错误

**症状：**
```
Operation timed out after 120 seconds
```

**原因：** 扫描超时（默认 2 分钟）。

**解决方法：**

1. **缩小扫描范围：**
   ```json
   {
     "path": "/path/to/specific-directory",
     "exclude": ["node_modules", "dist"]
   }
   ```

2. **增加超时时间**（需修改配置）：
   ```javascript
   // lib/security/services/ClaudeIntegration.js
   const DEFAULT_CONFIG = {
     timeout: 300000, // 5 minutes instead of 2
     maxBuffer: 10 * 1024 * 1024
   };
   ```

3. **分批扫描：**
   - 先扫描核心业务代码目录
   - 再扫描其他辅助模块
   - 最后扫描配置和脚本文件

### 问题 3: "Output buffer exceeded" 错误

**症状：**
```
Scan output is too large (exceeded 10MB limit)
```

**原因：** 扫描结果超过缓冲区限制。

**解决方法：**

1. **增加缓冲区大小：**
   ```javascript
   // lib/security/services/ClaudeIntegration.js
   const DEFAULT_CONFIG = {
     timeout: 120000,
     maxBuffer: 50 * 1024 * 1024 // 50MB instead of 10MB
   };
   ```

2. **缩小扫描范围或使用 exclude 规则**

3. **分批处理大型项目**

### 问题 4: 扫描结果显示异常

**症状：**
- UI 显示空白
- 问题列表无法加载
- 统计数据不正确

**排查步骤：**

1. **检查浏览器控制台：**
   ```
   F12 → Console → 查看错误信息
   ```

2. **检查 API 响应：**
   ```bash
   curl http://localhost:3456/api/security/scan/:id
   ```

3. **检查服务器日志：**
   ```bash
   npm start
   # 查看终端输出的错误日志
   ```

4. **验证数据格式：**
   - 确认 ScanResult 模型字段完整
   - 检查 issues 数组是否为有效 JSON

### 问题 5: 网络连接失败

**症状：**
```
Network error: Unable to connect to Claude services
```

**原因：** 无法连接到 Anthropic 服务。

**解决方法：**

1. **检查网络连接：**
   ```bash
   ping claude.ai
   ```

2. **检查防火墙设置：**
   - 允许 Claude CLI 访问外部网络
   - 检查公司代理配置

3. **配置代理（如需要）：**
   ```bash
   # 设置 HTTP 代理
   export HTTP_PROXY=http://proxy.example.com:8080
   export HTTPS_PROXY=http://proxy.example.com:8080
   ```

4. **验证 Claude CLI 独立运行：**
   ```bash
   claude skill run security-scanning:sast --path /path/to/test
   ```

### 问题 6: 历史记录丢失

**症状：** 重启服务器后历史记录消失。

**原因：** 历史记录存储在文件系统（`.claude/security-audit/history.json`）。

**解决方法：**

1. **检查存储文件：**
   ```bash
   cat .claude/security-audit/history.json
   ```

2. **确认文件权限：**
   ```bash
   ls -la .claude/security-audit/
   ```

3. **手动恢复备份：**
   ```bash
   cp .claude/security-audit/history.json.backup .claude/security-audit/history.json
   ```

4. **未来版本：** 将使用数据库存储以提高可靠性

---

## 高级配置

### 自定义缓存配置

在 `lib/security/services/ClaudeIntegration.js` 中配置缓存：

```javascript
const claudeIntegration = new ClaudeIntegration({
  cacheTTL: 2 * 60 * 60 * 1000, // 2 hours instead of 1 hour
  cacheMaxSize: 200 // 200 entries instead of 100
});
```

### 自定义超时和缓冲区

```javascript
const claudeIntegration = new ClaudeIntegration({
  timeout: 300000, // 5 minutes
  maxBuffer: 50 * 1024 * 1024 // 50MB
});
```

### 环境变量配置

创建 `.env` 文件：

```bash
# Claude CLI path (if not in system PATH)
CLAUDE_CLI_PATH=/custom/path/to/claude

# Timeout settings
SCAN_TIMEOUT=300000
MAX_BUFFER=52428800

# Cache settings
CACHE_TTL=7200000
CACHE_MAX_SIZE=200

# History settings
HISTORY_MAX_ENTRIES=20
HISTORY_PATH=.claude/security-audit/history.json
```

### 集成到 CI/CD

**GitHub Actions 示例：**

```yaml
name: Security Scan

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  security-scan:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm install

      - name: Start plugin manager
        run: npm start &
        env:
          PORT: 3456

      - name: Wait for server
        run: sleep 5

      - name: Run security scan
        run: |
          curl -X POST http://localhost:3456/api/security/scan \
            -H "Content-Type: application/json" \
            -d '{"path": "${{ github.workspace }}", "scope": "full"}'

      - name: Check scan result
        run: |
          # Get scan ID from previous step
          SCAN_ID=$(curl http://localhost:3456/api/security/scans | jq -r '.active[0].id')

          # Wait for completion
          while true; do
            STATUS=$(curl http://localhost:3456/api/security/scan/$SCAN_ID | jq -r '.status')
            if [ "$STATUS" == "completed" ]; then
              break
            fi
            sleep 10
          done

          # Check for critical issues
          CRITICAL=$(curl http://localhost:3456/api/security/scan/$SCAN_ID | jq '.result.summary.critical')
          if [ "$CRITICAL" -gt 0 ]; then
            echo "Found $CRITICAL critical security issues"
            exit 1
          fi
```

### 自定义扫描规则（未来支持）

创建 `.claude/security-audit/rules.json`：

```json
{
  "rules": {
    "sql-injection": {
      "enabled": true,
      "severity": "critical"
    },
    "xss": {
      "enabled": true,
      "severity": "high"
    },
    "hardcoded-secrets": {
      "enabled": true,
      "severity": "critical"
    },
    "insecure-randomness": {
      "enabled": false
    }
  },
  "exclude": {
    "files": ["*.test.js", "**/__tests__/**"],
    "directories": ["node_modules", "dist", "build"]
  }
}
```

---

## 相关资源

- **Claude Code 官方文档**: [https://docs.anthropic.com/claude/docs/claude-code](https://docs.anthropic.com/claude/docs/claude-code)
- **插件管理器 GitHub**: [https://github.com/your-org/claude-plugin-manager](https://github.com/your-org/claude-plugin-manager)
- **问题反馈**: [GitHub Issues](https://github.com/your-org/claude-plugin-manager/issues)
- **安全最佳实践**: [OWASP Top 10](https://owasp.org/www-project-top-ten/)

---

## 更新日志

- **2026-01-08**: 初始版本，包含基础扫描和缓存功能
- **未来版本**:
  - 支持更多扫描模式（quick / deep）
  - PDF 报告导出
  - 自定义扫描规则
  - 误报标记和管理
  - 数据库持久化
  - WebSocket 实时进度推送

---

**文档版本**: 1.0
**最后更新**: 2026-01-08
**维护者**: Claude Code 插件管理器团队
