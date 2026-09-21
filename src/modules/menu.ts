import { translateSelectedPDF } from "./translation";

const MENU_ID = "babeldoctranslator-translate-pdf";

export function registerMainWindowMenu(win: _ZoteroTypes.MainWindow): void {
  const menu = win.document.getElementById("zotero-itemmenu") as any;
  if (!menu) {
    ztoolkit.log("Could not find Zotero item context menu");
    return;
  }
  if (win.document.getElementById(MENU_ID)) return;

  const item = win.document.createXULElement("menuitem") as any;
  item.id = MENU_ID;
  item.setAttribute("label", "使用 BabelDOC 翻译 PDF");
  item.setAttribute(
    "tooltiptext",
    "调用本机 BabelDOC，将翻译 PDF 添加到同一文献下",
  );
  item.disabled = true;
  item.addEventListener("command", () => void translateSelectedPDF(win));

  const popupListener = () => {
    item.disabled = !getSelectedPdfAttachment(win);
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
  if (!item?.isAttachment?.()) return null;

  const contentType = String(item.attachmentContentType || "").toLowerCase();
  const filename = String(item.attachmentFilename || "").toLowerCase();
  if (contentType !== "application/pdf" && !filename.endsWith(".pdf")) {
    return null;
  }
  if (!Number((item as any).parentID || 0)) return null;
  return item;
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
