const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const Core = require("../assets/cadavre-core.js");
const fixtures = require("./fixtures/game-cases.json");

test("the core loads through CommonJS and as a browser global", () => {
  assert.equal(typeof Core.buildTurnPrompt, "function");

  const source = fs.readFileSync(path.join(__dirname, "../assets/cadavre-core.js"), "utf8");
  const context = {};
  vm.runInNewContext(source, context);
  assert.equal(typeof context.CadavreCore.validateContribution, "function");
});

test("contribution fixtures enforce one-to-five plain-text words", () => {
  fixtures.validation.forEach((fixture) => {
    const actual = Core.validateContribution(fixture.raw, fixture.maxWords);
    assert.deepEqual(
      actual,
      { text: fixture.text, wordCount: fixture.wordCount, valid: fixture.valid },
      fixture.raw,
    );
  });
});

test("hyphenated compounds count as one word at every table limit", () => {
  for (let maxWords = 1; maxWords <= 5; maxWords++) {
    const words = Array.from({ length: maxWords }, (_, index) => `blue-green-${index + 1}`);
    const result = Core.validateContribution(words.join(" "), maxWords);
    assert.equal(result.valid, true);
    assert.equal(result.wordCount, maxWords);
  }
});

test("turn fixtures cover seats, rounds, and model turns", () => {
  fixtures.turns.forEach(({ currentSeat, round, isModelTurn, ...state }) => {
    assert.deepEqual(Core.turnInfo(state), { currentSeat, round, isModelTurn });
  });
});

test("game state records contributions, passes, undo, and reveal", () => {
  let state = Core.createGameState({ players: 3, modelSeat: 2, maxWords: 3 });
  state = Core.addContribution(state, "paper moon");
  assert.deepEqual(state.contributions[0], {
    text: "paper moon",
    isModel: false,
    seat: 1,
    round: 1,
  });

  state = Core.passTurn(state);
  assert.deepEqual(state.turns[1], {
    type: "pass",
    seat: 2,
    round: 1,
    isModel: true,
  });
  assert.deepEqual(Core.turnInfo(state), { currentSeat: 3, round: 1, isModelTurn: false });

  state = Core.undoTurn(state);
  assert.deepEqual(Core.turnInfo(state), { currentSeat: 2, round: 1, isModelTurn: true });
  assert.equal(state.contributions.length, 1);

  state = Core.addContribution(state, "opens slowly");
  const revealed = Core.revealGame(state);
  assert.equal(revealed.active, false);
  assert.equal(revealed.revealed, true);
  assert.equal(revealed.poem, "paper moon\nopens slowly");

  const undone = Core.undoTurn(revealed);
  assert.equal(undone.active, true);
  assert.equal(undone.revealed, false);
  assert.deepEqual(undone.contributions.map((entry) => entry.text), ["paper moon"]);
});

test("the next-turn prompt includes only the newest contribution", () => {
  const contributions = [
    { text: "first hidden line" },
    { text: "second hidden line" },
    { text: "visible silver hinge" },
  ];
  const prompt = Core.buildTurnPrompt(contributions, 3);

  assert.match(prompt, /VISIBLE FOLD:\nvisible silver hinge/);
  assert.doesNotMatch(prompt, /first hidden line|second hidden line|EARLIER FOLDS/);
  assert.equal(Core.buildTurnPrompt([], 1), "Begin the poem with one word.");
});

test("model choice honors an available request, then catalog defaults and order", () => {
  assert.equal(Core.chooseModel(fixtures.catalog, ["legion:small"]).id, "legion:small");
  assert.equal(Core.chooseModel(fixtures.catalog, ["missing"]).id, "ollama:new");
  assert.equal(Core.chooseModel({ models: fixtures.catalog.models }, ["missing"]).id, "ollama:new");
  assert.equal(Core.chooseModel({ models: [{ id: "offline", available: false }] }), null);
});

test("quote matching is consecutive, case-insensitive, and punctuation-tolerant", () => {
  const tokens = ["The", "paper,", "moon", "won’t", "close."];
  assert.deepEqual(Core.matchPhrase(tokens, "paper moon"), [1, 2]);
  assert.deepEqual(Core.matchPhrase(tokens, "MOON won't"), [2, 3]);
  assert.equal(Core.matchPhrase(tokens, "paper close"), null);
  assert.equal(Core.matchPhrase(tokens, "..."), null);
});

test("wall poems paginate every twenty lines without dropping blank lines", () => {
  const twenty = Array.from({ length: 20 }, (_, index) => `line ${index + 1}`);
  const twentyOne = [...twenty, "line 21"];
  const eighty = Array.from({ length: 80 }, (_, index) => `line ${index + 1}`);
  const eightyOne = [...eighty, "line 81"];

  assert.deepEqual(Core.paginateLines(twenty), [twenty]);
  assert.deepEqual(Core.paginateLines(twentyOne), [twenty, ["line 21"]]);
  assert.deepEqual(Core.paginateLines(eighty).map((page) => page.length), [20, 20, 20, 20]);
  assert.deepEqual(Core.paginateLines(eightyOne).map((page) => page.length), [20, 20, 20, 20, 1]);

  const withBlankLine = [...twenty.slice(0, 10), "", ...twenty.slice(10)];
  const pages = Core.paginateLines(withBlankLine);
  assert.equal(pages.length, 2);
  assert.equal(pages[0][10], "");
  assert.equal(pages[1][0], "line 20");

  const windowsText = twentyOne.join("\r\n");
  assert.deepEqual(Core.paginateLines(windowsText), [twenty, ["line 21"]]);
  assert.deepEqual(Core.paginateLines("first\n\nthird", 2), [["first", ""], ["third"]]);
  assert.deepEqual(Core.paginateLines("last line\n", 20), [["last line", ""]]);
});

test("wall vote choices switch and toggle clear", () => {
  assert.equal(Core.nextWallVote(0, 1), 1);
  assert.equal(Core.nextWallVote(1, 1), 0);
  assert.equal(Core.nextWallVote(1, -1), -1);
  assert.equal(Core.nextWallVote(-1, -1), 0);
  assert.throws(() => Core.nextWallVote(0, 0), /wall vote/);
});

test("invalid table settings fail before a game starts", () => {
  assert.throws(() => Core.createGameState({ players: 1 }), /players/);
  assert.throws(() => Core.createGameState({ players: 2, modelSeat: 3 }), /modelSeat/);
  assert.throws(() => Core.validateContribution("moon", 6), /maxWords/);
  assert.throws(() => Core.paginateLines(["moon"], 0), /pageSize/);
});

test("a failed model call is asked again only when it likely never reached a model, and only once", () => {
  const Core = require("../assets/cadavre-core.js");
  const plan = (status, options, attempt = 0) => Core.failurePlan(Core.modelError(status, options), attempt);
  assert.deepEqual([plan(0).retry, plan(0).delayMs], [true, 1500]);
  // any answer from the host is final: the Worker already tried a standby model
  assert.deepEqual([plan(503).retry, plan(502).retry, plan(500).retry], [false, false, false]);
  assert.deepEqual([plan(503).kind, plan(503).canRetryByHand], ["unavailable", true]);
  assert.equal(plan(0, {}, 1).retry, false, "one automatic retry at most");
  for (const [status, options, kind] of [
    [0, { timedOut: true }, "timeout"], [504, {}, "timeout"], [408, {}, "timeout"], [429, {}, "limit"], [429, { detail: "the parlor has spent today's budget; play resumes tomorrow" }, "budget"],
    [401, {}, "signin"], [403, {}, "signin"], [400, {}, "refused"], [404, {}, "refused"], [413, {}, "refused"],
  ]) {
    const p = plan(status, options);
    assert.equal(p.kind, kind);
    assert.equal(p.retry, false, `${kind} is never retried automatically`);
    assert.ok(p.message && !/\d{3}/.test(p.message), "the message is for a player, not a status code");
  }
  assert.equal(plan(429, { detail: "budget" }).canRetryByHand, false);
  assert.equal(plan(429).canRetryByHand, true);
  assert.equal(Core.modelError(0, { cancelled: true }).cancelled, true);
  assert.equal(Core.failurePlan(new Error("unknown")).kind, "unavailable");
});

test("a saved sheet is restored only when every part of it is valid", () => {
  const Core = require("../assets/cadavre-core.js");
  const now = 1_800_000_000_000;
  const state = {
    players: 3, modelSeat: 2, maxWords: 3, model: "deepseek-v4.1-flash-1017", actorIndex: 4,
    contributions: [
      { text: "salt in the", isModel: false, seat: 1, turn: 0 },
      { text: "hollow of", isModel: true, seat: 2, turn: 1, model: "deepseek-v4.1-flash-1017" },
      { text: "a borrowed tooth", isModel: false, seat: 1, turn: 3 },
    ],
    work: { id: "11111111-1111-4111-8111-111111111111", revision: 2 },
  };
  const raw = Core.draftOf(state, now);
  const back = Core.restoreDraft(raw, now + 1000);
  assert.deepEqual(back.contributions, state.contributions);
  assert.deepEqual([back.players, back.modelSeat, back.maxWords, back.actorIndex, back.model], [3, 2, 3, 4, state.model]);
  assert.deepEqual(back.work, state.work);
  assert.equal(Core.restoreDraft(raw, now + 13 * 3600 * 1000), null, "an old sheet is not offered");
  const broken = (change) => { const d = JSON.parse(raw); change(d); return Core.restoreDraft(JSON.stringify(d), now); };
  assert.equal(Core.restoreDraft("not json", now), null);
  assert.equal(Core.restoreDraft("", now), null);
  assert.equal(broken((d) => { d.v = 2; }), null);
  assert.equal(broken((d) => { d.players = 9; }), null);
  assert.equal(broken((d) => { d.modelSeat = 4; }), null);
  assert.equal(broken((d) => { d.contributions = []; }), null);
  assert.equal(broken((d) => { d.contributions[0].text = "one two three four five six"; }), null);
  assert.equal(broken((d) => { d.contributions[1].text = "two\nlines"; }), null, "no line breaks or control characters");
  assert.equal(broken((d) => { d.contributions[1].text = "   "; }), null);
  assert.equal(broken((d) => { d.contributions[2].turn = 1; }), null, "turns must rise");
  assert.equal(broken((d) => { d.contributions[2].seat = 4; }), null);
  assert.equal(broken((d) => { d.actorIndex = 2; }), null);
  assert.equal(broken((d) => { d.work = { id: "../../etc", revision: 1 }; }).work, null, "a malformed work reference is dropped, not trusted");
});

test("a hand's own punctuation and marks come back exactly after a refresh", () => {
  const Core = require("../assets/cadavre-core.js");
  const now = 1_800_000_000_000;
  for (const line of ["wait, what?", "snake_case here", "*stars* fall", "it`s late", "no — never!", "fin."]) {
    const raw = Core.draftOf({
      players: 2, modelSeat: 2, maxWords: 3, model: "m", actorIndex: 1,
      contributions: [{ text: line, isModel: false, seat: 1, turn: 0 }],
    }, now);
    const back = Core.restoreDraft(raw, now);
    assert.ok(back, `the sheet with ${JSON.stringify(line)} is offered back`);
    assert.equal(back.contributions[0].text, line, "nothing is trimmed or rewritten");
  }
});
