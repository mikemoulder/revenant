import type { Decision, ReplayResult } from "./types.ts";

/**
 * v1: trust the commit's own tests, as CI does. If they regress against the parent's
 * baseline the commit is wrong; otherwise it stays. This cannot see a commit that
 * edited its own exam, and that blind spot is what v2 exists to close.
 */
export function decideV1(r: ReplayResult): Decision {
  switch (r.asCommitted.outcome) {
    case "regression":
      return { verdict: "revert", reason: `own exam regresses: ${r.asCommitted.line}` };
    case "holds":
      return { verdict: "keep", reason: "own exam holds against the parent baseline" };
    default:
      return { verdict: "freeze", reason: `verify verdict not usable: ${r.asCommitted.line || "none"}` };
  }
}

/**
 * v2: the commit's own exam first, then the parent's exam on the commit's code.
 * If the commit edited its exam and the original exam now regresses, the commit changed
 * behaviour the old tests pinned. Whether that was allowed is the warrant's question,
 * which reads the checkpoint prompt. Until a warrant can quote the prompt, it freezes.
 */
export function decideV2(r: ReplayResult): Decision {
  const own = decideV1(r);
  if (own.verdict !== "keep") return own;
  if (!r.originalExam) return { verdict: "keep", reason: "own exam holds; no exam files changed" };
  switch (r.originalExam.outcome) {
    case "holds":
      return { verdict: "keep", reason: "own exam holds, and so does the parent's exam on this code" };
    case "regression":
      return {
        verdict: "freeze",
        reason: `exam edited and the parent's exam regresses (${r.originalExam.line}); needs a warrant from the prompt`,
      };
    default:
      return { verdict: "freeze", reason: `parent's exam verdict not usable: ${r.originalExam.line || "none"}` };
  }
}
