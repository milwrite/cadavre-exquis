const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");

test("the canonical page loads the tested game core", () => {
  assert.match(html, /<script src="assets\/cadavre-core\.js"><\/script>/);
  assert.match(html, /Core\.buildTurnPrompt/);
  assert.match(html, /Core\.validateContribution/);
  assert.match(html, /Core\.chooseModel/);
  assert.match(html, /Core\.matchPhrase/);
});

test("the canonical page never sends hidden folds to the model", () => {
  assert.doesNotMatch(html, /EARLIER FOLDS/);
  assert.doesNotMatch(html, /contributions\.slice\(-7, -1\)/);
});
