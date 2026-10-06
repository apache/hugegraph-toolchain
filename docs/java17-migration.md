# Java 17 migration and candidate validation

Toolchain 1.8 requires Java 17 for the Java Client, ordinary Loader, Tools and Hubble. Select Java 17 for applications and for every Spark driver and executor using the new Client. An older server can keep its own supported JVM.

## Build the locked candidate

The Java 17 server candidate retains the Maven version `1.7.0`. Its Common, PD, gRPC and Store artifacts must come from the same source commit; Maven Central artifacts with that version are not interchangeable with the candidate. The locked source is `apache/hugegraph`, commit `d9abcd4317fb36128e7e4d209139ec7f3a28cdfc` from the upstream master branch after the Java 17 and TinkerPop 3.8 migration.

Use an explicit JDK directory and check both Java and Maven. On systems where Java 17 is not registered, a system JDK selector can return another installed version. Checking the generated class version alone does not identify the JVM that built or tested it.

From the Toolchain repository root:

```bash
export JAVA_HOME=/absolute/path/to/jdk-17
export PATH="$JAVA_HOME/bin:$PATH"
"$JAVA_HOME/bin/java" -version
mvn -version

toolchain_root="$PWD"
candidate_dir=$(mktemp -d /tmp/hugegraph-java17.XXXXXX)
mkdir "$candidate_dir/m2"
export SERVER_REPOSITORY=apache/hugegraph
export SERVER_FETCH_REF=d9abcd4317fb36128e7e4d209139ec7f3a28cdfc
server_commit=d9abcd4317fb36128e7e4d209139ec7f3a28cdfc

bash "$toolchain_root/hugegraph-client/assembly/travis/install-candidate-sdk.sh" \
  "$server_commit" "$candidate_dir/server" "$candidate_dir/m2"
mvn -Dmaven.repo.local="$candidate_dir/m2" clean install \
  -DskipTests -Dmaven.javadoc.skip=true -ntp
```

The SDK helper installs the locked Server distribution and its Maven reactor dependencies without starting a server. This includes every required SDK module and parent POM, but excludes unrelated Cluster tests and PD/Store service distributions. It requires a new external source directory and a dedicated Maven repository with no existing HugeGraph artifacts. It records source and artifact provenance in `candidate-sdk-manifest.json` inside that repository. Reuse the same explicit `-Dmaven.repo.local` option for subsequent Toolchain validation. The manifest's source and JDK paths describe that build; use your own directories when rebuilding. The package command skips test execution; run the module test suites separately. These source-built packages are candidates, not an ASF release.

Distribution packaging also requires Python 3.9 or newer. Before each module archive is written, the existing SDK verifier checks the locked source, required POM/JAR hashes and local installation origins, then checks the distribution's manifest and actual SDK libraries. The combined archive rechecks all three module directories before moving them. Source checks lock Server SDK artifacts; Toolchain artifacts such as the Client, Loader and Hubble backend are outputs of this reactor and may change during `install`. Older manifests can retain their metadata, but those outputs are excluded from SDK source hashes. The original manifest is still retained unchanged and compared with each packaged copy. A missing manifest, a Central artifact with the same version, or a stale/changed packaged SDK library fails packaging. Ordinary `compile` and `test` do not require the candidate manifest; they may validate published dependencies without establishing candidate package identity.

These isolated builds reuse `1.7.0` coordinates only for source validation. Before proposing a release candidate or deploying Toolchain Maven artifacts for external consumers, every Java 17 SDK dependency must have coordinates that distinguish it from the previously released `1.7.0` artifacts and are available to those consumers. Update the Toolchain dependencies and rerun the module dependency and runtime matrices against those publishable identities. Server versioning and publication are separate release work; this candidate validation does not authorize either.

## Upgrade the core tools

Keep the previous distribution, configuration, metadata and graph data. Extract the new distribution to a separate directory, select Java 17 and check its connection settings against a disposable graph before switching jobs.

Loader retains its `bin/hugegraph-loader.sh` entry point. From the extracted distribution, the bundled file example is:

```bash
bash bin/hugegraph-loader.sh -g hugegraph \
  -f example/file/struct.json -s example/file/schema.groovy
```

The Loader and Hubble launchers supply the scoped `java.net` opening required by Hive ORC. Custom launch commands need the same option; do not add it to unrelated JVMs. MySQL, HDFS and Kafka remain ordinary Loader sources.

Tools retains `bin/hugegraph` with `backup` and `restore`. Keep old backups and restore into a separate graph before comparing schema, vertices, edges and property values. Both ZIP and plain JSON backups are supported, including HDFS. Restoring a plain HDFS backup no longer interprets each JSON file as a ZIP.

## Hubble metadata

Hubble uses Spring Boot 3, Jakarta APIs and H2 metadata. Start with a new metadata database; the default is `jdbc:h2:file:./data/hubble-v2;DB_CLOSE_ON_EXIT=FALSE`. Existing databases are checked read-only before schema initialization. A database without this release's schema marker is rejected without changing its data. There is no automatic migration or deletion of an old database; retain it with its matching Hubble distribution. MySQL remains a Loader source.

Retain the new database and configuration across restarts. Local H2 file URL shorthand and encrypted files are supported; `INIT` settings are rejected before opening the database. The full initial schema includes the release marker. Packaging excludes runtime data from archives without deleting local data. See the [Hubble guide](../hugegraph-hubble/README.md) for configuration and UI validation evidence.

## Compatibility and peripheral engines

The compatibility scope below distinguishes supported operations from validation that must be repeated for each release. Use Java 17 for new Toolchain applications; released servers and original clients retain their supported JVMs.

| Tool | Server | Compatibility scope |
|---|---|---|
| New Client | Published 1.7 and locked candidate | REST, schema, graph data and Gremlin; validate API and functional suites, including HTTPS. |
| New Loader / Tools | Published 1.7 and locked candidate | Ordinary file imports and ZIP/plain backup/restore, including HDFS. |
| New Client | 1.5 standalone | Core schema, vertices/edges, Unicode, numeric precision, pagination, Gremlin, errors and cleanup. |
| New Loader / Tools | 1.5 standalone | Bundled file import and ZIP/plain backup/restore with schema, IDs, property types and Unicode readback. |
| New Hubble | Published 1.7 and 1.5 standalone | Core graph, schema and data workflows; 1.5 GraphSpace and PD management are outside the support boundary. |
| Original Client 1.7 / Java 11 | Locked candidate | REST and Gremlin compatibility. |
| Original Client 1.5 / Java 8 | Locked candidate | REST compatibility; the legacy `__g_hugegraph` Gremlin alias is absent from graphspace-prefixed bindings. |

Hubble release validation must include the candidate-SDK server/browser matrix and persistence of browser-created metadata. Backend tests and packaged H2/JAXB checks alone do not establish browser workflows or server compatibility.

New Tools supports restoring original Tools 1.7 ZIP and plain backups. Validate schema, vertex/edge IDs, property types and Unicode readback when upgrading.

The Spark Connector uses Spark 3.5.8 and Scala 2.12.18. Spark supplies its logging provider; the connector assembly does not bundle a competing SLF4J provider. Its [guide](../hugegraph-spark-connector/README.md) specifies driver and executor Guava paths and the tested client deploy mode. Cluster deploy mode requires a Guava path accessible to the remote driver and separate environment validation. A successful connector sink job does not establish Spark Loader or Flink CDC compatibility.

Spark Loader API writes, HBase bulkload, and Flink CDC require their own execution results. Failed peripheral modes may retain their previous released package with a documented limitation; they do not disable ordinary Loader sources. Do not use a new Java 11 variant as a substitute for the Java 17 core tools.

## Validation boundary

Release validation requires fresh core build/test and package evidence, released Server 1.7 and Hubble standalone Server 1.5 support checks, actual browser flows, isolated engine jobs, and runtime dependency/license coverage. Record the Toolchain source, server source, test JVM and artifact origin for each result. Validate against the locked candidate SDK in addition to published SDK dependencies. Pending checks remain pending; class versions, mocked tests and successful packaging alone do not establish runtime support.
