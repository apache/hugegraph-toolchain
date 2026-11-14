# Testing ownership

| Area | Test entry point |
|---|---|
| Java client unit behavior | `hugegraph-client` unit suite |
| Client API and functional behavior | Client API/functional suites with a compatible Server |
| Loader | Loader profile matching the changed source or pipeline |
| Hubble backend | `hugegraph-hubble/hubble-be` tests |
| Hubble frontend | Frontend package tests and build checks |
| Tools | Tools functional suite with a compatible Server |
| Spark connector | Connector unit/integration tests for the affected read or write path |
| Go client | Go tests and static checks in `hugegraph-client-go` |

Test the behavior and failure path, not only coverage. A shared Client or packaging change requires downstream validation. Exact commands and CI selection live in [`../../AGENTS.md`](../../AGENTS.md), module POMs and [`../../docs/ci.md`](../../docs/ci.md).
