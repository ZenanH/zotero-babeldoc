import { config } from "../../package.json";

export const REQUIRED_BABELDOC_VERSION = config.babeldocVersion;
export const REQUIRED_MARKITDOWN_VERSION = config.markitdownVersion;
export const REQUIRED_UV_VERSION = config.uvVersion;
export const REQUIRED_PYTHON_VERSION = config.pythonVersion;
export const RUNTIME_ID = config.runtimeId;

export type TranslationOutputMode = "mono" | "dual";

const CHINESE_LANGUAGE_ALIASES = new Set([
  "zh",
  "zh-cn",
  "zh-hans",
  "zhs",
  "chinese",
  "simplified chinese",
  "中文",
  "简体中文",
]);

export interface TranslatorSettings {
  baseUrl: string;
  apiKey: string;
  model: string;
  sourceLanguage: string;
  targetLanguage: string;
  qps: number;
  poolMaxWorkers: number;
  watermarkOutputMode: "watermarked" | "no_watermark" | "both";
  translationOutputMode: TranslationOutputMode;
}

export const DEFAULT_SETTINGS: TranslatorSettings = {
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o-mini",
  sourceLanguage: "en",
  targetLanguage: "zh-CN",
  qps: 10,
  poolMaxWorkers: 8,
  watermarkOutputMode: "no_watermark",
  translationOutputMode: "mono",
};

function getPref<T>(key: string, fallback: T): T {
  try {
    const value = Zotero.Prefs.get(`${config.prefsPrefix}.${key}`);
    if (value === undefined || value === null || value === "") {
      return fallback;
    }
    return value as T;
  } catch (error) {
    ztoolkit.log(`Failed to read preference ${key}`, error);
    return fallback;
  }
}

function setPref(key: string, value: string | number): void {
  Zotero.Prefs.set(`${config.prefsPrefix}.${key}`, value);
}

export function getSettings(): TranslatorSettings {
  const watermark = getPref<string>(
    "watermark-output-mode",
    DEFAULT_SETTINGS.watermarkOutputMode,
  );
  const translationOutput = getPref<string>(
    "translation-output-mode",
    DEFAULT_SETTINGS.translationOutputMode,
  );
  return {
    baseUrl: getPref("base-url", DEFAULT_SETTINGS.baseUrl).trim(),
    apiKey: getPref("api-key", DEFAULT_SETTINGS.apiKey).trim(),
    model: getPref("model", DEFAULT_SETTINGS.model).trim(),
    sourceLanguage: normalizeBabelDocLanguage(
      getPref("source-language", DEFAULT_SETTINGS.sourceLanguage),
    ),
    targetLanguage: normalizeBabelDocLanguage(
      getPref("target-language", DEFAULT_SETTINGS.targetLanguage),
    ),
    qps: clampInteger(getPref("qps", DEFAULT_SETTINGS.qps), 1, 64),
    poolMaxWorkers: clampInteger(
      getPref("pool-max-workers", DEFAULT_SETTINGS.poolMaxWorkers),
      1,
      64,
    ),
    watermarkOutputMode:
      watermark === "watermarked" || watermark === "both"
        ? watermark
        : "no_watermark",
    translationOutputMode: translationOutput === "dual" ? "dual" : "mono",
  };
}

export function saveSettings(settings: TranslatorSettings): void {
  setPref("base-url", settings.baseUrl.trim());
  setPref("api-key", settings.apiKey.trim());
  setPref("model", settings.model.trim());
  setPref(
    "source-language",
    normalizeBabelDocLanguage(settings.sourceLanguage),
  );
  setPref(
    "target-language",
    normalizeBabelDocLanguage(settings.targetLanguage),
  );
  setPref("qps", clampInteger(settings.qps, 1, 64));
  setPref("pool-max-workers", clampInteger(settings.poolMaxWorkers, 1, 64));
  setPref("watermark-output-mode", settings.watermarkOutputMode);
  setPref("translation-output-mode", settings.translationOutputMode);
}

export function getManagedRuntimeRoot(): string {
  return joinPath(getHomeDirectory(), ".babeldoc-translator");
}

/**
 * Keep BabelDOC's cache and other user-home based files inside the plugin's
 * managed root. BabelDOC resolves its cache at import time with Path.home(),
 * so inheriting Zotero's home would let it read or modify a global cache.
 */
export function getManagedProcessEnvironment(): Record<string, string> {
  const managedHome = getManagedRuntimeRoot();
  if (Services.appinfo.OS === "WINNT") {
    return { HOME: managedHome, USERPROFILE: managedHome };
  }
  return { HOME: managedHome };
}

export function getManagedUvDirectory(): string {
  return joinPath(getManagedRuntimeRoot(), "uv", REQUIRED_UV_VERSION);
}

export function getManagedPythonDirectory(): string {
  return joinPath(getManagedRuntimeRoot(), "python");
}

export function getManagedUvPath(): string {
  const executable = Services.appinfo.OS === "WINNT" ? "uv.exe" : "uv";
  return joinPath(getManagedUvDirectory(), executable);
}

export function getManagedRuntimesDirectory(): string {
  return joinPath(getManagedRuntimeRoot(), "runtimes");
}

export function getManagedRuntimeManifestPath(): string {
  return joinPath(getManagedRuntimeRoot(), "active-runtime.json");
}

export function getManagedBabelDocPythonPath(venvPath: string): string {
  const executableDirectory =
    Services.appinfo.OS === "WINNT" ? "Scripts" : "bin";
  const executable = Services.appinfo.OS === "WINNT" ? "python.exe" : "python";
  return joinPath(venvPath, executableDirectory, executable);
}

export function getManagedMarkItDownPath(venvPath: string): string {
  const executableDirectory =
    Services.appinfo.OS === "WINNT" ? "Scripts" : "bin";
  const executable =
    Services.appinfo.OS === "WINNT" ? "markitdown.exe" : "markitdown";
  return joinPath(venvPath, executableDirectory, executable);
}

export function getManagedBabelDocInstallCommand(): string {
  return "请在 Zotero 设置页点击“部署 / 修复 BabelDOC”，插件会一并配置 MarkItDown。";
}

export function getUnixBabelDocInstallCommand(): string {
  return `点击上方按钮后，插件会自动配置 uv ${REQUIRED_UV_VERSION}，并在插件专用环境中安装 BabelDOC ${REQUIRED_BABELDOC_VERSION} 和 MarkItDown ${REQUIRED_MARKITDOWN_VERSION}。`;
}

export function getWindowsBabelDocInstallCommand(): string {
  return `点击上方按钮后，插件会自动配置 uv ${REQUIRED_UV_VERSION}，并在插件专用环境中安装 BabelDOC ${REQUIRED_BABELDOC_VERSION} 和 MarkItDown ${REQUIRED_MARKITDOWN_VERSION}。`;
}

export function validateSettings(settings: TranslatorSettings): void {
  validateBaseUrl(settings.baseUrl);
  if (!settings.apiKey) {
    throw new Error("请填写 API Key。");
  }
  if (!settings.model) {
    throw new Error("请填写模型名称。");
  }
  if (!settings.sourceLanguage || !settings.targetLanguage) {
    throw new Error("源语言和目标语言不能为空。");
  }
}

export function validateBaseUrl(baseUrl: string): void {
  if (!baseUrl) {
    throw new Error("请填写 Base URL。");
  }
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error("Base URL 不是有效的 URL。");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Base URL 只支持 http 或 https。");
  }
}

export function getPathUtils(): any {
  const globalPathUtils = (globalThis as any).PathUtils;
  if (globalPathUtils) {
    return globalPathUtils;
  }
  return ChromeUtils.importESModule("resource://gre/modules/PathUtils.sys.mjs")
    .PathUtils;
}

export function joinPath(...parts: string[]): string {
  return getPathUtils().join(...parts);
}

export function getHomeDirectory(): string {
  return Services.dirsvc.get("Home", Components.interfaces.nsIFile).path;
}

export function getPluginDirectory(): string {
  const dataDirectory = (Zotero as any).DataDirectory?.dir;
  if (!dataDirectory) {
    throw new Error("无法读取 Zotero 数据目录。");
  }
  const path =
    typeof dataDirectory === "string" ? dataDirectory : dataDirectory.path;
  return joinPath(path, "babeldoc-translator");
}

export function getManagedConfigPath(): string {
  return joinPath(getPluginDirectory(), "babeldoc.toml");
}

export function getStringFileName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

export function getFileStem(path: string): string {
  return getStringFileName(path).replace(/\.pdf$/i, "");
}

export function tomlString(value: string): string {
  return JSON.stringify(value);
}

export function normalizeBabelDocLanguage(value: string): string {
  const trimmed = String(value || "").trim();
  const normalized = trimmed.toLowerCase().replaceAll("_", "-");
  // BabelDOC's language table and output naming use the lowercase `zh-cn`
  // code.  Keep one canonical value internally so the CLI, TOML, prompt and
  // output-file lookup cannot disagree about the requested language.
  return CHINESE_LANGUAGE_ALIASES.has(normalized) ? "zh-cn" : trimmed;
}

export function getBabelDocLanguageLabel(language: string): string {
  const normalized = normalizeBabelDocLanguage(language).toLowerCase();
  const labels: Record<string, string> = {
    "zh-cn": "Simplified Chinese (简体中文)",
    "zh-hans": "Simplified Chinese (简体中文)",
    "zh-tw": "Traditional Chinese (繁體中文)",
    "zh-hant": "Traditional Chinese (繁體中文)",
    en: "English",
    ja: "Japanese (日本語)",
    ko: "Korean (한국어)",
    fr: "French (Français)",
    de: "German (Deutsch)",
    es: "Spanish (Español)",
    it: "Italian (Italiano)",
    ru: "Russian (Русский)",
    pt: "Portuguese (Português)",
  };
  return labels[normalized] || normalized || language;
}

export function buildBabelDocSystemPrompt(
  sourceLanguage: string,
  targetLanguage: string,
): string {
  const source = normalizeBabelDocLanguage(sourceLanguage);
  const target = normalizeBabelDocLanguage(targetLanguage);
  const lines = [
    "You are a professional academic translation engine.",
    `Translate from ${getBabelDocLanguageLabel(source)} (code: ${source}) to ${getBabelDocLanguageLabel(target)} (code: ${target}).`,
    "Translate every human-readable sentence and paragraph into the required target language.",
    "Do not leave ordinary source-language prose unchanged when it can be translated.",
    "Preserve formulas, numbers, citations, URLs, code, placeholders, and markup tags exactly when they are not human-readable prose.",
    "Follow BabelDOC's output format exactly. If the request asks for a JSON array, return only that JSON array and put each translation in its object's output field.",
  ];
  if (["zh", "zh-cn", "zh-hans"].includes(target.toLowerCase())) {
    lines.splice(
      3,
      0,
      "The output must be Simplified Chinese; do not return ordinary English prose or the unchanged source text.",
    );
  }
  return lines.join("\n");
}

export function renderBabelDocToml(settings: TranslatorSettings): string {
  const sourceLanguage = normalizeBabelDocLanguage(settings.sourceLanguage);
  const targetLanguage = normalizeBabelDocLanguage(settings.targetLanguage);
  const customSystemPrompt = buildBabelDocSystemPrompt(
    sourceLanguage,
    targetLanguage,
  );
  return [
    "[babeldoc]",
    "debug = false",
    `lang-in = ${tomlString(sourceLanguage)}`,
    `lang-out = ${tomlString(targetLanguage)}`,
    `qps = ${clampInteger(settings.qps, 1, 64)}`,
    `watermark-output-mode = ${tomlString(settings.watermarkOutputMode)}`,
    "openai = true",
    `openai-model = ${tomlString(settings.model)}`,
    `openai-base-url = ${tomlString(settings.baseUrl.replace(/\/+$/, ""))}`,
    `openai-api-key = ${tomlString(settings.apiKey)}`,
    `custom-system-prompt = ${tomlString(customSystemPrompt)}`,
    "ignore-cache = true",
    "enable-json-mode-if-requested = false",
    `pool-max-workers = ${clampInteger(settings.poolMaxWorkers, 1, 64)}`,
    `no-dual = ${settings.translationOutputMode === "mono"}`,
    `no-mono = ${settings.translationOutputMode === "dual"}`,
    "min-text-length = 5",
    "report-interval = 0.5",
    "",
  ].join("\n");
}

export async function ensureDirectory(path: string): Promise<void> {
  const io = getIOUtils();
  if (!(await io.exists(path))) {
    await io.makeDirectory(path, { createAncestors: true });
  }
}

export async function writeTextAtomically(
  path: string,
  contents: string,
): Promise<void> {
  const io = getIOUtils();
  await ensureDirectory(getPathUtils().parent(path));
  const tempPath = `${path}.${Date.now()}.${Math.random()
    .toString(16)
    .slice(2)}.tmp`;
  await io.writeUTF8(tempPath, contents);
  try {
    await io.move(tempPath, path, { noOverwrite: false });
  } catch {
    await io.writeUTF8(path, contents);
    try {
      await io.remove(tempPath);
    } catch {
      // The destination has already been written; a stale temp file is harmless.
    }
  }
}

export async function writeManagedConfig(
  settings: TranslatorSettings,
): Promise<string> {
  const path = getManagedConfigPath();
  await writeTextAtomically(path, renderBabelDocToml(settings));
  return path;
}

export async function createTaskDirectory(): Promise<string> {
  const root = joinPath(
    getPluginDirectory(),
    "tasks",
    `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  await ensureDirectory(root);
  await ensureDirectory(joinPath(root, "output"));
  await ensureDirectory(joinPath(root, "working"));
  return root;
}

export async function removeDirectory(path: string): Promise<void> {
  try {
    await getIOUtils().remove(path, { recursive: true });
  } catch (error) {
    ztoolkit.log("Failed to remove temporary BabelDOC directory", error);
  }
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    return await getIOUtils().exists(path);
  } catch {
    return false;
  }
}

export function getIOUtils(): any {
  const globalIOUtils = (globalThis as any).IOUtils;
  if (globalIOUtils) {
    return globalIOUtils;
  }
  return ChromeUtils.importESModule("resource://gre/modules/IOUtils.sys.mjs")
    .IOUtils;
}

function clampInteger(
  value: number | string,
  min: number,
  max: number,
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}
