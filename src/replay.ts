import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { exec } from "./seams/exec.ts";
import { recordBaseline, verifyAgainst } from "./seams/entire.ts";
import { addWorktree, changedFiles, parentOf, pruneWorktrees, removeWorktree, resolveSha } from "./seams/git.ts";
import { step } from "./seams/trace.ts";
import { ReplayEnvError, type ExamConfig, type ReplayResult } from "./types.ts";

const SETUP_TIMEOUT_MS = 180_000;
const MAX_ATTEMPTS = 2;

async function setup(worktree: string, role: string, cfg: ExamConfig, commit: string): Promise<void> {
  if (!cfg.setup) return;
  await step("replay.setup", "TOOL", { "revenant.commit": commit, "revenant.role": role, "revenant.setup": cfg.setup }, async () => {
    const r = await exec(cfg.setup!, [], { cwd: worktree, shell: true, timeoutMs: SETUP_TIMEOUT_MS });
    if (r.code !== 0 || r.timedOut) {
      const why = r.timedOut ? "timed out" : `exited ${r.code}: ${r.stderr.trim().split("\n").slice(-3).join(" | ")}`;
      throw new ReplayEnvError("setup", `${role}: ${why}`);
    }
  });
}

/**
 * One replay attempt. The parent's tests run on the parent's code to record a baseline,
 * then the commit's tests run on the commit's code against that baseline.
 * Both run in scratch worktrees pinned to fixed SHAs, so nothing depends on HEAD.
 */
async function attempt(repo: string, commit: string, parent: string, cfg: ExamConfig, dir: string) {
  const parentTree = join(dir, "parent");
  const commitTree = join(dir, "commit");
  const baselineFile = join(dir, "baseline.json");
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  try {
    await addWorktree(repo, parentTree, parent);
    await addWorktree(repo, commitTree, commit);
    await setup(parentTree, "parent", cfg, commit);
    await setup(commitTree, "commit", cfg, commit);

    const baseline = await step("replay.baseline", "TOOL", { "revenant.commit": commit, "revenant.parent": parent }, async (span) => {
      const line = await recordBaseline(parentTree, cfg.test, baselineFile);
      span.setAttribute("revenant.baseline", line);
      return line;
    });

    const asCommitted = await step("replay.as_committed", "TOOL", { "revenant.commit": commit }, async (span) => {
      const r = await verifyAgainst(commitTree, cfg.test, baselineFile);
      span.setAttribute("revenant.verdict_line", r.line);
      span.setAttribute("revenant.outcome", r.outcome);
      return r;
    });

    return { baseline, asCommitted };
  } finally {
    await removeWorktree(repo, parentTree);
    await removeWorktree(repo, commitTree);
    await rm(dir, { recursive: true, force: true });
  }
}

export async function replay(repo: string, rev: string, cfg: ExamConfig, workRoot: string): Promise<ReplayResult> {
  const commit = await resolveSha(repo, rev);
  const parent = await parentOf(repo, commit);
  await pruneWorktrees(repo);

  return step("replay", "CHAIN", { "revenant.commit": commit, "revenant.parent": parent, "revenant.exam": cfg.test }, async (span) => {
    const examFilesChanged = (await changedFiles(repo, parent, commit, cfg.exam)).map((f) => `${f.status} ${f.path}`);
    span.setAttribute("revenant.exam_files_changed", examFilesChanged.join(", "));

    for (let n = 1; ; n++) {
      try {
        const { baseline, asCommitted } = await attempt(repo, commit, parent, cfg, join(workRoot, commit.slice(0, 12)));
        span.setAttribute("revenant.attempts", n);
        return { commit, parent, exam: cfg.test, baseline, asCommitted, examFilesChanged, attempts: n };
      } catch (err) {
        if (!(err instanceof ReplayEnvError) || n >= MAX_ATTEMPTS) {
          span.setAttribute("revenant.attempts", n);
          throw err;
        }
        span.addEvent("replay.retry", { "revenant.attempt": n, "revenant.error": err.message });
      }
    }
  });
}
