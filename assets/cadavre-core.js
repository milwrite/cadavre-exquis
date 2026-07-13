(function (root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CadavreCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five"];

  function checkWordLimit(maxWords) {
    const limit = Number(maxWords);
    if (!Number.isInteger(limit) || limit < 1 || limit > 5) {
      throw new RangeError("maxWords must be an integer from 1 to 5");
    }
    return limit;
  }

  function capPhrase(maxWords) {
    const limit = checkWordLimit(maxWords);
    return limit === 1 ? "one word" : `one to ${NUMBER_WORDS[limit]} words`;
  }

  function capitalizedCapPhrase(maxWords) {
    const phrase = capPhrase(maxWords);
    return phrase[0].toUpperCase() + phrase.slice(1);
  }

  function isCorrective(text) {
    return /^one (word|to (two|three|four|five) words)\.?$/i.test(String(text).trim());
  }

  function validateContribution(raw, maxWords) {
    const limit = checkWordLimit(maxWords);
    const text = String(raw ?? "").trim().replace(/[.,;:!?]+$/, "").trim();
    const words = text ? text.split(/\s+/) : [];
    const hasFormatting = /[\n\r`*_]/.test(text);

    return {
      text,
      wordCount: words.length,
      valid: words.length > 0
        && words.length <= limit
        && !hasFormatting
        && !isCorrective(text),
    };
  }

  function turnInfo({ actorIndex = 0, players = 2, modelSeat = 2 } = {}) {
    const playerCount = Number(players);
    const seat = Number(modelSeat);
    const index = Number(actorIndex);

    if (!Number.isInteger(playerCount) || playerCount < 2 || playerCount > 4) {
      throw new RangeError("players must be an integer from 2 to 4");
    }
    if (!Number.isInteger(seat) || seat < 1 || seat > playerCount) {
      throw new RangeError("modelSeat must name a seat at the table");
    }
    if (!Number.isInteger(index) || index < 0) {
      throw new RangeError("actorIndex must be a non-negative integer");
    }

    const currentSeat = (index % playerCount) + 1;
    return {
      currentSeat,
      round: Math.floor(index / playerCount) + 1,
      isModelTurn: currentSeat === seat,
    };
  }

  function buildTurnPrompt(contributions, maxWords) {
    const list = Array.isArray(contributions) ? contributions : [];
    const latest = list[list.length - 1];
    if (!latest) return `Begin the poem with ${capPhrase(maxWords)}.`;

    const text = typeof latest === "string" ? latest : latest.text;
    return `VISIBLE FOLD:\n${String(text ?? "")}\n\nWrite the next ${capPhrase(maxWords)}.`;
  }

  function chooseModel(catalog, requestedIds = []) {
    const routes = Array.isArray(catalog?.models) ? catalog.models : [];
    const available = routes.filter((route) => route?.id && route.available !== false);
    if (!available.length) return null;

    const requested = Array.isArray(requestedIds) ? requestedIds : [requestedIds];
    const ids = [...requested, catalog?.default, catalog?.defaultModel].filter(Boolean);
    return ids.map((id) => available.find((route) => route.id === id)).find(Boolean)
      || available[0];
  }

  function normalizeWord(word) {
    return String(word).toLowerCase().replace(/’/g, "'")
      .replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, "");
  }

  function matchPhrase(tokens, phrase) {
    const list = Array.isArray(tokens) ? tokens : [];
    const wanted = String(phrase).split(/\s+/).map(normalizeWord).filter(Boolean);
    if (!wanted.length) return null;

    for (let i = 0; i + wanted.length <= list.length; i++) {
      let matches = true;
      for (let offset = 0; offset < wanted.length; offset++) {
        const token = typeof list[i + offset] === "string"
          ? normalizeWord(list[i + offset])
          : list[i + offset]?.norm;
        if (token !== wanted[offset]) {
          matches = false;
          break;
        }
      }
      if (matches) return Array.from({ length: wanted.length }, (_, offset) => i + offset);
    }
    return null;
  }

  function paginateLines(text, pageSize = 20) {
    const size = Number(pageSize);
    if (!Number.isInteger(size) || size < 1) {
      throw new RangeError("pageSize must be a positive integer");
    }

    const list = Array.isArray(text)
      ? text.map((line) => String(line ?? ""))
      : String(text ?? "").split(/\r?\n/);
    if (!list.length) return [[]];

    const pages = [];
    for (let index = 0; index < list.length; index += size) {
      pages.push(list.slice(index, index + size));
    }
    return pages;
  }

  function nextWallVote(current, requested) {
    const selected = Number(current);
    const choice = Number(requested);
    if (choice !== -1 && choice !== 1) {
      throw new RangeError("requested wall vote must be -1 or 1");
    }
    return selected === choice ? 0 : choice;
  }

  function createGameState({ players = 2, modelSeat = 2, maxWords = 3 } = {}) {
    turnInfo({ actorIndex: 0, players, modelSeat });
    checkWordLimit(maxWords);
    return {
      players: Number(players),
      modelSeat: Number(modelSeat),
      maxWords: Number(maxWords),
      actorIndex: 0,
      contributions: [],
      turns: [],
      active: true,
      revealed: false,
      poem: "",
    };
  }

  function addContribution(state, raw, isModel) {
    const contribution = validateContribution(raw, state.maxWords);
    if (!contribution.valid) throw new Error("contribution must contain one to five plain-text words within the table limit");

    const turn = turnInfo(state);
    const entry = {
      text: contribution.text,
      isModel: isModel === undefined ? turn.isModelTurn : Boolean(isModel),
      seat: turn.currentSeat,
      round: turn.round,
    };

    return {
      ...state,
      actorIndex: state.actorIndex + 1,
      contributions: [...state.contributions, entry],
      turns: [...state.turns, { type: "contribution", entry }],
      active: true,
      revealed: false,
      poem: "",
    };
  }

  function passTurn(state) {
    const turn = turnInfo(state);
    return {
      ...state,
      actorIndex: state.actorIndex + 1,
      turns: [...state.turns, {
        type: "pass",
        seat: turn.currentSeat,
        round: turn.round,
        isModel: turn.isModelTurn,
      }],
      active: true,
      revealed: false,
      poem: "",
    };
  }

  function undoTurn(state) {
    if (!state.turns.length) return { ...state, active: true, revealed: false, poem: "" };

    const turns = state.turns.slice(0, -1);
    const removed = state.turns[state.turns.length - 1];
    return {
      ...state,
      actorIndex: Math.max(0, state.actorIndex - 1),
      contributions: removed.type === "contribution"
        ? state.contributions.slice(0, -1)
        : state.contributions.slice(),
      turns,
      active: true,
      revealed: false,
      poem: "",
    };
  }

  function revealGame(state) {
    if (!state.contributions.length) return state;
    return {
      ...state,
      active: false,
      revealed: true,
      poem: state.contributions.map((entry) => entry.text).join("\n"),
    };
  }

  return Object.freeze({
    NUMBER_WORDS,
    capPhrase,
    capitalizedCapPhrase,
    isCorrective,
    validateContribution,
    turnInfo,
    buildTurnPrompt,
    chooseModel,
    normalizeWord,
    matchPhrase,
    paginateLines,
    nextWallVote,
    createGameState,
    addContribution,
    passTurn,
    undoTurn,
    revealGame,
  });
});
