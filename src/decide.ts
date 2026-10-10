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
