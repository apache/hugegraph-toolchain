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
nonempty Hubble README content contract still permits reuse of module tests.
Once an image is selected, its proof binds the complete current source inputs,
including application source and packaged README content, plus the checked base
and CI policy. An old or missing image proof reruns that image while independently
verified module proofs remain reusable.

Each image job builds the checkout's actual Dockerfile, records its image ID and
starts a local run-scoped tag with pulling disabled. The container's image ID must
match the build. Loader explicitly runs its CLI with `--help`; its default idle
container alone cannot pass. Hubble must remain running and return a valid `/about`
JSON response with the application name and version. These checks validate image
build, packaging and startup; Loader data ingestion and Hubble browser workflows
remain covered by module tests. They do not publish an image.

Toolchain compilation and tests use Java 17 without changing application
dependencies. This matrix validates Toolchain on Java 17; it does not retain
a Toolchain Java 11 runtime lane. The historical Server Java 11 fixture validates
client/server compatibility, not Toolchain execution on Java 11.
Client, Loader, Tools, Spark and Go test the released Server 1.7
fixture on Java 11. Hubble tests both this release and the current Server master
snapshot on Java 17; the resolved commit stays fixed while the run is queued.

Each Server package is built once and shared, with independent services per job.
Reuse verifies source, commit, JDK, build inputs and archive checksum. The Server
JVM is scoped to service startup, so Toolchain compilation keeps Java 17.
Loader's HDFS tests run separately, so other profiles do not wait for Hadoop.
The immutable Server packages, `ci-plan` and successful `ci-test-receipt` artifacts
are retained for seven days from their upload. Partial reruns need the original
plan and fixture within that window. After an artifact expires, rerun the whole
workflow to rebuild its plan and fixtures; extending only the receipt cannot
restore an expired package. Test reports and coverage artifacts keep their
existing retention settings.

Documentation paths use an explicit allowlist. A documentation-only update may
reuse a successful receipt from the same PR only when the base, non-document
inputs and CI policy match. The latest commit receives a new gate result that
identifies reused tests. Missing or unverifiable evidence runs the tests again;
source, type definitions, tests and CI configuration are never treated as docs.
Hubble's packaged README must remain a regular, nonempty file; deletion, invalid
mode or empty content forces fresh validation. Receipt searches filter by PR
branch and use bounded pagination. The current Server input only affects reuse
when Hubble is selected.
For consecutive documentation updates, optional-check proofs retain their original
run and exact job identities and are reverified before forwarding. A newer failed
check or unverifiable evidence prevents reuse of an older optional success.

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
failed jobs at most twice, checking the open PR/current branch and unchanged run
attempt both before and after the 180-second delay. A moved base or missing
immutable plan also prevents an obsolete retry. Retry code comes from the trusted
default branch.

Validate policy and retry behavior locally:

```bash
python3 -m unittest discover -s .github/scripts -p 'test_*.py'
actionlint
```
