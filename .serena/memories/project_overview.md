# Project overview

HugeGraph Toolchain provides clients and operational tools around Apache HugeGraph.

| Module | Primary role |
|---|---|
| `hugegraph-client` | Java API foundation for schema, graph, Gremlin, traverser and administration operations |
| `hugegraph-loader` | Configurable bulk import pipeline |
| `hugegraph-hubble` | Web management, visualization and operational workspace |
| `hugegraph-tools` | Backup, restore, migration and graph administration CLI |
| `hugegraph-spark-connector` | Spark DataFrame integration |
| `hugegraph-client-go` | Go client |
| `hugegraph-dist` | Aggregate distribution packaging |

Loader, Hubble, Tools and the Spark connector depend on the Java client. Validate affected consumers when the client contract changes.

Authoritative entry points:

- Product and module selection: [`../../README.md`](../../README.md)
- Documentation ownership: [`../../docs/README.md`](../../docs/README.md)
- Build and validation rules: [`../../AGENTS.md`](../../AGENTS.md)
- Current modules and versions: [`../../pom.xml`](../../pom.xml)
