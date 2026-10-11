import type { Decision, ReplayResult, Warrant } from "./types.ts";

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

/** True when the commit edited its exam and the parent's exam now regresses: the prompt must decide. */
export function needsWarrant(r: ReplayResult): boolean {
  return r.asCommitted.outcome === "holds" && r.originalExam?.outcome === "regression";
}

/**
 * v2: the commit's own exam first, then the parent's exam on the commit's code.
 * If the commit edited its exam and the original exam now regresses, the commit changed
 * behaviour the old tests pinned. The warrant, read from the checkpoint's prompts, decides
 * whether that was asked for. Without a warrant that quotes a prompt, it freezes.
 */
export function decideV2(r: ReplayResult, warrant: Warrant | null): Decision {
  const own = decideV1(r);
  if (own.verdict !== "keep") return own;
  if (!r.originalExam) return { verdict: "keep", reason: "own exam holds; no exam files changed" };
  switch (r.originalExam.outcome) {
    case "holds":
      return { verdict: "keep", reason: "own exam holds, and so does the parent's exam on this code" };
    case "regression": {
      const what = `the parent's exam regresses (${r.originalExam.line})`;
      if (!warrant) return { verdict: "freeze", reason: `${what}; no warrant could be read` };
      if (warrant.answer === "authorized") return { verdict: "keep", reason: `${what}, and the prompt authorizes it: "${warrant.quote}"` };
      if (warrant.answer === "not_authorized") return { verdict: "revert", reason: `${what}, and the prompt does not authorize it: "${warrant.quote}"` };
      return { verdict: "freeze", reason: `${what}; the prompt neither authorizes nor rules it out (${warrant.reasoning})` };
    }
    default:
      return { verdict: "freeze", reason: `parent's exam verdict not usable: ${r.originalExam.line || "none"}` };
  }
}
