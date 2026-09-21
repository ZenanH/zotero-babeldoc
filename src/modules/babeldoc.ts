import {
  getHomeDirectory,
  getLastBabelDocPath,
  joinPath,
  pathExists,
  REQUIRED_BABELDOC_VERSION,
  setLastBabelDocPath,
} from "./settings";
import { runExternalProcess } from "./process";

export interface BabelDocInstallation {
  path: string;
  version: string;
  uvPath?: string;
}

export async function detectBabelDoc(): Promise<BabelDocInstallation> {
  const candidates: Array<{ path: string; uvPath?: string }> = [];
  const lastPath = getLastBabelDocPath();
  if (lastPath) candidates.push({ path: lastPath });

  const uvPaths = await findUvPaths();
  for (const uvPath of uvPaths) {
    const dirs = await getUvToolDirectories(uvPath);
    for (const dir of dirs.binDirs) {
      candidates.push({
        path: joinPath(dir, executableName("babeldoc")),
        uvPath,
      });
    }
    for (const dir of dirs.toolDirs) {
      const environmentBin =
        Services.appinfo.OS === "WINNT" ? "Scripts" : "bin";
      candidates.push({
        path: joinPath(
          dir,
          "babeldoc",
          environmentBin,
          executableName("babeldoc"),
        ),
        uvPath,
      });
    }
  }

  const home = getHomeDirectory();
  candidates.push(
    { path: joinPath(home, ".local", "bin", executableName("babeldoc")) },
    { path: "/opt/homebrew/bin/babeldoc" },
    { path: "/usr/local/bin/babeldoc" },
  );

  const seen = new Set<string>();
  let lastFailure = "";
  for (const candidate of candidates) {
    if (!candidate.path || seen.has(candidate.path)) continue;
    seen.add(candidate.path);
    if (!(await pathExists(candidate.path))) continue;

    try {
      const result = await runExternalProcess(candidate.path, ["--version"]);
      const version = parseVersion(result.stdout || result.stderr);
      if (result.exitCode === 0 && version) {
        if (version !== REQUIRED_BABELDOC_VERSION) {
          throw new Error(
            `检测到 BabelDOC ${version}，插件要求 ${REQUIRED_BABELDOC_VERSION}。`,
          );
        }
        setLastBabelDocPath(candidate.path);
        return { ...candidate, version };
      }
      lastFailure = compactDiagnostic(result.stderr || result.stdout);
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
      if (lastFailure.includes("插件要求")) {
        throw error;
      }
    }
  }

  const suffix = lastFailure ? `\n诊断信息：${lastFailure}` : "";
  throw new Error(
    `未找到可用的 BabelDOC ${REQUIRED_BABELDOC_VERSION}。请先在 Zotero 外运行：\n` +
      `uv tool install --python 3.12 "BabelDOC==${REQUIRED_BABELDOC_VERSION}"` +
      suffix,
  );
}

async function findUvPaths(): Promise<string[]> {
  const suffix = executableName("");
  const home = getHomeDirectory();
  const candidates = [
    joinPath(home, ".local", "bin", `uv${suffix}`),
    joinPath(home, "AppData", "Local", "uv", `uv${suffix}`),
    "/opt/homebrew/bin/uv",
    "/usr/local/bin/uv",
    "/usr/bin/uv",
  ];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate) || !(await pathExists(candidate))) continue;
    seen.add(candidate);
    result.push(candidate);
  }

  try {
    const { Subprocess } = ChromeUtils.importESModule(
      "resource://gre/modules/Subprocess.sys.mjs",
    );
    if (typeof Subprocess.pathSearch === "function") {
      const searched = await Subprocess.pathSearch("uv");
      if (searched && !seen.has(searched)) result.push(searched);
    }
  } catch {
    // Candidate paths cover the standard uv installations.
  }
  return result;
}

async function getUvToolDirectories(
  uvPath: string,
): Promise<{ binDirs: string[]; toolDirs: string[] }> {
  const binDirs: string[] = [];
  const toolDirs: string[] = [];
  for (const args of [
    ["tool", "dir", "--bin"],
    ["tool", "dir"],
  ]) {
    try {
      const result = await runExternalProcess(uvPath, args);
      if (result.exitCode !== 0) continue;
      const directory = (result.stdout || "")
        .split(/\r?\n/)
        .map((line: string) => line.trim())
        .find(Boolean);
      if (!directory) continue;
      if (args.includes("--bin")) binDirs.push(directory);
      else toolDirs.push(directory);
    } catch {
      // Try the next uv candidate.
    }
  }
  return { binDirs, toolDirs };
}

function parseVersion(output: string): string | null {
  const match = output.match(/\b(\d+\.\d+\.\d+)\b/);
  return match?.[1] || null;
}

function compactDiagnostic(output: string): string {
  return output.replace(/\s+/g, " ").trim().slice(0, 240);
}

function executableName(name: string): string {
  const os = Services.appinfo.OS;
  return os === "WINNT" ? `${name}.exe` : name;
}
