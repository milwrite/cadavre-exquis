const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "../ui/corpse.html"), "utf8");

test("the open sheet warms a verified route before accepting a first turn", () => {
  assert.match(html, /id="entry"[\s\S]*placeholder="warming the other hand…" disabled/);
  assert.match(html, /readyEndpoint: REMOTE_API \+ "\/ready"/);
  assert.match(html, /model: "ollama:gemma3:4b"/);
  assert.match(html, /async function warmSelectedModel/);
  assert.match(html, /entry\.disabled = false/);
  assert.match(html, /for\(let attempt = 0; attempt < 3; attempt\+\+\)/);
  assert.doesNotMatch(html, /can’t reach the model|is it running\?/);
});

test("the open sheet inline script parses", () => {
  const scripts = Array.from(html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g), (match) => match[1]);
  scripts.filter((source) => source.trim()).forEach((source) => {
    assert.doesNotThrow(() => new vm.Script(source));
  });
});
