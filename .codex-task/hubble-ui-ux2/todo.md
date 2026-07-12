# Hubble UI/UX2 TODO

> 唯一任务状态源。完成项保留证据链接；不记录执行流水账。

- 当前实施基线：branch `cx-hubble-ui-ux2-pr`，HEAD `10beb8678299ade21ef51d129a70cb0dabeaf4d7`；后续续跑仍须重新确认。
- 当前状态：1/14 顶层任务完成；多项已有实现、待当前 HEAD 的 Chrome/双模式或最终门禁验收。

## P0/P1

- [x] **UX2-BASE-01：完成 fresh preflight。** 证据见 `progress.md` 2026-07-12 checkpoint；当前真实服务容器因 Docker daemon 未运行而后移，不阻塞代码与 FE 工作。
- [ ] **UX2-CAP-01：恢复 Dashboard 条件能力。** configured+healthy 可用；unconfigured 明确未配置；configured+unhealthy 保留能力并给诊断；真正未实现项才 Coming Soon。
- [ ] **UX2-I18N-01：统一登录与应用语言。** 合法值仅 `en-US`/`zh-CN`，fresh/非法值默认英文；i18next 与 Ant Design locale 同步；登录、深链、刷新、重登录延续选择。
- [ ] **UX2-SAMPLE-01：提供低步骤示例图入口。** 已有 Loader file example（8V/6E）和旧 Rank tiny 示例的 non-PD 幂等证据；按用户最新选择改为内置 `hlm.zip`（schema + mapping + 50 条输入记录）与 `movie 2.zip`（两套 schema/mapping + 16,187 条输入记录），默认突出红楼梦小图，并保留 Loader example。必须补齐可分发来源/许可证依据、发布包资源、目标图、无清空/覆盖、重复执行、部分失败恢复与 PD/HStore 验证；GroupLens MovieLens Small 仅作为外部官方数据入口，不与内置电影包混同。
- [ ] **UX2-LOADER-01：重构 Loader 表单信息架构与默认模板。** 补齐字段分组、解释、示例值、合法约束、上下文错误和 HugeGraph 官方文档入口；覆盖新用户从数据源到映射再到执行的核心路径。
- [ ] **UX2-LOADER-02：校正 Loader 字段契约。** 任务名已按 BE `COMMON_NAME_PATTERN`/H2 列从 FE 20 对齐为 48，并保留数字/下划线首字符；仍需核实 `graph_id` 及其他字段、修复 BE 空值错误路径并做真实提交。
- [ ] **UX2-GRAPH-EDGE-01：默认展示可读 edge label。** 已实现默认 label、完整 ID 保留、缺失 label 回退并通过单测；待真实多 edge Chrome 验收。
- [ ] **UX2-GRAPH-01：落实图结果展示边界。** 已实现 300/300 判定、超限默认切换 Table 且 Graph 不挂载画布并显示完整数量/原因/替代入口；边界单测通过，待真实结果与布局性能验收。
- [ ] **UX2-GRAPH-STABILITY-01：重复查询保持画布稳定。** 相同拓扑刷新保留节点坐标且不重启布局；拓扑变化仍重新布局。已新增纯函数回归测试，待受影响测试与真实 Chrome 连续查询验收。
- [ ] **UX2-DEV-01：实测并改善前后端热更新。** FE `start` 已实测首编译约 10–15s、增量约 5s且有 52 条第三方 source-map 警告；新增 `yarn dev` 仅关闭开发 source map。Java 11 mvnd compile 11.401s，README 已给增量启动/恢复命令；待实测 BE 启动与资源/Java 变更并复验 package。
- [ ] **UX2-CI-01：修复 PR 当前 CI 阻断。** 修复 FE 解析/缩进、ASF header 与 i18n Chrome smoke 严格选择器；以当前远端 head 的实际 checks/log 为准，禁止只按截图猜测。

## P2

- [ ] **UX2-POLISH-01：完成一批证据化交互 polish。** 首项为英文 `Query & Analysis` 一致性；其余问题必须具备路由、截图/复现、实际/预期行为、严重度和验收证据。
- [ ] **UX2-DESKTOP-01：修复英文桌面长文本布局。** Data Source Management 侧栏项必须完整可发现；首页/支持入口的长英文文案不得在 1920×1080、2560×1440 溢出或截断，1440×900 辅助验证。

## Closure Gate

- [ ] **UX2-GATE-01：通过最终门禁。** 仅在实现批次稳定后执行全览检查；确认最终 HEAD 对应 exact package，并通过 affected/full FE、lint、i18n、build、Java 11 + `mvnd` 适用后端门禁、双模式 Chrome 和独立 reviewer，或由用户明确接受例外。

## Issue Pool

| ID | 页面/路由 | 问题 | 严重度 | 状态 | 证据 |
|---|---|---|---|---|---|
| UX2-P-001 | 全局导航与首页 | 英文统一为 `Query & Analysis` | P2 | 待处理 | 待本轮截图 |
| UX2-P-002 | Query & Analysis 图画布 | 同一查询再次执行后布局收缩 | P1 | 已实现待验收 | PR #19 issue comment 4951015124；自动化见 Graph/index.test.js |
| UX2-P-003 | 英文侧栏 | Data Source Management 被定宽省略且无完整提示 | P2 | 待处理 | PR #19 issue comment 4951015124 |
| UX2-P-004 | 英文首页/支持入口 | 长按钮文案存在固定宽度溢出风险 | P2 | 待处理 | PR #19 issue comment 4951015124 |
