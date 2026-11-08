# Code style and conventions

Executable configuration is authoritative:

- General formatting: [`../../.editorconfig`](../../.editorconfig)
- Java checks: `tools/checkstyle.xml` and Maven plugin configuration
- License headers: [`../../.licenserc.yaml`](../../.licenserc.yaml) and `tools/check-license-header.sh`
- Module language tooling: the nearest POM, frontend package configuration, Go tooling or module README

Repository-wide defaults include 4-space Java indentation, no star imports and a 120-character Java limit. Markdown paragraphs should remain logical lines and be wrapped only near 160 characters when necessary for review.

Do not maintain copied dependency versions, formatter versions or exhaustive naming examples here. Link a missing rule to executable configuration or add it there when enforcement is required.
