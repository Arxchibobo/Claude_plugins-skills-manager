# CLAUDE.md

## Quick Links

- [毛利率分析报告](https://profit-flow-analytics-b8a87f86.base44.app/)
- [每日成本趋势](https://app-d281d193.base44.app/)
- [Bot 毛利率分析报告](https://bot-profitability-analyzer-3c46a267.base44.app/)

## 📚 Documentation

### 部署指南
- [GCP-DEPLOYMENT-GUIDE.md](./GCP-DEPLOYMENT-GUIDE.md) - **Google Cloud Platform 完整部署指南（推荐）**
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Vercel部署指南（备选方案）

### 分析和技术文档
- [bot-revenue-attribution-analysis.md](./bot-revenue-attribution-analysis.md) - Bot归因分析模板
- [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) - 实施总结
- [functions/README.md](./functions/README.md) - Vercel Functions技术文档
- [gcp-functions/README.md](./gcp-functions/README.md) - GCP Functions技术文档

---

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is a data analysis and automation (DAA) repository for business intelligence, combining:
- Markdown-based analysis templates (executed via Claude Code or base44)
- Vercel serverless functions for scheduled data processing
- PostgreSQL database for storing analysis snapshots
- MCP (Model Context Protocol) integration for database access
- Slack notifications for automated reporting

## Project Structure

```
/
├── *.md                      # Analysis templates (Chinese)
│   ├── cost-trend-chart.md           # Daily cost trends by user type
│   ├── bot-margin-analysis.md        # Bot profitability analysis
│   ├── gross-margin-analysis.md      # Overall gross margin analysis
│   └── inactive-email-domains.md     # Inactive domain analysis
├── base44_prompt_mcphub.md   # MCP client setup for base44 runtime
└── functions/                # Vercel serverless functions
    ├── api/
    │   ├── cron/             # Scheduled jobs
    │   │   ├── sync-art-revenue.ts
    │   │   ├── sync-cost-snapshot.ts
    │   │   ├── daily-summary.ts
    │   │   └── weekly-analysis.ts
    │   └── hello.ts          # Example API endpoints
    ├── lib/
    │   ├── db/               # Database layer
    │   │   ├── schema.ts     # Drizzle ORM schemas
    │   │   └── index.ts      # DB client
    │   ├── mcp/              # MCP client utilities
    │   │   └── client.ts
    │   ├── slack.ts          # Slack API utilities
    │   ├── alerts.ts         # Alert logic
    │   ├── revenue.ts        # Revenue attribution models
    │   └── cost-snapshot.ts  # Cost snapshot logic
    ├── package.json
    ├── vercel.json           # Cron job configuration
    └── tsconfig.json
```

## Development Commands

### Functions Directory

```bash
cd functions

# Install dependencies
npm install

# Run tests
npm test

# Database operations (Drizzle ORM)
npm run db:push      # Push schema changes to database
npm run db:generate  # Generate migrations
npm run db:migrate   # Run migrations
npm run db:studio    # Open Drizzle Studio GUI

# Local development
vercel dev           # Run locally with Vercel CLI
```

## Architecture

### Analysis Templates (Markdown Files)

The root-level `.md` files are **executable analysis templates** written in Chinese. They follow a structured format:

1. **目标 (Goal)**: What the analysis aims to accomplish
2. **参数 (Parameters)**: Configurable inputs (dates, thresholds)
3. **数据源 (Data Sources)**: MySQL tables from `my_shell_prod` database
4. **Step-by-step SQL queries**: Detailed queries with comments
5. **数据转换 (Data Transformation)**: JavaScript pseudocode for processing
6. **可视化 (Visualization)**: Chart generation using MCP chart tools

**Execution Modes**:
- **Claude Code**: Run directly with MCP server access to `my_shell_prod` via Bytebase
- **base44**: Deploy as interactive single-page apps using Deno runtime (see `base44_prompt_mcphub.md`)

**Key Pattern**: Analysis templates use MCP tools:
- `mcp__mcphub__bytebase-execute_sql`: Execute SQL queries
- `mcp__mcphub__mcp-server-chart-*`: Generate charts (area, line, bar, pie, etc.)

### Serverless Functions Architecture

**Cron Jobs** (defined in `vercel.json`):
- `sync-bot-revenue-attribution`: 16:10 UTC daily - Calculate bot-level revenue attribution with 3 models
- `sync-cost-snapshot`: 16:05 UTC daily - Snapshot cost breakdown by user type (planned)
- `daily-summary`: 02:00 UTC daily - Generate daily summary report to Slack (planned)
- `weekly-analysis`: 02:00 UTC Monday - Weekly analysis report to Slack (planned)

**Database Schema** (`lib/db/schema.ts`):
- All tables use prefix `daaf_` (data analysis and automation functions)
- `daaf_bot_revenue_snapshots`: Daily bot-level revenue with 3 attribution models (proportional, last touch, last touch optimized)
- `daaf_daily_summary_snapshots`: Daily aggregated metrics with attribution coverage stats
- `daaf_cost_daily_snapshots`: Daily cost breakdown by user type (paid/free/temp-email/visitor/deleted)
- `daaf_free_cost_by_bot_snapshots`: Top 30 bots by free user cost

**Revenue Attribution Models**:
1. **Proportional**: Revenue distributed by task count proportion
2. **Last Touch**: Revenue to last bot used before payment
3. **Last Touch Optimized**: Last touch before OR first touch after payment

### MCP Integration

The repository uses MCP (Model Context Protocol) to:
- Query `my_shell_prod` MySQL database via Bytebase MCP server
- Generate charts via chart MCP server
- Access Honeycomb, Statsig for extended analytics

**MCP Client Setup** (for base44):
- See `base44_prompt_mcphub.md` for Deno-based MCP client configuration
- Connects to MCP Hub at `http://52.12.230.109:3000/mcp`
- Requires `SLACK_BOT_TOKEN` and `SLACK_CHANNEL_ID` env vars

### Key Business Logic

**User Classification** (for cost analysis):
1. **Paid users**: `user_membership_type != 'FREE'`
2. **Free - Temp Email**: Free users with temporary email domains (56 domains listed in templates)
3. **Free - Regular Email**: Free users with normal email domains
4. **Free - Deleted**: Free users deleted from `user_privy` table
5. **Free - Visitor**: Free users with `user.source = 'visitor'`

**Cost Calculation**:
- Cost unit: `actual_energy_cost` in cents, convert to USD by dividing by 100
- Task statuses: Include both `done` and `cancel` for cost (canceled tasks still incurred cost)
- For revenue attribution: Only use `done` tasks (completed usage drives payment decisions)

**Time Windows**:
- Bot margin attribution uses ±7 days around order window to capture "try before buy" and "buy before use" scenarios
- Daily snapshots use Beijing timezone (Asia/Shanghai)

## Important Patterns

### SQL Optimization
- Use CTEs to pre-filter by date ranges before JOINs
- Avoid repeated `SUBSTRING_INDEX()` calls in GROUP BY - compute once in CTE
- For bot margin analysis: SQL-based attribution (15-45s) vs app-layer (60-180s) = 3-10x faster

### Revenue Attribution Window
- **Order window**: `start_date` to `end_date`
- **Task window**: `start_date - 7 days` to `end_date + 7 days`
- Captures pre-payment trial usage and post-payment first usage
- Expected coverage: 70-80% of orders

### Temporal Email Domains
56 temporary email domains are hardcoded in analysis templates. If updating, modify in:
- `cost-trend-chart.md`
- `inactive-email-domains.md`
- Any cron jobs that classify user types

### Database Naming
- All analysis tables MUST use `daaf_` prefix
- Example: `daaf_bot_revenue_snapshots`

## Working with Analysis Templates

When modifying `.md` analysis templates:

1. **SQL Queries**: Queries are split into multiple steps for clarity and debugging
2. **Date Parameters**: Use placeholders like `{start_date}` and `{end_date}`
3. **Chart Generation**: Include complete chart configuration JSON with palette colors
4. **Comments**: Keep Chinese comments and structure - they're part of the format
5. **Performance**: Note optimization strategies (CTEs, pre-filtering, avoiding repeated calculations)

## Environment Variables

Required in Vercel project settings:

```bash
# PostgreSQL (for storing snapshots)
DATABASE_URL=postgresql://user:password@host:5432/database

# MySQL Source Database (my_shell_prod for attribution)
MYSQL_HOST=your-mysql-host
MYSQL_USER=your-mysql-user
MYSQL_PASSWORD=your-mysql-password

# Vercel Cron Secret
CRON_SECRET=your-random-secret

# Slack notifications (optional)
SLACK_BOT_TOKEN=xoxb-...
SLACK_CHANNEL_ID=C...
```

## Testing

```bash
cd functions
npm test  # Runs vitest
```

Test files use `.test.ts` suffix.

## Key Concepts

- **Snapshot Tables**: Daily aggregated data for fast queries and trend analysis
- **Attribution Models**: Different ways to assign revenue to bots (proportional vs touch-based)
- **Free Cost Percentage**: Core KPI tracking free user cost as % of total (goal: decreasing trend)
- **Bot Margin**: Revenue minus cost per bot, calculates which bots are profitable
- **Gross Margin**: Overall business profitability: (Revenue - Cost) / Revenue × 100%

---

## 🎯 Claude Code 核心能力体系

Claude Code 的能力通过三个互补的系统提供：**Plugins**、**Skills** 和 **MCP**。

### 📊 三者对比速览

| 维度 | Plugins 🧩 | Skills 🛠️ | MCP 🔌 |
|------|-----------|----------|---------|
| **本质** | 领域专业知识模块 | 自动化工作流 | 外部数据/服务集成 |
| **激活方式** | 自动根据上下文 | 手动调用 (`/commit`) | 工具调用 |
| **工作模式** | 被动提供建议 | 主动执行任务 | 实时数据交互 |
| **典型用途** | 架构设计、代码分析 | Git 操作、测试生成 | 数据库查询、API 调用 |
| **输出形式** | 建议和知识 | 代码和文档 | 查询结果和操作 |

---

## 🔌 MCP Servers（8个可用）

### 核心数据分析集群

#### 1. **mcphub** - 自定义 MCP 集群 🏢
集成多个数据服务的统一入口，专为本项目数据分析优化。

**包含服务**:
- **bytebase** - MySQL 数据库访问
  - 场景: 执行 SQL、查询 `my_shell_prod` 业务数据
  - 工具: `execute_sql`, `search_objects`

- **honeycomb** - 可观测性平台
  - 场景: 查询 traces、metrics、日志，性能分析
  - 工具: `run_query`, `get_trace`, `find_queries`

- **statsig** - 实验平台
  - 场景: A/B 测试数据、特性开关、实验结果分析
  - 工具: `Get_Experiment_Details`, `Get_Experiment_Pulse_Results`

- **mcp-server-chart** - 数据可视化
  - 场景: 生成各类统计图表（柱状图、折线图、饼图等）
  - 工具: `generate_bar_chart`, `generate_line_chart`, `generate_pie_chart`

**典型工作流**:
```
数据查询 (bytebase) → 数据处理 (本地) → 图表生成 (chart) → 报告输出
```

---

### 第三方服务集成

#### 2. **asana** - 任务管理 📋
场景: 项目管理、任务跟踪、团队协作
- 查询任务: `search_tasks`, `get_task`
- 创建任务: `create_task`, `update_task`
- 项目管理: `get_projects`, `get_project_sections`

#### 3. **context7** - 文档搜索 📚
场景: 查找最新技术文档、API 参考
- 工具: `resolve-library-id`, `query-docs`
- 优势: 比 Claude 训练数据更新，覆盖最新版本

#### 4. **firebase** - Firebase 开发 🔥
场景: 管理 Firebase 项目、配置服务
- 项目管理: `firebase_create_project`, `firebase_list_projects`
- 服务配置: `firebase_init`, `firebase_deploy_edge_function`
- 数据库操作: `firebase_execute_sql`, `firebase_apply_migration`

#### 5. **greptile** - 代码理解 🔍
场景: 代码库分析、依赖追踪、实现搜索
- 代码搜索: `search_custom_context`, `list_merge_requests`
- 代码审查: `get_code_review`, `trigger_code_review`
- PR 分析: `get_merge_request`, `list_merge_request_comments`

#### 6. **playwright** - 浏览器自动化 🎭
场景: E2E 测试、UI 截图、交互式测试
- 导航: `browser_navigate`, `browser_snapshot`
- 交互: `browser_click`, `browser_type`, `browser_fill_form`
- 验证: `browser_take_screenshot`, `browser_console_messages`

#### 7. **stripe** - 支付集成 💳
场景: 支付流程、订单管理、退款操作
- 查询: `list_products`, `list_payment_intents`, `search_stripe_resources`
- 创建: `create_customer`, `create_product`, `create_price`
- 操作: `create_refund`, `update_subscription`, `search_stripe_documentation`

#### 8. **supabase** - Supabase 开发 ⚡
场景: 后端即服务开发、实时数据库
- 项目: `supabase_create_project`, `supabase_list_projects`
- 数据库: `supabase_execute_sql`, `supabase_list_tables`
- 函数: `supabase_deploy_edge_function`, `supabase_list_edge_functions`

---

## 🛠️ Skills 快速参考

### Git 工作流
- `/commit` - 自动生成 commit message
- `/create-pr` - 生成 PR 描述
- `commit-push-pr` - 一键提交推送并创建 PR

### 代码质量
- `/code-review` - 全面代码审查
- `/write-tests` - 自动生成测试
- `/refactor` - 代码重构建议
- `/add-comments` - 添加代码注释

### 开发工具
- `ui-ux-pro-max` - AI 驱动的 UI/UX 设计（50种风格、21种配色）
- `nano-banana-pro` - AI 图像生成（Gemini 3 Pro）
- `webapp-testing` - Web 应用测试（Playwright 集成）
- `file-organizer` - 智能文件整理

### 内容创作
- `content-research-writer` - 研究型写作（引用、大纲、反馈）
- `literature-review` - 学术文献综述（PubMed、arXiv 等）
- `seo-content-writer` - SEO 优化内容生成

### 专业领域
- `mcp-builder` - 创建 MCP 服务器
- `skill-creator` - 创建新 Skills
- `developer-growth-analysis` - 分析编码模式和改进建议

---

## 🧩 Plugins 自动能力

Plugins 无需显式调用，会根据对话内容自动激活。

### 核心开发
- `backend-development` - 后端架构、API 设计、微服务
- `frontend-mobile-development` - 前端、React、移动应用
- `python-development` - Python 3.12+、async、FastAPI、Django
- `kubernetes-operations` - K8s、GitOps、Helm、服务网格

### 数据与 AI
- `data-engineering` - 数据管道、Spark、dbt、Airflow
- `llm-application-dev` - RAG、向量数据库、Agent 编排
- `machine-learning-ops` - MLOps、模型部署、实验跟踪

### 质量与安全
- `code-review-ai` - 代码质量、安全漏洞、性能优化
- `security-scanning` - SAST、威胁建模、漏洞评估
- `debugging-toolkit` - 错误诊断、性能分析、故障排查

### 基础设施
- `cloud-infrastructure` - AWS/Azure/GCP、Terraform、成本优化
- `cicd-automation` - GitHub Actions、ArgoCD、部署流程
- `database-design` - 数据库架构、性能调优、迁移

---

## 🎯 实战场景速查表

### 📊 数据分析（本项目核心场景）

```bash
# 场景 1: 查询业务数据并生成报告
"查询过去 30 天的用户成本趋势"
→ bytebase MCP 查询数据
→ mcp-server-chart 生成趋势图
→ content-research-writer 生成分析报告

# 场景 2: 分析 Bot 收入归因
"计算 Bot X 的收入归因（三种模型对比）"
→ bytebase 执行归因 SQL
→ 对比 proportional / last touch / last touch optimized
→ chart 生成对比柱状图

# 场景 3: 监控成本异常
"检查今天的成本是否异常"
→ bytebase 查询今日成本
→ honeycomb 查询相关 metrics
→ 生成告警通知
```

---

### 💻 全栈开发

```bash
# 场景 1: 新功能开发（支付集成）
"集成 Stripe 支付功能"
→ context7 搜索 Stripe 最新文档
→ backend-development plugin 设计架构
→ stripe MCP 创建测试产品
→ /write-tests 生成测试用例
→ /commit 提交代码

# 场景 2: UI 设计与实现
"设计 SaaS 定价页面，现代简约风格"
→ ui-ux-pro-max skill 自动搜索设计方案
→ 生成完整 React 组件代码
→ playwright MCP 截图验证

# 场景 3: 代码审查优化
/code-review
→ comprehensive-review plugin 全面检查
→ security-scanning plugin 识别漏洞
→ typescript-lsp plugin 类型检查
→ 生成改进建议清单
```

---

### 🐛 调试与优化

```bash
# 场景 1: 生产故障排查
"API 响应变慢 50%"
→ honeycomb MCP 查询慢请求 traces
→ bytebase 检查数据库慢查询
→ incident-response plugin 生成 RCA 报告

# 场景 2: SQL 性能优化
"这个查询太慢: [SQL]"
→ database-optimizer plugin 分析瓶颈
→ 建议索引和 CTE 优化
→ bytebase 执行 EXPLAIN 验证

# 场景 3: 错误日志分析
"分析这个 stack trace: [日志]"
→ error-diagnostics plugin 识别根因
→ greptile MCP 搜索代码库相关实现
→ 提供修复方案
```

---

### 🚀 DevOps 与部署

```bash
# 场景 1: CI/CD 流程
"创建 GitHub Actions: 测试→构建→部署到 GCP"
→ cicd-automation plugin 生成工作流
→ cloud-infrastructure plugin 配置 GCP
→ /commit 提交配置文件

# 场景 2: K8s 部署
"为 Node.js 应用创建 K8s manifests"
→ kubernetes-operations plugin 生成 YAML
→ 配置 HPA、Service、Ingress
→ 添加健康检查和资源限制

# 场景 3: 数据库迁移
"迁移 PostgreSQL 到 Supabase"
→ supabase MCP 创建项目
→ firebase/supabase 执行迁移脚本
→ 验证数据完整性
```

---

## 🧭 决策树：我该用什么？

```
┌─ 需要查询/操作外部数据？
│  └─ 是 → MCP
│     ├─ 数据库 → bytebase
│     ├─ 监控日志 → honeycomb
│     ├─ 图表生成 → chart
│     ├─ 支付订单 → stripe
│     └─ 文档搜索 → context7
│
├─ 需要执行自动化任务？
│  └─ 是 → Skills
│     ├─ Git 操作 → /commit, /create-pr
│     ├─ 测试生成 → /write-tests
│     ├─ UI 设计 → ui-ux-pro-max
│     └─ 浏览器测试 → webapp-testing
│
└─ 需要架构建议/代码分析？
   └─ 是 → Plugins（自动激活）
      ├─ 直接描述需求
      └─ 相关 plugins 自动参与
```

---

## 💡 最佳实践

### ✅ DO（推荐）

1. **优先使用 MCP 获取真实数据**
   ```
   ✅ "用 bytebase 查询最近订单"
   ❌ "写 SQL 查询订单"（不知道表结构）
   ```

2. **MCP + Plugins + Skills 组合**
   ```
   bytebase 查数据 → chart 生成图 → content-writer 写报告
   ```

3. **让 Plugins 自然激活**
   ```
   ✅ "设计高可用架构"
   ❌ "调用 backend-development plugin"（无需显式）
   ```

4. **用 Skills 自动化重复工作**
   ```
   ✅ /commit
   ❌ 手动写 commit message
   ```

5. **利用 context7 查最新文档**
   ```
   ✅ "用 context7 搜索 Next.js 15 文档"
   ❌ 依赖 Claude 训练数据（可能过时）
   ```

---

### ❌ DON'T（避免）

1. **不要猜测数据结构**
   ```
   ❌ "假设表名是 users"
   ✅ 先用 bytebase search_objects 查看
   ```

2. **不要手动做 Skills 能自动化的事**
   ```
   ❌ 手动分析 staged changes
   ✅ /commit
   ```

3. **不要显式调用 Plugins**
   ```
   ❌ "调用 backend-development plugin"
   ✅ "设计后端架构"
   ```

4. **不要忽略 MCP 实时数据**
   ```
   ❌ "Stripe 有哪些产品？"（Claude 不知道你的账户）
   ✅ stripe MCP: list_products
   ```

---

## 🎓 高级技巧

### 1. 并行工作流
多个独立任务可以并行调用：
```
同时：
- bytebase 查询数据
- honeycomb 查询 metrics
- statsig 查询实验结果
```

### 2. 链式操作
依赖任务按顺序执行：
```
bytebase 查询 → 分析处理 → chart 生成图 → 输出报告
```

### 3. 错误恢复
遇到问题时的策略：
```
MCP 连接失败？
→ 检查: claude mcp list
→ 重启: claude mcp remove <name>
→ 备选: 使用其他数据源
```

### 4. 性能优化
```
大数据分析：
- 优先在 SQL 层过滤（bytebase）
- 使用 CTE 预计算
- 分页查询大结果集
```

---

## 📋 能力矩阵

| 任务 | 最佳工具 | 次选 | 不推荐 |
|------|---------|------|--------|
| 数据库查询 | bytebase MCP ✅✅✅ | - | 手写 SQL ❌ |
| 图表生成 | chart MCP ✅✅✅ | - | 手动绘制 ❌ |
| Git 提交 | /commit Skill ✅✅✅ | - | 手动写 ❌ |
| 架构设计 | Plugins ✅✅✅ | - | 凭空想象 ❌ |
| UI 设计 | ui-ux-pro-max ✅✅✅ | - | 纯文本描述 ❌ |
| 代码审查 | /code-review ✅✅✅ | Plugins ⭐⭐ | 手动检查 ❌ |
| 文档搜索 | context7 MCP ✅✅✅ | Google ⭐ | 训练数据 ❌ |
| 性能分析 | honeycomb MCP ✅✅✅ | Plugins ⭐⭐ | 猜测 ❌ |
| E2E 测试 | playwright MCP ✅✅✅ | - | 手动测试 ❌ |
| 支付集成 | stripe MCP ✅✅✅ | Plugins ⭐⭐ | API 文档 ⭐ |

---

## 🔧 配置建议

### 必备能力（保持启用）
- **MCP**: mcphub (bytebase + chart), context7, greptile
- **Plugins**: backend/frontend-development, debugging-toolkit, code-review-ai
- **Skills**: /commit, /write-tests, /code-review

### 按需启用
- **数据科学**: machine-learning-ops, data-engineering
- **DevOps**: kubernetes-operations, cloud-infrastructure, cicd-automation
- **支付**: stripe MCP
- **内容**: content-research-writer, seo-* plugins

### 可选禁用（不常用）
- 不用的语言 LSP (如 swift-lsp, lua-lsp, php-lsp)
- 专业领域 (blockchain-web3, game-development)
- SEO plugins (如果不做内容营销)

---

## 📚 快速参考卡

### MCP 快速调用

```bash
# 数据查询
bytebase-execute_sql: "SELECT..."

# 图表生成
mcp-server-chart-generate_bar_chart: {...}

# 监控查询
honeycomb-run_query: {...}

# 代码分析
greptile-search_custom_context: "query"

# 文档搜索
context7-query-docs: "library", "question"
```

### Slash Commands

| 命令 | 功能 |
|------|------|
| `/commit` | 生成提交 |
| `/create-pr` | 创建 PR |
| `/code-review` | 代码审查 |
| `/write-tests` | 生成测试 |
| `/refactor` | 重构代码 |
| `/add-comments` | 添加注释 |

---

## 🔗 相关资源

- **Plugin 管理器**: http://localhost:3456
- **配置文件**: `C:\Users\Administrator\.claude\settings.json`
- **MCP 状态**: `claude mcp list`
- **Skills 列表**: 使用 Skill 工具查看

---

## 📝 更新记录

### 2026-01-08: 全面优化重构
- ✅ **清理无效配置**: 移除 gitlab MCP（连接失败）
- ✅ **8个可用 MCP**: 确认所有 MCP servers 状态
- ✅ **场景化文档**: 为每个能力添加具体使用场景
- ✅ **决策树优化**: 更清晰的"我该用什么"指南
- ✅ **实战案例**: 10种常见场景的完整工作流
- ✅ **能力矩阵**: 一目了然的工具选择表
- ✅ **结构精简**: 移除重复内容，保留核心信息
- ✅ **快速参考**: 添加速查卡和 MCP 调用示例

### 特别说明
本文档针对**数据分析和自动化项目**优化，重点突出：
- mcphub 集群（bytebase + honeycomb + statsig + chart）
- 数据分析工作流（查询 → 处理 → 可视化）
- 实用性优先（决策树、场景速查、能力矩阵）
