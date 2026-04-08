# Mermaid Live Preview — Spec

## Purpose

Give Scott a fast, low-friction way to view and verify Mermaid diagrams inside repo markdown files without creating a second source of truth.

This exists because:
- Scott thinks better with spatial trees and visual structure
- Mermaid/code-block previews are inconsistent across tools
- losing the visual layer makes it harder for Scott to validate taxonomy, orchestration trees, and system shape
- the source of truth should stay in the document, not drift into a separate unmanaged diagram app

## Elevator Pitch

View Mermaid diagrams directly from the source markdown file.

The core value is not just previewing:
- launch quickly from context
- verify structure on a wide visual surface
- keep the markdown block as the only source of truth

If this lands cleanly, it is not just an internal helper. It is a real open-source-worthy tool because this should already exist.

## Core Problem

Right now the workflow is bad:
- an agent writes a Mermaid block in markdown
- the current previewer may not render it
- exporting separate SVG/PNG artifacts creates maintenance liability
- Scott cannot quickly right-click or otherwise jump from source to visual
- editing the tree becomes harder than it should be

## Product Goal

Scott should be able to take a markdown document containing a Mermaid block and quickly:
1. see the diagram rendered properly
2. understand the tree on a wide monitor
3. keep the markdown block as the single source of truth
4. optionally edit the source and immediately see the visual update

## Non-Negotiable Rule

The markdown/Mermaid source remains the source of truth.

The tool may render, preview, inspect, or lightly edit that source.
It should not create a second authoritative diagram artifact that agents forget to update.

## V1 Job

Minimal successful version:
- open a markdown file or Mermaid block from the source editor
- render the Mermaid visually
- make the preview the dominant surface
- allow markdown edits while immediately re-rendering the visual

## Desired Workflow

Ideal simple flow:
1. Scott is in a markdown document or README, often inside VS Code
2. Scott triggers from the current file, ideally from the `mermaid` label, the fence line, or anywhere inside the block without needing to select the whole thing
3. Tool opens a preview/editor window
4. Primary focus: rendered diagram
5. Source edits stay in markdown, not in a separate editor model
6. Edits in markdown update preview in real time

Possible trigger shapes:
- VS Code context-menu action from the editor
- VS Code command palette action against the current markdown file/block
- command palette action
- standalone app that opens the current file
- browser/local helper that watches the file

Important:
- the launch gesture should work naturally from inside VS Code because that is where Scott and the agents will often already be while the markdown source is being edited
- if the markdown source changes in the editor, the visual preview should update without forcing a second manual sync step
- the same source should still remain usable later in GitHub, even if GitHub only shows the raw markdown

## V1 Scope

In scope:
- Mermaid only
- local files in repo
- one source of truth: markdown file
- fast preview
 - preview-first visual-first flow
 - markdown remains the source of truth

Out of scope for V1:
- multi-user collaboration
- full whiteboard replacement
- Figma/FigJam sync
- graph databases
- arbitrary diagram formats
- second memory/state system
- freeform drag-to-rearrange editing

## UX Requirements

- Scott works on a 49-inch ultrawide that effectively behaves like three screens. The tool should take advantage of wide layout so hierarchy and branching stay legible instead of collapsing into a cramped single-column view.
- must work well on a wide monitor
- must make hierarchy/tree shape easier to follow than raw markdown
- must be very low friction to open
- must not hide where the real source lives
- should preserve enough whitespace/layout that complex trees are readable

## Technical Requirements

- read markdown file
- detect Mermaid blocks
- render Mermaid reliably
- optionally isolate a selected block
- edit source without inventing another storage format
- save back to the markdown document cleanly

## Architecture Direction

Strong default:
- lightweight local tool
- markdown file in, markdown file out
- no separate database
- no second source of truth
- no remote dependence required for normal use

Likely implementation shape:
- small local web app or desktop wrapper
- Mermaid renderer in browser/webview
- file open / file save against repo markdown

## Questions To Answer Before Build

1. Does an existing local tool already do this well enough?
2. Should this be:
   - a Codex/Claude helper tool
   - a tiny standalone local app
   - a VS Code extension
   - a browser/local preview helper
3. Is block-selection required in V1, or is file-level open enough?
4. Does Scott need drag/reposition editing, or is source-edit + live preview sufficient at first?

## Success Criteria

The tool is successful if:
- Scott can quickly understand a complex tree that currently feels muddy in raw markdown
- agents can keep using markdown as source of truth
- diagrams stop creating SVG/PNG maintenance liability
- visual review becomes easy enough that taxonomy and system maps stay aligned more often

## Current Recommendation

Build this as a small internal infra tool if an existing option is not already clean enough.

But do it as:
- markdown source of truth
- local preview/editor
- no second authority

Not as:
- a separate diagram product
- a whiteboard replacement
- an artifact generator that agents forget to update

## Recommended V1

Build V1 as a **VS Code extension with a local webview preview/editor**.

Why this is the right first move:
- Scott and the agents are already inside VS Code when the markdown source is being edited
- the launch gesture can be low-friction: right-click, command palette, or current-file action
- the markdown file stays the source of truth
- a webview gives us reliable Mermaid rendering without creating a second artifact
- it avoids the extra lifecycle and maintenance burden of a standalone desktop app too early

Recommended V1 behavior:
1. Scott places the cursor on the `mermaid` label, the fence line, or anywhere inside a Mermaid fenced block
2. command: `Open Mermaid Preview`
3. extension opens a preview/editor window
4. the rendered diagram gets the majority of the space
5. source edits in markdown stay the editing surface
6. editing in the markdown file updates the preview live
7. if the source block changes in the editor, the preview updates

Recommended V1 commands:
- `Open Mermaid Preview`
- `Open Mermaid Block Under Cursor`
- `Refresh Mermaid Preview`
- `Reveal Block in Markdown`

Recommended V1 scope decisions:
- file-backed only
- one Mermaid block at a time
- markdown edit plus live preview
- prefer editing in the markdown file itself
- no drag-to-rearrange in V1
- no separate SVG/PNG outputs by default
- no second storage layer

Why not a standalone app first:
- too much extra surface area for launch, file targeting, and sync
- weaker "right here in the editor" workflow
- more opportunity for source-of-truth drift

Why not a browser/local helper first:
- weaker integration with the editor where the source actually lives
- more awkward launch flow
- less natural saveback

Future extensions if V1 works:
- navigate between multiple Mermaid blocks in one file
- side-by-side block list / outline
- open from GitHub-cloned file paths automatically
- optional wider layout presets for Scott's ultrawide monitor
- V2 exploration: direct manipulation of nodes and edges, with changes translated back into Mermaid source in real time

## Status

Current canonical implementation:
- `https://github.com/Scottpedia0/mermaid-live-preview/tree/main/cloud-pass-3`
- matching docs: `https://github.com/Scottpedia0/mermaid-live-preview/tree/main/cloud-pass-3/README.md`

Legacy variants are archived for context:
- `https://github.com/Scottpedia0/mermaid-live-preview/tree/main/archive/extension`
- `https://github.com/Scottpedia0/mermaid-live-preview/tree/main/archive/cloud-pass-2`

This spec should be treated as live operational truth for V1 behavior.
