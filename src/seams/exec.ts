import { spawn } from "node:child_process";

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

interface ExecOptions {
  cwd?: string;
  timeoutMs?: number;
  /** Run `cmd` through the shell. Only for operator-configured test and setup commands. */
  shell?: boolean;
}

/** Run a process to completion. Never throws on a non-zero exit; callers decide what failure means. */
export function exec(cmd: string, args: string[], opts: ExecOptions = {}): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      shell: opts.shell ?? false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill("SIGKILL");
        }, opts.timeoutMs)
      : undefined;
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr, timedOut });
    });
  });
}

/** Like exec, but a non-zero exit is an error. For git plumbing that must succeed. */
export async function execOk(cmd: string, args: string[], opts: ExecOptions = {}): Promise<string> {
  const r = await exec(cmd, args, opts);
  if (r.code !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} exited ${r.code}: ${r.stderr.trim() || r.stdout.trim()}`);
  }
  return r.stdout;
}
