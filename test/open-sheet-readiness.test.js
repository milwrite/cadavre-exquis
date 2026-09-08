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
  assert.match(html, /<script src="\.\.\/assets\/cadavre-core\.js"><\/script>/);
  assert.match(html, /async function closePoem/);
  assert.match(html, /CadavreCore\.readingMessages\(poem\)/);
  assert.match(html, /CadavreCore\.stripPoemFromReading\(reply, poem\)/);
  assert.match(html, /readingsLeft = CadavreCore\.READINGS_PER_POEM/);
  assert.match(html, /const NEVER_CLOSE = /);
  assert.match(html, /const tidyReply = /);
  for (const id of ["close-poem", "edit-poem", "steer-apply", "pin-title", "brand", "pinned", "poem-edit"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /<title>Exquisite Corpse — the open sheet<\/title>/);
  assert.doesNotMatch(html, /send\("\."|function reveal\(reply\)|function parseReading/);
  assert.match(html, /<h2>Keep<\/h2>/);
  for (const id of ["save-md", "print-poem", "pin-wall", "pin-dialog", "pin-name"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /return REMOTE_API \+ "\/wall";/);
  assert.match(html, /const WALL_TOKENS_KEY = "cadavreWallDeleteTokens"/);
  assert.match(html, /analysis: readingText/);
  assert.match(html, /\.\.\/wall\.html#pin-\$\{encodeURIComponent\(item\.id\)\}/);
});

test("the open sheet's ghost cue streams, erases, and takes the other hand's cues once it warms", () => {
  assert.match(html, /const STOCK_CUES = \["red door…", "salt…", "a hinge…"\]\.concat\(CUE_REMINDERS\)/);
  assert.match(html, /const CUE_REMINDERS = \[CadavreCore\.capPhrase\(5\) \+ "…", "type anything to begin…"\]/);
  assert.match(html, /entry\.placeholder = cue\.slice\(0, shown\)/);
  assert.match(html, /shown--; cueTimer = setTimeout\(tick, CUE_ERASE\)/);
  assert.match(html, /else cueTimer = setTimeout\(nextCue, CUE_PAUSE\)/);
  assert.match(html, /prefers-reduced-motion: reduce/);
  assert.match(html, /"warming and verifying…";\n\s*askForCues\(\);.*\n/);
  assert.match(html, /entry\.disabled = false;\n\s*askForCues\(\);.*\n\s*nextCue\(\);/);
  assert.match(html, /Offer ten cues in the spirit of/);
  assert.match(html, /cues = fresh\.concat\(CUE_REMINDERS\); cueIndex = 0; cuesFromModel = true;/);
  assert.match(html, /if \(isModel\) nextCue\(\);/);
  assert.match(html, /<div id="hint">Enter hands the line to the other hand\. A single period closes the poem\.<\/div>/);
  assert.doesNotMatch(html, /entry\.placeholder = "one or two words"|One or two words, then Enter|WORD_CAP/);
});

test("the poem editor grows to the poem instead of scrolling inside itself", () => {
  assert.match(html, /#poem-edit\{[^}]*resize:none; overflow:hidden;/);
  assert.match(html, /poemEdit\.style\.height = poemEdit\.scrollHeight \+ "px"/);
  assert.match(html, /poemEdit\.addEventListener\("input", growEditor\)/);
  assert.match(html, /editBtn\.textContent = "done editing";\n\s*growEditor\(\);/);
});
