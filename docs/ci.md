# Continuous integration

Only `check-license-header` (headers and RAT) is required for merging. Execution selection remains conservative: changed modules and their consumers run, but their results are advisory. Maintainers decide whether to rerun or request changes.

The independent workflows are:

| Workflow | Purpose | Required | Cancellation |
| --- | --- | --- | --- |
| license checker | Basic license checks | Yes | Cancelling it blocks merging |
| Module validation | Consumers, images, fixtures and dependency inventory audit | No | Can be cancelled without cancelling license checks or CodeQL |
| CodeQL | Affected-input scans and dependency review; weekly full scan | No | Independent of module tests |

`affected-module-tests` remains a truthful advisory summary under its existing name for migration. It fails when a selected test, image or fixture fails, is cancelled or unexpectedly skipped; it does not make these checks required. Plan and result summaries show specific checks, triggering paths, required roles and actual results. Native job checks provide the detailed logs.

| Change | Tests |
| --- | --- |
| Java Client | Client, Loader, Tools, Spark, Hubble |
| Loader | Loader, Hubble |
| Shared Client Server checkout/install/start scripts | Client downstreams and Go |
| Tools, Spark, Go or Hubble | The affected module |
| Shared build inputs or unrecognized paths | All modules |
| One workflow | Its tests and shared dependencies |

Image selection has its own matrix and does not follow the Client → Loader → Hubble module-test dependency closure:

| Image input change | Images built and started |
| --- | --- |
| Loader Dockerfile | Loader |
| Hubble Dockerfile | Hubble |
| Loader POM, assembly descriptor/static files or packaged README/LICENSE/NOTICE | Loader and Hubble |
| Hubble POMs, assembly descriptor/static files, distribution checker, backend startup properties or frontend build configuration | Hubble |
| Root/Client/reactor POMs, `.mvn`, `.dockerignore`, shared release docs or unknown shared inputs | Loader and Hubble |
| Ordinary Java/frontend application source or tests | None; the module behavior tests above still run |

Dockerfile-only changes run the image check without building Server fixtures. Hubble's Dockerfile builds Client and Loader before Hubble, so Loader packaging changes also select Hubble. Packaged README changes select images; the existing nonempty Hubble README content contract still requires fresh validation if the file is missing, empty or has an invalid mode. Every selected module and image runs in the current workflow; successful results from another run are not reused.

Each image job builds the checkout's actual Dockerfile, records its image ID and starts a local run-scoped tag with pulling disabled. The container's image ID must match the build. Loader directly executes `./bin/hugegraph-loader.sh --help`, including its executable permission and shebang; its default idle container alone cannot pass. Hubble must remain running and return a valid `/about` JSON response with the application name and version. Its public root page must contain the React root and serve nonempty local JavaScript bundles and referenced stylesheets with the correct content types, rejecting the HTML fallback for missing assets. These checks validate image build, packaging, startup and public entry points; Loader data ingestion and Hubble browser workflows remain covered by module tests. They do not publish an image.

Selected Client, Loader, Tools, Spark and Hubble tests compile and run on Java 17, including Loader's separate HDFS jobs. Java module tests compile against SDK 1.8.0; Client, Loader, Tools, Hubble and Spark Connector test both current Server 1.8 and official Server 1.7. Go Client runs the same Server matrix without installing the Java SDK; these runtime checks supplement affected-module selection without adding unrelated modules. Their results remain advisory.

The historical Server 1.7 fixture uses the official ASF 1.7.0 binary archive with a pinned official SHA-512 and runs on its own Java 11 JVM. Downloads fail without a source-build fallback. The locked current Server uses SDK 1.8.0, Java 17 and TinkerPop 3.8.1. CI locks the complete immutable source commit `68855199031d5801edb4fe41b2bacbacffe8fe68`, so later master updates do not change the build inputs. The SDK action, CI fixtures, image defaults and packaging verifier use the same locked source commit.

The official release archive is downloaded once and cached; the current Server fixture shared by Hubble and Go is built once, with independent services per job. Reuse verifies source, commit, JDK, build inputs and archive checksum. Client, Loader, Tools and Spark candidate tests start the archive already produced by their SDK bootstrap. Same-source SDK generation remains job-local and retains complete source-install and artifact-hash evidence; release/staging checks use their own isolated Maven repository without a candidate manifest. The bootstrap flattens CI-friendly POM versions before installation, including the root parent, so dependency and license metadata readers consume concrete coordinates without changing the locked source POMs. The service JVM is scoped to startup; Toolchain compilation and tests remain on Java 17.

The shared Java initialization action requires Maven 3.9 or newer and supplies explicit settings through `MAVEN_ARGS`, preserving existing arguments and user settings. Dependencies are resolved from Central before ASF Stage, with Stage snapshots disabled; build plugins use the standard public repositories. Maven cache keys include repository settings and SDK preparation inputs. Only third-party dependencies seed the isolated SDK repository; cached HugeGraph artifacts are discarded, and Hubble reuses the shared Maven cache without a second overlapping cache.

Loader validates its existing profiles against both configured Server baselines. The Ubuntu HDFS jobs use the ASF Hadoop 3.3.6 image pinned by digest, with separate NameNode and DataNode containers on the host network. Tests run on Java 17 and use `localhost:8020`. Startup checks live DataNode registration and a real block write/read before testing; containers are removed afterward. Image pulling and readiness are bounded. Cold runners still need to pull the image.

The immutable Server packages, `ci-plan` and `ci-test-results` diagnostic artifacts are retained for seven days from their upload. Partial reruns need the original plan and fixture within that window. After an artifact expires, rerun the whole workflow to rebuild its plan and fixtures; extending only the result report cannot restore an expired package. Test reports and coverage artifacts keep their existing retention settings.

Documentation paths use an explicit allowlist. A PR containing only plain prose and static documentation assets has no module tests. Selection uses the cumulative PR diff, so a documentation update to a PR that also changes source runs its selected consumers again. Source, type definitions, tests and CI configuration are never treated as docs. The gate checks the current workflow's actual selected job results and fixture producers. Its result report records the run, attempt and input metadata for diagnostics; it is not a reusable success receipt. The planner determines affected consumers before resolving external Server inputs. Plans that require Server fixtures record the historical release and locked candidate source; Go-only module tests resolve and consume both the historical release and current Server fixtures. Image-only and plain documentation plans need neither baseline. Unverifiable selection conservatively resolves both. A failed selected baseline lookup fails planning; without a published plan, recovery requires a full workflow rerun.

PR planning records the event's head, base and source before querying live metadata. A known mismatch with the checkout merge, current head or source fails planning. The report records the actual tested base and merge; advancing master alone does not invalidate a completed result, consistent with non-strict branch protection. Unknown selection falls back to full validation. No cross-run success is reused.

CodeQL starts independently on affected PR and push inputs, with its original analysis identity and weekly full scan. Java, frontend and Python changes select their supported scan language; shared/unknown build inputs keep all three languages. Go-only and image-only changes do not start unrelated source scans. Manual and weekly runs scan all three languages. Plain prose-only PRs skip compilation, fixtures, images and scanning; native workflows retain lightweight selection jobs. Packaged README files and shared build/configuration inputs are not plain prose. The `CI_OPTIMIZED_REQUIRED` variable is no longer needed.

The dependency inventory audit includes root `.mvn/**`, POMs, dependency manifests, assembly/license inputs and staged Maven settings. It runs from the repository root with the same root Maven configuration, separately from the required license check.

For rollout, `.asf.yaml` requests only `check-license-header`. Confirm actual branch protection has reconciled before relying on advisory cancellation. The existing module summary remains available during migration. `Analyze (java)` runs for Java or shared/unknown build inputs, and for manual and weekly full scans; it is not emitted for every PR. Old required names must not remain permanently Expected.

A new PR head cancels older first attempts. Reruns use separate concurrency groups, so retrying an old commit cannot cancel the current head. Automatic retries run failed **push** license jobs only at most twice, checking the repository branch head and unchanged completed-failure run attempt both before and after the 180-second delay. Retry code comes from the trusted default branch. PR automatic retries and cross-run success reuse are deferred until execution evidence can be verified independently; manual workflow reruns remain available.

The parent-metadata Maven regression runs once in the selected shared fixture for Java consumer validation, using a temporary Maven repository. Documentation and Go-only PRs keep the lightweight planner; the manual fixture workflow also runs this regression.

Validate policy and retry behavior locally:

```bash
python3 -m unittest discover -s .github/scripts -p 'test_*.py'
actionlint
```

Upstream compatibility runs daily and on demand against the latest ASF master, resolved once to an immutable commit for each run. It reuses the SDK build, core compilation, Client HTTP tests, Loader and Hubble backend unit tests, and Tools functional tests; Hadoop, Spark/Flink engine matrices and frontend browser tests remain in module CI. This independent check does not change the locked Module validation baseline.

The floating upstream check selects `hugegraph.version` from the verified SDK manifest for every consumer build and test. The same version is passed to SDK packaging verification through `CANDIDATE_SDK_VERSION`; provenance, local-install and artifact-hash checks remain enforced. This lets Server master advance its Maven version without accidentally testing a released SDK. Fixed-baseline jobs retain their default SDK version.
