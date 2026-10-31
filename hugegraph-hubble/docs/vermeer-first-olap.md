# Vermeer as the default OLAP entry

The algorithm sidebar explicitly identifies Vermeer as the default OLAP engine.
An available, loaded Vermeer graph exposes ten supported algorithms:
PageRank, PersonalPageRank, WCC, LPA, Degree Centrality, Closeness Centrality, Betweenness Centrality,
Triangle Count, K-Core and SSSP. This matches `DirectVermeerService` and does not
claim every native Vermeer algorithm is supported by Hubble. In particular,
Louvain is not added to the Vermeer interface.

When Vermeer is unavailable in the current session, the sidebar uses neutral
guidance without inferring a missing deployment or automatically falling back to
Computer. The Computer compatibility entry starts
collapsed and checks that graph's capability only after expansion. An unavailable
Computer capability cannot expose runnable forms. Graph changes invalidate the
opt-in and ignore late responses from the previous graph. Existing deployments
can still use the compatibility entry; its documentation and task labels identify
Computer explicitly. Returning to a previously selected graph also requires a new
explicit opt-in; its earlier capability result is not reused.

Vermeer algorithm links point to Vermeer documentation. Interactive traversal
links keep their API-specific references. Task types name the actual backend.
See [connection and service-token configuration](vermeer-development.md#connection-and-task-contracts)
for `vermeer.url` and `vermeer.token_file`; this UI change does not manufacture a
configured or healthy Vermeer service.

## Upgrade notes for existing Computer deployments

Previously the algorithm sidebar checked Computer automatically when Vermeer was
unavailable. It now starts with Vermeer and keeps **Computer compatibility**
collapsed. Computer remains supported; this change does not remove its backend
or require Computer users to configure Vermeer or migrate their graph data.

To use an existing Computer deployment, open the graph's algorithm page, expand
**Computer compatibility**, and wait for that graph's capability check before
selecting an algorithm. The Computer configuration link is inside this entry.

Expansion is a per-visit choice, not a saved deployment setting. Changing the
graph, GraphSpace or engine clears it; resetting parameters, leaving/remounting
the algorithm page or reloading also starts collapsed. Expand the entry again
when needed. There is no setting that restores the previous automatic probing.
Vermeer being unavailable can also reflect access restrictions or a temporary
service failure, so that message alone does not identify a configuration error.

## Manual browser checks

This is an optional manual regression runner, not an automatically executed CI
or release gate. It uses explicit API fixtures against the running frontend to
check engine selection, graph scope, supported algorithms, task routing, and
authenticated or anonymous visibility. It checks UI interaction and routing; it
does not establish live-engine computation, production authentication or result
persistence. Graph and GraphSpace selectors do not switch Server deployments.

To reproduce, start the frontend with `node node_modules/vite/bin/vite.js --port 3004`
from `hubble-fe`, then run from the repository root:

```sh
node hugegraph-hubble/hubble-dist/assembly/travis/vermeer_first_browser.cjs
```

The runner writes screenshots and its report to `/tmp/hubble-vermeer-first-evidence`.
`HUBBLE_UI_BASE` and `HUBBLE_UI_EVIDENCE_DIR` override the frontend URL and output
directory. Shared browser discovery honors `--chromium-executable`,
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` and `CHROME_PATH`; `CHROMIUM_PATH` remains a
legacy alias. `PLAYWRIGHT_NODE_MODULES` selects an external Playwright install;
otherwise the managed browser or platform defaults are used. The report records
the checked-out commit.
