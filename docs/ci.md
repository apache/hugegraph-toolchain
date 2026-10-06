# Continuous integration

Every PR runs license checks and `Required CI`. The stable
`affected-module-tests` check requires all selected Linux tests and image startup
checks to pass; a failed, cancelled or unexpectedly skipped selected job cannot
satisfy it.

| Change | Tests |
| --- | --- |
| Java Client | Client, Loader, Tools, Spark, Hubble |
| Loader | Loader, Hubble |
| Shared Client Server checkout/install/start scripts | Client downstreams and Go |
| Tools, Spark, Go or Hubble | The affected module |
| Shared build inputs or unrecognized paths | All modules |
| One workflow | Its tests and shared dependencies |

Image selection has its own matrix and does not follow the Client → Loader →
Hubble module-test dependency closure:

| Image input change | Images built and started |
| --- | --- |
| Loader Dockerfile | Loader |
| Hubble Dockerfile | Hubble |
| Loader POM, assembly descriptor/static files or packaged README/LICENSE/NOTICE | Loader and Hubble |
| Hubble POMs, assembly descriptor/static files, distribution checker, backend startup properties or frontend build configuration | Hubble |
| Root/Client/reactor POMs, `.mvn`, `.dockerignore`, shared release docs or unknown shared inputs | Loader and Hubble |
| Ordinary Java/frontend application source or tests | None; the module behavior tests above still run |

Dockerfile-only changes run the image check without building Server fixtures.
Hubble's Dockerfile builds Client and Loader before Hubble, so Loader packaging
changes also select Hubble. Packaged README changes select images; the existing
nonempty Hubble README content contract still requires fresh validation if the
file is missing, empty or has an invalid mode. Every selected module and image
runs in the current workflow; successful results from another run are not reused.

Each image job builds the checkout's actual Dockerfile, records its image ID and
starts a local run-scoped tag with pulling disabled. The container's image ID must
match the build. Loader directly executes `./bin/hugegraph-loader.sh --help`,
including its executable permission and shebang; its default idle
container alone cannot pass. Hubble must remain running and return a valid `/about`
JSON response with the application name and version. Its public root page must
contain the React root and serve nonempty local JavaScript bundles and referenced
stylesheets with the correct content types, rejecting the HTML fallback for missing
assets. These checks validate image build, packaging, startup and public entry
points; Loader data ingestion and Hubble browser workflows remain covered by
module tests. They do not publish an image.

Selected Client, Loader, Tools and Spark module tests compile and run on Java 11
and Java 17. Both matrix entries must pass, including Loader's separate HDFS tests.
Hubble compiles and runs on Java 17, matching its merged Boot 3 runtime requirement,
and tests against each Server baseline. These runtime checks supplement the
existing affected-module selection; unrelated modules are not added.
Client, Loader, Tools, Spark and Go test the released Server 1.7
fixture on Java 11. Hubble tests both this release and the current Server master
snapshot on Java 17; the resolved commit stays fixed while the run is queued.

Each Server package is built once and shared, with independent services per job.
Reuse verifies source, commit, JDK, build inputs and archive checksum. The Server
JVM is scoped to service startup, so Toolchain compilation and tests keep their
selected Java 11 or Java 17 runtime. Both Toolchain lanes reuse the same release
Server fixture; Hubble uses the separate Java 17 current Server fixture.
Loader's HDFS tests run separately, so other profiles do not wait for Hadoop.
The immutable Server packages, `ci-plan` and successful `ci-test-results` artifacts
are retained for seven days from their upload. Partial reruns need the original
plan and fixture within that window. After an artifact expires, rerun the whole
workflow to rebuild its plan and fixtures; extending only the result report cannot
restore an expired package. Test reports and coverage artifacts keep their
existing retention settings.

Documentation paths use an explicit allowlist. A PR containing only plain prose
and static documentation assets has no module tests. Selection uses the cumulative
PR diff, so a documentation update to a PR that also changes source runs its
selected consumers again. Source, type definitions, tests and CI configuration
are never treated as docs. The gate checks the current workflow's actual selected
job results and fixture producers. Its result report records the run, attempt and
input metadata for diagnostics; it is not a reusable success receipt.
The planner determines affected consumers before resolving external Server inputs.
Go-only changes resolve the release fixture but skip the Hubble master lookup;
image-only and plain documentation changes need neither baseline. Unverifiable
selection conservatively resolves both. A failed required baseline lookup still
fails planning; without a published plan, recovery requires a full workflow rerun.

PR planning records the event's head, base and source before querying live metadata.
A known mismatch with the checkout merge or current PR fails planning; expanding
coverage cannot make an outdated checkout current. After all selected jobs and
fixtures succeed, the gate rechecks the open PR's head, base and source using a
read-only API request. Changed inputs or unavailable metadata fail the gate.
Refresh the branch and start a new PR event after head or base movement: GitHub
reruns retain the original commit and event, so rerunning alone cannot refresh the
base. An unknown API or selection failure falls back to full coverage; a manual
full rerun can recover a transient failure while the recorded inputs remain current.

CodeQL follows the module gate and retains its weekly scan. During migration,
`Analyze (java)` still runs on every PR, after a successful module gate.
The legacy alias is PR-only; documentation pushes do not force scanning or fail
because a deliberately unselected scan was skipped. Scan write permissions are
limited to the security job. After ASF branch protection actually
requires `check-license-header` and `affected-module-tests`, an administrator can
set `CI_OPTIMIZED_REQUIRED=true` to skip security scans for documentation-only
changes. This switch is disabled by default and does not alter branch protection.

A new PR head cancels older first attempts. Reruns use separate concurrency groups,
so retrying an old commit cannot cancel the current head. Automatic retries run
failed **push** jobs at most twice, checking the repository branch head and
unchanged completed-failure run attempt both before and after the 180-second delay.
Retry code comes from the trusted default branch. PR automatic retries and
cross-run success reuse are deferred until execution evidence can be verified
independently; manual workflow reruns remain available.

Validate policy and retry behavior locally:

```bash
python3 -m unittest discover -s .github/scripts -p 'test_*.py'
actionlint
```
