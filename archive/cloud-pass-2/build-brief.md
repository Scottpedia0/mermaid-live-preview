You are a bounded external generalist working in a clean cloud workspace.

Build a minimal VS Code extension MVP for the Diagram Preview Tool.

Goal:
- Scott right-clicks or triggers from a Mermaid block in markdown
- a preview/editor opens beside the markdown editor
- source remains the only source of truth
- apply writes back to the original fenced Mermaid block

Constraints:
- build only V1
- no SVG or PNG artifacts
- no standalone app
- no drag editing
- one Mermaid block at a time
- keep it clean and installable

Implementation target:
- scaffold the extension files directly in this workspace
- include package.json, src files, tsconfig if needed, and minimal webview assets
- prefer TypeScript or plain JS, whichever gets to a cleaner MVP faster
- include a short README with install/test steps

Important:
- Do not ask questions
- Do not overdesign
- Ship the smallest real thing that can be installed locally and tested by Scott
