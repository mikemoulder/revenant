// Shared shapes. Changes here touch every stage, so keep them deliberate.

export type Verdict = "keep" | "revert" | "stale" | "freeze";

/** How one `entire graph verify` run reads, reduced to what a decision can use. */
export type VerifyOutcome = "holds" | "regression" | "unknown";

export interface VerifyResult {
  outcome: VerifyOutcome;
  /** The `VERDICT:` line exactly as printed. It goes in the ledger and the PR. */
  line: string;
  newlyFailing: string[];
  /** verify could not parse the runner and fell back to the exit code. Never revert on this. */
  exitCodeOnly: boolean;
}

/** The exam: how to run the tests and which files count as the tests. */
export interface ExamConfig {
  /** Test command, run by verify inside each worktree. */
  test: string;
  /** Run before verify in each worktree, e.g. `npm ci`. A failure here is a replay env failure. */
  setup?: string;
  /** Git pathspec globs for test files, test config and snapshots. */
  exam: string[];
}

/** v1 trusts the commit's own tests, as CI does. v2 also replays the parent's tests on the commit's code. */
export type Mode = "v1" | "v2";

export interface ReplayResult {
  commit: string;
  parent: string;
  mode: Mode;
  exam: string;
  /** The parent's own tests on the parent's code. */
  baseline: string;
  /** The commit's tests on the commit's code. What CI would say. */
  asCommitted: VerifyResult;
  /**
   * The commit's code with the parent's exam files restored: the tests as they were before
   * the agent touched them. Null in v1, or when the commit changed no exam files.
   */
  originalExam: VerifyResult | null;
  /** Exam files the commit added, modified or deleted. */
  examFilesChanged: string[];
  attempts: number;
}

export interface Decision {
  verdict: Verdict;
  reason: string;
}

/** A replay could not run (setup failed, verify crashed). Retry once, then freeze. */
export class ReplayEnvError extends Error {
  readonly stage: string;
  constructor(stage: string, message: string) {
    super(`${stage}: ${message}`);
    this.name = "ReplayEnvError";
    this.stage = stage;
  }
}
