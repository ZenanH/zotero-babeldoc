import { config } from "../../package.json";
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

const activeAttachments = new Set<number>();

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

  let progress: any;
  let taskDirectory = "";
  activeAttachments.add(attachment.id);
  try {
    progress = createProgressWindow();
    progress.update("准备 PDF");

    const inputPath = await getAttachmentPath(attachment);
    if (!inputPath || !(await pathExists(inputPath))) {
      throw new Error("找不到 PDF 的本地文件。请确认附件已下载到本机。");
    }

    progress.update("检测 BabelDOC");
    const babeldoc = await detectBabelDoc();
    taskDirectory = await createTaskDirectory();
    const outputDirectory = joinPath(taskDirectory, "output");
    const workingDirectory = joinPath(taskDirectory, "working");
    const taskConfigPath = joinPath(taskDirectory, "babeldoc.toml");

    progress.update("保存 BabelDOC 配置");
    await writeManagedConfig(settings);
    await writeTextAtomically(taskConfigPath, renderBabelDocToml(settings));

    progress.update(`启动 BabelDOC ${babeldoc.version}`);
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

    progress.update("查找翻译结果");
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

    progress.update("导入 Zotero 子附件");
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
    progress.finish("翻译完成，结果已添加到同一文献下。");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ztoolkit.log("BabelDOC translation failed", error);
    if (progress) progress.fail(message);
    else win.alert(message);
  } finally {
    activeAttachments.delete(attachment.id);
    if (taskDirectory) await removeDirectory(taskDirectory);
  }
}

function createProgressWindow() {
  const progressWindow = new ztoolkit.ProgressWindow(config.addonName, {
    closeOnClick: true,
    closeTime: -1,
  });
  progressWindow.createLine({ text: "准备翻译", type: "default" }).show();
  return {
    update(text: string) {
      progressWindow.changeLine({ text, type: "default" });
    },
    finish(text: string) {
      progressWindow.changeLine({ text, type: "success" });
      progressWindow.startCloseTimer(5000);
    },
    fail(text: string) {
      progressWindow.changeLine({ text, type: "fail" });
      progressWindow.startCloseTimer(12000);
    },
  };
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
