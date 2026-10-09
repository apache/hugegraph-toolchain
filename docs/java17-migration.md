# Java 17 migration and candidate validation

Toolchain 1.8 requires Java 17 for the Java Client, ordinary Loader, Tools and Hubble. Select Java 17 for applications and for every Spark driver and executor using the new Client. An older server can keep its own supported JVM.

Toolchain builds, tests and applications use Java 17. The released Server 1.7 compatibility fixture retains its supported Java 11 in a separate process; its JVM must not select the Toolchain build or test JVM. Building the candidate Server SDK requires JDK 17, matching the server reactor's `[17,18)` Enforcer range.

## Build the locked candidate

The locked Java 17 Server source uses TinkerPop 3.8.1 and SDK version `1.8.0`. Its Common, PD, gRPC and Store artifacts must come from the
same source commit; Maven Central artifacts with that version are not interchangeable with the candidate. Candidate CI uses the verified
`apache/hugegraph` baseline `68855199031d5801edb4fe41b2bacbacffe8fe68`, storing and fetching its complete immutable commit identity. Update the SDK action, verifier,
Docker defaults and CI baseline together when advancing that commit; moving master alone must not silently change packaged SDK provenance.

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
server_commit=$(python3 - <<'PY_COMMIT'
import runpy
print(runpy.run_path(".github/scripts/verify_candidate_image_sdk.py")["COMMIT"])
PY_COMMIT
)

bash "$toolchain_root/hugegraph-client/assembly/travis/install-candidate-sdk.sh" \
  "$server_commit" "$candidate_dir/server" "$candidate_dir/m2"
mvn -Dmaven.repo.local="$candidate_dir/m2" -Dhugegraph.version=1.8.0 -Dsdk.validation.mode=candidate clean install \
  -DskipTests -Dmaven.javadoc.skip=true -ntp
```

The SDK helper installs the locked Server distribution, PD client, Store client and Struct modules together with their Maven dependency closure, without starting a server. Unrelated Server modules are excluded. It requires a new external source directory and a dedicated Maven repository with no existing HugeGraph artifacts. It records source and artifact provenance in `candidate-sdk-manifest.json` inside that repository. Reuse the same explicit `-Dmaven.repo.local` option for subsequent Toolchain validation. The manifest's source and JDK paths describe that build; use your own directories when rebuilding. The package command skips test execution; run the module test suites separately. These source-built packages are candidates, not an ASF release.

Distribution packaging also requires Python 3.9 or newer. Before each module archive is written, the existing SDK verifier checks the locked source, required POM/JAR hashes and local installation origins, then checks the distribution's manifest and actual SDK libraries. The combined archive rechecks all three module directories before moving them. Source checks lock Server SDK artifacts; Toolchain artifacts such as the Client, Loader and Hubble backend are outputs of this reactor and may change during `install`. Toolchain publishes its aggregate module as `org.apache.hugegraph:hugegraph-toolchain-dist:1.8.0`; Server retains `org.apache.hugegraph:hugegraph-dist:1.8.0`. Toolchain reactor output hashes may change, while the selected Server dist hashes remain locked. The source directory stays `hugegraph-dist`, and the aggregate archive remains `apache-hugegraph-toolchain-1.8.0.tar.gz`; the Server archive is also bound separately by SHA256. The original manifest is still retained unchanged and compared with each packaged copy. A missing manifest, a Central artifact with the same version, or a stale/changed packaged SDK library fails packaging. Ordinary `compile` and `test` do not require the candidate manifest; they may validate published dependencies without establishing candidate package identity.

Normal Toolchain builds and fixed CI/Docker builds compile against SDK `1.8.0`. Same-source builds select
`-Dhugegraph.version=1.8.0 -Dsdk.validation.mode=candidate` together with the isolated Maven repository and retain its manifest.
The compile-time SDK version is independent of the runtime compatibility target: core CI runs the same Client, Loader, Tools and Hubble
against current Server 1.8 on Java 17 and the official Server 1.7 binary on its supported Java 11. The old Java 17 source SDK using 1.7.0
coordinates is no longer a test baseline.

The separate `upstream-master` workflow resolves master once, builds that exact source, validates its complete SDK manifest, hashes and local
source-install origins, then selects the actual source version for every consumer. This also supports a future upstream version such as
`1.9.0-SNAPSHOT`; it does not change the fixed 1.8.0 compile baseline or establish release/staging provenance.

## Release packaging

Build 1.8.0 release packages with Java 17, Python 3.9 or newer, and `-Papache-release`. Use a fresh Maven repository and settings that resolve the
chosen Apache staging repository. The existing `stage` profile selects Apache's staging group; specific repository selection belongs in Maven
settings. Do not preinstall local Server artifacts when validating remote staging dependencies.

```bash
release_settings=/absolute/path/to/settings-with-selected-staging.xml
release_repository=$(mktemp -d /tmp/hugegraph-release-m2.XXXXXX)
mvn --settings "$release_settings" -Dmaven.repo.local="$release_repository" -Papache-release \
  clean install -DskipTests -Dmaven.javadoc.skip=true -ntp
```

Release mode requires the Common and PD Common/Client/gRPC 1.8.0 POM/JARs, plus Core for Hubble. Every bundled Server SDK library must have the selected
version and match the JAR bytes in the build repository; missing, mixed or replaced libraries fail packaging. Candidate manifests in the Maven
repository or distribution are rejected. This verifies dependency/package consistency, while staging origin is established separately by fresh
resolution and retained build logs. For unsigned source prevalidation only, add `-Dgpg.skip=true` and record the local dependency origin explicitly.
Passing that build does not establish RC signatures or constitute an ASF release. Staging upload and formal publication remain separate actions.

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
