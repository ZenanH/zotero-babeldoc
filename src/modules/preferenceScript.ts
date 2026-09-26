import { testConnection } from "./api";
import {
  getSettings,
  getUnixBabelDocInstallCommand,
  getWindowsBabelDocInstallCommand,
  saveSettings,
  TranslatorSettings,
  validateSettings,
  writeManagedConfig,
} from "./settings";
import { deployBabelDoc, detectBabelDoc } from "./babeldoc";

export async function registerPrefsScripts(win: Window): Promise<void> {
  const document = win.document;
  const settings = getSettings();
  setValue(document, "babeldoctranslator-base-url", settings.baseUrl);
  setValue(document, "babeldoctranslator-api-key", settings.apiKey);
  setValue(document, "babeldoctranslator-model", settings.model);
  setValue(
    document,
    "babeldoctranslator-source-language",
    settings.sourceLanguage,
  );
  setValue(
    document,
    "babeldoctranslator-target-language",
    settings.targetLanguage,
  );
  setValue(document, "babeldoctranslator-qps", String(settings.qps));
  setValue(
    document,
    "babeldoctranslator-workers",
    String(settings.poolMaxWorkers),
  );
  setChecked(
    document,
    "babeldoctranslator-output-mono",
    settings.translationOutputMode === "mono",
  );
  setChecked(
    document,
    "babeldoctranslator-output-dual",
    settings.translationOutputMode === "dual",
  );

  const status = document.getElementById(
    "babeldoctranslator-status",
  ) as HTMLElement;
  const babeldocStatus = document.getElementById(
    "babeldoctranslator-babeldoc-status",
  ) as HTMLElement;
  const unixInstallCommand = document.getElementById(
    "babeldoctranslator-install-command-unix",
  ) as HTMLElement;
  if (unixInstallCommand) {
    unixInstallCommand.textContent = getUnixBabelDocInstallCommand();
  }
  const windowsInstallCommand = document.getElementById(
    "babeldoctranslator-install-command-windows",
  ) as HTMLElement;
  if (windowsInstallCommand) {
    windowsInstallCommand.textContent = getWindowsBabelDocInstallCommand();
  }
  setStatus(status, "配置尚未测试。", "neutral");
  setStatus(babeldocStatus, "正在检测插件专用 BabelDOC…", "neutral");

  const saveButton = document.getElementById(
    "babeldoctranslator-save",
  ) as HTMLButtonElement;
  const testButton = document.getElementById(
    "babeldoctranslator-test",
  ) as HTMLButtonElement;
  const deployButton = document.getElementById(
    "babeldoctranslator-deploy",
  ) as HTMLButtonElement;
  const detectButton = document.getElementById(
    "babeldoctranslator-detect",
  ) as HTMLButtonElement;
  if (saveButton.dataset.bound === "true") return;
  saveButton.dataset.bound = "true";

  saveButton.addEventListener("command", async () => {
    try {
      const nextSettings = readForm(document);
      validateSettings(nextSettings);
      saveSettings(nextSettings);
      await writeManagedConfig(nextSettings);
      setStatus(status, "配置已保存，BabelDOC TOML 已更新。", "success");
    } catch (error) {
      setStatus(
        status,
        error instanceof Error ? error.message : String(error),
        "error",
      );
    }
  });

  testButton.addEventListener("command", async () => {
    testButton.disabled = true;
    setStatus(status, "正在测试 Base URL / API Key…", "neutral");
    try {
      const result = await testConnection(readForm(document));
      setStatus(status, result.message, result.ok ? "success" : "error");
    } finally {
      testButton.disabled = false;
    }
  });

  deployButton.addEventListener("command", async () => {
    deployButton.disabled = true;
    detectButton.disabled = true;
    setStatus(
      babeldocStatus,
      "正在部署固定版本的 uv、Python 和 BabelDOC…",
      "neutral",
    );
    try {
      const installation = await deployBabelDoc();
      setStatus(
        babeldocStatus,
        `已部署 BabelDOC ${installation.version}：${installation.path}`,
        "success",
      );
    } catch (error) {
      setStatus(
        babeldocStatus,
        error instanceof Error ? error.message : String(error),
        "error",
      );
    } finally {
      deployButton.disabled = false;
      detectButton.disabled = false;
    }
  });

  detectButton.addEventListener("command", async () => {
    detectButton.disabled = true;
    setStatus(babeldocStatus, "正在检测固定版本 BabelDOC…", "neutral");
    try {
      const installation = await detectBabelDoc();
      setStatus(
        babeldocStatus,
        `已检测到 BabelDOC ${installation.version}：${installation.path}`,
        "success",
      );
    } catch (error) {
      setStatus(
        babeldocStatus,
        error instanceof Error ? error.message : String(error),
        "error",
      );
    } finally {
      detectButton.disabled = false;
    }
  });

  setStatus(
    babeldocStatus,
    "尚未检测 BabelDOC。请先点击“检测 BabelDOC”，未部署时再点击“部署 / 修复 BabelDOC”。",
    "neutral",
  );
}

function readForm(document: Document): TranslatorSettings {
  return {
    baseUrl: getValue(document, "babeldoctranslator-base-url"),
    apiKey: getValue(document, "babeldoctranslator-api-key"),
    model: getValue(document, "babeldoctranslator-model"),
    sourceLanguage: getValue(document, "babeldoctranslator-source-language"),
    targetLanguage: getValue(document, "babeldoctranslator-target-language"),
    qps: Number(getValue(document, "babeldoctranslator-qps")),
    poolMaxWorkers: Number(getValue(document, "babeldoctranslator-workers")),
    watermarkOutputMode: "no_watermark",
    translationOutputMode: getChecked(
      document,
      "babeldoctranslator-output-dual",
    )
      ? "dual"
      : "mono",
  };
}

function getValue(document: Document, id: string): string {
  return String(
    (document.getElementById(id) as HTMLInputElement)?.value || "",
  ).trim();
}

function setValue(document: Document, id: string, value: string): void {
  const input = document.getElementById(id) as HTMLInputElement | null;
  if (input) input.value = value;
}

function getChecked(document: Document, id: string): boolean {
  return Boolean((document.getElementById(id) as HTMLInputElement)?.checked);
}

function setChecked(document: Document, id: string, checked: boolean): void {
  const input = document.getElementById(id) as HTMLInputElement | null;
  if (input) input.checked = checked;
}

function setStatus(
  element: HTMLElement | null,
  message: string,
  kind: string,
): void {
  if (!element) return;
  element.textContent = message;
  element.setAttribute("data-status", kind);
}
