type StatusBarState = "running" | "success" | "error";

export interface TranslationStatusBarSnapshot {
  state: StatusBarState;
  message: string;
  badge: string;
}

interface StatusBarElements {
  bar: HTMLElement;
  message: HTMLElement;
  badge: HTMLElement;
  style: Element;
}

const STATUS_BAR_ID = "babeldoctranslator-status-bar";
const STATUS_STYLE_ID = "babeldoctranslator-status-style";
const statusBars = new Map<Window, StatusBarElements>();
let currentSnapshot: TranslationStatusBarSnapshot | null = null;

export function registerTranslationStatusBar(win: Window): void {
  if (statusBars.has(win) || win.document.getElementById(STATUS_BAR_ID)) return;

  const document = win.document;
  const documentElement = document.documentElement;
  const appContent = document.getElementById("appcontent");
  const paneStack = document.getElementById("zotero-pane-stack");
  if (!documentElement || !appContent || !paneStack) {
    ztoolkit.log(
      "Could not find Zotero app content for translation status bar",
    );
    return;
  }

  const style = document.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "style",
  );
  style.id = STATUS_STYLE_ID;
  style.textContent = `
    #${STATUS_BAR_ID} {
      box-sizing: border-box;
      min-height: 30px;
      padding: 0 10px;
      gap: 8px;
      border-top: 1px solid var(--color-panedivider);
      background: var(--material-toolbar);
      color: var(--fill-primary);
    }
    #${STATUS_BAR_ID}[hidden] {
      display: none;
    }
    #${STATUS_BAR_ID} .babeldoc-status-icon {
      width: 16px;
      height: 16px;
      margin: 0;
    }
    #${STATUS_BAR_ID} .babeldoc-status-dot {
      width: 7px;
      min-width: 7px;
      height: 7px;
      min-height: 7px;
      margin: 0;
      border-radius: 50%;
      background: var(--accent-blue);
    }
    #${STATUS_BAR_ID}[data-state="success"] .babeldoc-status-dot {
      background: var(--accent-green);
    }
    #${STATUS_BAR_ID}[data-state="error"] .babeldoc-status-dot {
      background: var(--accent-red);
    }
    #${STATUS_BAR_ID} .babeldoc-status-title {
      margin: 0;
      font-weight: 600;
    }
    #${STATUS_BAR_ID} .babeldoc-status-message {
      min-width: 0;
      margin: 0;
      color: var(--fill-secondary);
    }
    #${STATUS_BAR_ID} .babeldoc-status-badge {
      min-width: 24px;
      margin: 0;
      padding: 1px 7px;
      border-radius: 8px;
      background: var(--accent-blue10);
      color: var(--accent-blue);
      font-size: 11px;
      font-weight: 600;
      text-align: center;
    }
    #${STATUS_BAR_ID}[data-state="success"] .babeldoc-status-badge {
      color: var(--accent-green);
    }
    #${STATUS_BAR_ID}[data-state="error"] .babeldoc-status-badge {
      color: var(--accent-red);
    }
  `;
  documentElement.appendChild(style);

  const bar = document.createXULElement("hbox") as unknown as HTMLElement;
  bar.id = STATUS_BAR_ID;
  bar.hidden = true;
  bar.setAttribute("align", "center");
  bar.setAttribute("role", "status");

  const icon = document.createXULElement("image") as unknown as HTMLElement;
  icon.setAttribute("class", "babeldoc-status-icon");
  icon.setAttribute(
    "src",
    `chrome://${addon.data.config.addonRef}/content/icons/favicon@0.5x.png`,
  );

  const dot = document.createXULElement("box") as unknown as HTMLElement;
  dot.setAttribute("class", "babeldoc-status-dot");

  const title = document.createXULElement("label") as unknown as HTMLElement;
  title.setAttribute("class", "babeldoc-status-title");
  title.setAttribute("value", "Zotero BabelDOC");

  const message = document.createXULElement("label") as unknown as HTMLElement;
  message.setAttribute("class", "babeldoc-status-message");
  message.setAttribute("flex", "1");
  message.setAttribute("crop", "end");

  const badge = document.createXULElement("label") as unknown as HTMLElement;
  badge.setAttribute("class", "babeldoc-status-badge");

  bar.append(icon, dot, title, message, badge);
  appContent.insertBefore(bar, paneStack.nextSibling);

  const elements = { bar, message, badge, style };
  statusBars.set(win, elements);
  renderStatusBar(elements, currentSnapshot);
}

export function unregisterTranslationStatusBar(win: Window): void {
  const elements = statusBars.get(win);
  if (!elements) return;
  elements.bar.remove();
  elements.style.remove();
  statusBars.delete(win);
}

export function unregisterTranslationStatusBars(): void {
  for (const win of [...statusBars.keys()]) {
    unregisterTranslationStatusBar(win);
  }
  currentSnapshot = null;
}

export function showTranslationStatusBar(
  snapshot: TranslationStatusBarSnapshot,
): void {
  currentSnapshot = snapshot;
  for (const elements of statusBars.values()) {
    renderStatusBar(elements, snapshot);
  }
}

export function hideTranslationStatusBar(): void {
  currentSnapshot = null;
  for (const elements of statusBars.values()) {
    renderStatusBar(elements, null);
  }
}

function renderStatusBar(
  elements: StatusBarElements,
  snapshot: TranslationStatusBarSnapshot | null,
): void {
  if (!snapshot) {
    elements.bar.hidden = true;
    return;
  }
  elements.bar.hidden = false;
  elements.bar.setAttribute("data-state", snapshot.state);
  elements.message.setAttribute("value", snapshot.message);
  elements.badge.setAttribute("value", snapshot.badge);
}
