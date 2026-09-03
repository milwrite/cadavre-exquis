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

test("the other hand is a menu when the host lists routes, one clean line otherwise", () => {
  assert.match(html, /function modelLabel\(model\)/);
  assert.match(html, /setSingleModelOption\(\);/);
  assert.match(html, /function renderModelOptions\(catalog\)/);
  assert.match(html, /async function loadModelOptions\(\)/);
  assert.match(html, /if \(!CFG\.modelsEndpoint \|\| custom\)/);
  assert.match(html, /el\("modelRoute"\)\.addEventListener\("change"/);
  assert.match(html, /warmSelectedModel\(\{ force: true \}\)/);
  assert.match(html, /loadModelOptions\(\);\n/);
});

test("the parlor takes a same-origin wall endpoint from config.local.js", () => {
  assert.match(html, /CFG\.wallEndpoint/);
  assert.match(html, /return REMOTE_API \+ "\/wall";/);
});

test("the stage carries the game's state and reflows the reveal on wide screens", () => {
  assert.match(html, /el\("stage"\)\.classList\.add\("is-playing"\)/);
  assert.match(html, /el\("stage"\)\.classList\.add\("is-revealed"\)/);
  assert.equal((html.match(/classList\.remove\("is-revealed"\)/g) || []).length, 2);
  assert.match(html, /\.stage\.is-playing \.intro, \.stage\.is-revealed \.intro \{ display: none; \}/);
  assert.match(html, /@media \(min-width: 60rem\) \{\s*\.revealed \{[^}]*grid-template-areas: "poem reading" "foot foot";/);
  assert.match(html, /\.poem \{[^}]*max-width: 36rem;/);
  assert.match(html, /\.epigraph \{[^}]*white-space: nowrap;/);
  assert.doesNotMatch(html, /game-shell|game-intro|game-stage|\.eyebrow|text-transform: uppercase/);
});

test("the table stays closed until a generated readiness check succeeds", () => {
  assert.match(html, /readyEndpoint: REMOTE_API \+ "\/ready"/);
  assert.match(html, /model: "ollama:deepseek-v4-flash"/);
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

test("the parlor previews the wall, five lines a pin, and sends readers to wall.html", () => {
  assert.match(html, /const WALL_PREVIEW_LINES = 5;/);
  assert.match(html, /lines\.slice\(0, WALL_PREVIEW_LINES\)/);
  assert.match(html, /href="wall\.html">every pinned corpse<\/a>/);
  assert.match(html, /wall\.html#pin-\$\{encodeURIComponent\(item\.id\)\}/);
  assert.match(html, /wallTokens\[data\.item\.id\] = data\.deleteToken/);
  assert.match(html, /setRevealStatus\(`pinned to the wall\./);
  assert.doesNotMatch(html, /\/vote`|nextWallVote|paginateLines|loadWallMore|cadavreWallVoterToken|scrollIntoView\(\{ behavior: "smooth", block: "start" \}\);\n\s*\} catch/);
});
