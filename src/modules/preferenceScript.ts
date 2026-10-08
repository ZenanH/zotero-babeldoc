import { testConnection } from "./api";
import {
  getSettings,
  saveSettings,
  TranslatorSettings,
  validateBaseUrl,
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
  setStatus(status, "配置尚未测试。", "neutral");
  setStatus(babeldocStatus, "正在检测翻译环境…", "neutral");

  const saveButton = document.getElementById(
    "babeldoctranslator-save",
  ) as HTMLButtonElement;
  const testButton = document.getElementById(
    "babeldoctranslator-test",
  ) as HTMLButtonElement;
  const baseUrlInput = document.getElementById(
    "babeldoctranslator-base-url",
  ) as HTMLInputElement;
  const deployButton = document.getElementById(
    "babeldoctranslator-deploy",
  ) as HTMLButtonElement;
  const detectButton = document.getElementById(
    "babeldoctranslator-detect",
  ) as HTMLButtonElement;
  if (saveButton.dataset.bound === "true") {
    void refreshBabelDocStatus(babeldocStatus);
    return;
  }
  saveButton.dataset.bound = "true";

  baseUrlInput.addEventListener("blur", () => {
    try {
      validateBaseUrl(baseUrlInput.value.trim());
      setStatus(status, "Base URL 格式已检查；可点击“测试连接”。", "neutral");
    } catch (error) {
      setStatus(
        status,
        error instanceof Error ? error.message : String(error),
        "error",
      );
    }
  });

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
    setStatus(status, "正在测试连接…", "neutral");
    try {
      const result = await testConnection(readForm(document));
      setStatus(
        status,
        result.message,
        result.warning ? "error" : result.ok ? "success" : "error",
      );
    } finally {
      testButton.disabled = false;
    }
  });

  deployButton.addEventListener("command", async () => {
    deployButton.disabled = true;
    detectButton.disabled = true;
    const stopSpinner = startStatusSpinner(babeldocStatus, "正在配置翻译环境");
    try {
      const installation = await deployBabelDoc();
      setStatus(
        babeldocStatus,
        `已完成 · 环境路径：${installation.runtimePath}`,
        "success",
      );
    } catch (error) {
      setStatus(
        babeldocStatus,
        error instanceof Error ? error.message : String(error),
        "error",
      );
    } finally {
      stopSpinner();
      deployButton.disabled = false;
      detectButton.disabled = false;
    }
  });

  detectButton.addEventListener("command", async () => {
    detectButton.disabled = true;
    try {
      await refreshBabelDocStatus(babeldocStatus);
    } finally {
      detectButton.disabled = false;
    }
  });

  void refreshBabelDocStatus(babeldocStatus);
}

async function refreshBabelDocStatus(
  status: HTMLElement | null,
): Promise<void> {
  setStatus(status, "正在检测翻译环境…", "neutral");
  try {
    const installation = await detectBabelDoc();
    setStatus(
      status,
      `已完成 · 环境路径：${installation.runtimePath}`,
      "success",
    );
  } catch (error) {
    setStatus(
      status,
      error instanceof Error ? error.message : String(error),
      "error",
    );
  }
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

function startStatusSpinner(
  element: HTMLElement | null,
  message: string,
): () => void {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let frameIndex = 0;
  const update = () => {
    setStatus(element, `${message} ${frames[frameIndex]}`, "neutral");
    frameIndex = (frameIndex + 1) % frames.length;
  };
  update();
  const timer = setInterval(update, 160);
  return () => clearInterval(timer);
}
