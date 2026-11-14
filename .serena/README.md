# Serena project context

This directory is a small navigation cache for coding agents. It must remain subordinate to [`../AGENTS.md`](../AGENTS.md), the [documentation index](../docs/README.md), module READMEs and executable build configuration.

## Read order

1. Root `AGENTS.md` for cross-module dependencies, validation and documentation rules.
2. `docs/README.md` for the authoritative document map.
3. The nearest module README or module-specific agent guidance.
4. A memory below only for a quick search map.

## Memories

- [README_INDEX.md](memories/README_INDEX.md): memory map and maintenance boundary.
- [project_overview.md](memories/project_overview.md): stable module purpose and relationships.
- [architecture_and_design_patterns.md](memories/architecture_and_design_patterns.md): high-level ownership and extension points.
- [code_style_and_conventions.md](memories/code_style_and_conventions.md): links to executable style sources.
- [common_development_workflows.md](memories/common_development_workflows.md): short task-to-command map.
- [testing_infrastructure.md](memories/testing_infrastructure.md): test ownership and selection.
- [task_completion_checklist.md](memories/task_completion_checklist.md): concise pre-push checks.

Do not store release versions, timestamps, PR links, commit hashes, copied CI inventories or long procedures here. Update or remove a memory when its paths or ownership change.
