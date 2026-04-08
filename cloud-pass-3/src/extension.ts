import * as vscode from 'vscode';

type MermaidBlock = {
  startLine: number;
  endLine: number;
  contentStartLine: number;
  contentEndLine: number;
  source: string;
};

type PreviewSession = {
  panel: vscode.WebviewPanel;
  editor: vscode.TextEditor;
  document: vscode.TextDocument;
  block: MermaidBlock;
  documentSubscription?: vscode.Disposable;
};

const DEFAULT_NEARBY_LINE_DISTANCE = 6;

const sessions = new Map<string, PreviewSession>();
let activeSessionKey: string | undefined;

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('diagramPreview.openMermaidPreview', () => {
      void openPreviewFromActiveEditor();
    }),
    vscode.commands.registerCommand('diagramPreview.openMermaidBlockUnderCursor', () => {
      void openPreviewFromActiveEditor();
    }),
    vscode.commands.registerCommand('diagramPreview.revealBlockInMarkdown', () => {
      void revealActiveSession();
    })
  );
}

export function deactivate(): void {
  for (const session of sessions.values()) {
    session.documentSubscription?.dispose();
    session.panel.dispose();
  }
  sessions.clear();
}

async function openPreviewFromActiveEditor(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'markdown') {
    void vscode.window.showErrorMessage('Open a Markdown editor with a Mermaid fenced block first.');
    return;
  }

  const block = findBestMermaidBlockForSelection(editor.document, editor.selection);
  if (!block) {
    void vscode.window.showErrorMessage('No nearby Mermaid fenced block found from the current cursor position.');
    return;
  }

  const key = createSessionKey(editor.document.uri, block.startLine, block.endLine);
  const existing = sessions.get(key);
  if (existing) {
    activeSessionKey = key;
    existing.editor = editor;
    existing.document = editor.document;
    existing.block = block;
    existing.panel.reveal(vscode.ViewColumn.Beside);
    postState(existing, 'Preview refreshed from Markdown.');
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    'diagramPreview.mermaidPreview',
    buildPanelTitle(editor.document, block),
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      retainContextWhenHidden: true
    }
  );

  const session: PreviewSession = {
    panel,
    editor,
    document: editor.document,
    block
  };

  sessions.set(key, session);
  activeSessionKey = key;

  session.documentSubscription = vscode.workspace.onDidChangeTextDocument((event) => {
    void handleDocumentChange(session, event);
  });

  panel.onDidDispose(() => {
    session.documentSubscription?.dispose();
    sessions.delete(key);
    if (activeSessionKey === key) {
      activeSessionKey = undefined;
    }
  });

  panel.onDidChangeViewState((event) => {
    if (event.webviewPanel.active) {
      activeSessionKey = key;
    }
  });

  panel.webview.onDidReceiveMessage((message: { type?: string }) => {
    if (message.type === 'revealSourceBlock') {
      void revealBlockInEditor(session);
    }
  });

  panel.webview.html = getWebviewHtml(panel.webview);
  postState(session, 'Loaded Mermaid block from Markdown.');
}

async function revealActiveSession(): Promise<void> {
  const session = getActiveSession();
  if (!session) {
    void vscode.window.showInformationMessage('No active Mermaid preview to reveal.');
    return;
  }

  await revealBlockInEditor(session);
}

async function handleDocumentChange(
  session: PreviewSession,
  event: vscode.TextDocumentChangeEvent
): Promise<void> {
  if (event.document.uri.toString() !== session.document.uri.toString()) {
    return;
  }

  const refreshed = findMermaidBlockAtLine(event.document, session.block.startLine) ?? findMermaidBlockNearLine(event.document, session.block.startLine);
  if (!refreshed) {
    postState(session, 'Mermaid block was removed from the file.');
    return;
  }

  session.document = event.document;
  session.block = refreshed;
  session.panel.title = buildPanelTitle(event.document, refreshed);
  postState(session, 'Preview synced from Markdown changes.');
}

function refreshSessionFromDocument(session: PreviewSession, status: string): void {
  const refreshed = findMermaidBlockAtLine(session.document, session.block.startLine) ?? findMermaidBlockNearLine(session.document, session.block.startLine);
  if (!refreshed) {
    void vscode.window.showErrorMessage('Could not find the Mermaid block in the current document.');
    return;
  }

  session.block = refreshed;
  session.panel.title = buildPanelTitle(session.document, refreshed);
  postState(session, status);
}

async function revealBlockInEditor(session: PreviewSession): Promise<void> {
  const editor = await vscode.window.showTextDocument(session.document, session.editor.viewColumn);
  session.editor = editor;

  const selection = new vscode.Selection(
    session.block.contentStartLine,
    0,
    session.block.contentEndLine,
    session.document.lineAt(session.block.contentEndLine).text.length
  );

  editor.selection = selection;
  editor.revealRange(selection, vscode.TextEditorRevealType.InCenter);
  void vscode.window.showInformationMessage('Edit the Mermaid block in Markdown; the preview stays in sync.');
}

function getActiveSession(): PreviewSession | undefined {
  if (activeSessionKey) {
    return sessions.get(activeSessionKey);
  }

  const first = sessions.values().next();
  return first.done ? undefined : first.value;
}

function createSessionKey(uri: vscode.Uri, startLine: number, endLine: number): string {
  return `${uri.toString()}::${startLine}-${endLine}`;
}

function buildPanelTitle(document: vscode.TextDocument, block: MermaidBlock): string {
  return `Mermaid Preview: ${document.uri.path.split('/').pop() ?? document.fileName}:${block.startLine + 1}`;
}

function findMermaidBlockAtLine(document: vscode.TextDocument, line: number): MermaidBlock | undefined {
  const text = document.getText();
  const blocks = parseMermaidBlocks(text);
  return blocks.find((block) => line >= block.startLine && line <= block.endLine);
}

function findBestMermaidBlockForSelection(
  document: vscode.TextDocument,
  selection: vscode.Selection
): MermaidBlock | undefined {
  const text = document.getText();
  const blocks = parseMermaidBlocks(text);
  if (blocks.length === 0) {
    return undefined;
  }

  const directHit = blocks.find((block) =>
    rangesOverlap(selection.start.line, selection.end.line, block.startLine, block.endLine)
  );
  if (directHit) {
    return directHit;
  }

  const anchorLine = selection.active.line;
  const nearbyBlock = findClosestBlock(blocks, anchorLine);
  if (!nearbyBlock) {
    return undefined;
  }

  const distance = getDistanceToBlock(anchorLine, nearbyBlock);
  return distance <= DEFAULT_NEARBY_LINE_DISTANCE ? nearbyBlock : undefined;
}

function findMermaidBlockNearLine(document: vscode.TextDocument, line: number): MermaidBlock | undefined {
  const text = document.getText();
  const blocks = parseMermaidBlocks(text);
  if (blocks.length === 0) {
    return undefined;
  }

  return findClosestBlock(blocks, line);
}

function findClosestBlock(blocks: MermaidBlock[], line: number): MermaidBlock | undefined {
  return blocks.reduce((closest, current) => {
    const closestDistance = getDistanceToBlock(line, closest);
    const currentDistance = getDistanceToBlock(line, current);
    if (currentDistance !== closestDistance) {
      return currentDistance < closestDistance ? current : closest;
    }

    return current.startLine < closest.startLine ? current : closest;
  });
}

function getDistanceToBlock(line: number, block: MermaidBlock): number {
  if (line < block.startLine) {
    return block.startLine - line;
  }

  if (line > block.endLine) {
    return line - block.endLine;
  }

  return 0;
}

function rangesOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA <= endB && endA >= startB;
}

function parseMermaidBlocks(text: string): MermaidBlock[] {
  const lines = text.split(/\r?\n/);
  const blocks: MermaidBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const startMatch = lines[index].match(/^```\s*mermaid\s*$/i);
    if (!startMatch) {
      index += 1;
      continue;
    }

    let endLine = index + 1;
    while (endLine < lines.length && !/^```\s*$/.test(lines[endLine])) {
      endLine += 1;
    }

    if (endLine >= lines.length) {
      break;
    }

    const contentStartLine = index + 1;
    const contentEndLine = Math.max(contentStartLine, endLine - 1);
    const source = lines.slice(contentStartLine, endLine).join('\n');

    blocks.push({
      startLine: index,
      endLine,
      contentStartLine,
      contentEndLine,
      source
    });

    index = endLine + 1;
  }

  return blocks;
}

function postState(session: PreviewSession, status: string): void {
  session.panel.webview.postMessage({
    type: 'setState',
    source: session.block.source,
    status,
    fileName: session.document.uri.fsPath,
    startLine: session.block.startLine + 1
  });
}

function getWebviewHtml(webview: vscode.Webview): string {
  const nonce = getNonce();
  const csp = [
    "default-src 'none'",
    `script-src 'nonce-${nonce}' https://cdn.jsdelivr.net`,
    "style-src 'unsafe-inline'",
    "img-src https: data:",
    "font-src https:"
  ].join('; ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Mermaid Preview</title>
  <style>
    :root {
      color-scheme: var(--vscode-color-scheme);
      --bg: #ffffff;
      --surface: #ffffff;
      --surface-strong: #ffffff;
      --line: var(--vscode-panel-border, var(--vscode-contrastBorder, rgba(127, 127, 127, 0.35)));
      --text: #0f172a;
      --muted: #334155;
      --accent: var(--vscode-button-background);
      --accent-hover: var(--vscode-button-hoverBackground);
      --accent-text: var(--vscode-button-foreground);
      --secondary-bg: var(--vscode-button-secondaryBackground, var(--vscode-toolbar-hoverBackground, transparent));
      --secondary-hover: var(--vscode-button-secondaryHoverBackground, var(--vscode-toolbar-hoverBackground, transparent));
      --secondary-text: var(--vscode-button-secondaryForeground, var(--vscode-editor-foreground));
      --danger: var(--vscode-errorForeground);
      --shadow: none;
      --diagram-bg: #ffffff;
      --diagram-text: #0f172a;
      --diagram-edge: #0f172a;
      --ui-font: var(--vscode-font-family);
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      font-family: var(--ui-font);
      color: var(--diagram-text);
      background: var(--bg);
    }

    .shell {
      min-height: 100vh;
    }

    .toolbar {
      display: none;
    }

    .toolbar-actions {
      display: flex;
      gap: 6px;
      flex-wrap: nowrap;
      justify-content: flex-end;
    }

    button {
      border: 1px solid transparent;
      border-radius: 999px;
      padding: 10px 16px;
      font: inherit;
      cursor: pointer;
      transition: opacity 120ms ease, background 120ms ease;
    }

    button:hover {
      opacity: 0.96;
    }

    button.primary {
      color: var(--accent-text);
      background: var(--accent);
      box-shadow: var(--shadow);
    }

    button.primary:hover {
      background: var(--accent-hover);
    }

    button.secondary {
      color: var(--secondary-text);
      background: var(--secondary-bg);
      border-color: var(--line);
    }

    button.secondary:hover {
      background: var(--secondary-hover);
    }

    .secondary.compact {
      padding: 5px 10px;
      border-radius: 999px;
      font-size: 12px;
      line-height: 1;
    }

    .content {
      display: block;
      padding: 18px;
      min-height: 0;
    }

    .preview-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }

    .zoom-label {
      font-size: 12px;
      color: var(--muted);
      min-width: 54px;
      text-align: right;
    }

    .panel {
      min-height: 0;
      display: flex;
      flex-direction: column;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: var(--surface);
      box-shadow: var(--shadow);
      overflow: hidden;
    }

    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px;
      border-bottom: 1px solid var(--line);
      background: var(--surface-strong);
    }

    textarea {
      flex: 1;
      width: 100%;
      border: 0;
      resize: none;
      padding: 18px;
      font: 13px/1.6 var(--editor-font);
      color: var(--text);
      background: transparent;
      outline: none;
      tab-size: 2;
    }

    .preview-wrap {
      flex: 1;
      overflow: auto;
      padding: 8px;
      min-height: 0;
      background: var(--diagram-bg);
    }

    #diagramFrame {
      background: var(--diagram-bg);
      color: var(--diagram-text);
    }

    #preview {
      width: 100%;
      min-width: 0;
      min-height: 0;
      display: flex;
      align-items: flex-start;
      justify-content: center;
    }

    #preview svg {
      color: var(--diagram-text);
      background: var(--diagram-bg);
      display: block;
    }

    #diagramFrame {
      display: inline-flex;
      align-items: flex-start;
      justify-content: center;
      transform-origin: top center;
    }

    .empty,
    .error {
      padding: 18px;
      border-radius: 16px;
      background: var(--surface-strong);
      border: 1px solid var(--line);
      color: var(--muted);
    }

    .error {
      color: var(--danger);
    }

  </style>
</head>
  <body>
  <div class="shell">
    <div class="content" id="contentLayout">
      <section class="panel preview-panel">
        <div class="panel-header">
          <div class="preview-actions">
            <button class="secondary compact" id="revealButton" type="button" title="Reveal source block in Markdown">↗</button>
            <button class="secondary" id="zoomOutButton" type="button" title="Zoom out">-</button>
            <button class="secondary" id="fitButton" type="button" title="Fit diagram to preview">Fit</button>
            <button class="secondary" id="zoomInButton" type="button" title="Zoom in">+</button>
            <span class="zoom-label" id="zoomLabel">100%</span>
          </div>
        </div>
        <div class="preview-wrap">
          <div id="preview" class="empty">The diagram preview appears here.</div>
        </div>
      </section>
    </div>
  </div>

  <script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const previewEl = document.getElementById('preview');
    const revealButton = document.getElementById('revealButton');
    const zoomOutButton = document.getElementById('zoomOutButton');
    const zoomInButton = document.getElementById('zoomInButton');
    const fitButton = document.getElementById('fitButton');
    const zoomLabel = document.getElementById('zoomLabel');
    const previewWrap = document.querySelector('.preview-wrap');
    let renderToken = 0;
    let currentSource = '';
    let currentScale = 1;
    let fitScale = 1;
    let intrinsicWidth = 0;
    let intrinsicHeight = 0;
    let hasManualZoom = false;

    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      theme: 'base',
      themeVariables: {
        background: '#ffffff',
        primaryColor: '#f8fafc',
        primaryTextColor: '#0f172a',
        secondaryColor: '#dbeafe',
        lineColor: '#0f172a',
        textColor: '#0f172a',
        edgeLabelBackground: '#ffffff',
        edgeLabelColor: '#0f172a'
      },
      flowchart: { useMaxWidth: false }
    });

    revealButton.addEventListener('click', () => {
      vscode.postMessage({ type: 'revealSourceBlock' });
    });

    zoomOutButton.addEventListener('click', () => {
      if (!intrinsicWidth || !intrinsicHeight) {
        return;
      }
      hasManualZoom = true;
      setScale(currentScale * 0.85);
    });

    zoomInButton.addEventListener('click', () => {
      if (!intrinsicWidth || !intrinsicHeight) {
        return;
      }
      hasManualZoom = true;
      setScale(currentScale * 1.15);
    });

    fitButton.addEventListener('click', () => {
      if (!intrinsicWidth || !intrinsicHeight) {
        return;
      }
      hasManualZoom = false;
      setScale(getDefaultScale());
    });

    window.addEventListener('resize', () => {
      if (!intrinsicWidth || !intrinsicHeight) {
        return;
      }
      fitScale = computeFitScale();
      if (!hasManualZoom) {
        setScale(getDefaultScale());
      }
    });

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.type !== 'setState') {
        return;
      }

      currentSource = message.source || '';
      renderMermaid(currentSource);
    });

    async function renderMermaid(source) {
      const currentToken = ++renderToken;
      const trimmed = source.trim();
      if (!trimmed) {
        previewEl.className = 'empty';
        previewEl.textContent = 'Add Mermaid source to render the preview.';
        return;
      }

      try {
        const { svg } = await mermaid.render('mermaid-preview-' + currentToken, source);
        if (currentToken !== renderToken) {
          return;
        }
        previewEl.className = '';
        previewEl.innerHTML = '<div id="diagramFrame">' + svg + '</div>';
        const svgEl = previewEl.querySelector('svg');
        if (!svgEl) {
          throw new Error('Mermaid did not return an SVG.');
        }
        measureDiagram(svgEl);
        fitScale = computeFitScale();
        hasManualZoom = false;
        setScale(getDefaultScale());
      } catch (error) {
        if (currentToken !== renderToken) {
          return;
        }
        previewEl.className = 'error';
        previewEl.textContent = (error && error.message) ? error.message : String(error);
        intrinsicWidth = 0;
        intrinsicHeight = 0;
        zoomLabel.textContent = '--';
      }
    }

    function measureDiagram(svgEl) {
      const viewBox = svgEl.viewBox && svgEl.viewBox.baseVal;
      if (viewBox && viewBox.width > 0 && viewBox.height > 0) {
        intrinsicWidth = viewBox.width;
        intrinsicHeight = viewBox.height;
        return;
      }

      const width = Number(svgEl.getAttribute('width')) || svgEl.getBoundingClientRect().width || 1;
      const height = Number(svgEl.getAttribute('height')) || svgEl.getBoundingClientRect().height || 1;
      intrinsicWidth = width;
      intrinsicHeight = height;
    }

    function computeFitScale() {
      if (!intrinsicWidth || !intrinsicHeight) {
        return 1;
      }
      const availableWidth = Math.max(160, previewWrap.clientWidth - 20);
      const availableHeight = Math.max(160, previewWrap.clientHeight - 16);
      return Math.min(2, availableWidth / intrinsicWidth, availableHeight / intrinsicHeight);
    }

    function getDefaultScale() {
      return Math.max(0.25, Math.min(1.6, fitScale * 0.96));
    }

    function setScale(nextScale) {
      if (!intrinsicWidth || !intrinsicHeight) {
        return;
      }

      currentScale = Math.max(0.1, Math.min(2, nextScale));

      const frame = document.getElementById('diagramFrame');
      const svgEl = previewEl.querySelector('svg');
      if (!frame || !svgEl) {
        return;
      }

      frame.style.width = intrinsicWidth * currentScale + 'px';
      frame.style.height = intrinsicHeight * currentScale + 'px';
      svgEl.style.width = intrinsicWidth + 'px';
      svgEl.style.height = intrinsicHeight + 'px';
      svgEl.style.maxWidth = 'none';
      svgEl.style.maxHeight = 'none';
      svgEl.style.transform = 'scale(' + currentScale + ')';
      svgEl.style.transformOrigin = 'top center';
      zoomLabel.textContent = Math.round(currentScale * 100) + '%';
    }
  </script>
</body>
</html>`;
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let value = '';
  for (let index = 0; index < 16; index += 1) {
    value += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return value;
}
