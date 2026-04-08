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
  pendingSource: string;
  applying: boolean;
  documentSubscription?: vscode.Disposable;
};

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
    vscode.commands.registerCommand('diagramPreview.refreshMermaidPreview', () => {
      refreshActiveSession();
    }),
    vscode.commands.registerCommand('diagramPreview.applyMermaidEditsToMarkdown', () => {
      void applyActiveSession();
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

  const block = findMermaidBlockAtLine(editor.document, editor.selection.active.line);
  if (!block) {
    void vscode.window.showErrorMessage('No Mermaid fenced block found under the cursor.');
    return;
  }

  const key = createSessionKey(editor.document.uri, block.startLine, block.endLine);
  const existing = sessions.get(key);
  if (existing) {
    activeSessionKey = key;
    existing.editor = editor;
    existing.document = editor.document;
    existing.block = block;
    existing.pendingSource = block.source;
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
    block,
    pendingSource: block.source,
    applying: false
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

  panel.webview.onDidReceiveMessage((message: { type?: string; source?: string }) => {
    if (message.type === 'updateSource' && typeof message.source === 'string') {
      session.pendingSource = message.source;
    }

    if (message.type === 'applyEdits') {
      void applySession(session);
    }

    if (message.type === 'refreshFromFile') {
      refreshSessionFromDocument(session, 'Preview refreshed from Markdown.');
    }
  });

  panel.webview.html = getWebviewHtml(panel.webview);
  postState(session, 'Loaded Mermaid block from Markdown.');
}

function refreshActiveSession(): void {
  const session = getActiveSession();
  if (!session) {
    void vscode.window.showInformationMessage('No active Mermaid preview to refresh.');
    return;
  }

  refreshSessionFromDocument(session, 'Preview refreshed from Markdown.');
}

async function applyActiveSession(): Promise<void> {
  const session = getActiveSession();
  if (!session) {
    void vscode.window.showInformationMessage('No active Mermaid preview to apply.');
    return;
  }

  await applySession(session);
}

async function applySession(session: PreviewSession): Promise<void> {
  const latestBlock = findMermaidBlockAtLine(session.document, session.block.startLine);
  if (!latestBlock) {
    void vscode.window.showErrorMessage('Could not find the original Mermaid block to update.');
    return;
  }

  session.applying = true;
  const edit = new vscode.WorkspaceEdit();
  const range = new vscode.Range(
    latestBlock.contentStartLine,
    0,
    latestBlock.contentEndLine,
    session.document.lineAt(latestBlock.contentEndLine).text.length
  );

  edit.replace(session.document.uri, range, normalizeSource(session.pendingSource));
  const applied = await vscode.workspace.applyEdit(edit);
  if (!applied) {
    session.applying = false;
    void vscode.window.showErrorMessage('Failed to apply Mermaid edits to Markdown.');
    return;
  }

  await session.document.save();
  session.applying = false;
  refreshSessionFromDocument(session, 'Applied Mermaid edits to Markdown.');
}

async function handleDocumentChange(
  session: PreviewSession,
  event: vscode.TextDocumentChangeEvent
): Promise<void> {
  if (session.applying || event.document.uri.toString() !== session.document.uri.toString()) {
    return;
  }

  const refreshed = findMermaidBlockAtLine(event.document, session.block.startLine) ?? findMermaidBlockNearLine(event.document, session.block.startLine);
  if (!refreshed) {
    postState(session, 'Mermaid block was removed from the file.');
    return;
  }

  session.document = event.document;
  session.block = refreshed;
  session.pendingSource = refreshed.source;
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
  session.pendingSource = refreshed.source;
  session.panel.title = buildPanelTitle(session.document, refreshed);
  postState(session, status);
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

function findMermaidBlockNearLine(document: vscode.TextDocument, line: number): MermaidBlock | undefined {
  const text = document.getText();
  const blocks = parseMermaidBlocks(text);
  if (blocks.length === 0) {
    return undefined;
  }

  return blocks.reduce((closest, current) => {
    const closestDistance = Math.abs(closest.startLine - line);
    const currentDistance = Math.abs(current.startLine - line);
    return currentDistance < closestDistance ? current : closest;
  });
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

function normalizeSource(source: string): string {
  return source.replace(/\r\n/g, '\n');
}

function postState(session: PreviewSession, status: string): void {
  session.panel.webview.postMessage({
    type: 'setState',
    source: session.pendingSource,
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
      color-scheme: light dark;
      --bg: #f4f1ea;
      --surface: rgba(255, 252, 247, 0.9);
      --surface-strong: rgba(249, 244, 235, 0.98);
      --line: rgba(92, 71, 45, 0.16);
      --text: #2f2418;
      --muted: #6b5a47;
      --accent: #1f6f5f;
      --accent-strong: #174f44;
      --danger: #9a3d2d;
      --shadow: 0 18px 40px rgba(46, 31, 11, 0.12);
      --editor-font: 'IBM Plex Mono', 'Courier New', monospace;
      --ui-font: 'Segoe UI', sans-serif;
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #201a15;
        --surface: rgba(39, 33, 28, 0.9);
        --surface-strong: rgba(49, 42, 36, 0.96);
        --line: rgba(241, 225, 201, 0.12);
        --text: #f5ebdb;
        --muted: #c9b69b;
        --accent: #77bea9;
        --accent-strong: #9dd7c5;
        --danger: #ff9f86;
        --shadow: 0 24px 44px rgba(0, 0, 0, 0.24);
      }
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      font-family: var(--ui-font);
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(31, 111, 95, 0.16), transparent 34%),
        radial-gradient(circle at bottom right, rgba(194, 141, 78, 0.14), transparent 28%),
        var(--bg);
    }

    .shell {
      display: grid;
      grid-template-rows: auto 1fr;
      min-height: 100vh;
    }

    .toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 16px 20px;
      border-bottom: 1px solid var(--line);
      backdrop-filter: blur(10px);
      background: rgba(255, 255, 255, 0.18);
    }

    .meta {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }

    .title {
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .subtitle,
    .status {
      font-size: 12px;
      color: var(--muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .toolbar-actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    button {
      border: 1px solid transparent;
      border-radius: 999px;
      padding: 10px 16px;
      font: inherit;
      cursor: pointer;
      transition: transform 120ms ease, opacity 120ms ease, background 120ms ease;
    }

    button:hover {
      transform: translateY(-1px);
    }

    button.primary {
      color: #fff;
      background: linear-gradient(135deg, var(--accent), var(--accent-strong));
      box-shadow: var(--shadow);
    }

    button.secondary {
      color: var(--text);
      background: var(--surface);
      border-color: var(--line);
    }

    .content {
      display: grid;
      grid-template-columns: minmax(320px, 0.9fr) minmax(360px, 1.1fr);
      gap: 18px;
      padding: 18px;
      min-height: 0;
    }

    .panel {
      min-height: 0;
      display: flex;
      flex-direction: column;
      border: 1px solid var(--line);
      border-radius: 20px;
      background: var(--surface);
      box-shadow: var(--shadow);
      overflow: hidden;
    }

    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 16px;
      border-bottom: 1px solid var(--line);
      background: var(--surface-strong);
    }

    .panel-header h2 {
      margin: 0;
      font-size: 13px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
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
      padding: 18px;
      min-height: 0;
      background-image:
        linear-gradient(rgba(127, 98, 64, 0.06) 1px, transparent 1px),
        linear-gradient(90deg, rgba(127, 98, 64, 0.06) 1px, transparent 1px);
      background-size: 24px 24px;
    }

    #preview {
      min-width: fit-content;
      min-height: 100%;
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

    @media (max-width: 900px) {
      .content {
        grid-template-columns: 1fr;
      }

      .toolbar {
        align-items: flex-start;
        flex-direction: column;
      }

      .toolbar-actions {
        width: 100%;
        justify-content: flex-start;
      }
    }
  </style>
</head>
<body>
  <div class="shell">
    <div class="toolbar">
      <div class="meta">
        <div class="title">Diagram Preview Tool</div>
        <div class="subtitle" id="fileLabel">Waiting for a Mermaid block</div>
        <div class="status" id="statusLabel">Open a Mermaid block from Markdown to start.</div>
      </div>
      <div class="toolbar-actions">
        <button class="secondary" id="refreshButton" type="button">Refresh from Markdown</button>
        <button class="primary" id="applyButton" type="button">Apply to Markdown</button>
      </div>
    </div>

    <div class="content">
      <section class="panel">
        <div class="panel-header">
          <h2>Mermaid Source</h2>
        </div>
        <textarea id="source" spellcheck="false" placeholder="graph TD\n  A[Source] --> B[Preview]"></textarea>
      </section>

      <section class="panel">
        <div class="panel-header">
          <h2>Rendered Diagram</h2>
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
    const sourceEl = document.getElementById('source');
    const previewEl = document.getElementById('preview');
    const statusLabel = document.getElementById('statusLabel');
    const fileLabel = document.getElementById('fileLabel');
    const applyButton = document.getElementById('applyButton');
    const refreshButton = document.getElementById('refreshButton');
    let renderToken = 0;
    let isApplyingRemoteUpdate = false;

    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      theme: 'default',
      flowchart: { useMaxWidth: false }
    });

    sourceEl.addEventListener('input', () => {
      if (isApplyingRemoteUpdate) {
        return;
      }

      vscode.postMessage({ type: 'updateSource', source: sourceEl.value });
      renderMermaid(sourceEl.value);
      statusLabel.textContent = 'Rendering local edits...';
    });

    applyButton.addEventListener('click', () => {
      vscode.postMessage({ type: 'applyEdits' });
    });

    refreshButton.addEventListener('click', () => {
      vscode.postMessage({ type: 'refreshFromFile' });
    });

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.type !== 'setState') {
        return;
      }

      isApplyingRemoteUpdate = true;
      sourceEl.value = message.source || '';
      isApplyingRemoteUpdate = false;
      fileLabel.textContent = message.fileName + ' - block starting at line ' + message.startLine;
      statusLabel.textContent = message.status || '';
      renderMermaid(sourceEl.value);
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
        previewEl.innerHTML = svg;
      } catch (error) {
        if (currentToken !== renderToken) {
          return;
        }
        previewEl.className = 'error';
        previewEl.textContent = (error && error.message) ? error.message : String(error);
      }
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
