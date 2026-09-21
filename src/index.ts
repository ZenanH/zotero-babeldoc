import { BasicTool } from "zotero-plugin-toolkit";
import Addon from "./addon";
import { config } from "../package.json";

const basicTool = new BasicTool();
const zoteroGlobal = basicTool.getGlobal("Zotero") as Record<string, any>;

if (!zoteroGlobal[config.addonInstance]) {
  _globalThis.addon = new Addon();
  defineGlobal("ztoolkit", () => _globalThis.addon.data.ztoolkit);
  zoteroGlobal[config.addonInstance] = addon;
}

function defineGlobal(name: string, getter: () => any): void {
  Object.defineProperty(_globalThis, name, {
    get() {
      return getter();
    },
  });
}
