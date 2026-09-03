const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "../wall.html"), "utf8");

test("the wall page resolves its endpoint like the parlor and anchors each pin", () => {
  assert.match(html, /<script src="ui\/config\.local\.js"><\/script>/);
  assert.match(html, /<script src="assets\/cadavre-core\.js"><\/script>/);
  assert.match(html, /CFG\.wallEndpoint/);
  assert.match(html, /return REMOTE_API \+ "\/wall";/);
  assert.match(html, /pin\.id = `pin-\$\{item\.id\}`/);
  assert.match(html, /location\.hash/);
  assert.match(html, /id="loadWallMore"/);
});

test("every pin is one card: the whole poem flush left, its reading to the right, never paged", () => {
  assert.match(html, /grid-template-columns: minmax\(0, 1fr\) minmax\(0, 2fr\); grid-template-areas: "poem reading" "meta meta"/);
  assert.match(html, /\.pin-reading-pane \{ grid-area: reading; border-left/);
  assert.match(html, /\.pin-poem-pane \{ min-width: 0; \}/);
  assert.doesNotMatch(html, /\.pin-poem-pane \{ display: flex; justify-content: center; \}/);
  assert.match(html, /pin-poem-pane/);
  assert.match(html, /pin-reading-pane/);
  assert.match(html, /No close reading was kept with this corpse\./);
  assert.match(html, /renderReadingLinked\(reading, item\.analysis, tokens\)/);
  assert.doesNotMatch(html, /paginateLines|pin-pages|<details|readingOpen/);
});

test("the hand that pinned a corpse can rename it with its delete token", () => {
  assert.match(html, /const WALL_CAN_RENAME = true;/);
  assert.match(html, /\/rename`, \{/);
  assert.match(html, /JSON\.stringify\(\{ deleteToken: wallTokens\[item\.id\], name \}\)/);
  assert.match(html, /id="renameDialog"/);
});

test("remote wall votes persist a private browser token and follow the vote API contract", () => {
  assert.match(html, /const WALL_VOTER_TOKEN_KEY = "cadavreWallVoterToken"/);
  assert.match(html, /const WALL_VOTES_KEY = "cadavreWallVotes"/);
  assert.match(html, /new Uint8Array\(32\)/);
  assert.match(html, /crypto\.getRandomValues\(bytes\)/);
  assert.match(html, /if \(item\.remote\)/);
  assert.match(html, /\/vote`, \{/);
  assert.match(html, /\/remove`, \{/);
  assert.match(html, /JSON\.stringify\(\{ voterToken: wallVoterToken, value \}\)/);
  assert.match(html, /aria-pressed/);
  assert.match(html, /delete wallVotes\[item\.id\]/);
  assert.match(html, /wallTokens\[item\.id\]/);
});

test("the wall page's inline scripts parse", () => {
  const scripts = Array.from(html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g), (match) => match[1]);
  scripts.filter((source) => source.trim()).forEach((source) => {
    assert.doesNotThrow(() => new vm.Script(source));
  });
});
