import assert from "node:assert/strict";
import test from "node:test";
import { BUDGET_MESSAGE, publicFailure } from "../src/failure.ts";
import { UpstreamError } from "../src/inference.ts";

test("upstream detail never reaches the page", () => {
  const leaky = [
    new UpstreamError("CAIL Gateway returned 401: invalid key sk-cail-abc123", 401),
    new UpstreamError("CAIL Gateway returned 502: <html>origin 10.0.0.4 refused</html>", 502),
    new UpstreamError("Workers AI: binding error 3040 account 452c", 502),
    new UpstreamError("route x needs CAIL_GATEWAY_KEY", 503),
    new Error("TypeError: fetch failed at inference.ts:52"),
  ];
  for (const error of leaky) {
    const failure = publicFailure(error);
    assert.doesNotMatch(failure.message, /sk-cail|10\.0\.0\.4|3040|452c|CAIL_GATEWAY_KEY|inference\.ts|Gateway returned/);
    assert.ok(failure.status >= 500, "a server-side fault is never reported as the player's mistake");
  }
});

test("limits say whether waiting helps", () => {
  assert.deepEqual(publicFailure(new UpstreamError(BUDGET_MESSAGE, 429)), { status: 429, message: BUDGET_MESSAGE });
  const busy = publicFailure(new UpstreamError("CAIL Gateway returned 429: quota for key ...", 429));
  assert.equal(busy.status, 429);
  assert.equal(busy.retryAfter, 60);
  assert.doesNotMatch(busy.message, /quota|key/);
});

test("timeouts, retired models and refused turns keep statuses the page can act on", () => {
  assert.equal(publicFailure(new UpstreamError("The model took too long to answer.", 504)).status, 504);
  assert.equal(publicFailure(new UpstreamError("This model is not in the game catalog.", 404)).status, 404);
  assert.equal(publicFailure(new UpstreamError("bad", 400)).status, 400);
  assert.equal(publicFailure("nonsense").status, 502);
});
