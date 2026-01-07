# 🎯 插件优化建议 - 基于你的使用场景

根据你的开发需求（Python/JS/TS/Go/Rust, Web全栈, DevOps, 数据/AI, 移动开发），以下是推荐的插件配置。

## ✅ 强烈推荐启用（核心功能）

### 开发语言支持
- ✅ `python-development@claude-code-workflows` - Python 全套工具
- ✅ `javascript-typescript@claude-code-workflows` - JS/TS 开发
- ✅ `systems-programming@claude-code-workflows` - Go/Rust/C++ 支持

### LSP 语言服务器（按需）
- ✅ `pyright-lsp@claude-plugins-official` - Python 智能提示（必备）
- ✅ `typescript-lsp@claude-plugins-official` - TS/JS 智能提示（必备）
- ✅ `gopls-lsp@claude-plugins-official` - Go 智能提示（如果用 Go）
- ✅ `rust-analyzer-lsp@claude-plugins-official` - Rust 智能提示（如果用 Rust）

### 前后端开发
- ✅ `frontend-mobile-development@claude-code-workflows` - 前端+移动开发
- ✅ `backend-development@claude-code-workflows` - 后端架构
- ✅ `api-scaffolding@claude-code-workflows` - API 脚手架

### DevOps & 云
- ✅ `cloud-infrastructure@claude-code-workflows` - 云基础设施
- ✅ `kubernetes-operations@claude-code-workflows` - K8s 运维
- ✅ `cicd-automation@claude-code-workflows` - CI/CD
- ✅ `deployment-strategies@claude-code-workflows` - 部署策略

### 数据 & AI
- ✅ `data-engineering@claude-code-workflows` - 数据工程
- ✅ `machine-learning-ops@claude-code-workflows` - MLOps
- ✅ `llm-application-dev@claude-code-workflows` - LLM 应用开发

### 代码质量
- ✅ `code-review-ai@claude-code-workflows` - AI 代码审查
- ✅ `comprehensive-review@claude-code-workflows` - 全面审查
- ✅ `security-scanning@claude-code-workflows` - 安全扫描
- ✅ `tdd-workflows@claude-code-workflows` - TDD 工作流

### 数据库
- ✅ `database-design@claude-code-workflows` - 数据库设计
- ✅ `database-migrations@claude-code-workflows` - 数据库迁移
- ✅ `database-cloud-optimization@claude-code-workflows` - 数据库优化

### 集成工具
- ✅ `github@claude-plugins-official` - GitHub 集成
- ✅ `slack@claude-plugins-official` - Slack 通知

## ⚠️ 可选启用（根据实际需求）

### 移动开发（如果需要）
- ⚠️ `multi-platform-apps@claude-code-workflows`
- ⚠️ `playwright@claude-plugins-official` - 测试自动化

### 其他集成（按需）
- ⚠️ `gitlab@claude-plugins-official` - 如果用 GitLab
- ⚠️ `linear@claude-plugins-official` - 如果用 Linear
- ⚠️ `asana@claude-plugins-official` - 如果用 Asana
- ⚠️ `firebase@claude-plugins-official` - 如果用 Firebase
- ⚠️ `supabase@claude-plugins-official` - 如果用 Supabase
- ⚠️ `stripe@claude-plugins-official` - 如果做支付

### 专业领域（按需）
- ⚠️ `blockchain-web3@claude-code-workflows` - 区块链开发
- ⚠️ `game-development@claude-code-workflows` - 游戏开发
- ⚠️ `seo-content-creation@claude-code-workflows` - SEO 优化

## ❌ 建议禁用（不常用）

### LSP 服务器（不用的语言）
- ❌ `swift-lsp@claude-plugins-official` - 如果不做 iOS 开发
- ❌ `lua-lsp@claude-plugins-official` - 如果不用 Lua
- ❌ `php-lsp@claude-plugins-official` - 如果不用 PHP
- ❌ `clangd-lsp@claude-plugins-official` - 如果不用 C/C++
- ❌ `jdtls-lsp@claude-plugins-official` - 如果不用 Java
- ❌ `csharp-lsp@claude-plugins-official` - 如果不用 C#

### 不常用语言支持
- ❌ `jvm-languages@claude-code-workflows` - 如果不用 Java/Scala
- ❌ `web-scripting@claude-code-workflows` - 如果不用 PHP/Ruby
- ❌ `functional-programming@claude-code-workflows` - 如果不用 Elixir/Haskell
- ❌ `arm-cortex-microcontrollers@claude-code-workflows` - 嵌入式开发

### 专业领域（不需要的）
- ❌ `payment-processing@claude-code-workflows` - 如果不做支付
- ❌ `accessibility-compliance@claude-code-workflows` - 如果不关注无障碍
- ❌ `seo-analysis-monitoring@claude-code-workflows` - 如果不做 SEO
- ❌ `customer-sales-automation@claude-code-workflows` - 如果不做销售

### 实验性插件
- ❌ `ralph-loop@claude-plugins-official` - 高级自动化（实验性）
- ❌ `learning-output-style@claude-plugins-official` - 学习模式（可选）
- ❌ `explanatory-output-style@claude-plugins-official` - 解释模式（可选）

## 🔄 推荐操作步骤

### 1. 立即禁用不需要的 LSP
打开插件管理器，禁用不使用的语言 LSP：

```bash
# 在浏览器中打开
http://localhost:3456

# 找到 "claude-plugins-official" 分类
# 禁用不需要的 LSP（如 swift-lsp, lua-lsp, php-lsp 等）
```

### 2. 保留核心工作流插件
保持以下分类的插件启用：
- `python-development`
- `javascript-typescript`
- `systems-programming`
- `frontend-mobile-development`
- `backend-development`
- `cloud-infrastructure`
- `data-engineering`
- `machine-learning-ops`

### 3. 按需启用集成
只启用你实际使用的第三方集成：
- GitHub ✅（大多数人需要）
- GitLab ⚠️（如果用）
- Slack ⚠️（如果用）
- Linear/Asana ⚠️（如果用项目管理工具）

## 📊 优化后的预期效果

### 禁用前（95个插件全开）
- ⚠️ 启动速度：较慢
- ⚠️ 内存占用：较高
- ⚠️ 响应速度：可能卡顿

### 优化后（约60-70个插件）
- ✅ 启动速度：提升 30-40%
- ✅ 内存占用：降低 20-30%
- ✅ 响应速度：更流畅
- ✅ 相关功能：完全保留

## 💡 进阶优化建议

### 1. 按项目启用插件
对于不同项目，可以使用不同的插件配置：

```bash
# 在项目目录中
claude plugin disable <插件名> --scope project
```

### 2. 定期审查
每月检查一次插件使用情况，禁用长期不用的插件。

### 3. 性能监控
如果感觉 Claude Code 变慢：
1. 打开插件管理器
2. 查看启用插件数量
3. 禁用最近未使用的插件

### 4. 保持更新
定期点击"更新全部"保持插件最新：
- 新功能
- 性能改进
- Bug 修复

## 🎯 快速配置模板

### Web 全栈开发者
```
启用: python-development, javascript-typescript, frontend-mobile-development,
      backend-development, database-design, code-review-ai, github
LSP: pyright-lsp, typescript-lsp
禁用: 所有不用的语言 LSP，游戏开发，区块链，SEO 工具
```

### DevOps 工程师
```
启用: cloud-infrastructure, kubernetes-operations, cicd-automation,
      deployment-strategies, observability-monitoring, security-scanning
LSP: pyright-lsp (用于脚本), gopls-lsp (如果用 Go)
禁用: 前端工具，移动开发，游戏开发，SEO 工具
```

### 数据/AI 工程师
```
启用: python-development, data-engineering, machine-learning-ops,
      llm-application-dev, database-design
LSP: pyright-lsp
禁用: 移动开发，游戏开发，区块链，所有非 Python LSP
```

### 全能型（你的情况）
```
启用: 所有核心开发工具 + DevOps + 数据/AI
LSP: pyright-lsp, typescript-lsp, gopls-lsp, rust-analyzer-lsp
禁用: 不用的语言 LSP（Swift, Lua, PHP 等），
      专业领域（游戏、区块链、SEO，除非需要）
```

## 🔧 使用插件管理器快速优化

1. **访问管理器**
   ```
   http://localhost:3456
   ```

2. **搜索并禁用**
   - 搜索 "lsp"
   - 禁用不需要的语言服务器

3. **按分类优化**
   - 点击每个 marketplace 的"禁用全部"
   - 然后只启用需要的插件

4. **保存配置**
   - 点击右上角"保存配置"按钮
   - 重启 Claude Code 生效

---

💡 **提示**: 先按照建议禁用不需要的插件，使用一周后根据实际情况微调！
