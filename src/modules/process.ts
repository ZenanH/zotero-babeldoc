export interface ProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export async function runExternalProcess(
  command: string,
  args: string[],
  options: { workdir?: string; environment?: Record<string, string> } = {},
): Promise<ProcessResult> {
  const { Subprocess } = ChromeUtils.importESModule(
    "resource://gre/modules/Subprocess.sys.mjs",
  );
  const child = await Subprocess.call({
    command,
    arguments: args,
    workdir: options.workdir,
    environment: options.environment,
    environmentAppend: Boolean(options.environment),
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdoutPromise = readPipe(child.stdout);
  const stderrPromise = readPipe(child.stderr);
  const result = await child.wait();
  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);
  return {
    exitCode: typeof result === "number" ? result : result.exitCode,
    stdout,
    stderr,
  };
}

async function readPipe(pipe: any): Promise<string> {
  if (!pipe) return "";
  let output = "";
  while (true) {
    const chunk = await pipe.readString();
    if (!chunk) break;
    output += chunk;
  }
  return output;
}
