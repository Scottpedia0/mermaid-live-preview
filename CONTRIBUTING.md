# Contributing

Thank you for helping improve Mermaid Live Preview.

## Development setup

1. Open `cloud-pass-3/` in a terminal.
2. Run `npm install`.
3. Run `npm run build`.
4. Open the folder in VS Code and press `F5`.

## Canonical implementation path

Only `cloud-pass-3/` is actively maintained.  
`archive/extension/` and `archive/cloud-pass-2/` are reference history only.

## Scope

- Keep Markdown as the single source of truth.
- Preserve preview-first flow and `Reveal Block in Markdown` behavior.
- Avoid reintroducing in-webview source editing as the primary path.

## Pull request guidance

- Keep changes focused and small.
- Update matching docs when behavior changes.
- Include reproduction steps for user-visible behavior changes.
