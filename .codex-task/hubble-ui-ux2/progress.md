# Hubble UI/UX2 Progress

## Handoff context

- 上一轮候选产物：`/Users/imbajin/.codex/worktrees/hubble-ui-ux-refactor/integration`。
- 候选 branch：`cx-hubble-ui-ux-integration`；候选 HEAD：`46aa85d6`。
- 上一轮已完成首轮工作台框架和已确认修复；剩余交互细节转入本任务。
- 以上仅为交接线索，尚未经过本任务 fresh preflight，不代表当前状态。

## Current checkpoint

- 状态：fresh preflight 进行中；已完成 Git、工具链、依赖、进程、旧任务契约与主要代码入口核对。
- 当前分支/HEAD：`cx-hubble-ui-ux2-pr` / `10beb8678299ade21ef51d129a70cb0dabeaf4d7`，远端跟踪 `hugegraph/cx-hubble-ui-ux2-pr`。
- dirty state：tracked 产品文件干净；启动前已有 `ORIGINAL_REQUEST.md`、Hubble QA/REVIEW、`hubble2_qa.js`、`qa_report.json`、`qa_screenshots/`、`review-gemini.md` 等 untracked 内容，本任务保留且不纳入修改。
- 工具链：默认 Java 21.0.2；已发现 Temurin Java 11.0.29。`mvnd` 1.0.2（内置 Maven 3.9.9）、`mvn` 3.9.11、Node 25.6.0、npm 11.8.0、Yarn 1.22.22；FE `node_modules` 已存在。
- 运行环境：启动时无 Hubble FE/BE/Server 业务进程；Docker/OrbStack daemon 未运行，因此容器双模式环境当前不可用，需尝试恢复或使用既有真实环境路径。
- 当前代码事实：Loader 发布包内置 `hugegraph-loader/assembly/static/example/file` 数据集；Hubble FE 使用 `react-scripts start`；Hubble BE 目标 Java 11；代码中同时存在 `pd.enabled` 条件分支和 non-PD 回退。
- 文档校正：`plan.md` 已补齐长期执行、续跑、阻塞后移、环境清理和 candidate-only 学习契约；`todo.md` 从 6 项扩展为 11 项，新增示例图、Loader IA/字段合同、edge label 和热更新任务。
- review：最终只读 reviewer 尚未创建，按约束仅在最终 diff 与证据稳定后创建。
- 下一动作：完成 Chrome/真实服务与现有自动化门禁探测，关闭 `UX2-BASE-01`，随后从 Dashboard/语言合同开始实施。

## 2026-07-12 implementation checkpoint

- 完成：`UX2-BASE-01`。Chrome extension 可用；真实 FE dev server 在 `127.0.0.1:3100` 验证后已清理；Docker/OrbStack daemon 不可用已作为真实双模式验收的环境阻塞后移。
- 实现：edge 默认展示 `label`，完整 `id` 继续保留在模型/详情；缺失 label 回退 ID。300 nodes / 300 edges 为包含边界，301 任一维度时默认激活 Table，Graph tab 只显示数量、原因与 Table/Json 替代说明，不挂载画布。
- 实现：Loader 任务名 FE 上限由无依据的 20 对齐 BE `COMMON_NAME_PATTERN` 与 H2 `VARCHAR(100)` 的 48；目标图旁补充不清图/重复行为说明及当前 HugeGraph Loader 官方文档链接。
- 开发反馈：现有 FE `start` 首编译约 10–15s、增量约 5s、52 条第三方 source-map warning；新增 `yarn dev` 只设置 `GENERATE_SOURCEMAP=false`。Java 11 + mvnd affected compile 成功，总计 11.401s；README 记录增量启动、重启与发布构建边界。
- 自动化：FE 92 suites / 364 tests 全通过；eslint 0 warning；i18n 1749/1749、静态键 1226；production build 成功（既有 source-map/bundle-size warnings）。Java 11 `mvnd -pl hubble-be -am -DskipTests compile -ntp` 成功且 checkstyle 0。
- Chrome：登录页语言从 English 切到中文后刷新仍为中文，再切回 English；1920×1080 与 2560×1440 截图位于 `evidence/login-*.png`。
- dirty state：16 个本任务 tracked 文件修改；启动前 7 组 untracked QA/评审内容仍原样保留；本轮无业务进程遗留。
- review：未到最终 diff，独立 reviewer 尚未创建。
- 剩余关键路径：示例图真实导入、Loader 全字段/失败路径、Dashboard/登录后语言、真实 edge/300 边界、BE 热更新、双模式 Chrome 与最终 reviewer。
- 下一动作：实现并测试示例图后端幂等导入服务及 Hubble 入口；若真实 Server 环境仍不可用，后移运行验收并继续 Dashboard/Loader 独立工作。

## 2026-07-12 sample graph checkpoint

- 完成：`UX2-SAMPLE-01` 实现与 non-PD 真实服务验收。图菜单提供 Loader 自带 file example（8V/6E）与 HugeGraph Rank 文档 Neighbor Rank 英文电影示例（14V/15E），完整 MovieLens 仅作为算法数据文档链接，不把大数据下载纳入本轮。
- 数据合同：POST endpoint 显式返回 dataset/source/目标 graphspace+graph/预期计数/幂等与不清图标志；导入只补齐缺失 schema、顶点和边，不更新已有属性，不清空数据。两套 `person` Schema 不兼容，确认框建议空白/专用图，冲突时保留原数据并返回本地化恢复提示。
- 真实证据：HugeGraph Server 1.7.0、memory backend、non-PD。Loader 从先前失败残留的 8V/0E 恢复为 8V/6E，随后重复执行仍为 8V/6E；重启临时 memory Server 后 Rank 连续两次均为 14V/15E；再导入 Loader 得到 400 Schema/ID 冲突提示，前后计数均为 14V/15E。
- 失败修正：真实 Gremlin 暴露 `fold().coalesce(addE())` 会把 `ArrayList` 当边起点；改为按端点检查 `hasNext()` 后由 Vertex `addEdge()`，Java 11 mvnd compile/checkstyle 通过。此问题证明运行证据不可由 mock E2E 替代。
- 模式边界：controller 使用现有 `authGremlinClient(graphSpace, graph)`，non-PD Basic auth 与 PD graphspace 路由共用；本 checkpoint 未把 memory backend 冒充 RocksDB 或 HStore 证据，PD/HStore 运行验收继续保留在最终门禁。
- 自动化：SampleGraphController 单测覆盖非破坏性脚本、8V/6E 与 14V/15E 合同和 schema-before-data；FE API 合同、目标测试、eslint、i18n 1760/1760 已通过（最终变更后仍需 fresh full gate）。
- dirty state：本任务产品改动新增 sample controller/test、Graph 菜单/API/i18n；启动前 untracked QA/评审文件继续保留且未修改。临时 Hubble 与 HugeGraph Server 已停止。
- review：最终 diff 尚未稳定，独立只读 reviewer 继续后置。
- 下一动作：收口 Loader 全字段/BE 空值路径、Dashboard 条件能力与语言延续，再进行真实 Chrome 图结果和双模式验收。
