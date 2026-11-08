# Completion checklist

- The change is scoped to the module that owns the behavior.
- User-visible behavior and configuration have matching documentation.
- Relevant unit, integration and downstream tests ran, or the missing environment is stated.
- Formatting, license and static checks for the changed languages pass.
- New dependencies and distribution files include required license metadata.
- Durable documentation is linked from `docs/README.md` or a module-local entry point.
- Documentation contains current contracts, not PR links, commit hashes, timestamps or review history.
- `git diff --check` and a final diff review show no accidental generated or unrelated files.

See [`../../AGENTS.md`](../../AGENTS.md) for commands and module-specific guidance.
