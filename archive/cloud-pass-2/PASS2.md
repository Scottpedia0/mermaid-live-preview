## PASS 2

- shifted the webview to a preview-first layout so the rendered diagram dominates the panel by default
- hid the in-panel source editor on load and added a `Show Source` toggle for optional quick edits
- made Mermaid block lookup more forgiving so opening works from the fence line, inside the block, across a selection, or a few nearby lines away
- kept Markdown as the single source of truth; Markdown edits still live-sync into the preview and in-panel edits only write back through `Apply to Markdown`
- rebuilt the extension after the changes to confirm the updated TypeScript compiles cleanly
