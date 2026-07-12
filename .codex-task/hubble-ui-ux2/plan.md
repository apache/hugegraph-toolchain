# Hubble UI/UX2 Implementation Plan

> **Execution note:** 任务状态只在 `todo.md` 维护；本文只定义稳定约束、行为契约、执行顺序与完成门禁。

**Goal:** 收口 Hubble 已知 UI/UX 遗留问题，并在不丢失能力和双模式正确性的前提下完成一批有证据、可回退的桌面交互优化。

**Architecture:** 以当前分支和 HEAD 为唯一启动事实；旧 integration 代码只作为候选线索。每次开始或续跑必须重新确认 HEAD、工作树、进程和环境。先恢复能力合同，再按示例数据、Loader、查询图与开发反馈的依赖顺序推进；不启动新一轮全站重构或基础设施迁移。

**Tech Stack:** React 18、React Router 6、Ant Design 4、i18next、G6/Graphin、Spring Boot、Java 11、mvnd。

## Global Constraints

- 用户优先级：图分析人员 = 新开发者 > 运维管理员；效率和功能正确性优先。
- 保留 non-PD/RocksDB 与 PD/HStore 双模式；只验证受影响且适用的模式，不重复无关全站矩阵。
- 主桌面尺寸：1920×1080、2560×1440；1440×900 辅助。
- 保留 Apache HugeGraph 名称、Logo 和必要归属。
- Text2GQL 保持同级前端占位 Tab；本任务不实现后端。
- 当前 checkout 即用户指定的实施分支；保留所有既存 dirty/untracked 内容，仅修改本任务明确涉及的文件。
- 不继承旧端口、进程、包 SHA、测试数量、登录状态或 CI 状态；每次启动重新 preflight。
- Java 11 构建默认显式设置 `JAVA_HOME` 后使用 `mvnd` 复用 Maven daemon；仅在当前 `mvnd` 与 Java 11 不兼容或不可用时记录命令和错误后回退 `mvn`。
- 不升级路由、状态管理、UI 或图引擎，除非真实数据证明本任务必须且有明确回退路径。
- 新发现默认进入 P2 问题池；仅核心功能阻断、能力丢失、数据安全或正确性问题可打断当前批次。
- 最终 diff 必须由未参与实现的独立 reviewer 只读审查；P0/P1 修复或由用户明确接受，P2 可后移。

## Long-running and Resume Contract

- `todo.md` 是唯一任务状态源；每次续跑先读取四文件，再核对当前 branch、HEAD、dirty state、相关进程和最近验证，不把旧报告当作当前证据。
- 在每个阶段边界更新 `progress.md`：完成项、剩余项、可复现命令/浏览器证据、review 状态、dirty state、运行环境和唯一下一动作必须齐全。
- 单项因真实环境、依赖或外部服务阻塞时，记录已尝试恢复、等价证据路径和解除条件，将其后移并继续独立可执行任务；不得因一个门禁阻塞而停止整轮。
- 只保留当前验证所需的一个前端进程和必要服务；阶段结束清理本轮遗留进程，不清理启动前已存在且归属不明的进程。
- lessons 候选只能来自本轮可复现事实；未复现的推测标为 candidate，不得提升为长期规则。只有经至少一次修复后验证或跨阶段重复验证的 candidate 才写入 `lessons.md` 正文。
- 任何旧候选 SHA、包、截图、测试计数、服务健康或双模式结论都必须在当前 HEAD 重验后才可用于完成门禁。

---

## Behavior Contracts

### Dashboard

- `dashboard.address` 已配置且健康：入口可点击并打开对应页面。
- 未配置：入口禁用并显示“未配置”，不显示 Coming Soon。
- 已配置但探测失败：保留能力语义，显示不可用和重试/诊断信息。
- 只有真正未实现的 Cluster、Monitoring、Node、Alert 能力显示 Coming Soon。

### Language

- 无合法偏好时默认 `en-US`；仅接受 `en-US`、`zh-CN`，非法值回退英文。
- 登录页切换语言时，i18next 与 Ant Design locale 同步更新。
- 登录成功、深链、刷新和再次登录延续同一选择。

### Query and graph

- 英文导航和首页统一使用 `Query & Analysis`。
- 保留 Cmd/Ctrl+Enter、IME/空查询/pending 防护和画布全屏快捷键边界。
- 默认图渲染上限为 300 nodes / 300 edges；任一数量超过上限时默认折叠图画布，不直接渲染不可读的完整关系图。
- 超限状态必须显示节点/边数量、折叠原因和可用的 Table/JSON 等替代查看入口；不得静默截断或伪装成完整结果。
- 上限内验收覆盖首屏、布局稳定、fit/zoom、标签可读性和有界性能；不以固定坐标或截图替代真实布局。
- edge 默认文本使用可读的 edge label；完整 edge ID 保留在详情或按需展示中，不丢失定位能力。

### Sample graph and Loader

- 示例入口优先复用 Loader 随发布包提供的 `assembly/static/example/file` 数据集；若采用其他数据源，必须记录来源、版本和选择理由。
- 导入前明确目标 graph/graphspace、将创建或复用的 schema 和写入边界；默认不得清空、覆盖或删除用户既有数据。
- 重复执行必须得到可理解的幂等结果；部分失败必须保留诊断并提供安全重试或人工清理说明。
- Loader 表单默认模板、字段说明、示例值、约束和后端/Loader 数据契约一致；`graph_id`、命名长度、首字符等限制必须逐项给出前端、后端或 Server 依据。
- 所有官方文档链接使用 HugeGraph 官方稳定入口，并能从相关表单就近访问。

### Development feedback

- 前端先基线测量现有 `react-scripts start` 首启与增量更新时间，再做最小改进；不得同时替换打包器、包管理器或路由等核心设施。
- 后端提供基于当前 Maven/Spring Boot 能力的可复现增量启动命令，记录首次启动、一次 Java/资源变更反馈和失败恢复；不得影响正式 package。

### Feedback intake

- 新问题必须记录页面/路由、截图或可复现状态、实际行为、预期行为、严重度和验收证据。
- 同一问题只保留一个权威条目；无证据的审美偏好不直接升级为实现任务。

## Execution Order

按以下依赖顺序执行，具体任务和状态只在 `todo.md` 维护：

1. Fresh preflight：重新确认代码、环境、双模式、Chrome 和 reviewer，并以当前事实覆盖 `progress.md`。
2. Contract recovery：先关闭 Dashboard、语言和英文 IA 合同，避免在错误能力基线上继续 polish。
3. Onboarding：实现示例图低步骤入口，并校正 Loader 信息架构、模板、字段契约、错误和官方链接。
4. Graph boundary：落实 edge label，验证 300/300 内渲染和超限折叠，再处理一批证据化交互问题。
5. Development feedback：实测并收口前后端增量反馈方案。
6. Closure：完成分层门禁、Java 11 + `mvnd` exact package、真实 Chrome、双模式、独立复审和环境清理。

## Completion Gates

- `todo.md` 无未解决 P0/P1；P2 已完成或明确后移。
- Dashboard、语言和 Query & Analysis 合同有自动化与真实浏览器证据。
- 当前最终 HEAD、exact package SHA 和 Chrome 证据一致。
- 300/300 边界内渲染和超限默认折叠均有当前实现的真实证据。
- 双模式无受影响能力静默缺失或数据正确性回归。
- 独立 reviewer 的 actionable findings 已修复或由用户明确接受。
