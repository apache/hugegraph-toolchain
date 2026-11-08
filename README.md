# Apache HugeGraph Toolchain

[![License](https://img.shields.io/badge/license-Apache%202-0E78BA.svg)](https://www.apache.org/licenses/LICENSE-2.0.html)
[![Client CI](https://github.com/apache/hugegraph-toolchain/actions/workflows/client-ci.yml/badge.svg)](https://github.com/apache/hugegraph-toolchain/actions/workflows/client-ci.yml)
[![Loader CI](https://github.com/apache/hugegraph-toolchain/actions/workflows/loader-ci.yml/badge.svg)](https://github.com/apache/hugegraph-toolchain/actions/workflows/loader-ci.yml)
[![Hubble CI](https://github.com/apache/hugegraph-toolchain/actions/workflows/hubble-ci.yml/badge.svg)](https://github.com/apache/hugegraph-toolchain/actions/workflows/hubble-ci.yml)
[![Tools CI](https://github.com/apache/hugegraph-toolchain/actions/workflows/tools-ci.yml/badge.svg)](https://github.com/apache/hugegraph-toolchain/actions/workflows/tools-ci.yml)
[![Maven Central](https://img.shields.io/maven-central/v/org.apache.hugegraph/hugegraph-toolchain)](https://mvnrepository.com/artifact/org.apache.hugegraph/hugegraph-toolchain)

HugeGraph Toolchain is the client and operations suite for [Apache HugeGraph](https://github.com/apache/hugegraph). It provides application SDKs, bulk data loading, browser-based graph management, command-line utilities and Spark integration.

**Start here:** [Choose a tool](#choose-a-tool) · [Quick start](#quick-start) · [Modules](#modules) · [Documentation](#documentation) · [Development](#development)

## Choose a tool

| Goal | Component | Entry point |
|---|---|---|
| Build a Java application | [`hugegraph-client`](hugegraph-client/) | `HugeClient` SDK |
| Import CSV, JSON, JDBC, HDFS or Kafka data | [`hugegraph-loader`](hugegraph-loader/) | `hugegraph-loader.sh` |
| Explore graphs and manage schemas in a browser | [`hugegraph-hubble`](hugegraph-hubble/) | Hubble Web UI |
| Back up, restore, migrate or inspect graphs | [`hugegraph-tools`](hugegraph-tools/) | `bin/hugegraph` |
| Read or write HugeGraph from Spark | [`hugegraph-spark-connector`](hugegraph-spark-connector/) | Spark DataSource |
| Use a Go client | [`hugegraph-client-go`](hugegraph-client-go/) | Go package |
| Use Python | [HugeGraph Python client](https://github.com/apache/hugegraph-ai/tree/main/hugegraph-python-client) | `pyhugegraph` |

The Java client is the shared foundation for Loader, Hubble, Tools and the Spark connector. A client contract change therefore requires validation of the affected downstream modules.

```text
HugeGraph Server
       ▲
       │ REST APIs
       │
HugeGraph Java Client
  ├─ Loader
  ├─ Hubble
  ├─ Tools
  └─ Spark Connector
```

## Quick start

Start a HugeGraph Server first, then choose the tool that matches the task.

### Hubble

```bash
docker run -d --name hubble -p 8088:8088 hugegraph/hugegraph-hubble
```

Open `http://localhost:8088` and create a connection to the Server. For authentication, GraphSpace and distributed-cluster behavior, follow the [Hubble module documentation](hugegraph-hubble/).

### Loader

```bash
./hugegraph-loader/bin/hugegraph-loader.sh -f mapping.json -g hugegraph
```

The mapping file defines input sources, vertex and edge mappings, identifiers and error handling. See the [Loader guide](https://hugegraph.apache.org/docs/quickstart/hugegraph-loader/) for complete examples.

### Java client

Use the released `org.apache.hugegraph:hugegraph-client` artifact from Maven Central:

```xml
<dependency>
    <groupId>org.apache.hugegraph</groupId>
    <artifactId>hugegraph-client</artifactId>
    <version>${hugegraph.version}</version>
</dependency>
```

```java
HugeClient client = HugeClient.builder("http://localhost:8080", "hugegraph").build();
client.schema().propertyKey("name").asText().ifNotExist().create();
client.schema().vertexLabel("person").properties("name").ifNotExist().create();
client.graph().addVertex(T.label, "person", "name", "Alice");
```

Select a version compatible with the target Server. Do not copy a repository development version into application documentation; use Maven Central and the relevant migration guide as the source of truth.

## Modules

| Module | Responsibility |
|---|---|
| `hugegraph-client` | Java schema, graph, Gremlin, traverser, authentication and administration APIs |
| `hugegraph-loader` | Parallel import pipeline for files, databases, messaging systems and existing graphs |
| `hugegraph-hubble` | Web UI for connections, schemas, loading, querying, visualization, analysis and cluster operations |
| `hugegraph-tools` | Backup, restore, migration, cloning and metadata commands |
| `hugegraph-spark-connector` | Spark DataFrame read and write integration |
| `hugegraph-client-go` | Go client under active development |
| `hugegraph-dist` | Aggregate packaging and distribution assembly |

Module READMEs own detailed commands and configuration. The root README stays focused on choosing the correct component and reaching those documents.

## Documentation

- [Repository documentation index](docs/README.md): CI, Java migration, module ownership and documentation rules.
- [Official Toolchain guides](https://hugegraph.apache.org/docs/): user-facing Client, Loader, Hubble and Tools documentation.
- Module directories: closest source, examples and module-specific README files.
- [`AGENTS.md`](AGENTS.md): repository constraints, build/test selection and code-navigation guidance.
- [`.serena/README.md`](.serena/README.md): compact agent navigation cache linked back to authoritative files.

Every durable Markdown page should be reachable from this index or a module-local entry point. Avoid maintaining the same procedure in the root README, module README and agent notes.

## Development

The main Java modules build with Java 17 and Maven. Read exact dependency and plugin versions from the POM files.

```bash
mvn clean install -DskipTests -Dmaven.javadoc.skip=true -ntp
./tools/check-license-header.sh
```

Build only the affected module and its dependencies when possible:

```bash
mvn install -pl hugegraph-client -am -DskipTests -ntp
mvn install -pl hugegraph-loader -am -DskipTests -ntp
mvn install -pl hugegraph-hubble -am -DskipTests -ntp
mvn install -pl hugegraph-tools -am -DskipTests -ntp
```

Run the module tests described in [`AGENTS.md`](AGENTS.md) and [CI policy](docs/ci.md). Client changes require downstream validation; Loader or Client changes also affect Hubble.

## Related projects

- [Apache HugeGraph](https://github.com/apache/hugegraph): graph database, PD and distributed Store.
- [Apache HugeGraph Computer](https://github.com/apache/hugegraph-computer): graph computation and Vermeer.
- [Apache HugeGraph AI](https://github.com/apache/hugegraph-ai): Python client, GraphRAG, MCP, knowledge-graph extraction and graph ML.
- [Apache HugeGraph Documentation](https://github.com/apache/hugegraph-doc): website and long-form user documentation.

## Community and license

- [Contribution guide](https://hugegraph.apache.org/docs/contribution-guidelines/)
- [Issue tracker](https://github.com/apache/hugegraph-toolchain/issues)
- [Developer mailing list](mailto:dev@hugegraph.apache.org)

HugeGraph Toolchain is licensed under the [Apache License 2.0](LICENSE).
