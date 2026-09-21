import {
  getManagedBabelDocInstallCommand,
  getManagedBabelDocVenvPath,
  joinPath,
  pathExists,
  REQUIRED_BABELDOC_VERSION,
} from "./settings";
import { runExternalProcess } from "./process";

export interface BabelDocInstallation {
  path: string;
  version: string;
}

export async function detectBabelDoc(): Promise<BabelDocInstallation> {
  const path = getManagedBabelDocExecutablePath();
  if (!(await pathExists(path))) {
    throw new Error(
      `未找到插件专用的 BabelDOC ${REQUIRED_BABELDOC_VERSION}。请在 Zotero 外运行：\n` +
        getManagedBabelDocInstallCommand(),
    );
  }

  let result;
  try {
    result = await runExternalProcess(path, ["--version"]);
  } catch (error) {
    const message = `无法启动插件专用 BabelDOC。\n${
      error instanceof Error ? error.message : String(error)
    }`;
    throw new Error(message, { cause: error });
  }

  const version = parseVersion(result.stdout || result.stderr);
  if (result.exitCode !== 0 || !version) {
    const diagnostic = compactDiagnostic(result.stderr || result.stdout);
    throw new Error(
      `插件专用 BabelDOC 无法运行。${
        diagnostic ? `\n诊断信息：${diagnostic}` : ""
      }\n请重新运行：\n${getManagedBabelDocInstallCommand()}`,
    );
  }
  if (version !== REQUIRED_BABELDOC_VERSION) {
    throw new Error(
      `插件专用环境中的 BabelDOC 为 ${version}，插件要求 ${REQUIRED_BABELDOC_VERSION}。\n` +
        `请重新运行：\n${getManagedBabelDocInstallCommand()}`,
    );
  }

  return { path, version };
}

function getManagedBabelDocExecutablePath(): string {
  const executableDirectory =
    Services.appinfo.OS === "WINNT" ? "Scripts" : "bin";
  const executable =
    Services.appinfo.OS === "WINNT" ? "babeldoc.exe" : "babeldoc";
  return joinPath(
    getManagedBabelDocVenvPath(),
    executableDirectory,
    executable,
  );
}

function parseVersion(output: string): string | null {
  const match = output.match(/\b(\d+\.\d+\.\d+)\b/);
  return match?.[1] || null;
}

function compactDiagnostic(output: string): string {
  return output.replace(/\s+/g, " ").trim().slice(0, 240);
}
