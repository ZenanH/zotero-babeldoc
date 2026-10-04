import { translateSelectedPDF } from "./translation";
import { summarizeSelectedPDF } from "./summary";

const MENU_ID = "babeldoctranslator-translate-pdf";
const SUMMARY_MENU_ID = "babeldoctranslator-summarize-pdf";

export function registerMainWindowMenu(win: _ZoteroTypes.MainWindow): void {
  const menu = win.document.getElementById("zotero-itemmenu") as any;
  if (!menu) {
    ztoolkit.log("Could not find Zotero item context menu");
    return;
  }
  registerMenuAction(
    win,
    menu,
    MENU_ID,
    "使用 BabelDOC 翻译 PDF",
    "调用本机 BabelDOC，将翻译 PDF 添加到同一文献下",
    () => translateSelectedPDF(win),
    () => Boolean(getSelectedPdfAttachment(win)),
  );
  registerMenuAction(
    win,
    menu,
    SUMMARY_MENU_ID,
    "总结论文（中文）",
    "提取 PDF 正文并使用已配置的模型生成中文总结，保存为文献笔记",
    () => summarizeSelectedPDF(win),
    () => Boolean(getSelectedPdfAttachment(win)),
  );
}

function registerMenuAction(
  win: _ZoteroTypes.MainWindow,
  menu: any,
  id: string,
  label: string,
  tooltip: string,
  action: () => Promise<void>,
  isEnabled: () => boolean,
): void {
  if (win.document.getElementById(id)) return;
  const item = win.document.createXULElement("menuitem") as any;
  item.id = id;
  item.setAttribute("label", label);
  item.setAttribute("tooltiptext", tooltip);
  item.disabled = true;
  item.addEventListener("command", () => void action());

  const popupListener = () => {
    item.disabled = !isEnabled();
  };
  menu.addEventListener("popupshowing", popupListener);
  menu.appendChild(item);
  addon.data.menuBindings.push({ menu, item, listener: popupListener });
}

export function unregisterMainWindowMenus(): void {
  for (const binding of addon.data.menuBindings) {
    removeBinding(binding);
  }
  addon.data.menuBindings = [];
}

export function unregisterMainWindowMenu(win: Window): void {
  const bindings = addon.data.menuBindings.filter(
    (binding) => binding.menu.ownerDocument.defaultView === win,
  );
  for (const binding of bindings) removeBinding(binding);
  addon.data.menuBindings = addon.data.menuBindings.filter(
    (binding) => binding.menu.ownerDocument.defaultView !== win,
  );
}

export function getSelectedPdfAttachment(win: Window): any | null {
  const pane =
    win.ZoteroPane || (ztoolkit.getGlobal("ZoteroPane") as any | undefined);
  const selectedItems = pane?.getSelectedItems?.() || [];
  if (selectedItems.length !== 1) return null;
  const item = selectedItems[0];
  return isPdfAttachment(item) ? item : null;
}

function isPdfAttachment(item: any): boolean {
  if (!item?.isAttachment?.()) return false;

  const contentType = String(item.attachmentContentType || "").toLowerCase();
  const filename = String(item.attachmentFilename || "").toLowerCase();
  if (contentType !== "application/pdf" && !filename.endsWith(".pdf")) {
    return false;
  }
  return Boolean(Number((item as any).parentID || 0));
}

function removeBinding(binding: {
  menu: any;
  item: any;
  listener: EventListener;
}): void {
  binding.menu.removeEventListener("popupshowing", binding.listener);
  if (binding.item.parentNode)
    binding.item.parentNode.removeChild(binding.item);
}
