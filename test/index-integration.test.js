const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");

test("the canonical page loads the tested game core", () => {
  assert.match(html, /<script src="assets\/cadavre-core\.js"><\/script>/);
  assert.match(html, /Core\.buildTurnPrompt/);
  assert.match(html, /Core\.validateContribution/);
  assert.match(html, /Core\.matchPhrase/);
});

test("the canonical page presents one clean model setting", () => {
  assert.match(html, /function modelLabel\(model\)/);
  assert.match(html, /setSingleModelOption\(\);/);
  assert.doesNotMatch(html, /renderModelOptions/);
  assert.doesNotMatch(html, /OpenRouter|Ollama Cloud|Ollama Fallback/);
});

test("the table stays closed until a generated readiness check succeeds", () => {
  assert.match(html, /readyEndpoint: REMOTE_API \+ "\/ready"/);
  assert.match(html, /model: "ollama:gemma3:4b"/);
  assert.match(html, /id="startBtn" class="primary" disabled>warming…<\/button>/);
  assert.match(html, /async function warmSelectedModel/);
  assert.match(html, /if \(!data\.ready \|\| !data\.model\)/);
  assert.match(html, /data\.failover \? "ready on a verified standby route"/);
  assert.doesNotMatch(html, /the model isn’t answering|is it running\?/);
});

test("the canonical page never sends hidden folds to the model", () => {
  assert.doesNotMatch(html, /EARLIER FOLDS/);
  assert.doesNotMatch(html, /contributions\.slice\(-7, -1\)/);
});

test("the canonical page's inline scripts parse", () => {
  const scripts = Array.from(html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g), (match) => match[1]);
  scripts.filter((source) => source.trim()).forEach((source) => {
    assert.doesNotThrow(() => new vm.Script(source));
  });
});

test("wall poems use numbered twenty-line pages and retain per-item view state", () => {
  assert.match(html, /Core\.paginateLines\(item\.poem, 20\)/);
  assert.match(html, /if \(pages\.length > 1\)/);
  assert.match(html, /aria-current", "page"/);
  assert.match(html, /wallViews = new Map\(\)/);
  assert.match(html, /readingOpen: false/);
  assert.match(html, /view\.readingOpen = details\.open/);
});

test("remote wall votes persist a private browser token and follow the vote API contract", () => {
  assert.match(html, /const WALL_VOTER_TOKEN_KEY = "cadavreWallVoterToken"/);
  assert.match(html, /const WALL_VOTES_KEY = "cadavreWallVotes"/);
  assert.match(html, /new Uint8Array\(32\)/);
  assert.match(html, /crypto\.getRandomValues\(bytes\)/);
  assert.match(html, /if \(item\.remote\)/);
  assert.match(html, /\/vote`, \{/);
  assert.match(html, /JSON\.stringify\(\{ voterToken: wallVoterToken, value \}\)/);
  assert.match(html, /aria-pressed/);
  assert.match(html, /delete wallVotes\[item\.id\]/);
});
