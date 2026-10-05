# Continuous integration

Every PR runs license checks and `Required CI`. The stable
`affected-module-tests` check requires all selected Linux tests to pass; a failed,
cancelled or unexpectedly skipped module cannot satisfy it.

| Change | Tests |
| --- | --- |
| Java Client | Client, Loader, Tools, Spark, Hubble |
| Loader | Loader, Hubble |
| Tools, Spark, Go or Hubble | The affected module |
| Shared build inputs or unrecognized paths | All modules |
| One workflow | Its tests and shared dependencies |

Loader's HDFS tests run separately, so other profiles do not wait for Hadoop.
Client, Loader, Tools, Spark and Go share one verified Server package, but each
starts its own service. Hubble retains its Server master baseline. Package reuse
checks source, commit, JDK, build configuration and archive checksum.

Documentation paths use an explicit allowlist. A documentation-only update may
reuse a successful receipt from the same PR only when the base, non-document
inputs and CI policy match. The latest commit receives a new gate result that
identifies reused tests. Missing or unverifiable evidence runs the tests again;
source, type definitions, tests and CI configuration are never treated as docs.

CodeQL follows the module gate and retains its weekly scan. During migration,
`Analyze (java)` still runs on every PR. After ASF branch protection actually
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
