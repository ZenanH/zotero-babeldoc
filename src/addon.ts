import { config } from "../package.json";
import hooks from "./hooks";
import { createZToolkit } from "./utils/ztoolkit";

class Addon {
  public data: {
    alive: boolean;
    initialized: boolean;
    config: typeof config;
    env: "development" | "production";
    ztoolkit: ZToolkit;
    menuBindings: Array<{
      menu: any;
      item: any;
      listener: EventListener;
    }>;
  };

  public hooks: typeof hooks;

  constructor() {
    this.data = {
      alive: true,
      initialized: false,
      config,
      env: __env__,
      ztoolkit: createZToolkit(),
      menuBindings: [],
    };
    this.hooks = hooks;
  }
}

export default Addon;
