# Continuous integration

PR workflows cancel older runs of the same workflow and PR when a new run arrives.
Pushes, scheduled jobs and manual runs use separate concurrency groups and are not
cancelled by PR updates. The labeler applies the same rule to `pull_request_target`.

The automatic retry workflow retries failed jobs at most twice, retaining its
existing delay. Before and after the delay it checks the current run and source
through the GitHub API. Only the same completed failed attempt can be retried, with either an
open PR in this repository at the same head SHA or an unchanged push branch tip.
Closed PRs, superseded commits, changed attempts and unverifiable API responses
are skipped. The retry checker loads only trusted default-branch code.

Run its behavioral tests locally with:

```bash
python3 -m unittest discover -s .github/scripts -p 'test_*.py'
```
