import { execOk } from "./exec.ts";

const git = (repo: string, ...args: string[]) => execOk("git", ["-C", repo, ...args]);

export async function resolveSha(repo: string, rev: string): Promise<string> {
  return (await git(repo, "rev-parse", "--verify", `${rev}^{commit}`)).trim();
}

/** First parent. Revenant audits linear agent commits; merges are frozen upstream of this. */
export async function parentOf(repo: string, sha: string): Promise<string> {
  return resolveSha(repo, `${sha}^1`);
}

export async function committedAt(repo: string, sha: string): Promise<Date> {
  return new Date((await git(repo, "log", "-1", "--format=%cI", sha)).trim());
}

/** The full patch a commit introduced, for the warrant to read. */
export async function commitDiff(repo: string, parent: string, sha: string): Promise<string> {
  return git(repo, "diff", "--no-color", parent, sha);
}

export async function subjectOf(repo: string, sha: string): Promise<string> {
  return (await git(repo, "log", "-1", "--format=%s", sha)).trim();
}

export async function addWorktree(repo: string, path: string, sha: string): Promise<void> {
  await git(repo, "worktree", "add", "--force", "--detach", path, sha);
}

export async function removeWorktree(repo: string, path: string): Promise<void> {
  await git(repo, "worktree", "remove", "--force", path).catch(() => undefined);
}

export async function pruneWorktrees(repo: string): Promise<void> {
  await git(repo, "worktree", "prune");
}

/** Overwrite paths in a worktree with their content at another commit. */
export async function restoreFiles(worktree: string, fromSha: string, paths: string[]): Promise<void> {
  if (paths.length > 0) await git(worktree, "checkout", fromSha, "--", ...paths);
}

export interface ChangedFile {
  status: "A" | "M" | "D" | string;
  path: string;
}

/** Files a commit changed, limited to the given pathspec globs. Renames show as delete plus add. */
export async function changedFiles(
  repo: string,
  parent: string,
  sha: string,
  globs: string[],
): Promise<ChangedFile[]> {
  const pathspecs = globs.map((g) => `:(glob)${g}`);
  const out = await git(repo, "diff", "--name-status", "--no-renames", parent, sha, "--", ...pathspecs);
  return out
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [status, path] = line.split("\t");
      return { status, path };
    });
}
