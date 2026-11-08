# Common development workflows

Run from the repository root unless a module guide says otherwise.

```bash
# Full Maven reactor compile/package path; the standalone Go client is separate
mvn clean install -DskipTests -Dmaven.javadoc.skip=true -ntp

# Build one Maven module and required dependencies; replace hugegraph-client as needed
mvn install -pl hugegraph-client -am -DskipTests -ntp

# License headers
./tools/check-license-header.sh
```

## Dependency-aware validation

- Client change: test Client and every affected Loader, Hubble, Tools or Spark caller.
- Loader change: test Loader and the Hubble loading path when shared behavior changes.
- Hubble backend change: run backend tests; frontend contract changes also require frontend validation.
- Go client change: run the module Makefile and Go tests separately; the Maven reactor does not build `hugegraph-client-go`.
- Packaging or root POM change: validate aggregate packaging and affected module builds.
- Documentation-only change: inspect rendered headings, relative links, command working directories and `git diff --check`.

Use [`../../AGENTS.md`](../../AGENTS.md) and [`../../docs/ci.md`](../../docs/ci.md) for exact suite selection. Do not copy transient CI job names into this memory.
