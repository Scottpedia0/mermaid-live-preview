# Completion

Built a runnable VS Code extension MVP in this workspace for Mermaid-in-Markdown preview in VS Code.

- scaffolded a TypeScript extension with `package.json`, `tsconfig.json`, and build output target
- added commands and a Markdown editor context-menu action for opening a Mermaid block under the cursor
- implemented a preview-first webview with live rendering, refresh, and reveal-in-Markdown flow
- kept the Markdown fenced block as the only persisted source of truth
- included local install and test steps in `README.md`
