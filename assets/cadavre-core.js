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

  function catalogModels(catalog, includeAll = false) {
    const routes = Array.isArray(catalog?.models) ? catalog.models : (Array.isArray(catalog?.data) ? catalog.data : []);
    return routes.filter(route => route && (includeAll || route.featured !== false));
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

  /* ── when the other hand does not answer ────────────────────────────────
     One policy for every page. A request is asked again automatically only
     when it never reached the host at all (the connection dropped before any
     response), and then only once. Any answer from the host is final for that
     attempt: the Worker has already tried a standby model itself, so a 5xx
     means up to two models were asked. Timeouts, limits, a spent budget, an
     ended sign-in and refused requests likewise wait for the player. */
  const MAX_AUTO_RETRIES = 1;

  function modelError(status, { timedOut = false, cancelled = false, detail = "" } = {}) {
    const code = Number(status) || 0;
    const kind = cancelled ? "cancelled"
      : timedOut ? "timeout"
      : code === 0 ? "network"
      : code === 429 ? (/budget/i.test(detail) ? "budget" : "limit")
      : code === 401 || code === 403 ? "signin"
      // The Worker answers 504 after it has already waited on a model, so the
      // turn may have been paid for: it is a timeout, never an automatic retry.
      : code === 504 || code === 408 ? "timeout"
      : code >= 500 ? "unavailable"
      : "refused";
    const error = new Error(`model call failed: ${kind}`);
    error.status = code;
    error.kind = kind;
    error.cancelled = kind === "cancelled";
    return error;
  }

  const FAILURE_MESSAGES = {
    network: "the line to the other hand dropped. your words are kept",
    unavailable: "the other hand is away from the table. your words are kept",
    timeout: "the other hand took too long. your words are kept",
    limit: "too many turns at once. the table needs a minute",
    budget: "the parlor has spent today's budget. play resumes tomorrow",
    signin: "your CUNY sign-in ended. sign in again, then try once more",
    refused: "this turn could not be sent as written",
  };

  function failurePlan(error, attempt = 0) {
    const kind = error && FAILURE_MESSAGES[error.kind] ? error.kind : "unavailable";
    const retry = kind === "network" && Number(attempt) < MAX_AUTO_RETRIES;
    return {
      kind,
      retry,
      delayMs: retry ? 1500 : 0,
      // nothing to ask again today, or nothing a second ask would change
      canRetryByHand: kind !== "budget",
      message: FAILURE_MESSAGES[kind],
    };
  }

  /* ── a sheet in progress, kept for this tab ─────────────────────────────
     A refresh should not cost the table its poem. Whatever is read back is
     checked like fresh input before it is trusted. */
  const DRAFT_MAX_AGE_MS = 12 * 60 * 60 * 1000;

  function draftOf(state, now) {
    return JSON.stringify({
      v: 1, ts: now,
      players: state.players, modelSeat: state.modelSeat, maxWords: state.maxWords,
      model: String(state.model || ""), actorIndex: state.actorIndex,
      ...(state.work ? { work: state.work } : {}),
      contributions: state.contributions.map((entry) => ({
        text: entry.text, isModel: Boolean(entry.isModel), seat: entry.seat, turn: entry.turn,
        ...(entry.model ? { model: entry.model } : {}),
      })),
    });
  }

  function restoreDraft(raw, now) {
    let data;
    try { data = JSON.parse(raw); } catch { return null; }
    if (!data || typeof data !== "object" || data.v !== 1) return null;
    if (!Number.isFinite(data.ts) || now - data.ts > DRAFT_MAX_AGE_MS || data.ts > now + 60000) return null;
    try {
      turnInfo({ actorIndex: data.actorIndex, players: data.players, modelSeat: data.modelSeat });
      checkWordLimit(data.maxWords);
    } catch { return null; }
    if (!Array.isArray(data.contributions) || !data.contributions.length || data.contributions.length > 300) return null;
    if (data.actorIndex < data.contributions.length || data.actorIndex > data.contributions.length * 2 + 4) return null;
    const contributions = [];
    let lastTurn = -1;
    for (const entry of data.contributions) {
      if (!entry || typeof entry.text !== "string") return null;
      // A line is restored exactly as it was written. The table accepts a hand's
      // punctuation and marks (only its word count is checked), so the rules for a
      // model's line would wrongly reject, or quietly trim, what a person typed.
      const text = entry.text.trim();
      if (!text || text.length > 200 || /[\u0000-\u001f\u007f]/.test(text) || text.split(/\s+/).length > 5) return null;
      if (!Number.isInteger(entry.turn) || entry.turn <= lastTurn || entry.turn >= data.actorIndex) return null;
      if (!Number.isInteger(entry.seat) || entry.seat < 1 || entry.seat > data.players) return null;
      lastTurn = entry.turn;
      contributions.push({
        text, isModel: entry.isModel === true, seat: entry.seat, turn: entry.turn,
        ...(typeof entry.model === "string" && entry.model.length <= 180 ? { model: entry.model } : {}),
      });
    }
    const work = data.work && typeof data.work.id === "string" && /^[0-9a-f-]{36}$/.test(data.work.id)
      && Number.isSafeInteger(data.work.revision) && data.work.revision >= 0
      ? { id: data.work.id, revision: data.work.revision } : null;
    return {
      players: Number(data.players), modelSeat: Number(data.modelSeat), maxWords: Number(data.maxWords),
      model: typeof data.model === "string" ? data.model.slice(0, 180) : "",
      actorIndex: data.actorIndex, contributions, work,
    };
  }

  function withEditedPoem(messages, editedText) {
    if (editedText === null) return messages;
    return messages.map((message,index) => index===0 ? {...message,content:message.content+'\nThe current edited poem, to continue as supplied by the user:\n'+editedText} : message);
  }

  return Object.freeze({
    connectionConfig,
    withEditedPoem,
    MAX_AUTO_RETRIES,
    modelError,
    failurePlan,
    draftOf,
    restoreDraft,
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
    catalogModels,
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
