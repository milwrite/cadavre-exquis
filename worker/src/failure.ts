/* What a failed model call tells the browser. Upstream detail (provider text,
 * gateway bodies, binding errors) is logged here and never sent to the page;
 * the page gets a status it can act on and a line a player can read. */
import { UpstreamError } from "./inference.ts";

export const BUDGET_MESSAGE = "the parlor has spent today's budget; play resumes tomorrow";

export type PublicFailure = { status: number; message: string; retryAfter?: number };

export function publicFailure(error: unknown): PublicFailure {
  const status = error instanceof UpstreamError ? error.status : 502;
  if (status === 429) {
    // Our own daily ceiling is final for the day; any other limit clears in about a minute.
    if (error instanceof UpstreamError && error.message === BUDGET_MESSAGE) return { status, message: BUDGET_MESSAGE };
    return { status, message: "too many requests; the table needs a minute", retryAfter: 60 };
  }
  if (status === 504) return { status, message: "the model took too long to answer" };
  if (status === 404) return { status, message: "that model is no longer at the table; choose another" };
  if (status === 401 || status === 403) return { status: 503, message: "the other hand is unavailable; try again shortly" };
  if (status >= 400 && status < 500) return { status, message: "this turn could not be sent as written" };
  return { status: status >= 500 ? status : 502, message: "the other hand is unavailable; try again shortly" };
}
