# Toolchain documentation

This directory indexes cross-module documentation for HugeGraph Toolchain. User tutorials live on the [HugeGraph website](https://hugegraph.apache.org/docs/); detailed module behavior belongs in the nearest module README and source tree.

## Find the right document

| Task | Document |
|---|---|
| Choose a Toolchain component | [Root README](../README.md) |
| Understand CI selection and required checks | [ci.md](ci.md) |
| Upgrade the Java baseline or understand compatibility boundaries | [java17-migration.md](java17-migration.md) |
| Work on the Java client | [`hugegraph-client/`](../hugegraph-client/) |
| Work on Loader | [`hugegraph-loader/`](../hugegraph-loader/) |
| Work on Hubble | [`hugegraph-hubble/`](../hugegraph-hubble/) |
| Work on CLI tools | [`hugegraph-tools/`](../hugegraph-tools/) |
| Work on the Spark connector | [`hugegraph-spark-connector/`](../hugegraph-spark-connector/) |
| Work on the Go client | [`hugegraph-client-go/`](../hugegraph-client-go/) |
| Select build and test commands | [`AGENTS.md`](../AGENTS.md) and the nearest module guidance |

## Source-of-truth hierarchy

1. POMs, source code, scripts and CI workflows define current executable behavior.
2. A module README owns module installation, entry points and configuration.
3. This directory owns cross-module CI and migration guidance.
4. The website owns long-form user tutorials and released-product instructions.
5. `AGENTS.md` and `.serena/` provide concise developer and agent navigation; they must link to the sources above rather than duplicate them.

The Java client is a dependency of Loader, Hubble, Tools and the Spark connector. Cross-module documentation should describe that stable relationship and link to current build configuration instead of copying artifact versions or dependency trees.

## Writing durable documentation

- Write the current contract, supported workflow, compatibility boundary and verification result. Do not append a chronological development log.
- Do not embed pull-request links, commit hashes, temporary branches, review conclusions or onboarding timestamps in durable pages.
- Add each cross-module page to this index and each module-specific page to the nearest module README or local index. Avoid orphan documents that require repository search to discover.
- Prefer explicit module names, class names, commands, paths and expected results. This improves human navigation and LLM retrieval.
- Keep prose paragraphs as logical lines. Do not hard-wrap every sentence; wrap near 160 characters only when a source line becomes difficult to review. Preserve structure in tables, lists, code and output.
- Keep one canonical procedure. Replace repeated blocks with a short summary and a link to the owner.
- Read versions and supported modules from Maven or package configuration. Copy them into prose only when the version itself is the documented compatibility boundary.

## Documentation change checklist

1. Confirm which file owns the topic.
2. Update the smallest authoritative page and its index link.
3. Remove stale or competing copies.
4. Check relative links, headings and commands from their documented working directory.
5. Update the website when released user behavior, installation or configuration changes.
