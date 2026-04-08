# Mermaid Live Preview AI

![Mermaid live preview in VS Code (5:32 PM)](../assets/mermaid-live-preview-loop.png)

## What this does

This extension renders Mermaid diagrams from Markdown files as live visual previews inside VS Code. While you edit the Mermaid block in your Markdown file, the rendered diagram updates in real time. You never leave the Markdown file. The diagram and the text stay side by side.

Right-click a Mermaid block, the preview opens, you edit the Markdown, the diagram shifts to match. When you need to jump back to a specific block in the source, you can do that from the preview.

## Why it exists

Agents and humans both work in Markdown. When workflows, routing logic, or decision trees live as Mermaid blocks inside shared Markdown files, agents read and edit the text directly. But humans need to see the diagram rendered to verify it's correct.

Without a visual preview, the only way to QA a workflow defined in Mermaid is to read the raw syntax and trace the logic in your head. That works for small diagrams. It stops working when you have multiple files with complex branching logic that agents are actually executing.

This extension closes that gap. The agent works with the text. The human sees the picture. Both are looking at the same file. The human never has to leave the shared Markdown to do QA, and the diagram updates live as the text changes.

## The trade-off

Mermaid syntax costs slightly more tokens than a plain bullet list would. A large diagram might add 1,000-2,000 tokens. In conversations running against 100k-1M token context windows, this is negligible.

What you get in return: a single source of truth that both agents and humans can read, edit, review, and confirm -- in the format that works for each of them. The Markdown stays versionable, reviewable, and searchable in git. The diagram stays visual for the human doing QA.

## When this matters most

When you have agent configurations, automation rules, or workflow definitions living in Markdown files and you need to verify that the logic is correct before it runs. The more workflows you manage, the more you need a fast way to visually confirm what's actually defined.

## Using this with AI agents

To get your agent producing visual workflows alongside text descriptions, add something like this to your system prompt, CLAUDE.md, AGENTS.md, or equivalent:

```
When a document describes a process, workflow, routing logic, or decision tree,
include a Mermaid diagram in the Markdown that reflects the same logic.

Place the Mermaid block near the section it describes.

The diagram and the surrounding text should reflect the same thing.
The text is the authoritative description. The diagram is the visual
confirmation of that description. Keep them in sync.

The diagram can simplify for readability -- not every edge case needs
a node -- but it should not contradict the text.
```

## Commands

- **Open Mermaid Preview** -- opens preview for the file
- **Open Mermaid Block Under Cursor** -- opens the nearest Mermaid block to your cursor
- **Reveal Block in Markdown** -- jumps from the preview back to the source block

The editor context menu includes **Open Mermaid Block Under Cursor** when a Markdown file is active.

## Install

1. Open Extensions in VS Code (`Cmd/Ctrl+Shift+X`).
2. Search for **Mermaid Live Preview AI** and install it.
3. Open a Markdown file containing a Mermaid block.
4. Place your cursor inside or near the block and run **Open Mermaid Block Under Cursor** from the command palette or right-click menu.

## What this is not

This is not a diagramming app. You do not draw diagrams in this tool. You write Markdown, Mermaid blocks render live, and you confirm the logic visually. The Markdown is the authoring surface. The preview is the QA surface.
