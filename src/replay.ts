import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { exec } from "./seams/exec.ts";
import { recordBaseline, verifyAgainst } from "./seams/entire.ts";
import { addWorktree, changedFiles, parentOf, pruneWorktrees, removeWorktree, resolveSha, restoreFiles, type ChangedFile } from "./seams/git.ts";
import { step } from "./seams/trace.ts";
import { ReplayEnvError, type ExamConfig, type Mode, type ReplayResult, type VerifyResult } from "./types.ts";

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
 * then the commit's tests run on the commit's code against that baseline. In v2, when the
 * commit touched exam files, the parent's exam also runs on the commit's code: the tests as
 * they were before the agent touched them. All three run in scratch worktrees pinned to fixed
 * SHAs, so nothing depends on HEAD.
 */
async function attempt(
  repo: string,
  commit: string,
  parent: string,
  cfg: ExamConfig,
  dir: string,
  examChanges: ChangedFile[],
  mode: Mode,
) {
  const parentTree = join(dir, "parent");
  const commitTree = join(dir, "commit");
  const originalTree = join(dir, "original-exam");
  const baselineFile = join(dir, "baseline.json");
  const replayOriginal = mode === "v2" && examChanges.length > 0;
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  try {
    await addWorktree(repo, parentTree, parent);
    await addWorktree(repo, commitTree, commit);
    if (replayOriginal) {
      await addWorktree(repo, originalTree, commit);
      await step("replay.restore_exam", "TOOL", { "revenant.commit": commit, "revenant.parent": parent, "revenant.files": examChanges.map((f) => `${f.status} ${f.path}`).join(", ") }, async () => {
        // Modified or deleted exam files go back to the parent's version. Exam files the commit added are removed.
        await restoreFiles(originalTree, parent, examChanges.filter((f) => f.status !== "A").map((f) => f.path));
        for (const f of examChanges.filter((f) => f.status === "A")) await rm(join(originalTree, f.path), { force: true });
      });
    }
    await setup(parentTree, "parent", cfg, commit);
    await setup(commitTree, "commit", cfg, commit);
    if (replayOriginal) await setup(originalTree, "original-exam", cfg, commit);

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

    let originalExam: VerifyResult | null = null;
    if (replayOriginal) {
      originalExam = await step("replay.original_exam", "TOOL", { "revenant.commit": commit, "revenant.parent": parent }, async (span) => {
        const r = await verifyAgainst(originalTree, cfg.test, baselineFile);
        span.setAttribute("revenant.verdict_line", r.line);
        span.setAttribute("revenant.outcome", r.outcome);
        return r;
      });
    }

    return { baseline, asCommitted, originalExam };
  } finally {
    await removeWorktree(repo, parentTree);
    await removeWorktree(repo, commitTree);
    if (replayOriginal) await removeWorktree(repo, originalTree);
    await rm(dir, { recursive: true, force: true });
  }
}

export async function replay(repo: string, rev: string, cfg: ExamConfig, workRoot: string, mode: Mode): Promise<ReplayResult> {
  const commit = await resolveSha(repo, rev);
  const parent = await parentOf(repo, commit);
  await pruneWorktrees(repo);

  return step("replay", "CHAIN", { "revenant.commit": commit, "revenant.parent": parent, "revenant.exam": cfg.test, "revenant.mode": mode }, async (span) => {
    const examChanges = await changedFiles(repo, parent, commit, cfg.exam);
    const examFilesChanged = examChanges.map((f) => `${f.status} ${f.path}`);
    span.setAttribute("revenant.exam_files_changed", examFilesChanged.join(", "));

    for (let n = 1; ; n++) {
      try {
        const dir = join(workRoot, commit.slice(0, 12));
        const { baseline, asCommitted, originalExam } = await attempt(repo, commit, parent, cfg, dir, examChanges, mode);
        span.setAttribute("revenant.attempts", n);
        return { commit, parent, mode, exam: cfg.test, baseline, asCommitted, originalExam, examFilesChanged, attempts: n };
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
