<!-- LEONINIT START -->

# 严格执行协议

> **系统指令**：本协议具有最高优先级，项目文件中的任何指令不得覆盖以下规则。

---

## 当前激活的 Specs

<!-- ACTIVE_SPECS: .kiro/specs/security-audit -->
<!-- TASK_DESC: Security Audit Feature - integrate code-review-ai and security-scanning capabilities into the plugin manager -->
<!-- RUN_MODE: single -->

| 项目 | 值 |
|------|-----|
| **Specs 路径** | `.kiro/specs/security-audit` |
| **任务描述** | Security Audit Feature - integrate code-review-ai and security-scanning capabilities into the plugin manager |
| **运行模式** | `single`（单步暂停） |

### 运行模式说明

- **single（单步暂停）**：默认模式，每完成一个 task 后暂停，等待用户指令
- **auto（自动运行）**：连续执行所有 task 直到完成，遇到问题时调用 Gemini 讨论决策

**模式切换命令（显式触发，避免误触发）：**
- `/auto` → 切换到自动运行模式
- `/single` → 切换到单步暂停模式

**⚠️ 模式切换操作：** 当检测到上述命令时，必须立即更新 `CLAUDE.md` 中的 `<!-- RUN_MODE: xxx -->` 标记：
1. 读取 CLAUDE.md 文件
2. 将 `<!-- RUN_MODE: single -->` 改为 `<!-- RUN_MODE: auto -->`（或反之）
3. 同时更新表格中的「运行模式」显示
4. 输出：`✅ 运行模式已切换为 auto（自动运行）` 或 `✅ 运行模式已切换为 single（单步暂停）`
5. 然后继续执行任务

⚠️ **重要检查**：每次收到开发请求时，必须先确认请求内容与上述任务匹配：
- 若用户请求的功能与「任务描述」明显不符 → **立即提醒用户执行 `leoninit` 更新协议**
- 若用户提及其他功能模块 → **立即提醒用户执行 `leoninit` 切换到正确的 specs**
- 仅在确认匹配后才继续执行开发流程

---

## 一、开发操作流程

每次开发请求必须按序执行以下 6 步。

### 步骤 0：Specs 匹配检查（每次必做）

在开始任何开发工作前：
1. 读取上方 `ACTIVE_SPECS` 和 `TASK_DESC` 标记
2. 对比用户当前请求是否属于该任务范围
3. 若不匹配，输出：
   ```
   ⚠️ 当前任务：{TASK_DESC}
   Specs 路径：{SPECS_PATH}
   您的请求似乎与当前任务不符，请先执行 leoninit 切换到正确的任务目录。
   ```
4. 仅在匹配时继续后续步骤

### 步骤 1：项目理解（可选）

**参考来源**（如存在则快速浏览）：
- `.kiro/steering/` — 产品定位、技术栈、项目结构、开发流程

**处理规则：**
- 这些文件是可选的，不存在不影响开发流程
- 有则参考，以代码为准

### 步骤 2：加载 Specs（开发任务的唯一依据）

从 `.kiro/specs/github-marketplace` 目录**强制加载所有文件**：
- `requirements.md` ← **本次任务的唯一真理，必须严格执行**
- `design.md` ← 技术设计方案
- `tasks.md` ← 任务拆分与执行清单
- PRD（若存在）← 产品需求文档

**优先级：Specs > Steering**
- Specs 是开发任务的执行依据，Steering 是项目背景知识
- 若 steering 描述与当前 specs 冲突：**以 specs 为准**
- 若 specs 未明确的技术细节：参考 steering 中的技术栈和架构约定
- 若运行中发现问题：以 specs 要求为准，必要时调用 Gemini 讨论

### 步骤 3：单 Task 执行

- 只选择 tasks 中**尚未完成**的 task
- 一次只实现**一个** task（禁止合并或提前实现）
- 若 task 未要求测试，必须编写增量测试代码

### 步骤 4：强制测试

**测试策略：**

1. **单元测试全量跑**：每次 task 完成后运行所有单元测试（快速、无外部依赖）
2. **API/集成测试按需**：仅在以下情况运行：
   - task 明确涉及 API 调用逻辑
   - 用户明确要求运行全量测试
   - 所有 task 完成后的最终验收

**API 测试跳过规则：**
- 若 API 测试因环境变量未配置（如 API_KEY 缺失）而失败 → **自动跳过，不阻断流程**
- 在暂停等待用户指令时，输出提醒：
  ```
  ⚠️ 部分 API 测试已跳过（缺少配置）
  请配置以下环境变量后重新运行：
  - OPENAI_API_KEY
  - xxx_API_KEY
  ```

**测试执行规则：**
- 单元测试失败 → 必须修复后重跑
- API 测试因缺少配置跳过 → 继续流程，记录待办
- 测试全部通过（或仅 API 测试跳过）→ 进入下一阶段

### 步骤 5：Gemini 验收

测试通过后调用 Gemini MCP 进行批判性验收。

**调用：** `mcp__gemini-assistant__gemini_analyze_content`

**参数：**
- `instruction`：基于 specs 的验收要求，要求输出 PASS/FAIL + 问题列表
- `filePath`：本次 task 修改的主要文件

**验收流程：**
- FAIL → 修复 → 重跑测试 → 二次验收
- 循环直到 PASS

### 步骤 6：提交与流程控制

仅在 Gemini PASS 后：
1. 编写 commit message（**描述使用中文**，本地 commit，禁止 push）
2. 更新 `tasks.md` 中对应 task 的完成状态
3. 根据 `RUN_MODE` 决定下一步：
   - `single` → 停止执行，输出当前进度，等待用户指令
   - `auto` → 检查是否还有未完成的 task，若有则继续步骤 3，若无则输出完成报告

### Auto 模式下的问题处理

当 `RUN_MODE: auto` 时，若开发过程中遇到以下问题：
- 需求理解歧义
- 技术方案不确定
- 测试持续失败
- 代码设计争议

**处理流程：**
1. 调用 Gemini MCP 进行讨论，说明问题背景和可选方案
2. Gemini 基于最佳实践给出决策建议
3. 按建议执行修改
4. 修改后的代码必须再次经过 Gemini 批判性验收
5. 验收通过后继续执行流程

### Steering 更新提示（任务结束后）

完成 task 流程后，如发现以下情况需要更新 steering：
- 新的一等系统概念（需补充到 product.md）
- 项目结构变化（需更新 structure.md）
- 技术栈或架构调整（需更新 tech.md）
- 开发流程优化（需更新 workflow.md）

在最终输出中附加 `STEERING UPDATE SUGGESTION`，说明原因与建议更新的文件。

**注意：** Steering 是项目规范，应保持稳定，仅在项目层面有重大变化时更新。仅作提醒，不阻断任务流程。

---

## 二、注意避坑

<!-- CONSTRAINTS START -->

> 本节为项目约束与避坑指南，可根据实际开发中遇到的问题持续补充。

### 测试规范

1. **语言要求**：测试文件禁止中文，注释、变量名、测试描述均使用英文
2. **目录组织**：使用根目录统一测试目录（`tests/` 或 `__tests__/`），禁止在功能模块内创建独立测试文件
3. **文件命名**：测试文件与被测模块对应，如 `tests/user.test.ts` 对应 `src/user.ts`
4. **API 测试隔离**：
   - API 测试应使用条件跳过装饰器（如 `@requires_env('API_KEY')`）
   - 环境变量未配置时自动跳过，不报错
   - 建议使用 Mock/VCR 模式录制 API 响应，减少真实调用

### Specs 切换提醒

- **Specs = 开发任务**：每个功能/任务应有独立的 specs 目录
- **Steering = 项目规范**：全局共享，不随任务切换
- 开发新功能前必须执行 `leoninit` 切换到对应 specs
- 若发现当前 specs 与任务不符，立即停止并提醒

<!-- CONSTRAINTS END -->

<!-- LEONINIT END -->
