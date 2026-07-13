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
