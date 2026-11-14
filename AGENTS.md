# AGENTS.md

Repository guidance for coding agents. Read the nearest module README or local guidance before editing implementation details.

## Module relationships

```text
Loader, Hubble, Tools and Spark Connector
                    │
                    ▼
             Java Client
                    │
                    ▼
          HugeGraph Server APIs
```

A Java client contract change can affect every dependent module. Loader and Client changes commonly require Hubble validation because Hubble reuses their behavior.

## Load on demand

| Task | Read first |
|---|---|
| Documentation ownership | [docs/README.md](docs/README.md) |
| Java client | [`hugegraph-client/`](hugegraph-client/) |
| Data import | [`hugegraph-loader/`](hugegraph-loader/) |
| Hubble backend or frontend | [`hugegraph-hubble/`](hugegraph-hubble/) |
| Backup, restore or migration CLI | [`hugegraph-tools/`](hugegraph-tools/) |
| Spark integration | [`hugegraph-spark-connector/`](hugegraph-spark-connector/) |
| Go client | [`hugegraph-client-go/`](hugegraph-client-go/) |
| CI selection | [docs/ci.md](docs/ci.md) |
| Java baseline and compatibility | [docs/java17-migration.md](docs/java17-migration.md) |

## Repository constraints

- Keep a change inside the module that owns the behavior and avoid opportunistic refactors in dependent modules.
- Update dependent callers deliberately when a shared client contract changes; do not rely on a successful Client-only build.
- Keep root and module READMEs as entry points. Move long procedures to focused documents and link them from `docs/README.md` or a module-local index.
- Treat `.serena/` as a compact navigation cache. It must not contain copied release versions, timestamps, PR links, commit hashes or exhaustive command inventories.
- Document the current contract and compatibility boundary rather than the history of how it was implemented. Keep prose paragraphs as logical lines and wrap near 160 characters only when needed.

## Build and test

```bash
mvn clean install -DskipTests -Dmaven.javadoc.skip=true -ntp
# Example: replace hugegraph-client with the concrete target module
mvn install -pl hugegraph-client -am -DskipTests -ntp
./tools/check-license-header.sh
```

Use concrete reactor paths: `hugegraph-loader`, `hugegraph-hubble/hubble-be`, `hugegraph-tools` or `hugegraph-spark-connector`. After a Client change, install each affected downstream target before its tests so it resolves the current Client build. After a Loader change, install `hugegraph-loader` before running Hubble backend tests. When using custom Maven settings or an isolated local repository, keep the same options for the install and test commands.

Common test entry points:

```bash
mvn test -pl hugegraph-client -Dtest=UnitTestSuite -ntp
mvn test -pl hugegraph-loader -Punit -ntp
mvn test -pl hugegraph-hubble/hubble-be -Punit-test -ntp
mvn test -pl hugegraph-tools -Dtest=FuncTestSuite -ntp
```

Use the profile matching the changed Loader source and run integration/functional suites only with their required external services. Hubble frontend changes require its package-level test, type and build checks. Go changes use the module Makefile and Go tooling.

## Quality boundaries

- Java style is enforced through `.editorconfig`, `tools/checkstyle.xml` and Maven configuration. Do not use star imports or `System.out.println`.
- New source and test files require the complete configured Apache license header; run `tools/check-license-header.sh`.
- Distribution or dependency changes require packaging and license-metadata validation, not only compilation.
- Documentation-only changes require rendered-heading and relative-link review plus `git diff --check`.
- Read exact versions and package membership from POMs and package configuration instead of copying them into agent notes.
