import { config } from "../package.json";
import { registerPrefsScripts } from "./modules/preferenceScript";
import {
  registerMainWindowMenu,
  unregisterMainWindowMenu,
  unregisterMainWindowMenus,
} from "./modules/menu";
import { createZToolkit } from "./utils/ztoolkit";

async function onStartup(): Promise<void> {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  Zotero.PreferencePanes.register({
    pluginID: addon.data.config.addonID,
    src: rootURI + "content/preferences.xhtml",
    label: "Zotero BabelDOC",
    image: rootURI + "icon.svg",
  });

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );
  addon.data.initialized = true;
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  addon.data.ztoolkit = createZToolkit();
  registerMainWindowMenu(win);
}

async function onMainWindowUnload(win: Window): Promise<void> {
  unregisterMainWindowMenu(win);
}

function onShutdown(): void {
  unregisterMainWindowMenus();
  addon.data.alive = false;
  addon.data.initialized = false;
  delete (_globalThis.Zotero as Record<string, any>)[config.addonInstance];
}

async function onPrefsEvent(
  type: string,
  data: { window: Window },
): Promise<void> {
  if (type === "load") {
    await registerPrefsScripts(data.window);
  }
}

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onPrefsEvent,
};
