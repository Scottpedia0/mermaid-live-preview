Refine the existing VS Code extension based on live user feedback.

What worked:
- Right click opening the tool worked extremely well.
- Keep the overall direction. This is a strong first pass.

Required improvements:
1. Make the diagram bigger by default.
- The preview should dominate the window.
- The source/editor pane should be much smaller by default, or collapsed by default.
- The user often wants to keep editing directly in VS Code and just see the diagram update.

2. Cut a step if possible.
- Prefer a preview-first workflow where editing in the markdown file updates the diagram live.
- Keep optional in-panel editing only if it is still useful, but do not make that the primary path.
- If keeping in-panel editing, it should not consume half the screen.

3. Improve block targeting.
- The user should not have to select the entire block.
- Opening from the line with the word mermaid / the fence line / inside the block should work reliably.
- Be forgiving: if the cursor or selection is near a Mermaid block, open the nearest relevant block.

4. Preserve simplicity.
- Do not overbuild this.
- Keep markdown as the only source of truth.
- Do not add databases or sidecar state.

Deliverables:
- Update the extension in place.
- Rebuild it successfully.
- Update README if needed.
- Write a short PASS2.md summarizing what changed.
