# Operations diagnostics

Use Cluster Overview, Server/Store node details and PD source diagnostics to
identify what failed, inspect concrete evidence, and find the next recovery step
without treating a collection failure as a process outage.

## Reading the views

1. **Cluster Overview — clearer collection failures.**
   Source issues use compact rows with direct diagnostic links. The attention
   table names affected metric groups while preserving the node's actual
   registration status.
2. **Server details — failure count before supporting details.**
   The page shows only the selected node's source. The current failed-graph
   count remains visible, while repeated context and recovery instructions are
   available through a disclosure. Stale metric timestamps are labeled as the
   last successful collection, not the latest observation.
3. **Store details — actionable request evidence.**
   The failure reason is localized. `/metrics/system` and HTTP 503 remain visible
   before expanding supporting details; the node stays UP when registration is
   healthy. Collection and node health remain separate.
4. **PD diagnostics — concise status with address evidence on demand.**
   The summary distinguishes online nodes, missing system metrics and
   `Cluster_Not_Ready`. The disclosure shows the configured origin, member origins,
   origin/path match results and matched/discovered counts. It names the relevant
   `pd.server` / `server.protocol` settings and restart/refresh steps. Endpoint
   ambiguity is preserved; metrics are never assigned to a leader by guesswork.
   Hubble collects system metrics only from the one PD member matched to its
   configured endpoint. Other discovered members are intentionally not scraped.
   An unmapped endpoint creates one source collection issue, not a failed metric
   request for every discovered PD member; their registration status stays intact.

## Access and endpoint matching

In authenticated Server mode, operations health, topology and metric capabilities
are granted only to the global `ADMIN` level. GraphSpace administrators and
ordinary users receive HTTP 403 from the overview and node endpoints before the
data service runs. Configured/member origins are intentional administrator
diagnostics; credentials, URL parameters and base-path contents are not exposed.
In Server non-auth mode these read endpoints are available without a login, as
with the existing global operations view; Hubble does not invent a user role.

Endpoint matching lowercases the scheme and host, fills the standard HTTP/HTTPS
port, normalizes path dot segments and ignores one optional trailing slash. A
member address without a scheme inherits the configured scheme. Proxy base paths
must otherwise match exactly, including case and escaped path spelling. A proxy
or load-balancer origin is not treated as an alias of its backend member.
Bracketed IPv6 literals are supported and host case is normalized; equivalent
compressed/expanded IPv6 spellings are not resolved to guess a member identity.

A missing, null or non-array `pdList` is a malformed PD member-list response. The
collector preserves that source diagnosis and skips PD metric matching, rather
than trying to recover a topology from `pdLeader` alone. Other healthy sources
remain available. The strict parser is retained so malformed data cannot appear
as a successful but empty PD topology.

## Verification and limits

- Backend collector/parser tests cover unmatched identities, canonical matches,
  ambiguous identities, three healthy PD nodes without attributed metric failures, bounded
  diagnostic membership, and redaction of URL credentials, parameters and paths.
- Frontend tests cover disclosures, visible request evidence and failed-graph
  counts, independent topology health, current-source scoping and timestamp labels.
- A single failed metric shown before disclosure includes its owning node and
  metric group. With multiple failures, every request/status or failed-graph count
  stays inside its own node/group row; no arbitrary first value appears source-wide.
- The [browser fixture](../hubble-dist/assembly/travis/run_ui_operations_diagnostics.js)
  covers the four views above and multiple Server/Store diagnostic ownership using
  deterministic API responses. Native disclosure controls support keyboard
  interaction; these checks do not establish complete accessibility conformance.
- Actual PD connection addresses, cluster readiness, authentication enforcement,
  upstream recovery and multi-Server behavior still require deployment validation.
  A screenshot showing `pd_metrics_unmapped` does not identify which address differs;
  the new diagnostic response exposes that comparison safely.

## Run the browser fixture

Against a running frontend, choose an output directory outside the repository:

```bash
HUBBLE_UI_EVIDENCE_DIR=/tmp/hubble-operations-diagnostics \
node hubble-dist/assembly/travis/run_ui_operations_diagnostics.js
```

Set `HUBBLE_URL` for the frontend address and
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` for a custom Chromium executable. Generated
reports and screenshots are temporary outputs; keep them outside Git. The fixture
does not contact a deployed cluster or establish deployment acceptance.


## PD Service addresses and bounded Raft collection

A PD Service or load-balancer URL is valid for connection discovery but does not
uniquely identify the node serving CPU/JVM metrics. Hubble keeps the discovered
PD topology and refuses to attach one member's system metrics to another member.
The diagnostics panel compares the configured `pd.server` with advertised member
REST addresses and separates that mapping issue from node health and readiness.
When the endpoint cannot be uniquely matched, Hubble also requests its bounded
`/actuator/prometheus` response once per metrics collection and shows the
allowlisted CPU, memory and process values as a **configured endpoint sample**.
This sample is not a sum and is never attached to a discovered member. A Service
may route subsequent requests to different members, so changes between samples
cannot be interpreted as one member's history. Failed or stale samples show their
collection status instead of presenting old values as current. A topology-only
request does not collect the sample.
If member-specific system metrics are needed, review the intended routing before
changing `pd.server` to a reachable member address (or correcting its `restUrl`),
then restart Hubble. A scheme-less address uses `server.protocol`.

Vermeer process CPU is an approximate display measurement. JSON responses are
parsed with lossless numbers, so Hubble converts a finite nonnegative BigNumber
to a JavaScript number at the resource display boundary. It does not convert
graph identifiers or other precision-sensitive values. Missing, invalid and
stale samples remain unavailable; zero is a valid CPU measurement. A low CPU
sample can round to zero in the summary without becoming unavailable.

Store node details also show process lifecycle when the Store supports
`GET /-/lifecycle`. STARTING, STARTED, STOPPING and UNAVAILABLE describe the
Store process and its gRPC server, not PD membership, partition health or
read/write readiness. Hubble collects this separately from its existing
readiness check, with bounded concurrency and the same collection deadline.
An older Store returning HTTP 404 is shown as unsupported; a failed or stale
observation is not presented as a current process state. The endpoint is
introduced by [Store lifecycle support](https://github.com/hugegraph/hugegraph/pull/362)
and requires a Store version containing that change.

For Store Raft counters, Hubble first requests `/metrics/raft/summary`, whose
response is `{"groups":32,"enabled_groups":32}`. The enabled count means JRaft
metrics collection is enabled, not that the groups are healthy. HTTP 404/405
falls back to the older `/metrics/raft` contract. Authorization, transport,
malformed payloads and server errors do not trigger the larger request.

The older endpoint serializes complete per-group metric registries including
timer and histogram data, while Hubble displays only two aggregate counters.
Its response can therefore exceed the default 1,048,576-byte (1 MiB) collection
limit even when nodes are online. Upgrading Store to a version that provides
the summary endpoint avoids that payload amplification.

For older deployments, the diagnostic request shows the active limit and known
response bytes. `At least` means collection stopped after reading that many
bytes; it does not establish the complete size. Inspect the complete response
and partition count before adjusting `operations.max_response_bytes` in
`hugegraph-hubble.properties`. Choose a value within the available memory budget,
restart Hubble and refresh. The setting limits every upstream response, and
concurrent collection can hold multiple responses at once. Hubble retains the
bounded-read protection and does not silently raise the default.
