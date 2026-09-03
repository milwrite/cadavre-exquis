const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "../ui/corpse.html"), "utf8");

test("the open sheet warms a verified route before accepting a first turn", () => {
  assert.match(html, /id="entry"[\s\S]*placeholder="warming the other hand…" disabled/);
  assert.match(html, /readyEndpoint: REMOTE_API \+ "\/ready"/);
  assert.match(html, /model: "ollama:deepseek-v4-flash"/);
  assert.match(html, /async function warmSelectedModel/);
  assert.match(html, /entry\.disabled = false/);
  assert.match(html, /for\(let attempt = 0; attempt < 3; attempt\+\+\)/);
  assert.doesNotMatch(html, /can’t reach the model|is it running\?/);
});

test("the open sheet is flush left in a centred column, with a paper tab for the table", () => {
  assert.match(html, /main\{ width:min\(var\(--measure\), 100%\); margin:auto; text-align:left; \}/);
  assert.match(html, /main\.revealed\{[^}]*grid-template-columns:minmax\(0,1fr\) minmax\(0,1\.25fr\)/);
  assert.match(html, /<button id="panel-tab" type="button" aria-expanded="false" aria-controls="panel"><span class="tab-open">the table<\/span>/);
  assert.match(html, /#panel-tab\{[^}]*writing-mode:vertical-rl;/);
  assert.match(html, /<h2 class="reading-head">Close reading<\/h2>/);
  assert.doesNotMatch(html, /reading-seam|text-transform:uppercase|id="keep"|id="library"|⋯/);
});

test("the open sheet inline script parses", () => {
  const scripts = Array.from(html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g), (match) => match[1]);
  scripts.filter((source) => source.trim()).forEach((source) => {
    assert.doesNotThrow(() => new vm.Script(source));
  });
});

test("the open sheet budgets a fold and a reading, and can keep a closed poem", () => {
  assert.match(html, /const TURN_TOKENS = 80, READING_TOKENS = 400/);
  assert.match(html, /max_tokens: maxTokens, temperature, top_p: 0\.95, stream: false/);
  assert.match(html, /send\("\.", READING_TOKENS\)/);
  assert.match(html, /request\(messages, 1\.0, READING_TOKENS\)/);
  assert.match(html, /<h2>Keep<\/h2>/);
  for (const id of ["save-md", "print-poem", "pin-wall", "pin-dialog", "pin-name"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /return REMOTE_API \+ "\/wall";/);
  assert.match(html, /const WALL_TOKENS_KEY = "cadavreWallDeleteTokens"/);
  assert.match(html, /analysis: readingText/);
  assert.match(html, /\.\.\/wall\.html#pin-\$\{encodeURIComponent\(data\.item\.id\)\}/);
});
