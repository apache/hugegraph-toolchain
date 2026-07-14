<!--
Licensed to the Apache Software Foundation (ASF) under one or more
contributor license agreements. See the NOTICE file distributed with this
work for additional information regarding copyright ownership. The ASF
licenses this file to You under the Apache License, Version 2.0 (the
"License"); you may not use this file except in compliance with the License.
You may obtain a copy of the License at

  http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
License for the specific language governing permissions and limitations
under the License.
-->

# Hubble 监控、告警与鉴权设计上下文

## 1. 文档目的

本文最初由 Hubble 全路由 UI/UX goal 产出，现作为原生监控与鉴权基础版的实现合同和告警后续设计
输入。当前交付只实现 P0 基础监控，不把外部 Dashboard 当成监控事实源，也不提前实现告警执行器。

核心原则：

- Server、PD、Store 自身 API 是监控事实源。
- Hubble Backend 是面向浏览器的唯一聚合、鉴权、规范化和脱敏边界。
- Hubble Frontend 不直连 PD、Store 或 Server 内部监控端口。
- Dashboard/Grafana 是可选高级展示层，缺失时不能阻断 Hubble 原生基础监控。
- 监控读取、告警读取、规则修改、静默/确认和通知渠道管理必须分权，不能复用单一“管理员”判断。

```text
HugeGraph Server ─┐
PD ───────────────┼─→ Hubble BE ─→ Hubble FE
Store ────────────┘      │
                         ├─ 认证、授权、审计
                         ├─ 聚合、规范化、脱敏
                         └─ 超时、缓存、部分失败降级

Dashboard / Prometheus / Grafana ─→ 可选高级监控，不是基础功能前置条件
```

### 1.1 当前上下文快照

- 调查基线：toolchain `a0e30a43f130033d6bb8d5e89f23860044c02ea4`；Server 仓当前本地代码。
- 当前 `hubble-monitoring-alerting-auth` goal 实现基础监控与三角色 capability；完整告警、通知、历史
  时序和自定义 Dashboard 仍留待独立 goal 设计、实现和复审。

### 1.2 当前基础版冻结合同

- API：`/api/v1.3/operations/capabilities`、`overview`、`nodes`、`nodes/{node_id}`；Nodes 支持
  type/status/query、分页以及 name/type/status/observed_at 全局稳定排序。
- DTO：snake_case；来源分别携带 availability、observed_at、last_success_at、fresh、stale 和安全
  reason；Node Detail 的 system/drive/raft/backend 分别携带同等粒度的 `metric_statuses`。
- 身份：Server metrics 继续使用当前 Hubble 用户 token 的 `metrics_read`；PD 与 Store 使用互不复用的
  Backend 服务身份。浏览器不能覆盖目标地址，响应不包含原始 endpoint、路径、graph 名或凭据。
- 失败：短 TTL、按凭据摘要和 metrics scope 隔离、同 key 并发合并；失败指标组只回用本组最近成功值
  并标 stale，不回滚新 topology 或 Leader；non-PD 明确返回 PD/Store `UNSUPPORTED`。
- 本地最小 PD/Store/Server 实例曾分别监听 `8620/8520/8080`，只用于功能证据，不作为生产容量或
  稳定性结论。
- 实机只读结果：PD health/Actuator 为 200/UP；内部认证后 cluster 为 `Cluster_OK`，PD Leader 和
  Store 状态可见；Store health、system、drive、raft 均返回真实数据；Server metrics 未认证为 401。
- 已确认的产品决定：事实源必须是 Server/PD/Store 自有 API；Dashboard 是可选展示层；Hubble FE
  不直连内部服务；监控、告警和鉴权需独立体系加强。
- 当前未冻结：用户角色可见粒度、服务认证方案、告警执行器归属、历史曲线范围和最终 Hubble API。

## 2. 当前 Hubble 实现

### 2.1 已有能力

- `DashboardController` 提供 `GET /api/v1.3/dashboard`，读取 `dashboard.address`，以 1.5 秒超时
  探测根 URL，并返回 `configured/address/protocol/available`。
- 前端 `modules/navigation/ConsoleItem` 已处理 checking、unconfigured、unavailable、configured
  四态，规范化 Dashboard URL，并提供集群、监控、节点、报警外链。
- HugeGraph Client 已提供 `HugeClient.metrics()`，可读取 Server system、backend、all 和 statistics
  metrics。
- Hubble 已有 `PDController#get /api/v1.3/pds/status`，但当前调用 Server 侧
  `client.pdManager().status()`；代码已注明 Server 1.7 不具备该 `/pd status` 能力。后续不应继续依赖
  这条错误边界，而应直接由 Hubble BE 消费 PD 自身 API。

### 2.2 当前缺口

- 没有 Hubble 原生集群概览、PD/Store 节点列表、资源指标或告警页面。
- 没有统一的监控聚合 DTO、时间戳/单位/状态映射和版本兼容策略。
- 没有针对 Server、PD、Store 部分不可达的独立状态和降级响应。
- 没有监控/告警专用 RBAC、服务凭据、审计日志、缓存和请求限流设计。
- 当前 Dashboard 可用性直接决定四个运维入口是否可点击，错误地把展示层当成基础能力开关。

## 3. 已确认的上游事实源

以下接口已经通过当前 Server 仓代码审计；PD/Store 关键接口也在本地运行实例完成只读验证。

### 3.1 HugeGraph Server

| 接口 | 内容 | 当前鉴权 |
| --- | --- | --- |
| `/metrics/system` | JVM、heap/non-heap、线程、类加载、GC、CPU 等 | HugeGraph `metrics_read` |
| `/metrics/backend` | 图后端、节点、存储容量及后端专有指标 | HugeGraph `metrics_read` |
| `/metrics?type=json` | gauges/counters/histograms/meters/timers | HugeGraph `metrics_read` |
| `/metrics/statistics?type=json` | 统计指标 | HugeGraph `metrics_read` |
| `/metrics`、`/metrics/statistics` | Prometheus 文本 | HugeGraph `metrics_read` |

代码入口：

- Server：`hugegraph-server/hugegraph-api/.../api/metrics/MetricsAPI.java`
- Client：`hugegraph-client/.../driver/MetricsManager.java`

当前实例未认证请求返回 HTTP 401，符合权限合同。Hubble 应使用当前登录用户的 Server token，并让
Server 继续执行 `metrics_read` 判权；不得以 Hubble 超级凭据绕过用户授权后再把完整指标返回前端。

### 3.2 HugeGraph PD

| 接口 | 内容 | 当前鉴权 |
| --- | --- | --- |
| `/v1/health` | 基础存活 | interceptor 排除 |
| `/actuator/health` | Spring health | actuator 排除 |
| `/actuator/metrics` | Micrometer 指标目录/单指标 | actuator 排除 |
| `/actuator/prometheus` | Prometheus 指标 | actuator 排除 |
| `/v1/cluster` | PD Leader/成员、Store、图、分区、容量、集群状态 | 内部服务认证 |
| `/v1/stores` | Store 状态、心跳、容量、分区和 Leader | 内部服务认证 |
| `/v1/store_monitor/json/{storeId}` | Store 历史监控数据 | 内部服务认证 |
| `/v1/prom/targets-all` | PD/Store Prometheus targets | 当前实现需要内部认证 |

代码入口：

- `hugegraph-pd/hg-pd-service/.../rest/IndexAPI.java`
- `hugegraph-pd/hg-pd-service/.../rest/StoreAPI.java`
- `hugegraph-pd/hg-pd-service/.../rest/SDConfigAPI.java`
- `hugegraph-pd/hg-pd-service/.../rest/interceptor/RestAuthentication.java`
- `hugegraph-pd/hg-pd-service/.../service/interceptor/Authentication.java`

本地实例验证结果：health 200、Actuator `UP`；内部认证后 `/v1/cluster` 返回 `Cluster_OK`、PD Leader、
Up Store、图和分区统计；`/v1/stores` 返回 Store 心跳、容量、可用量、Leader 和分区；targets 能发现
PD 与 Store 的 Prometheus 地址。

### 3.3 HugeGraph Store

| 接口 | 内容 | 当前鉴权/暴露情况 |
| --- | --- | --- |
| `/v1/health` | 基础存活 | 当前本地实例可直接读取 |
| `/actuator/health` | Spring health | 当前本地实例可直接读取 |
| `/actuator/metrics` | Micrometer 指标 | 当前本地实例可直接读取 |
| `/actuator/prometheus` | Prometheus 指标 | 当前本地实例可直接读取 |
| `/metrics/system` | JVM、内存、线程、GC、CPU | 当前本地实例可直接读取 |
| `/metrics/drive` | 磁盘容量与可用空间 | 当前本地实例可直接读取 |
| `/metrics/raft` | 分区 Raft/NodeMetrics | 当前本地实例可直接读取 |

代码入口：

- `hugegraph-store/hg-store-node/.../controller/HgStoreStatusController.java`
- `hugegraph-store/hg-store-node/.../controller/HgStoreMetricsController.java`
- `hugegraph-store/hg-store-node/.../metrics/`

本地实例已返回真实 system、drive 和 raft 数据。Store 监控接口当前可匿名读取只能视为现状，不能直接
沿用为最终安全设计；应由网络隔离、服务认证和 Hubble BE 代理共同收口。

## 4. 已发现的鉴权与安全债务

### 4.1 PD 内部认证不完整

PD REST 使用 `Authorization: Basic ...` 识别内部模块，允许 `hg/store/hubble/vermeer`；当前代码只检查
模块名，密码校验被 TODO 注释。这不是可接受的最终服务认证：知道模块名即可访问 cluster、stores 等
内部拓扑接口。

新 goal 至少需要决定：

- 是否在 PD 侧补齐强凭据校验，或引入短期 token、mTLS/服务身份。
- 凭据如何配置、轮换、吊销和避免写入日志/异常/前端响应。
- 多 PD 节点、Leader 切换时 token/身份是否一致。
- health、Actuator、Prometheus 哪些保持匿名，哪些仅允许可信网络或认证抓取。

### 4.2 Store 指标暴露边界过宽

当前 Store health、Actuator、system/drive/raft 在本地实例可匿名读取。它们可能泄露：

- 内部地址、磁盘布局和容量；
- JVM/线程/GC 和运行状态；
- Raft group、Leader、吞吐和延迟；
- 版本、数据路径或其他拓扑信息。

需要明确 Store 自身认证、管理网络绑定、IP allowlist/mTLS 或仅由 PD/Hubble 服务身份读取的策略。

### 4.3 Hubble Dashboard URL 存在 SSRF 边界

当前 Hubble BE 会请求管理员配置的 `dashboard.address`。后续如果允许配置 PD/Store/Prometheus 地址，
必须防止任意协议、重定向、DNS rebinding、云元数据地址和内网端口扫描：

- 只允许 `http/https`，禁止用户请求级覆盖目标地址。
- 地址来自管理员配置或 PD discovery，不接受普通前端传入完整 URL。
- 校验 host/port allowlist，限制重定向、响应体大小、连接/读取总超时。
- 不把上游原始异常、凭据、完整 URL 或响应体直接回显浏览器。

### 4.4 用户权限与服务权限必须分层

Hubble BE 能访问内部服务，不代表当前用户有权查看或修改全部运维信息。每次请求都要同时满足：

```text
用户权限：这个人能做什么？
服务权限：Hubble 这个服务能从 PD/Store/Server 读取什么？
数据范围：结果中哪些字段可以返回给这个人？
```

不能使用 Hubble 服务身份替代用户授权，也不能把 PD/Store 的完整内部响应直接透传。

## 5. 建议的权限域

以下是待新 goal 评审的起点，不是已冻结 API：

| 权限 | 典型能力 | 建议初始角色 |
| --- | --- | --- |
| `operations_health_read` | 只读整体健康、服务是否可用 | SUPERADMIN；可评估有限开放 |
| `operations_topology_read` | PD/Store/Server 节点、角色、版本、拓扑 | SUPERADMIN |
| `operations_metrics_read` | JVM、磁盘、Raft、backend 详细指标 | SUPERADMIN |
| `alerts_read` | 告警实例、状态、历史 | SUPERADMIN；后续可按空间过滤 |
| `alerts_acknowledge` | 确认、关闭或备注告警 | SUPERADMIN/授权运维角色 |
| `alerts_silence_manage` | 新建、修改、删除静默 | SUPERADMIN/授权运维角色 |
| `alert_rules_manage` | 创建、修改、启停规则 | SUPERADMIN |
| `notification_channels_manage` | Webhook/邮件等渠道和秘密 | SUPERADMIN，秘密永不回显 |

需要单独决定普通用户、GraphSpace 管理员能否查看其空间的图级指标。节点拓扑和全局资源指标不应因为
用户能访问某个公开 GraphSpace 就自动可见。

## 6. Hubble Frontend 基线状态与缺失项

### 6.1 当前已有的前端能力

当前前端只有导航首页的运维入口壳层：

- `modules/navigation/ConsoleItem/index.js` 渲染“集群管理、监控管理、节点运维、报警管理”四项。
- `api/auth.js#getDashboard()` 只请求 Hubble `/dashboard` capability，不读取任何监控数据。
- 四项共享同一个 Dashboard 状态；Dashboard 不可用时四项全部禁用。
- Dashboard 可用时分别打开外部 `/`、`/monitor/machine`、`/operate/node`、`/alert/rule`。
- 已覆盖 checking、unconfigured、unavailable、configured、URL 安全规范化和 popup blocked。
- `routes/index.js` 没有 Hubble 内部 operations、cluster、monitor、node 或 alert 路由。
- `src/modules` 没有监控、节点或告警业务模块，也没有对应侧栏入口、页面状态或权限 guard。

因此现有前端只能说明“外部 Dashboard 是否可打开”，不能展示任何 Hubble 原生监控或告警内容。

### 6.2 基线前端信息架构缺失

新 goal 至少需要设计下列 Hubble 内部旅程，最终路径需与 Backend API 一起冻结：

```text
运维管理
├── 集群概览
│   ├── 总体健康与数据新鲜度
│   ├── Server / PD / Store 来源状态
│   └── PD、Store、图、分区、容量摘要
├── 节点
│   ├── PD 节点列表与 Leader/Follower
│   ├── Store 节点列表、心跳、容量、分区和 Leader 数
│   ├── Server 实例与基础运行指标
│   └── 节点详情与 system / drive / raft 指标
├── 告警
│   ├── 当前告警与历史
│   ├── 告警详情、确认和静默
│   ├── 规则管理
│   └── 通知渠道
└── 高级监控
    └── 可选 Dashboard / Grafana 外链
```

导航首页不能再用 Dashboard availability 统一禁用前三类原生入口。建议分别依据 Hubble capability 和
当前用户 permissions 渲染；Dashboard 不可用只影响“高级监控”外链。

### 6.3 P0：基础监控页面缺失

#### 集群概览

需要展示：

- 总状态 `UP/DEGRADED/DOWN/UNKNOWN`，并说明状态计算依据，不能只用颜色。
- 最近观测时间、缓存时间和数据是否 stale；允许手动刷新，自动刷新需可暂停。
- Server、PD、Store 独立来源卡片；单个来源失败时显示原因而不是整页失败。
- PD Leader、成员数、Store online/offline 数、图数、分区数、副本数、key/data size 等可用摘要。
- 部署模式和版本；未知或上游不支持的字段显示“不可用”，不得伪造 0。
- 无 Dashboard 时原生摘要仍可用；Dashboard 可用时提供清晰的次级“打开高级监控”入口。

#### 节点列表

需要至少包含：

- 节点类型、稳定节点 ID/名称、角色、版本、健康状态和最后心跳/观测时间。
- PD 的 Leader/Follower、REST/gRPC/Raft endpoint；内部地址是否完整显示由权限和脱敏合同决定。
- Store 的容量/可用量、分区数、Leader 数、心跳与状态。
- Server 的服务状态和基础资源摘要；多 Server 实例需能区分节点。
- 按类型/状态过滤、搜索、排序和刷新；大列表需要分页或虚拟化。
- 行点击进入节点详情，不以弹出小框承载全部指标。

#### 节点详情

需要按节点能力渐进展示：

- 公共信息：状态、角色、版本、启动/观测时间、来源可用性。
- Server/Store system：CPU、heap/non-heap、线程、GC、class loading。
- Store drive：总量、可用量、使用率及单位；Store raft：group/leader 和关键 Raft 指标。
- Backend/图存储指标只在用户具备对应权限和数据范围时显示。
- 每块指标独立 loading/error/unsupported/stale，避免一项失败清空整个详情。
- 第一阶段没有可靠历史数据时只展示当前值，不用静态假曲线填充页面。

### 6.4 P1：告警前端缺失

当前 Hubble 没有任何原生告警模型、页面或操作。告警执行器和 API 冻结后，前端至少需要：

#### 告警列表与详情

- severity、status、source、scope、summary、first seen、last seen、assignee/acknowledger。
- 按状态、级别、来源、作用域和时间过滤；默认突出 firing，不把 resolved 与 firing 混在一起。
- 详情展示触发条件、当前值/阈值、受影响对象、状态时间线和操作审计。
- 清晰区分“确认告警”“解决告警”“静默”，避免一个模糊的“处理”按钮。
- 实时刷新不能覆盖用户正在填写的确认备注或静默表单。

#### 规则、静默与通知渠道

- 规则列表、创建/编辑、启停、阈值/持续时间/作用域校验和冲突提示。
- 静默必须展示作用域、开始/截止时间、时区、原因和创建人；危险或全局静默需要二次确认。
- 通知渠道的 secret 创建后只显示掩码；编辑时空值表示保持不变，掩码绝不能作为新 secret 回传。
- Webhook 连通测试要有明确结果，但前端不得接受任意目标并绕过 Backend SSRF 策略。
- 所有 mutation 需要 pending、成功、失败和重复提交保护；失败响应要可行动但不泄露内部详情。

### 6.5 权限感知与路由保护缺失

前端不能只读取用户的粗粒度 `ADMIN/SPACEADMIN/USER` 后自行推断全部运维能力。Backend 应返回稳定
capabilities/permissions，前端据此控制入口和操作：

- 无 `operations_health_read`：不显示或明确禁止进入集群概览。
- 只有 health 权限：只展示脱敏健康摘要，不展示内部拓扑、地址、磁盘和 Raft。
- 有 `operations_topology_read`：允许节点与角色信息。
- 有 `operations_metrics_read`：允许资源和详细指标。
- 告警 read、acknowledge、silence、rule manage、notification channel manage 分别控制对应按钮。
- 直接输入 URL 必须经过 route guard；即使按钮隐藏，Backend 仍必须返回 403。
- 403 与 401、上游 unavailable、版本 unsupported 需要不同页面反馈，不能统一成“加载失败”。

前端权限控制只是体验层，不能被视为安全边界。

### 6.6 页面状态矩阵缺失

每个原生页面和主要卡片至少覆盖：

| 状态 | 必需表现 |
| --- | --- |
| 首次加载 | skeleton/明确 loading，避免旧数据闪烁 |
| 刷新中 | 保留旧数据并标记 refreshing，不清空整页 |
| 空集群 | 解释未发现节点，提供配置/排查路径 |
| 部分失败 | 保留成功来源，列出失败来源与最近成功时间 |
| stale | 显示数据时间和过期状态，不冒充实时 |
| 401 | 会话失效流程，不显示成服务故障 |
| 403 | 明确无权限及所需能力，不暴露隐藏字段 |
| timeout/unavailable | 标识具体来源、可重试，不暴露内部异常栈 |
| unsupported | 说明当前服务版本不支持该指标 |
| malformed/unknown | 安全降级并记录诊断，不渲染 `undefined`/`NaN` |

多来源状态不能压缩成单一布尔 `available`。

### 6.7 前后端依赖矩阵

| 前端能力 | 最小 Backend 合同 | 当前状态 |
| --- | --- | --- |
| 导航权限 | operations capabilities/permissions | 缺失 |
| 集群概览 | 聚合 overview、source status、freshness | 缺失 |
| 节点列表 | 规范化 node DTO、分页/过滤能力 | 缺失 |
| 节点详情 | 节点 metadata 与分组 metrics | 缺失 |
| 手动/自动刷新 | cache/freshness/observed_at 语义 | 缺失 |
| 告警列表/详情 | alert DTO、过滤、状态时间线 | 缺失，执行器未定 |
| 确认/静默 | 独立权限、mutation、审计响应 | 缺失 |
| 规则管理 | schema、校验、版本/并发控制 | 缺失 |
| 通知渠道 | secret-safe DTO、连通测试 | 缺失 |
| 高级监控外链 | 现有 Dashboard capability | 已有基础壳层 |

前端不应在 Backend 合同未冻结前自行解析 PD/Store 原始 JSON；否则版本差异、敏感字段和状态语义会
固化到浏览器代码中。

### 6.8 前端工程与 UX 门禁

- 所有新路由纳入统一 Layout、侧栏、面包屑、语言切换和 route guard。
- 中英文 key 同步，状态、单位、时间和数字格式本地化；技术缩写提供可访问帮助。
- 1280px 与 768px 可用；表格列可按重要性响应式隐藏，关键状态不能只靠横向滚动才能看到。
- 颜色之外提供文字/图标；键盘焦点、读屏名称、图表替代摘要和 reduced motion 可用。
- 图表只用于真实时序数据；当前值优先使用数值卡/表格，不为填充版面制造无意义图形。
- 单元测试覆盖路由权限、状态矩阵、单位/空值、partial/stale 和 mutation 防重复提交。
- 真实浏览器覆盖 SUPERADMIN、受限角色、无权限、部分服务不可达、中英文及窄屏。

### 6.9 前端实施优先级

建议新 goal 按以下顺序规划，避免先做重型告警 UI：

1. **P0**：capability/permission、原生运维路由、集群概览、节点列表/详情、状态矩阵。
2. **P1**：当前指标刷新与必要的短期历史曲线；告警只读列表/详情。
3. **P1/P2**：确认、静默、规则和通知渠道；必须等待告警执行器与权限模型冻结。
4. **P2**：Dashboard/Grafana 深链、复杂图表、自定义面板和高级诊断。

## 7. Hubble Backend 设计要求

### 7.1 聚合边界

- Server metrics 通过 HugeGraph Client 和当前用户 token 调用。
- PD/Store 通过 Hubble 服务身份调用；目标地址来自受信配置或 PD discovery。
- 对上游响应建立稳定 DTO，不把 protobuf/内部 JSON 原样透传。
- 统一状态、单位、时间戳、节点 ID、版本和 unavailable reason。
- 对 deployPath、dataPath、完整内部地址、异常栈、凭据和通知秘密做字段级过滤。
- 每个来源独立超时和错误状态；一个 Store 失败不能让整个概览 500。
- 使用短 TTL 缓存、并发合并和响应体上限，避免每次页面刷新扇出压垮低资源集群。
- Store 指标扇出使用固定线程池和单次采集总 deadline；公开配置
  `operations.store_threads=16`、`operations.store_deadline_ms=5000` 必须为正数。该默认值只面向
  受控采集和本地 3/30/300 节点功能验证，不代表生产容量结论。
- 新 PD 以 Store ID 对应的 `restAddress` 精确匹配 `/v1/prom/targets-all` allowlist；旧 PD 仅在同 host
  唯一 target 时兼容，多个候选返回 `metrics_target_ambiguous`，不得猜测或跨 Store 读取。
- 所有告警 mutation 采用 POST/PUT/DELETE，具备输入校验、幂等或并发版本控制和审计日志。

### 7.2 候选 Hubble API

具体路径需在新 goal 设计阶段冻结，候选结构：

```text
GET  /api/v1.3/operations/overview
GET  /api/v1.3/operations/nodes
GET  /api/v1.3/operations/nodes/{nodeId}/metrics
GET  /api/v1.3/operations/alerts
POST /api/v1.3/operations/alerts/{alertId}/acknowledge
GET  /api/v1.3/operations/alert-rules
POST /api/v1.3/operations/alert-rules
PUT  /api/v1.3/operations/alert-rules/{ruleId}
POST /api/v1.3/operations/silences
```

API 应返回每个来源的 freshness 和 availability，例如：

```json
{
  "status": "DEGRADED",
  "observed_at": "2026-07-14T12:00:00Z",
  "sources": {
    "server": {"status": "UP", "fresh": true},
    "pd": {"status": "UP", "fresh": true},
    "stores": {"status": "PARTIAL", "up": 2, "total": 3}
  }
}
```

不得把上例字段直接视为最终合同；先对照多版本 Server/PD/Store 响应和角色模型再冻结。

## 8. 告警体系待设计范围

监控展示不等于告警体系。新 goal 需要明确：

- 告警计算位置：Hubble 内部规则、PD 现有状态/历史、Prometheus/Alertmanager，或组合模式。
- 告警生命周期：firing、acknowledged、resolved、silenced 的状态机和操作者审计。
- 规则作用域：集群、节点、GraphSpace、图、导入任务；不同作用域的授权方式。
- 告警去重、抑制、聚合、恢复通知和重复通知策略。
- 静默的范围、时区、截止时间、原因、创建人和审批/审计要求。
- 通知渠道秘密加密、掩码回显、连通测试、防 SSRF 和发送速率限制。
- Hubble 不可用时告警是否仍能计算和发送；若不能，需明确它只是管理面而非可靠告警执行器。

建议先完成 P0 只读健康/拓扑/资源监控，再决定告警执行器归属；不要在没有可靠数据模型和权限域前
直接堆叠规则编辑 UI。

## 9. 验收门禁

### 9.1 功能

- PD 模式下无需 Dashboard 即可查看真实集群摘要、PD 节点、Store 节点和基础资源指标。
- Server、PD、单个 Store 分别不可达时页面准确降级，保留其他来源数据。
- 多节点、空集群、Leader 切换、旧版本缺字段和超时均有稳定响应。
- Dashboard 配置存在时只增加高级入口，不替换原生基础监控。

### 9.2 鉴权与安全

- 普通用户和 GraphSpace 管理员不能读取全局拓扑、路径、磁盘、Raft 或通知渠道秘密。
- Server metrics 保留 `metrics_read` 判权；Hubble 不使用超级身份绕过当前用户权限。
- PD/Store 服务身份不可由浏览器获得，凭据不出现在日志、异常、DTO 或截图。
- 覆盖越权、IDOR、SSRF、恶意重定向、超大响应、慢响应和部分失败测试。
- 告警规则、静默、确认、通知渠道 mutation 均有权限负向测试和审计记录。
- 所有 secret 创建后只允许掩码回显；更新语义不以掩码值覆盖真实秘密。

### 9.3 工程门禁

- Client/BE/FE 定向与全量测试、lint、i18n、build/package 通过。
- 使用真实最小 PD/Store/Server 环境完成浏览器功能矩阵；不要求性能或长时稳定性测试。
- 由未参与实现的只读 reviewer 对最终整体 diff 做安全、API 和 UI/UX 复审。
- 更新公开配置说明、升级/兼容说明和威胁模型；不得只记录在测试脚本或本地启动命令中。

## 10. 新 goal 首轮必须回答的问题

1. P0 只读监控对 SUPERADMIN、SPACEADMIN、普通用户分别开放到什么粒度？
2. PD/Store 服务认证是在上游补强，还是先由可信网络与 Hubble 凭据适配；迁移路径是什么？
3. Store 地址应完全来自 PD discovery，还是允许管理员配置补充；如何防 SSRF？
4. 第一阶段是否只做实时摘要，还是同时纳入 `store_monitor` 历史曲线？
5. 告警执行器属于 Hubble、PD 还是 Prometheus/Alertmanager；Hubble 是执行面还是管理面？
6. 哪些字段属于敏感拓扑/基础设施数据，哪些可以按 GraphSpace 过滤后向空间管理员开放？
7. 如何兼容 Server/PD/Store 1.7、当前 master 及缺少部分接口的部署？

## 11. 建议的新 goal 边界

第一阶段建议只冻结并实现：

- 权限模型和服务信任边界；
- Server/PD/Store 只读适配器及稳定 Hubble DTO；
- 集群概览、节点列表、基础 system/drive 状态；
- 部分失败、缓存、超时、脱敏、审计与真实浏览器验证。

告警规则引擎、通知渠道、历史时序存储和完整 Dashboard 替代可在设计完成后分阶段实施，但鉴权模型、
API 命名和数据分类必须在第一阶段统一，避免后续产生第二套权限体系。
