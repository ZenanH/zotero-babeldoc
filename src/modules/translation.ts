import {
  createTaskDirectory,
  getFileStem,
  getIOUtils,
  getSettings,
  joinPath,
  pathExists,
  removeDirectory,
  renderBabelDocToml,
  validateSettings,
  writeManagedConfig,
  writeTextAtomically,
} from "./settings";
import { detectBabelDoc } from "./babeldoc";
import { runExternalProcess } from "./process";
import { getSelectedPdfAttachment } from "./menu";
import {
  hideTranslationStatusBar,
  registerTranslationStatusBar,
  showTranslationStatusBar,
} from "./statusBar";

const activeAttachments = new Set<number>();
const activeTasks = new Map<
  number,
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
    taskDirectory = await createTaskDirectory();
    const outputDirectory = joinPath(taskDirectory, "output");
    const workingDirectory = joinPath(taskDirectory, "working");
    const taskConfigPath = joinPath(taskDirectory, "babeldoc.toml");

    updateTranslationTask(attachment.id, "保存 BabelDOC 配置");
    await writeManagedConfig(settings);
    await writeTextAtomically(taskConfigPath, renderBabelDocToml(settings));

    updateTranslationTask(attachment.id, `BabelDOC ${babeldoc.version} 翻译中`);
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
      ],
      { workdir: taskDirectory },
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
      settings.targetLanguage,
      settings.translationOutputMode,
    );
    if (!outputPath) {
      throw new Error(
        settings.translationOutputMode === "dual"
          ? "BabelDOC 已结束，但没有找到原文+译文 PDF。"
          : "BabelDOC 已结束，但没有找到中文翻译 PDF。",
      );
    }

    updateTranslationTask(attachment.id, "导入 Zotero 子附件");
    const parentItem = (await Zotero.Items.getAsync(parentID)) as any;
    const parentTitle = parentItem?.getField("title") || getFileStem(inputPath);
    const imported = await Zotero.Attachments.importFromFile({
      file: outputPath,
      parentItemID: parentID,
      title: `${parentTitle} [BabelDOC ${settings.targetLanguage}]`,
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
    if (taskDirectory) await removeDirectory(taskDirectory);
  }
}

function registerTranslationTask(attachment: any, win: Window): void {
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
  activeTasks.set(attachment.id, {
    label,
    stage: "等待开始",
    updatedAt: Date.now(),
  });
  registerStatusBarIfNeeded(win);
  refreshTranslationStatusBar();
}

function updateTranslationTask(attachmentID: number, stage: string): void {
  const task = activeTasks.get(attachmentID);
  if (!task) return;
  task.stage = stage;
  task.updatedAt = Date.now();
  refreshTranslationStatusBar();
}

function finishTranslationTask(
  attachmentID: number,
  success: boolean,
  errorMessage = "",
): void {
  const task = activeTasks.get(attachmentID);
  if (!task) return;
  activeTasks.delete(attachmentID);
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
        ? `全部翻译完成，共成功 ${completedTaskCount} 个任务`
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
    const matches = (children as string[])
      .filter((path) => new RegExp(`\\.${suffix}\\.pdf$`, "i").test(path))
      .sort()
      .reverse();
    return matches[0] || null;
  } catch {
    return null;
  }
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
