import { decideV1, decideV2, needsWarrant } from "./decide.ts";
import { replay } from "./replay.ts";
import { checkpointFor } from "./seams/entire.ts";
import { commitDiff, committedAt, resolveSha, subjectOf } from "./seams/git.ts";
import { judgeWarrant, ModelUnavailable } from "./seams/model.ts";
import { step } from "./seams/trace.ts";
import { ReplayEnvError, type Checkpoint, type Decision, type ExamConfig, type Mode, type ReplayResult, type Warrant } from "./types.ts";

export interface AuditResult {
  commit: string;
  subject: string;
  checkpoint: Checkpoint | null;
  replay: ReplayResult | null;
  warrant: Warrant | null;
  decision: Decision;
}

/**
 * One commit on trial. v1 only replays, as CI would. v2 follows the decision order:
 * no checkpoint freezes before anything runs, then the replays, then the warrant when
 * the commit changed behaviour its old tests pinned.
 */
export async function auditCommit(repo: string, rev: string, cfg: ExamConfig, workRoot: string, mode: Mode): Promise<AuditResult> {
  const commit = await resolveSha(repo, rev);
  const subject = await subjectOf(repo, commit);
  let checkpoint: Checkpoint | null = null;

  if (mode === "v2") {
    checkpoint = await step("resolve", "TOOL", { "revenant.commit": commit }, async (span) => {
      const cp = await checkpointFor(repo, commit, await committedAt(repo, commit));
      span.setAttribute("revenant.checkpoint", cp?.id ?? "none");
      if (cp) span.setAttribute("revenant.session", cp.sessions.map((s) => s.sessionId).join(","));
      return cp;
    });
    if (!checkpoint) {
      return { commit, subject, checkpoint, replay: null, warrant: null, decision: { verdict: "freeze", reason: "no checkpoint: there is no prompt to judge this commit against" } };
    }
  }

  let r: ReplayResult;
  try {
    r = await replay(repo, commit, cfg, workRoot, mode);
  } catch (err) {
    if (!(err instanceof ReplayEnvError)) throw err;
    return { commit, subject, checkpoint, replay: null, warrant: null, decision: { verdict: "freeze", reason: `replay environment failed twice: ${err.message}` } };
  }
  if (mode === "v1") return { commit, subject, checkpoint, replay: r, warrant: null, decision: decideV1(r) };

  let warrant: Warrant | null = null;
  let unavailable = "";
  if (needsWarrant(r) && checkpoint) {
    const cp = checkpoint;
    warrant = await step("warrant", "CHAIN", { "revenant.commit": commit, "revenant.checkpoint": cp.id }, async (span) => {
      try {
        const w = await judgeWarrant({
          prompts: cp.sessions.flatMap((s) => s.prompts),
          failingTests: r.originalExam?.newlyFailing ?? [],
          diff: await commitDiff(repo, r.parent, commit),
        });
        span.setAttribute("revenant.warrant", w.answer);
        span.setAttribute("revenant.quote", w.quote ?? "");
        return w;
      } catch (err) {
        if (!(err instanceof ModelUnavailable)) throw err;
        unavailable = err.message;
        span.setAttribute("revenant.warrant", "unavailable");
        return null;
      }
    });
  }
  const decision = decideV2(r, warrant);
  if (unavailable) decision.reason += ` (${unavailable})`;
  return { commit, subject, checkpoint, replay: r, warrant, decision };
}
