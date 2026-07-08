# Corpse Control Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a collapsed-by-default right control panel to `ui/corpse.html` giving system-prompt steer, subgenre tags, regenerate-with-awareness, and a keep/library — all prompt-level and localStorage-only.

**Architecture:** Single self-contained HTML file. The locked game prompt becomes `BASE_GAME_PROMPT`; `composeSystem()` layers a `STYLE GUIDANCE` block (steer text + selected tag descriptors) on top and rebuilds `messages[0]` live. The `fetch` call is refactored into a pure `request(msgs, temp)` reused by normal turns, regenerate (avoid-note + resample), and re-read. Keep/library serialize the DOM lines to localStorage.

**Tech Stack:** Vanilla HTML/CSS/JS. No framework, no build, no deps. OpenAI-compatible chat endpoint via existing `window.CORPSE_CONFIG`.

## Global Constraints

- No new dependencies, no build step, no bundler — `ui/corpse.html` stays a single self-contained file.
- No JS test runner exists in this repo and none is to be added. Verify in-browser: paste console-assertion snippets for pure functions, and follow the interaction checks. Use `./ui/serve.sh` (serves at `http://localhost:8800/corpse.html`).
- The minimal center stage MUST be visually unchanged on load — the panel is off-screen until summoned.
- The game rules always win: `BASE_GAME_PROMPT` is verbatim and comes first; the guidance block explicitly defers to it.
- Real `messages` history stays canonical `[system, user, assistant, …]`; avoid-notes are ephemeral (request-copy only), never persisted into it.
- Request shape unchanged otherwise: `stream:false`, `top_p:0.95`, `model`/`apiKey` from `CFG`.
- Git commits: detailed but ≤100 chars, all lowercase, no co-author sign-off. Work on branch `corpse-control-panel`.

---

### Task 1: Refactor prompt + fetch into composable, testable units

Invisible refactor. Introduces `state`, `TAGS`, `composeSystem()`, `applySystem()`, and a pure `request()`; rewires `send()` and `messages[0]` on top of them. Page must play identically afterward.

**Files:**
- Modify: `ui/corpse.html` (the `<script>` block)

**Interfaces:**
- Produces: `BASE_GAME_PROMPT: string`; `TAGS: [label, descriptor][]`; `state: {steer, tags[], override}`; `composeSystem(): string`; `applySystem(): void`; `request(msgs, temperature=0.9): Promise<string>`; `loadSettings()/saveSettings()`.
- Consumes: existing `CFG`, `messages`.

- [ ] **Step 1: Rename the system constant.** In `ui/corpse.html`, change the declaration `const SYSTEM = \`You are Exquisite Corpse.` … (the whole template literal) so it reads `const BASE_GAME_PROMPT = \`You are Exquisite Corpse.` … — content byte-for-byte identical, only the identifier changes.

- [ ] **Step 2: Add state, tags, and prompt composition.** Immediately after the `BASE_GAME_PROMPT` template literal (and before `const CORRECTIVES`), insert:

```js
/* ── style layer ───────────────────────────────────────────────────────────
   The game prompt above is locked. The panel appends a STYLE GUIDANCE block. */
const TAGS = [
  ["Surrealism", "dream-logic, automatic juxtaposition, the uncanny"],
  ["Imagism", "one hard clear image, no wasted word, direct treatment"],
  ["Dada", "anti-logic, chance, nonsense, collage"],
  ["Symbolism", "suggestion over statement, correspondences, dusk"],
  ["Vorticism", "angular, kinetic, machine-edged energy"],
  ["Futurism", "speed, motors, words-in-freedom"],
  ["Objectivism", "the thing itself, plain sincerity"],
  ["Stein / proto-language", "repetition, grammar as material, domestic objects"],
  ["Modernist lyric (Eliot)", "urban fragment, allusion, ironic melancholy"],
  ["Georgian pastoral", "English countryside lyric, plainspoken"],
  ["War elegy", "trench grief, doomed youth"],
  ["Harlem Renaissance", "defiant early-1920s lyric"],
];
const LS_SETTINGS = "corpse.settings";
const LS_LIBRARY = "corpse.library";

function loadSettings(){
  try { return Object.assign({ steer:"", tags:[], override:null },
    JSON.parse(localStorage.getItem(LS_SETTINGS) || "{}")); }
  catch { return { steer:"", tags:[], override:null }; }
}
const state = loadSettings();
function saveSettings(){
  localStorage.setItem(LS_SETTINGS, JSON.stringify(
    { steer: state.steer, tags: state.tags, override: state.override }));
}

function composeSystem(){
  if (state.override != null) return state.override;
  const descriptors = state.tags
    .map(label => (TAGS.find(t => t[0] === label) || [])[1])
    .filter(Boolean);
  const steer = (state.steer || "").trim();
  if (!steer && !descriptors.length) return BASE_GAME_PROMPT;
  let block = "\n\nSTYLE GUIDANCE (bias word choice and imagery; never break the rules above):";
  if (steer) block += "\n" + steer;
  if (descriptors.length) block += "\nLean toward: " + descriptors.join("; ") + ".";
  return BASE_GAME_PROMPT + block;
}
function applySystem(){ messages[0].content = composeSystem(); saveSettings(); }
```

- [ ] **Step 3: Build `messages[0]` from `composeSystem()`.** Change `const messages = [{ role: "system", content: SYSTEM }];` to:

```js
const messages = [{ role: "system", content: composeSystem() }];
```

(`state`/`composeSystem` are declared above this line per Step 2, so this is valid.)

- [ ] **Step 4: Extract a pure `request()` and rewire `send()`.** Replace the entire existing `async function send(text){ … }` with:

```js
async function request(msgs, temperature = 0.9){
  const res = await fetch(CFG.endpoint, {
    method: "POST",
    headers: Object.assign({ "Content-Type": "application/json" },
      CFG.apiKey ? { "Authorization": "Bearer " + CFG.apiKey } : {}),
    body: JSON.stringify({
      model: CFG.model, messages: msgs,
      temperature, top_p: 0.95, stream: false,
    }),
  });
  if(!res.ok) throw new Error("model returned " + res.status);
  const data = await res.json();
  return (data.choices?.[0]?.message?.content ?? "").trim();
}

function setWaiting(on){
  edge.classList.toggle("waiting", on);
  entry.disabled = on;
}

async function send(text){
  messages.push({ role: "user", content: text });
  setWaiting(true);
  try {
    const reply = await request(messages, 0.9);
    messages.push({ role: "assistant", content: reply });
    return reply;
  } finally {
    setWaiting(false);
    keepFocus();
  }
}
```

- [ ] **Step 5: Verify pure logic in the console.** Run `./ui/serve.sh`, open `http://localhost:8800/corpse.html`, open DevTools console, and paste:

```js
console.assert(composeSystem() === BASE_GAME_PROMPT, "empty state must equal base prompt");
state.tags = ["Imagism"]; state.steer = "colder";
const s = composeSystem();
console.assert(s.startsWith(BASE_GAME_PROMPT), "base must come first");
console.assert(/STYLE GUIDANCE/.test(s) && /Lean toward: one hard clear image/.test(s) && /colder/.test(s), "guidance block present");
state.tags = []; state.steer = "";   // reset
console.log("Task 1 OK");
```

Expected: no assertion errors, `Task 1 OK` logged.

- [ ] **Step 6: Verify the game still plays.** With a local Ollama base Gemma running (or any OpenAI-compatible endpoint in `ui/config.local.js`), type `snow` + Enter → a model line appears; type `.` + Enter → poem + reading reveal. (If no backend, confirm instead in DevTools → Network that submitting a word POSTs a body whose `messages[0].content` equals the base prompt.)

- [ ] **Step 7: Commit.**

```bash
git add ui/corpse.html
git commit -m "refactor: composable system prompt + pure request() in corpse.html"
```

---

### Task 2: Panel shell — edge tab, slide-in, Esc, focus fix

Adds the off-screen panel and its toggle. Sections are present but their controls are wired in later tasks. Center stage unchanged on load.

**Files:**
- Modify: `ui/corpse.html` (CSS in `<style>`, markup in `<body>`, JS in `<script>`)

**Interfaces:**
- Produces: `panel` (element), `togglePanel(open?)`, `$ = id => document.getElementById(id)`; DOM ids `panel-tab`, `panel`, `steer`, `chips`, `override-on`, `toggle-full`, `full-prompt`, `override-text`, `regen`, `reread`, `keep`, `copy`, `export`, `library`.
- Consumes: `closed`, `entry`, `keepFocus` (from base file).

- [ ] **Step 1: Add panel CSS.** Inside `<style>`, just before the closing `</style>`, add:

```css
  /* control panel — off-screen until summoned; center stage stays minimal */
  #panel-tab{
    position:fixed; top:1.1rem; right:max(1.1rem,3vw);
    font-family:var(--mono); font-size:.95rem; letter-spacing:.1em;
    background:transparent; border:0; color:var(--ash); cursor:pointer; z-index:20;
  }
  #panel-tab:hover{ color:var(--bone); }
  #panel{
    position:fixed; top:0; right:0; height:100%; z-index:19;
    width:min(22rem,86vw); overflow-y:auto;
    background:var(--ink); border-left:1px solid #1c1d22;
    padding:3.4rem 1.4rem 2rem;
    font-family:var(--mono); color:var(--bone);
    transform:translateX(100%); transition:transform .32s cubic-bezier(.22,.61,.36,1);
  }
  #panel.open{ transform:none; }
  #panel h2{ font-size:.7rem; letter-spacing:.12em; text-transform:uppercase;
    color:var(--ash); font-weight:400; margin:1.5rem 0 .6rem; }
  #panel h2:first-of-type{ margin-top:0; }
  #panel textarea{
    width:100%; min-height:4.5rem; resize:vertical;
    background:#111217; color:var(--bone); border:1px solid #1c1d22;
    padding:.6rem; font-family:var(--mono); font-size:.8rem; outline:0;
  }
  #panel textarea:focus{ border-color:var(--ash); }
  .chips{ display:flex; flex-wrap:wrap; gap:.4rem; }
  .chip{
    font-family:var(--mono); font-size:.72rem; color:var(--ash);
    background:transparent; border:1px solid #1c1d22; padding:.28rem .5rem; cursor:pointer;
  }
  .chip[aria-pressed="true"]{ color:var(--ink); background:var(--bone); border-color:var(--bone); }
  .pbtn{
    font-family:var(--mono); font-size:.75rem; color:var(--bone);
    background:transparent; border:1px solid #1c1d22;
    padding:.4rem .7rem; margin:.2rem .3rem .2rem 0; cursor:pointer;
  }
  .pbtn:hover:not(:disabled){ border-color:var(--ash); }
  .pbtn:disabled{ opacity:.35; cursor:not-allowed; }
  #full-prompt{ white-space:pre-wrap; font-size:.72rem; color:var(--reading);
    border:1px dashed #1c1d22; padding:.6rem; margin-top:.5rem; display:none; }
  .lib-item{ border-top:1px solid #1c1d22; padding:.5rem 0; font-size:.75rem; }
  .lib-item .first{ color:var(--bone); }
  .lib-item .when{ color:var(--ash); font-size:.68rem; }
  .lib-item .row{ margin-top:.3rem; }
  @media (prefers-reduced-motion: reduce){ #panel{ transition:none; } }
```

- [ ] **Step 2: Add panel markup.** In `<body>`, immediately after the `<div id="hint">…</div>` line, add:

```html
  <button id="panel-tab" aria-label="open controls" aria-expanded="false">⋯</button>
  <aside id="panel" aria-label="controls">
    <h2>System steer</h2>
    <textarea id="steer" placeholder="a line of guidance for the other hand…"></textarea>

    <h2>Subgenre</h2>
    <div class="chips" id="chips"></div>

    <h2>Full prompt</h2>
    <label class="pbtn" style="user-select:none"><input type="checkbox" id="override-on" style="margin-right:.4rem">override</label>
    <button class="pbtn" id="toggle-full">view</button>
    <pre id="full-prompt"></pre>
    <textarea id="override-text" placeholder="full system prompt…" style="display:none"></textarea>

    <h2>The other hand</h2>
    <button class="pbtn" id="regen" disabled>↻ regenerate</button>
    <button class="pbtn" id="reread" disabled>↻ re-read</button>

    <h2>Keep</h2>
    <button class="pbtn" id="keep" disabled>♥ keep poem</button>
    <button class="pbtn" id="copy">copy</button>
    <button class="pbtn" id="export">export .md</button>

    <h2>Library</h2>
    <div id="library"></div>
  </aside>
```

- [ ] **Step 3: Add the `$` helper and panel refs.** In `<script>`, right after the existing `const HINT_DEFAULT = hint.innerHTML;` line, add:

```js
const $ = id => document.getElementById(id);
const panel = $("panel");
const panelTab = $("panel-tab");
```

- [ ] **Step 4: Add `togglePanel` and Esc handler.** After the refs from Step 3, add:

```js
function togglePanel(open){
  const show = (open === undefined) ? !panel.classList.contains("open") : open;
  panel.classList.toggle("open", show);
  panelTab.setAttribute("aria-expanded", show ? "true" : "false");
}
panelTab.addEventListener("click", () => togglePanel());
document.addEventListener("keydown", (e) => {
  if(e.key === "Escape" && panel.classList.contains("open")) togglePanel(false);
});
```

- [ ] **Step 5: Fix `keepFocus` so panel controls are usable.** Replace the existing block

```js
const keepFocus = () => { if (!closed) entry.focus(); };
document.addEventListener("click", keepFocus);
window.addEventListener("load", keepFocus);
```

with:

```js
const keepFocus = (e) => {
  if (closed) return;
  if (e && panel.contains(e.target)) return;   // don't steal focus from the panel
  entry.focus();
};
document.addEventListener("click", keepFocus);
window.addEventListener("load", () => keepFocus());
```

- [ ] **Step 6: Verify.** Reload `corpse.html`. Expected: page looks identical to before except a faint `⋯` at top-right. Click `⋯` → panel slides in from the right; click into the `steer` textarea and type — text appears (focus not stolen). Press `Esc` → panel closes. Click empty center → caret returns to the entry line. Console: `console.assert(!!$("regen") && !!$("chips"), "panel ids present"); console.log("Task 2 OK");`

- [ ] **Step 7: Commit.**

```bash
git add ui/corpse.html
git commit -m "feat: add collapsible right control panel shell to corpse.html"
```

---

### Task 3: Wire system steer + subgenre tags

Populate chips, bind the steer textarea, recompose `messages[0]` live, persist across reloads.

**Files:**
- Modify: `ui/corpse.html` (`<script>`)

**Interfaces:**
- Produces: `renderChips()`, live binding of `#steer`; calls `applySystem()` from Task 1.
- Consumes: `TAGS`, `state`, `applySystem`, `$`.

- [ ] **Step 1: Bind steer + build chips.** After the `togglePanel`/Esc block from Task 2, add:

```js
const steerEl = $("steer");
steerEl.value = state.steer || "";
steerEl.addEventListener("input", () => { state.steer = steerEl.value; applySystem(); syncPromptView(); });

const chipsEl = $("chips");
function renderChips(){
  chipsEl.innerHTML = "";
  TAGS.forEach(([label]) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "chip"; b.textContent = label;
    b.setAttribute("aria-pressed", state.tags.includes(label) ? "true" : "false");
    b.addEventListener("click", () => {
      const on = b.getAttribute("aria-pressed") === "true";
      b.setAttribute("aria-pressed", on ? "false" : "true");
      state.tags = on ? state.tags.filter(t => t !== label) : state.tags.concat(label);
      applySystem(); syncPromptView();
    });
    chipsEl.appendChild(b);
  });
}
renderChips();
```

Note: `syncPromptView()` is defined in Task 4; add a temporary no-op now so this task runs standalone — insert `function syncPromptView(){}` just above `const steerEl` and delete it in Task 4 Step 1.

- [ ] **Step 2: Verify persistence + live recompose.** Reload, open panel, click the `Imagism` and `Dada` chips (they invert to filled), type `colder` in steer. In console:

```js
console.assert(state.tags.includes("Imagism") && state.tags.includes("Dada"), "tags tracked");
console.assert(/Lean toward:.*one hard clear image.*collage/.test(messages[0].content), "descriptors composed");
console.assert(/colder/.test(messages[0].content), "steer composed");
console.log("Task 3 OK");
```

Then reload the page and confirm the two chips are still filled and the steer textarea still says `colder` (persisted). Click `Imagism` again to unselect → `console.assert(!messages[0].content.includes("one hard clear image"))`.

- [ ] **Step 3: Verify on the wire (if backend available).** DevTools → Network. With tags selected, submit a word; open the request payload and confirm `messages[0].content` contains `STYLE GUIDANCE` and the chosen `Lean toward:` descriptors.

- [ ] **Step 4: Commit.**

```bash
git add ui/corpse.html
git commit -m "feat: wire system steer + subgenre tag chips to composed prompt"
```

---

### Task 4: View / override full prompt

Reveal the composed prompt read-only; an override switch swaps in an editable textarea that becomes the verbatim system prompt.

**Files:**
- Modify: `ui/corpse.html` (`<script>`)

**Interfaces:**
- Produces: `syncPromptView()` (real implementation), override wiring.
- Consumes: `state`, `composeSystem`, `applySystem`, `$`.

- [ ] **Step 1: Remove the temporary stub.** Delete the `function syncPromptView(){}` no-op added in Task 3 Step 1.

- [ ] **Step 2: Add the real prompt-view logic.** After the `renderChips(); renderChips` call block from Task 3, add:

```js
const fullEl = $("full-prompt");
const overrideText = $("override-text");
const overrideOn = $("override-on");
const toggleFull = $("toggle-full");
let fullShown = false;

function syncPromptView(){
  const ov = state.override != null;
  overrideText.style.display = ov ? "block" : "none";
  fullEl.style.display = (!ov && fullShown) ? "block" : "none";
  if (ov) { if (overrideText.value !== state.override) overrideText.value = state.override; }
  else if (fullShown) { fullEl.textContent = composeSystem(); }
}

overrideOn.checked = state.override != null;
overrideOn.addEventListener("change", () => {
  state.override = overrideOn.checked ? composeSystem() : null;
  applySystem(); syncPromptView();
});
overrideText.addEventListener("input", () => { state.override = overrideText.value; applySystem(); });
toggleFull.addEventListener("click", () => {
  fullShown = !fullShown;
  toggleFull.textContent = fullShown ? "hide" : "view";
  syncPromptView();
});
syncPromptView();
```

- [ ] **Step 3: Verify read-only view.** Reload, open panel, select `Surrealism`, click `view` under Full prompt. Expected: the composed prompt renders in the dashed box and ends with `Lean toward: dream-logic, automatic juxtaposition, the uncanny.` Toggle another tag → the box updates. Click `hide` → box disappears.

- [ ] **Step 4: Verify override.** Check the `override` box. Expected: an editable textarea appears seeded with the current composed prompt; the read-only box is hidden. Edit it to `TEST OVERRIDE`. In console: `console.assert(messages[0].content === "TEST OVERRIDE", "override is verbatim"); console.log("Task 4 OK");` Uncheck `override` → `console.assert(messages[0].content.startsWith("You are Exquisite Corpse"), "reverts to composed")`. Reset for cleanliness: `state.override=null; applySystem();`.

- [ ] **Step 5: Commit.**

```bash
git add ui/corpse.html
git commit -m "feat: view + override the composed system prompt in panel"
```

---

### Task 5: Regenerate last line + re-read

Regenerate the most recent model contribution, injecting an ephemeral avoid-note; accumulate the avoid-list on repeats. Re-read reuses the mechanism on the close reading.

**Files:**
- Modify: `ui/corpse.html` (`<script>`)

**Interfaces:**
- Produces: `regenerate()`, `reread()`, `parseReading()`, `renderReading()`, enable-setters `setRegenEnabled/setRereadEnabled/setKeepEnabled`, module var `let last = null;`.
- Consumes: `messages`, `request`, `addLine`, `setWaiting`, `note`, `reveal`, `keepFocus`.

- [ ] **Step 1: Make `addLine` return its element.** In `function addLine(text){ … }`, add `return div;` as the last line (after `div.scrollIntoView(...)`).

- [ ] **Step 2: Add regenerate state + enable-setters.** Directly after `let closed = false;` add:

```js
let last = null;   // { userText, reply, lineEl, avoided:[] } — the current growing edge
function setRegenEnabled(on){ $("regen").disabled = !on; }
function setRereadEnabled(on){ $("reread").disabled = !on; }
function setKeepEnabled(on){ $("keep").disabled = !on; }
```

- [ ] **Step 3: Split reading render out of `reveal`.** Replace the existing `function reveal(reply){ … }` with:

```js
function parseReading(reply){
  const parts = reply.split(/\n\s*\n/);
  return parts.slice(1).join("\n\n").trim() || parts[0];
}
function renderReading(reply){
  readingEl.textContent = parseReading(reply);
  readingEl.classList.add("show");
  readingEl.scrollIntoView({ behavior: "smooth", block: "center" });
}
function reveal(reply){
  poemEl.querySelectorAll(".line").forEach(l => l.classList.add("settled"));
  renderReading(reply);
  entry.remove();
  closed = true;
  last = null;
  setRegenEnabled(false);
  setRereadEnabled(true);
  setKeepEnabled(true);
  note("closed &nbsp;·&nbsp; reload to begin again");
}
```

- [ ] **Step 4: Add `regenerate()` and `reread()`.** After `reveal`, add:

```js
async function regenerate(){
  if(!last || entry.disabled) return;
  const rejected = last.reply;
  if(messages[messages.length - 1]?.role === "assistant") messages.pop();
  last.lineEl.remove();
  setWaiting(true); setRegenEnabled(false);
  const avoid = last.avoided.concat(rejected);
  try {
    const list = avoid.map(w => `"${w}"`).join(", ");
    const req = messages.concat([{ role: "user",
      content: `Previous attempt${avoid.length > 1 ? "s" : ""}: ${list}. `
        + `Give a different next line — one or two words only, do not repeat those.` }]);
    const reply = await request(req, 1.0);
    messages.push({ role: "assistant", content: reply });
    last = { userText: last.userText, reply, lineEl: addLine(reply), avoided: avoid };
  } catch(err){
    messages.push({ role: "assistant", content: rejected });   // restore on failure
    last = { userText: last.userText, reply: rejected, lineEl: addLine(rejected), avoided: last.avoided };
    note("can’t reach the model — is it running?", true);
  } finally {
    setWaiting(false); setRegenEnabled(!!last); keepFocus();
  }
}

async function reread(){
  if(!closed) return;
  if(messages[messages.length - 1]?.role === "assistant") messages.pop();
  setWaiting(true); setRereadEnabled(false);
  try {
    const reply = await request(messages, 1.0);
    messages.push({ role: "assistant", content: reply });
    renderReading(reply);
  } catch(err){
    note("can’t reach the model — is it running?", true);
  } finally {
    setWaiting(false); setRereadEnabled(true);
  }
}
```

- [ ] **Step 5: Track `last` in the keydown handler + wire buttons.** In the `entry.addEventListener("keydown", …)` handler, in the **normal word** branch (the part after the `if(text === ".")` block), replace:

```js
  entry.value = "";
  let reply;
  try { reply = await send(text); }
  catch(err){ return note("can’t reach the model — is it running? &nbsp;<span style='opacity:.6'>see ui/README</span>", true); }

  if(isCorrective(reply)){
    // don't advance the poem; surface the correction quietly
    messages.splice(-2, 2);           // forget this exchange so state stays clean
    note(reply.replace(/\s+/g," ").slice(0,80), true);
    return;
  }
  addLine(text);      // your contribution
  addLine(reply);     // the other hand
```

with:

```js
  entry.value = "";
  last = null; setRegenEnabled(false);
  let reply;
  try { reply = await send(text); }
  catch(err){ return note("can’t reach the model — is it running? &nbsp;<span style='opacity:.6'>see ui/README</span>", true); }

  if(isCorrective(reply)){
    // don't advance the poem; surface the correction quietly
    messages.splice(-2, 2);           // forget this exchange so state stays clean
    note(reply.replace(/\s+/g," ").slice(0,80), true);
    return;
  }
  addLine(text);                          // your contribution
  const modelEl = addLine(reply);         // the other hand
  last = { userText: text, reply, lineEl: modelEl, avoided: [] };
  setRegenEnabled(true); setKeepEnabled(true);
```

Then, at the very end of the `<script>` (after the keydown listener), add the button bindings:

```js
$("regen").addEventListener("click", regenerate);
$("reread").addEventListener("click", reread);
```

- [ ] **Step 6: Verify regenerate (backend needed).** Reload; type `snow` + Enter → model line appears and `↻ regenerate` enables. Click `↻ regenerate` → the model line is replaced by a different one. Click again → another. In console after two regens:

```js
console.assert(last.avoided.length >= 2, "avoid-list accumulates");
console.assert(messages.filter(m => m.role === "assistant").length === 1, "history holds one assistant line, not the rejects");
console.assert(!messages.some(m => /Previous attempt/.test(m.content)), "avoid-note never persisted");
console.log("Task 5 OK");
```

Then type your next word → `↻ regenerate` disables (the prior line is now committed). Type `.` → reveal; `↻ re-read` enables; click it → the reading changes.

- [ ] **Step 7: Commit.**

```bash
git add ui/corpse.html
git commit -m "feat: regenerate last line with avoid-note + re-read the close reading"
```

---

### Task 6: Keep poem + library (save / list / reopen / delete / copy / export)

Snapshot the DOM poem to a localStorage library and render it in the panel; copy and Markdown export.

**Files:**
- Modify: `ui/corpse.html` (`<script>`)

**Interfaces:**
- Produces: `currentPoemLines()`, `poemMarkdown()`, `loadLibrary()/saveLibrary()`, `keepPoem()`, `renderLibrary()`, `reopen(item)`, `copyPoem()`, `exportMd()`.
- Consumes: `poemEl`, `readingEl`, `closed`, `entry`, `state`, `note`, `$`, enable-setters, `LS_LIBRARY`.

- [ ] **Step 1: Add poem serialization + library storage.** Before the final button bindings from Task 5, add:

```js
function currentPoemLines(){
  return Array.from(poemEl.querySelectorAll(".line")).map(l => l.textContent);
}
function poemMarkdown(){
  const lines = currentPoemLines();
  let md = "# Exquisite Corpse\n\n" + lines.join("\n") + "\n";
  if(closed && readingEl.textContent) md += "\n## Close reading\n\n" + readingEl.textContent + "\n";
  return md;
}
function loadLibrary(){ try { return JSON.parse(localStorage.getItem(LS_LIBRARY) || "[]"); } catch { return []; } }
function saveLibrary(lib){ localStorage.setItem(LS_LIBRARY, JSON.stringify(lib)); }
```

- [ ] **Step 2: Add keep, render, reopen, copy, export.** Immediately after Step 1's block, add:

```js
function keepPoem(){
  const lines = currentPoemLines();
  if(!lines.length){ note("nothing to keep yet", true); return; }
  const lib = loadLibrary();
  lib.unshift({ lines, reading: closed ? readingEl.textContent : "",
    steer: state.steer, tags: state.tags.slice(), ts: new Date().toISOString() });
  saveLibrary(lib);
  renderLibrary();
  note("kept &nbsp;·&nbsp; see library");
}

function reopen(item){
  poemEl.innerHTML = "";
  item.lines.forEach(t => {
    const d = document.createElement("div");
    d.className = "line settled"; d.textContent = t;
    poemEl.appendChild(d);
  });
  readingEl.classList.remove("show");
  if(item.reading){ readingEl.textContent = item.reading; readingEl.classList.add("show"); }
  if(entry.isConnected) entry.remove();
  closed = true; last = null;
  setRegenEnabled(false); setRereadEnabled(!!item.reading); setKeepEnabled(false);
  togglePanel(false);
  note("viewing a kept poem &nbsp;·&nbsp; reload to play");
}

function renderLibrary(){
  const lib = loadLibrary();
  const box = $("library");
  box.innerHTML = "";
  if(!lib.length){ box.innerHTML = '<div class="lib-item when">nothing kept yet</div>'; return; }
  lib.forEach((item, i) => {
    const row = document.createElement("div");
    row.className = "lib-item";
    const first = (item.lines[0] || "…").slice(0, 42);
    const when = (item.ts || "").slice(0, 10);
    row.innerHTML = `<div class="first"></div><div class="when"></div>`
      + `<div class="row"><button class="pbtn open">reopen</button>`
      + `<button class="pbtn del">delete</button></div>`;
    row.querySelector(".first").textContent = first;
    row.querySelector(".when").textContent = when;
    row.querySelector(".open").addEventListener("click", () => reopen(item));
    row.querySelector(".del").addEventListener("click", () => {
      const cur = loadLibrary(); cur.splice(i, 1); saveLibrary(cur); renderLibrary();
    });
    box.appendChild(row);
  });
}

function copyPoem(){
  const lines = currentPoemLines();
  if(!lines.length){ note("nothing to copy yet", true); return; }
  navigator.clipboard.writeText(poemMarkdown())
    .then(() => note("copied to clipboard"))
    .catch(() => note("copy failed", true));
}

function exportMd(){
  const lines = currentPoemLines();
  if(!lines.length){ note("nothing to export yet", true); return; }
  const blob = new Blob([poemMarkdown()], { type: "text/markdown" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `exquisite-corpse-${Date.now()}.md`;
  a.click();
  URL.revokeObjectURL(a.href);
}
```

- [ ] **Step 3: Bind the buttons and render on load.** At the end of `<script>` (next to the `regen`/`reread` bindings from Task 5), add:

```js
$("keep").addEventListener("click", keepPoem);
$("copy").addEventListener("click", copyPoem);
$("export").addEventListener("click", exportMd);
renderLibrary();
```

- [ ] **Step 4: Verify serialization in console.** Reload; play a couple of words (or paste lines manually), then:

```js
poemEl.innerHTML = '<div class="line">snow</div><div class="line">falls upward</div>';
console.assert(currentPoemLines().join("|") === "snow|falls upward", "lines serialize");
console.assert(/# Exquisite Corpse/.test(poemMarkdown()) && /snow\nfalls upward/.test(poemMarkdown()), "markdown shape");
console.log("Task 6 OK");
```

- [ ] **Step 5: Verify keep/library end-to-end.** With that poem in the DOM, open the panel and click `♥ keep poem` (enable it first via `setKeepEnabled(true)` in console if needed) → the Library section lists a row (`snow`, today's date). Reload the page, open panel → the row is still there; click `reopen` → the poem renders in the center column and the panel closes. Click `delete` → the row disappears and stays gone after reload. Click `export .md` → a `exquisite-corpse-<ts>.md` file downloads and opens as readable Markdown. Click `copy` → paste elsewhere shows the same Markdown.

- [ ] **Step 6: Commit.**

```bash
git add ui/corpse.html
git commit -m "feat: keep poems to a local library with copy + markdown export"
```

---

### Task 7: Document the panel + full end-to-end pass

**Files:**
- Modify: `ui/README.md`

**Interfaces:** none (docs).

- [ ] **Step 1: Add a panel section to `ui/README.md`.** After the existing `## Notes` section, append:

```markdown
## Control panel

Open it with the faint `⋯` at the top-right (`Esc` closes). It stays hidden until
summoned, so the play surface loads unchanged. Inside:

- **System steer** + **Subgenre** tags — layered on top of the locked game prompt as
  a `STYLE GUIDANCE` block (the game rules always win). Choices persist across reloads.
- **Full prompt** — `view` the composed prompt, or `override` it verbatim for full control.
- **↻ regenerate** — replace the last model line; the model is told which word(s) to
  avoid, and repeats accumulate the avoid-list. **↻ re-read** re-rolls the close reading.
- **♥ keep poem** + **Library** — save finished poems locally (reopen / delete),
  **copy** to clipboard, or **export .md**. All local; nothing leaves the browser.
```

- [ ] **Step 2: Full verification pass against the spec.** Run `./ui/serve.sh` and walk the spec's verification list end-to-end:
  1. On load: center column empty, only `⋯` visible; open/`Esc` close works; center still typable.
  2. Steer/tags: Network payload `messages[0].content` carries `STYLE GUIDANCE` + chosen descriptors; toggling a tag off drops it next request.
  3. Regenerate: DOM line changes; request copy carries `Previous attempt: "…"`; avoid-list grows; real `messages` stays clean.
  4. Keep/library: keep → reload → reopen; delete; export `.md`; copy.
  5. Reduced motion: with OS "reduce motion" on, the panel appears without sliding.

- [ ] **Step 3: Commit.**

```bash
git add ui/README.md
git commit -m "docs: document corpse.html control panel (steer, tags, regenerate, keep)"
```

---

## Self-Review notes (author)

- **Spec coverage:** panel (Task 2) · layered steer + STYLE GUIDANCE + view/override (Tasks 1,3,4) · ~12 tags with descriptors (Task 1 data, Task 3 UI) · regenerate avoid-note+resample + accumulation + clean history + re-read (Task 5) · keep library + copy + export (Task 6) · persistence `corpse.settings`/`corpse.library` (Tasks 1,3,6) · focus fix + reduced-motion (Task 2) · README (Task 7). All spec sections map to a task.
- **Type consistency:** `composeSystem/applySystem/request/setWaiting` (T1) reused verbatim in T5/T6; `last` shape `{userText,reply,lineEl,avoided}` identical in T5 producer and consumers; enable-setters defined once (T5) used in T5/T6; `syncPromptView` stubbed in T3, implemented in T4 (stub removal called out explicitly).
- **No placeholders:** every code step shows full code; no TBD/TODO.
