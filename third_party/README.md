# third_party

Vendored dependencies go here only when there is a clear reason not to use the normal package manager.

Rules:

- Do not vendor AGPL dependencies.
- Record upstream URL, commit/version, license, and local changes for every vendored item.
- Prefer permissive licenses for runtime code.
- Flag GPL-family licenses before adding them.
- Keep generated or downloaded artifacts out of this directory unless they are intentionally vendored.

No third-party code is currently vendored.

Local tool installs such as `third_party/fstar-z3/` are ignored by git unless we explicitly decide to vendor them with license/version notes.
