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
    return ids.map((id) => available.find((route) => route.id === id || route.model === id)).find(Boolean)
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

  /* ── the close reading, asked for the same way on every page ─────────── */
  const READING_PROMPT = `You are a close reader of a finished poem.

Write one paragraph of 2–4 concrete sentences. Quote specific words and describe how syntax, juxtaposition, line breaks, or pronouns shape the poem. Treat the poem as a finished, single-authored work. Focus on what the language does. Do not reprint or restate the poem; begin with the reading itself.`;

  const READINGS_PER_POEM = 3;   // "read it again" is offered this many times per poem

  function readingMessages(poem) {
    return [
      { role: "system", content: READING_PROMPT },
      { role: "user", content: `Read this finished poem:\n\n${String(poem || "").trim()}\n\nProvide the close reading paragraph.` },
    ];
  }

  // A reading that opens by reprinting the poem loses that prefix, however the
  // model joined the lines; what remains is the reading proper.
  function stripPoemFromReading(reading, poem) {
    const fold = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    const text = String(reading || "").trim();
    const target = fold(poem);
    if (!target) return text;
    let matched = "";
    let i = 0;
    while (i < text.length && matched.length < target.length) {
      const piece = fold(text[i]);
      if (piece) {
        if (target[matched.length] !== piece) return text;
        matched += piece;
      } else if (matched && matched[matched.length - 1] !== " " && target[matched.length] === " ") {
        matched += " ";
      }
      i += 1;
    }
    if (matched !== target) return text;
    return text.slice(i).replace(/^[\s.,;:—–-]+/, "").trim() || text;
  }

  function connectionConfig(defaults, supplied, href) {
    const url = new URL(href);
    const campusMount = /^(?:tools\.ailab\.gc\.cuny\.edu|localhost|127\.0\.0\.1)$/.test(url.hostname) && /^\/cadavre(?:\/|$)/.test(url.pathname);
    const workerHost = url.hostname === 'cadavre.ailab-452.workers.dev';
    const signed = campusMount || supplied?.authenticated === true;
    const prefix = campusMount ? '/cadavre' : '';
    const expected = {endpoint:prefix+'/api/cadavre/chat',modelsEndpoint:prefix+'/api/cadavre/models',readyEndpoint:'',wallEndpoint:prefix+'/api/cadavre/wall',workEndpoint:prefix+'/api/work',apiKey:''};
    if (signed && (supplied?.authenticated !== true || Object.entries(expected).some(([key,value]) => supplied[key] !== value) || typeof supplied.model !== 'string' || !supplied.model)) throw new Error('CUNY configuration is unavailable. Reload this page before continuing.');
    if (workerHost) {
      const publicExpected = {endpoint:'/api/cadavre/chat',modelsEndpoint:'/api/cadavre/models',readyEndpoint:'/api/cadavre/ready',wallEndpoint:'/api/cadavre/wall',workEndpoint:'',apiKey:''};
      if (typeof supplied?.authenticated !== 'boolean' || (!signed && Object.entries(publicExpected).some(([key,value]) => supplied[key] !== value)) || typeof supplied?.model !== 'string' || !supplied.model) throw new Error('Cadavre configuration is unavailable. Reload this page before continuing.');
    }
    const config = Object.assign({}, defaults, supplied || {});
    if (!signed && !workerHost && url.searchParams.get('endpoint')) config.endpoint=url.searchParams.get('endpoint');
    if (url.searchParams.get('model')) config.model=url.searchParams.get('model');
    return config;
  }

  function withEditedPoem(messages, editedText) {
    if (editedText === null) return messages;
    return messages.map((message,index) => index===0 ? {...message,content:message.content+'\nThe current edited poem, to continue as supplied by the user:\n'+editedText} : message);
  }

  return Object.freeze({
    connectionConfig,
    withEditedPoem,
    READING_PROMPT,
    READINGS_PER_POEM,
    readingMessages,
    stripPoemFromReading,
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
