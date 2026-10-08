import {
  createTaskDirectory,
  getFileStem,
  getManagedProcessEnvironment,
  getIOUtils,
  getSettings,
  joinPath,
  pathExists,
  removeDirectory,
  renderBabelDocToml,
  buildBabelDocSystemPrompt,
  validateSettings,
  writeManagedConfig,
  writeTextAtomically,
} from "./settings";
import { acquireBabelDocRuntime, detectBabelDoc } from "./babeldoc";
import { runExternalProcess } from "./process";
import { getSelectedPdfAttachment } from "./menu";
import {
  hideTranslationStatusBar,
  registerTranslationStatusBar,
  showTranslationStatusBar,
} from "./statusBar";

const activeAttachments = new Set<number>();
export type TranslationTaskKind = "translation";
const activeTasks = new Map<
  string,
  { label: string; stage: string; updatedAt: number }
>();
let statusBarCloseTimer: ReturnType<typeof setTimeout> | null = null;
let completedTaskCount = 0;
let failedTaskCount = 0;
let lastFailureMessage = "";

export async function translateSelectedPDF(win: Window): Promise<void> {
  const attachment = getSelectedPdfAttachment(win);
  if (!attachment) {
    win.alert("请选择一个有父文献的 PDF 附件。");
    return;
  }

  const parentID = Number((attachment as any).parentID || 0);
  if (!parentID) {
    win.alert("该 PDF 没有父文献，无法作为子附件保存翻译结果。");
    return;
  }
  if (activeAttachments.has(attachment.id)) {
    win.alert("该 PDF 已经在翻译中。");
    return;
  }

  const settings = getSettings();
  try {
    validateSettings(settings);
  } catch (error) {
    win.alert(error instanceof Error ? error.message : String(error));
    return;
  }

  let taskDirectory = "";
  let releaseBabelDocRuntime: (() => void) | null = null;
  const sourceLanguage = settings.sourceLanguage;
  const targetLanguage = settings.targetLanguage;
  activeAttachments.add(attachment.id);
  registerTranslationTask(attachment, win);
  try {
    updateTranslationTask(attachment.id, "准备 PDF");

    const inputPath = await getAttachmentPath(attachment);
    if (!inputPath || !(await pathExists(inputPath))) {
      throw new Error("找不到 PDF 的本地文件。请确认附件已下载到本机。");
    }

    updateTranslationTask(attachment.id, "检测 BabelDOC");
    const babeldoc = await detectBabelDoc();
    releaseBabelDocRuntime = acquireBabelDocRuntime(babeldoc.runtimePath);
    taskDirectory = await createTaskDirectory();
    const outputDirectory = joinPath(taskDirectory, "output");
    const workingDirectory = joinPath(taskDirectory, "working");
    const taskConfigPath = joinPath(taskDirectory, "babeldoc.toml");

    updateTranslationTask(attachment.id, "保存 BabelDOC 配置");
    await writeManagedConfig(settings);
    await writeTextAtomically(taskConfigPath, renderBabelDocToml(settings));

    updateTranslationTask(
      attachment.id,
      `BabelDOC ${babeldoc.version}（${sourceLanguage} → ${targetLanguage}）翻译中`,
    );
    const result = await runExternalProcess(
      babeldoc.path,
      [
        "-c",
        taskConfigPath,
        "--files",
        inputPath,
        "--output",
        outputDirectory,
        "--working-dir",
        workingDirectory,
        "--lang-in",
        sourceLanguage,
        "--lang-out",
        targetLanguage,
        "--custom-system-prompt",
        buildBabelDocSystemPrompt(sourceLanguage, targetLanguage),
        "--ignore-cache",
        "--qps",
        String(settings.qps),
        "--pool-max-workers",
        String(settings.poolMaxWorkers),
        "--watermark-output-mode",
        settings.watermarkOutputMode,
        settings.translationOutputMode === "mono" ? "--no-dual" : "--no-mono",
      ],
      {
        workdir: taskDirectory,
        environment: getManagedProcessEnvironment(),
      },
    );
    if (result.exitCode !== 0) {
      const details = redactDiagnostic(
        result.stderr || result.stdout,
        settings,
      );
      throw new Error(
        `BabelDOC 执行失败（退出码 ${result.exitCode}）。${
          details ? `\n${details}` : ""
        }`,
      );
    }

    updateTranslationTask(attachment.id, "查找翻译结果");
    const outputPath = await findTranslatedPDF(
      outputDirectory,
      getFileStem(inputPath),
      targetLanguage,
      settings.translationOutputMode,
    );
    if (!outputPath) {
      throw new Error(
        settings.translationOutputMode === "dual"
          ? `BabelDOC 已结束，但没有找到目标语言 ${targetLanguage} 的原文+译文 PDF。`
          : `BabelDOC 已结束，但没有找到目标语言 ${targetLanguage} 的翻译 PDF。`,
      );
    }

    updateTranslationTask(attachment.id, "验证翻译结果");
    await validateTranslationResult(
      inputPath,
      targetLanguage,
      workingDirectory,
    );

    updateTranslationTask(attachment.id, "导入 Zotero 子附件");
    const parentItem = (await Zotero.Items.getAsync(parentID)) as any;
    const parentTitle = parentItem?.getField("title") || getFileStem(inputPath);
    const imported = await Zotero.Attachments.importFromFile({
      file: outputPath,
      parentItemID: parentID,
      title: `${parentTitle} [BabelDOC ${targetLanguage}]`,
    });

    try {
      win.ZoteroPane?.selectItem?.(imported.id);
    } catch {
      // Selection is only a convenience and should not affect a successful import.
    }
    finishTranslationTask(attachment.id, true);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ztoolkit.log("BabelDOC translation failed", error);
    finishTranslationTask(attachment.id, false, message);
  } finally {
    activeAttachments.delete(attachment.id);
    releaseBabelDocRuntime?.();
    if (taskDirectory) await removeDirectory(taskDirectory);
  }
}

export function registerTranslationTask(
  attachment: any,
  win: Window,
  kind: TranslationTaskKind = "translation",
): void {
  clearStatusBarCloseTimer();
  if (activeTasks.size === 0) {
    completedTaskCount = 0;
    failedTaskCount = 0;
    lastFailureMessage = "";
  }

  const label = String(
    attachment.getField?.("title") ||
      attachment.attachmentFilename ||
      `PDF ${attachment.id}`,
  );
  activeTasks.set(getTaskKey(attachment.id, kind), {
    label,
    stage: "等待开始",
    updatedAt: Date.now(),
  });
  registerStatusBarIfNeeded(win);
  refreshTranslationStatusBar();
}

export function updateTranslationTask(
  attachmentID: number,
  stage: string,
  kind: TranslationTaskKind = "translation",
): void {
  const task = activeTasks.get(getTaskKey(attachmentID, kind));
  if (!task) return;
  task.stage = stage;
  task.updatedAt = Date.now();
  refreshTranslationStatusBar();
}

export function finishTranslationTask(
  attachmentID: number,
  success: boolean,
  errorMessage = "",
  kind: TranslationTaskKind = "translation",
): void {
  const task = activeTasks.get(getTaskKey(attachmentID, kind));
  if (!task) return;
  activeTasks.delete(getTaskKey(attachmentID, kind));
  if (success) completedTaskCount += 1;
  else {
    failedTaskCount += 1;
    lastFailureMessage = errorMessage;
  }

  if (activeTasks.size > 0) {
    refreshTranslationStatusBar();
    return;
  }

  showTranslationStatusBar({
    state: failedTaskCount === 0 ? "success" : "error",
    message:
      failedTaskCount === 0
        ? `全部任务完成，共成功 ${completedTaskCount} 个任务`
        : `任务结束：成功 ${completedTaskCount}，失败 ${failedTaskCount}。${compactProgressError(lastFailureMessage)}`,
    badge: failedTaskCount === 0 ? "完成" : `${failedTaskCount} 个失败`,
  });
  statusBarCloseTimer = setTimeout(
    closeTranslationStatusBar,
    failedTaskCount > 0 ? 12000 : 5000,
  );
}

function refreshTranslationStatusBar(): void {
  if (activeTasks.size === 0) return;
  const latestTask = [...activeTasks.values()].sort(
    (left, right) => right.updatedAt - left.updatedAt,
  )[0];
  const completed = completedTaskCount + failedTaskCount;
  showTranslationStatusBar({
    state: "running",
    message: `${truncateProgressLabel(latestTask.label)}：${latestTask.stage}${
      completed > 0 ? `（本轮已结束 ${completed} 个）` : ""
    }`,
    badge: `${activeTasks.size} 个进行中`,
  });
}

function closeTranslationStatusBar(): void {
  hideTranslationStatusBar();
  statusBarCloseTimer = null;
  completedTaskCount = 0;
  failedTaskCount = 0;
  lastFailureMessage = "";
}

function registerStatusBarIfNeeded(win: Window): void {
  const bar = win.document.getElementById("babeldoctranslator-status-bar");
  if (bar) return;
  registerTranslationStatusBar(win);
}

function clearStatusBarCloseTimer(): void {
  if (statusBarCloseTimer === null) return;
  clearTimeout(statusBarCloseTimer);
  statusBarCloseTimer = null;
}

function truncateProgressLabel(label: string): string {
  return label.length > 42 ? `${label.slice(0, 39)}...` : label;
}

function compactProgressError(message: string): string {
  const compact = message.replace(/\s+/g, " ").trim();
  return compact.length > 120 ? `${compact.slice(0, 117)}...` : compact;
}

function getTaskKey(attachmentID: number, kind: TranslationTaskKind): string {
  return `${kind}:${attachmentID}`;
}

async function getAttachmentPath(attachment: any): Promise<string> {
  if (typeof attachment.getFilePathAsync === "function") {
    const value = await attachment.getFilePathAsync();
    return typeof value === "string" ? value : value?.path || "";
  }
  if (typeof attachment.getFilePath === "function") {
    const value = await attachment.getFilePath();
    return typeof value === "string" ? value : value?.path || "";
  }
  return "";
}

async function findTranslatedPDF(
  outputDirectory: string,
  inputStem: string,
  targetLanguage: string,
  outputMode: "mono" | "dual",
): Promise<string | null> {
  const suffix = outputMode === "dual" ? "dual" : "mono";
  const expected = [
    `${inputStem}.no_watermark.${targetLanguage}.${suffix}.pdf`,
    `${inputStem}.${targetLanguage}.${suffix}.pdf`,
    `${inputStem}.debug.no_watermark.${targetLanguage}.${suffix}.pdf`,
  ];
  for (const filename of expected) {
    const path = joinPath(outputDirectory, filename);
    if (await pathExists(path)) return path;
  }

  try {
    const children = await getIOUtils().getChildren(outputDirectory);
    const outputFiles = (children as string[]).filter((path) =>
      new RegExp(`\\.${suffix}\\.pdf$`, "i").test(path),
    );
    const languageToken = `.${targetLanguage.toLowerCase()}.${suffix}.pdf`;
    const languageMatches = outputFiles.filter((path) =>
      path.toLowerCase().endsWith(languageToken),
    );
    if (languageMatches.length > 0) {
      return languageMatches.sort().reverse()[0];
    }
    // Never import an arbitrary `.mono.pdf`/`.dual.pdf` file.  BabelDOC's
    // target-language suffix is the only reliable way to distinguish a
    // translated result from a copied or partially generated source PDF.
    return null;
  } catch {
    return null;
  }
}

interface TranslationTrackingParagraph {
  input?: unknown;
  output?: unknown;
  llm_translate_trackers?: unknown;
}

async function validateTranslationResult(
  inputPath: string,
  targetLanguage: string,
  workingDirectory: string,
): Promise<void> {
  const trackingPath = joinPath(
    workingDirectory,
    getFileStem(inputPath),
    "translate_tracking.json",
  );
  if (!(await pathExists(trackingPath))) {
    throw new Error(
      "BabelDOC 未生成翻译记录，无法确认模型返回已被应用。已阻止导入结果 PDF。",
    );
  }

  let tracking: unknown;
  try {
    tracking = JSON.parse(await getIOUtils().readUTF8(trackingPath));
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    throw new Error(
      `BabelDOC 翻译记录无法读取，已阻止导入结果 PDF。${compactProgressError(details)}`,
      { cause: error },
    );
  }

  const paragraphs: TranslationTrackingParagraph[] = [];
  collectTranslationTrackingParagraphs(tracking, paragraphs);
  if (paragraphs.length === 0) {
    throw new Error(
      "BabelDOC 没有记录任何可验证的翻译段落，已阻止导入结果 PDF。",
    );
  }

  const inputs = paragraphs.map((paragraph) =>
    getTrackingText(paragraph.input),
  );
  const outputs = paragraphs.map((paragraph) =>
    getTrackingText(paragraph.output),
  );
  const missingOutputCount = outputs.filter((output, index) => {
    return inputs[index].trim().length > 0 && output.trim().length === 0;
  }).length;
  if (missingOutputCount > 0) {
    throw new Error(
      `BabelDOC 有 ${missingOutputCount} 个翻译段落没有返回内容，已阻止导入结果 PDF。`,
    );
  }

  const sourceText = inputs.join(" ");
  const translatedText = outputs.join(" ");
  if (
    sourceText.trim().length > 0 &&
    normalizeForComparison(sourceText) ===
      normalizeForComparison(translatedText)
  ) {
    throw new Error(
      "BabelDOC 返回的翻译文本与原文完全相同，已阻止导入英文 PDF。",
    );
  }

  const signal = getTargetLanguageSignal(targetLanguage);
  if (!signal) return;

  const sourceLetterCount = countSourceLetters(sourceText, targetLanguage);
  const targetSignalCount = countMatches(translatedText, signal.pattern);
  const requiredSignals = Math.max(
    signal.minimumSignals,
    Math.floor(sourceLetterCount * 0.1),
  );
  if (sourceLetterCount > 0 && targetSignalCount < requiredSignals) {
    throw new Error(
      `BabelDOC 返回的内容疑似仍为原文：目标语言 ${targetLanguage} 检测到 ${targetSignalCount} 个目标文字，至少需要 ${requiredSignals} 个。已阻止导入英文 PDF。`,
    );
  }
}

function collectTranslationTrackingParagraphs(
  value: unknown,
  paragraphs: TranslationTrackingParagraph[],
): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) {
      collectTranslationTrackingParagraphs(item, paragraphs);
    }
    return;
  }

  const object = value as Record<string, unknown>;
  if (
    Object.prototype.hasOwnProperty.call(object, "input") &&
    Object.prototype.hasOwnProperty.call(object, "output") &&
    Object.prototype.hasOwnProperty.call(object, "llm_translate_trackers")
  ) {
    paragraphs.push(object as TranslationTrackingParagraph);
  }
  for (const child of Object.values(object)) {
    collectTranslationTrackingParagraphs(child, paragraphs);
  }
}

function getTrackingText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function getTargetLanguageSignal(
  targetLanguage: string,
): { pattern: RegExp; minimumSignals: number } | null {
  const normalized = targetLanguage.toLowerCase().replaceAll("_", "-");
  if (
    normalized === "zh" ||
    normalized === "zh-cn" ||
    normalized === "zh-hans"
  ) {
    return { pattern: /[\u3400-\u9fff]/g, minimumSignals: 8 };
  }
  if (normalized === "ja" || normalized === "ja-jp") {
    return {
      pattern: /[\u3040-\u30ff\u3400-\u9fff]/g,
      minimumSignals: 8,
    };
  }
  if (normalized === "ko" || normalized === "ko-kr") {
    return { pattern: /[\uac00-\ud7af]/g, minimumSignals: 8 };
  }
  if (["ru", "uk", "bg", "sr"].includes(normalized)) {
    return { pattern: /[\u0400-\u04ff]/g, minimumSignals: 8 };
  }
  return null;
}

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length || 0;
}

function countSourceLetters(text: string, targetLanguage: string): number {
  const normalized = targetLanguage.toLowerCase().replaceAll("_", "-");
  if (
    normalized === "zh" ||
    normalized === "zh-cn" ||
    normalized === "zh-hans" ||
    normalized === "ja" ||
    normalized === "ja-jp" ||
    normalized === "ko" ||
    normalized === "ko-kr"
  ) {
    return countMatches(text, /[A-Za-z]/g);
  }
  if (["ru", "uk", "bg", "sr"].includes(normalized)) {
    return countMatches(text, /[A-Za-z\u0400-\u04ff]/g);
  }
  return countMatches(text, /\p{L}/gu);
}

function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, "")
    .trim();
}

function redactDiagnostic(
  output: string,
  settings: ReturnType<typeof getSettings>,
): string {
  return output
    .replaceAll(settings.apiKey, "[API_KEY]")
    .replaceAll(settings.baseUrl, "[BASE_URL]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1000);
}
