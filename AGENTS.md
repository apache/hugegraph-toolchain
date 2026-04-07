# AGENTS.md

This file provides guidance to AI coding assistants (Claude Code, Cursor, GitHub Copilot, etc.) when working with code in this repository.

## Project Overview

Apache HugeGraph Toolchain - a multi-module Maven project providing utilities for the HugeGraph graph database. Current version: 1.7.0.

## Build Commands

### Full Build
```bash
mvn clean install -DskipTests -Dmaven.javadoc.skip=true -ntp
```

### Module-Specific Builds

**Java Client:**
```bash
mvn -e compile -pl hugegraph-client -Dmaven.javadoc.skip=true -ntp
```

**Loader (requires client):**
```bash
mvn install -pl hugegraph-client,hugegraph-loader -am -DskipTests -ntp
```

**Hubble (requires client + loader):**
```bash
mvn install -pl hugegraph-client,hugegraph-loader -am -DskipTests -ntp
cd hugegraph-hubble && mvn package -DskipTests -ntp
```

**Tools:**
```bash
mvn install -pl hugegraph-client,hugegraph-tools -am -DskipTests -ntp
```

**Spark Connector:**
```bash
mvn install -pl hugegraph-client,hugegraph-spark-connector -am -DskipTests -ntp
```

**Go Client:**
```bash
cd hugegraph-client-go && make all
```

## Testing

### Client Tests
```bash
cd hugegraph-client
mvn test -Dtest=UnitTestSuite      # Unit tests (no server required)
mvn test -Dtest=ApiTestSuite       # API tests (requires HugeGraph server)
mvn test -Dtest=FuncTestSuite      # Functional tests (requires HugeGraph server)
```

### Loader Tests (profiles)
```bash
cd hugegraph-loader
mvn test -P unit     # Unit tests
mvn test -P file     # File source tests
mvn test -P hdfs     # HDFS tests (requires Hadoop)
mvn test -P jdbc     # JDBC tests (requires MySQL)
mvn test -P kafka    # Kafka tests
```

### Hubble Tests
```bash
mvn test -P unit-test -pl hugegraph-hubble/hubble-be -ntp
```

### Tools Tests
```bash
mvn test -Dtest=FuncTestSuite -pl hugegraph-tools -ntp
```

## Code Style

Checkstyle enforced via `tools/checkstyle.xml`:
- Max line length: 100 characters
- 4-space indentation (no tabs)
- No star imports
- No `System.out.println`

Run checkstyle:
```bash
mvn checkstyle:check
```

## Architecture

### Module Dependencies
```
hugegraph-loader, hugegraph-tools, hugegraph-hubble, hugegraph-spark-connector
                            ↓
                    hugegraph-client
                            ↓
                hugegraph-common (external)
```

### Key Patterns

**hugegraph-client** - Manager/Facade pattern:
- `HugeClient` is the entry point providing access to specialized managers
- `SchemaManager`, `GraphManager`, `GremlinManager`, `TraverserManager`, etc.
- Builder pattern for fluent schema creation

**hugegraph-loader** - Pipeline with Factory pattern:
- `InputSource` interface with implementations: `FileSource`, `HDFSSource`, `JDBCSource`, `KafkaSource`, `GraphSource`
- `InputReader.create()` factory method creates appropriate reader for source type

**hugegraph-hubble** - Spring Boot MVC:
- Backend: `controller/` → `service/` → `mapper/` layers
- Frontend: React + TypeScript + MobX + Ant Design
- H2 database for metadata storage

**hugegraph-tools** - Command pattern:
- Manager classes for operations: `BackupManager`, `RestoreManager`, `GraphsManager`

### Key Directories

| Module | Main Code | Package |
|--------|-----------|---------|
| client | `hugegraph-client/src/main/java` | `org.apache.hugegraph` |
| loader | `hugegraph-loader/src/main/java` | `org.apache.hugegraph.loader` |
| hubble-be | `hugegraph-hubble/hubble-be/src/main/java` | `org.apache.hugegraph` |
| hubble-fe | `hugegraph-hubble/hubble-fe/src` | React/TypeScript |
| tools | `hugegraph-tools/src/main/java` | `org.apache.hugegraph` |
| spark | `hugegraph-spark-connector/src/main/scala` | `org.apache.hugegraph.spark` |

## Running Applications

### Hubble (Web UI on port 8088)
```bash
cd hugegraph-hubble/apache-hugegraph-hubble-*/bin
./start-hubble.sh      # Background
./start-hubble.sh -f   # Foreground
./stop-hubble.sh       # Stop
```

### Loader
```bash
cd hugegraph-loader/apache-hugegraph-loader-*
./bin/hugegraph-loader.sh [options]
```

## Docker

```bash
# Loader
cd hugegraph-loader && docker build -t hugegraph/hugegraph-loader:latest .

# Hubble
cd hugegraph-hubble && docker build -t hugegraph/hugegraph-hubble:latest .
```
