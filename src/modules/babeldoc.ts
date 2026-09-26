import { EMBEDDED_REQUIREMENTS_LOCK } from "./runtimeLock";
import {
  ensureDirectory,
  getHomeDirectory,
  getIOUtils,
  getManagedBabelDocInstallCommand,
  getManagedBabelDocPythonPath,
  getManagedRuntimeManifestPath,
  getManagedRuntimesDirectory,
  getManagedPythonDirectory,
  getManagedUvDirectory,
  getManagedUvPath,
  getPathUtils,
  joinPath,
  pathExists,
  removeDirectory,
  REQUIRED_BABELDOC_VERSION,
  REQUIRED_PYTHON_VERSION,
  REQUIRED_UV_VERSION,
  RUNTIME_ID,
  writeTextAtomically,
} from "./settings";
import { runExternalProcess } from "./process";

export interface BabelDocInstallation {
  path: string;
  version: string;
  runtimePath: string;
  uvPath: string;
}

interface RuntimeManifest {
  runtimeId: string;
  uvVersion: string;
  pythonVersion: string;
  babeldocVersion: string;
  environmentPath: string;
  installedAt: string;
}

let deploymentPromise: Promise<BabelDocInstallation> | null = null;
const activeRuntimeUsers = new Map<string, number>();

export async function detectBabelDoc(): Promise<BabelDocInstallation> {
  const manifest = await readRuntimeManifest();
  if (!manifest) {
    throw new Error(
      `未部署插件专用的 BabelDOC ${REQUIRED_BABELDOC_VERSION}。${getManagedBabelDocInstallCommand()}`,
    );
  }
  if (
    manifest.runtimeId !== RUNTIME_ID ||
    manifest.uvVersion !== REQUIRED_UV_VERSION ||
    manifest.pythonVersion !== REQUIRED_PYTHON_VERSION ||
    manifest.babeldocVersion !== REQUIRED_BABELDOC_VERSION
  ) {
    throw new Error(
      `当前插件需要 BabelDOC ${REQUIRED_BABELDOC_VERSION}、uv ${REQUIRED_UV_VERSION} 和 Python ${REQUIRED_PYTHON_VERSION}。请点击“部署 / 修复 BabelDOC”。`,
    );
  }

  const uvPath = await findWorkingUv();
  const executablePath = getBabelDocExecutablePath(manifest.environmentPath);
  if (!(await pathExists(executablePath))) {
    throw new Error(
      `插件专用 BabelDOC 环境不完整。请点击“部署 / 修复 BabelDOC”。`,
    );
  }

  const result = await runExternalProcess(executablePath, ["--version"]);
  const version = parseVersion(result.stdout || result.stderr);
  if (result.exitCode !== 0 || version !== REQUIRED_BABELDOC_VERSION) {
    throw new Error(
      `插件专用 BabelDOC 版本不匹配，检测到 ${version || "未知版本"}，需要 ${REQUIRED_BABELDOC_VERSION}。请点击“部署 / 修复 BabelDOC”。`,
    );
  }

  return {
    path: executablePath,
    version,
    runtimePath: manifest.environmentPath,
    uvPath,
  };
}

export async function deployBabelDoc(): Promise<BabelDocInstallation> {
  if (deploymentPromise) return deploymentPromise;
  deploymentPromise = deployBabelDocInternal().finally(() => {
    deploymentPromise = null;
  });
  return deploymentPromise;
}

async function deployBabelDocInternal(): Promise<BabelDocInstallation> {
  const uvPath = await ensureUv();
  const runtimesDirectory = getManagedRuntimesDirectory();
  await ensureDirectory(runtimesDirectory);
  const deploymentSuffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const runtimeDirectory = joinPath(
    runtimesDirectory,
    `runtime-${RUNTIME_ID}-${deploymentSuffix}`,
  );
  const environmentPath = joinPath(runtimeDirectory, "venv");

  try {
    await ensureDirectory(runtimeDirectory);
    await writeTextAtomically(
      joinPath(runtimeDirectory, "requirements.lock"),
      EMBEDDED_REQUIREMENTS_LOCK,
    );

    await runUv(uvPath, [
      "python",
      "install",
      "--install-dir",
      getManagedPythonDirectory(),
      REQUIRED_PYTHON_VERSION,
    ]);
    const pythonResult = await runExternalProcess(
      uvPath,
      [
        "python",
        "find",
        "--managed-python",
        "--no-project",
        REQUIRED_PYTHON_VERSION,
      ],
      { environment: { UV_PYTHON_INSTALL_DIR: getManagedPythonDirectory() } },
    );
    if (pythonResult.exitCode !== 0 || !pythonResult.stdout.trim()) {
      throw new Error("无法定位插件专用 Python 运行时。");
    }
    await runUv(uvPath, [
      "venv",
      "--no-project",
      "--python",
      pythonResult.stdout.trim(),
      environmentPath,
    ]);

    const pythonPath = getManagedBabelDocPythonPath(environmentPath);
    await runUv(uvPath, [
      "pip",
      "sync",
      joinPath(runtimeDirectory, "requirements.lock"),
      "--python",
      pythonPath,
      "--require-hashes",
      "--strict",
    ]);

    const executablePath = getBabelDocExecutablePath(environmentPath);
    const versionResult = await runExternalProcess(executablePath, [
      "--version",
    ]);
    const version = parseVersion(versionResult.stdout || versionResult.stderr);
    if (versionResult.exitCode !== 0 || version !== REQUIRED_BABELDOC_VERSION) {
      throw new Error(
        `部署完成后 BabelDOC 校验失败：检测到 ${version || "未知版本"}，需要 ${REQUIRED_BABELDOC_VERSION}。`,
      );
    }

    const manifest: RuntimeManifest = {
      runtimeId: RUNTIME_ID,
      uvVersion: REQUIRED_UV_VERSION,
      pythonVersion: REQUIRED_PYTHON_VERSION,
      babeldocVersion: REQUIRED_BABELDOC_VERSION,
      environmentPath,
      installedAt: new Date().toISOString(),
    };
    await writeTextAtomically(
      getManagedRuntimeManifestPath(),
      JSON.stringify(manifest, null, 2),
    );
    await cleanupOldRuntimes(environmentPath);

    return {
      path: getBabelDocExecutablePath(environmentPath),
      version,
      runtimePath: environmentPath,
      uvPath,
    };
  } catch (error) {
    await removeDirectory(runtimeDirectory);
    throw new Error(
      `BabelDOC 部署失败。${compactDiagnostic(error instanceof Error ? error.message : String(error))}`,
      { cause: error },
    );
  }
}

export function acquireBabelDocRuntime(runtimePath: string): () => void {
  activeRuntimeUsers.set(
    runtimePath,
    (activeRuntimeUsers.get(runtimePath) || 0) + 1,
  );
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const remaining = (activeRuntimeUsers.get(runtimePath) || 1) - 1;
    if (remaining > 0) activeRuntimeUsers.set(runtimePath, remaining);
    else activeRuntimeUsers.delete(runtimePath);
    void cleanupActiveRuntimeAndStaleRuntimes();
  };
}

async function ensureUv(): Promise<string> {
  const managedPath = getManagedUvPath();
  if (await hasRequiredUvVersion(managedPath)) return managedPath;

  for (const candidate of await getUvCandidates()) {
    if (await hasRequiredUvVersion(candidate)) return candidate;
  }

  await ensureDirectory(getManagedUvDirectory());
  const result =
    Services.appinfo.OS === "WINNT"
      ? await runExternalProcess(getWindowsPowerShellPath(), [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          `$env:UV_INSTALL_DIR='${escapePowerShell(getManagedUvDirectory())}'; $env:UV_NO_MODIFY_PATH='1'; irm https://astral.sh/uv/${REQUIRED_UV_VERSION}/install.ps1 | iex`,
        ])
      : await runExternalProcess("/bin/sh", [
          "-c",
          `curl -LsSf https://astral.sh/uv/${REQUIRED_UV_VERSION}/install.sh | env UV_INSTALL_DIR=${shellQuote(getManagedUvDirectory())} UV_NO_MODIFY_PATH=1 sh`,
        ]);
  if (result.exitCode !== 0 || !(await hasRequiredUvVersion(managedPath))) {
    throw new Error(
      `无法配置固定版本 uv ${REQUIRED_UV_VERSION}。${compactDiagnostic(result.stderr || result.stdout)}`,
    );
  }
  return managedPath;
}

async function getUvCandidates(): Promise<string[]> {
  const home = getHomeDirectory();
  const executable = Services.appinfo.OS === "WINNT" ? "uv.exe" : "uv";
  const candidates = [
    joinPath(home, ".local", "bin", executable),
    joinPath(home, ".cargo", "bin", executable),
    ...(Services.appinfo.OS === "WINNT"
      ? [joinPath(home, "AppData", "Local", "Programs", "uv", executable)]
      : [
          joinPath("/opt", "homebrew", "bin", executable),
          joinPath("/usr", "local", "bin", executable),
          joinPath("/usr", "bin", executable),
        ]),
  ];
  const command =
    Services.appinfo.OS === "WINNT" ? getWindowsWherePath() : "/bin/sh";
  const args =
    Services.appinfo.OS === "WINNT"
      ? ["uv.exe"]
      : ["-c", "command -v uv 2>/dev/null || true"];
  try {
    const result = await runExternalProcess(command, args);
    candidates.push(
      ...result.stdout
        .split(/\r?\n/)
        .map((path) => path.trim())
        .filter(Boolean),
    );
  } catch {
    // The explicit well-known paths above are enough when shell lookup is unavailable.
  }
  return [...new Set(candidates)];
}

async function findWorkingUv(): Promise<string> {
  const candidates = [getManagedUvPath(), ...(await getUvCandidates())];
  for (const candidate of [...new Set(candidates)]) {
    if (await hasRequiredUvVersion(candidate)) return candidate;
  }
  throw new Error(
    `未找到固定版本 uv ${REQUIRED_UV_VERSION}。请点击“部署 / 修复 BabelDOC”重新配置。`,
  );
}

async function hasRequiredUvVersion(path: string): Promise<boolean> {
  if (!(await pathExists(path))) return false;
  try {
    const result = await runExternalProcess(path, ["--version"]);
    return (
      result.exitCode === 0 &&
      new RegExp(`\\b${escapeRegExp(REQUIRED_UV_VERSION)}\\b`).test(
        result.stdout || result.stderr,
      )
    );
  } catch {
    return false;
  }
}

async function runUv(path: string, args: string[]): Promise<void> {
  const result = await runExternalProcess(path, ["--no-progress", ...args], {
    environment: { UV_PYTHON_INSTALL_DIR: getManagedPythonDirectory() },
  });
  if (result.exitCode !== 0) {
    throw new Error(compactDiagnostic(result.stderr || result.stdout));
  }
}

async function readRuntimeManifest(): Promise<RuntimeManifest | null> {
  const path = getManagedRuntimeManifestPath();
  if (!(await pathExists(path))) return null;
  try {
    const value = JSON.parse(await getIOUtils().readUTF8(path));
    if (
      !value ||
      typeof value.environmentPath !== "string" ||
      typeof value.runtimeId !== "string"
    ) {
      return null;
    }
    const runtimeDirectory = getPathUtils().parent(value.environmentPath);
    if (
      getPathUtils().parent(runtimeDirectory) !==
        getManagedRuntimesDirectory() ||
      getPathUtils().filename(value.environmentPath) !== "venv" ||
      !isManagedRuntimeDirectory(runtimeDirectory)
    ) {
      return null;
    }
    return value as RuntimeManifest;
  } catch {
    return null;
  }
}

function getBabelDocExecutablePath(environmentPath: string): string {
  const directory = Services.appinfo.OS === "WINNT" ? "Scripts" : "bin";
  const executable =
    Services.appinfo.OS === "WINNT" ? "babeldoc.exe" : "babeldoc";
  return joinPath(environmentPath, directory, executable);
}

async function cleanupOldRuntimes(
  activeEnvironmentPath: string,
): Promise<void> {
  const activeDirectory = getPathUtils().parent(activeEnvironmentPath);
  const parent = getManagedRuntimesDirectory();
  try {
    const children = await getIOUtils().getChildren(parent);
    for (const child of children as string[]) {
      if (!isManagedRuntimeDirectory(child)) continue;
      if (child === activeDirectory || isRuntimeInUse(child)) continue;
      await removeDirectory(child);
    }
  } catch (error) {
    ztoolkit.log("Failed to clean old BabelDOC runtimes", error);
  }
}

function getManagedBabelDocVenvPathForRuntime(runtimePath: string): string {
  return joinPath(runtimePath, "venv");
}

async function cleanupActiveRuntimeAndStaleRuntimes(): Promise<void> {
  const manifest = await readRuntimeManifest();
  if (!manifest) return;
  await cleanupOldRuntimes(
    getManagedBabelDocVenvPathForRuntime(manifest.environmentPath),
  );
}

function isRuntimeInUse(runtimeDirectory: string): boolean {
  for (const [runtimePath, count] of activeRuntimeUsers) {
    if (count > 0 && getPathUtils().parent(runtimePath) === runtimeDirectory) {
      return true;
    }
  }
  return false;
}

function isManagedRuntimeDirectory(path: string): boolean {
  const name = getPathUtils().filename(path);
  return name.startsWith(`runtime-${RUNTIME_ID}-`);
}

function parseVersion(output: string): string | null {
  const match = output.match(/\b(\d+\.\d+\.\d+)\b/);
  return match?.[1] || null;
}

function compactDiagnostic(output: string): string {
  const compact = output.replace(/\s+/g, " ").trim();
  return compact ? `\n${compact.slice(0, 500)}` : "";
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function escapePowerShell(value: string): string {
  return value.replaceAll("'", "''");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getWindowsPowerShellPath(): string {
  const windowsDirectory = Services.dirsvc.get(
    "WinD",
    Components.interfaces.nsIFile,
  ).path;
  return joinPath(
    windowsDirectory,
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
}

function getWindowsWherePath(): string {
  const windowsDirectory = Services.dirsvc.get(
    "WinD",
    Components.interfaces.nsIFile,
  ).path;
  return joinPath(windowsDirectory, "System32", "where.exe");
}
