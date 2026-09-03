/* One SQLite-backed Durable Object holds the shared wall and the daily spend
 * ledger. A single instance ("cadavre") is plenty for a poetry table, and
 * deleting the Worker deletes it — nothing else on the account is touched. */
import { DurableObject } from "cloudflare:workers";

export type WallItem = {
  id: string;
  name: string;
  title: string;
  poem: string;
  analysis: string;
  ts: string;
  upvotes: number;
  downvotes: number;
  score: number;
};

export type VoteResult = WallItem & { viewerVote: -1 | 0 | 1 };

export const WALL_LIMITS = { name: 40, title: 80, poem: 2000, analysis: 2000, page: 40 } as const;

type PinRow = {
  id: string;
  name: string;
  title: string;
  poem: string;
  analysis: string;
  ts: number;
  upvotes: number;
  downvotes: number;
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS pins (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  poem TEXT NOT NULL,
  analysis TEXT NOT NULL DEFAULT '',
  delete_hash TEXT NOT NULL,
  ts INTEGER NOT NULL,
  removed_at INTEGER
);
CREATE INDEX IF NOT EXISTS pins_live ON pins (removed_at, ts DESC, id DESC);
CREATE TABLE IF NOT EXISTS votes (
  pin_id TEXT NOT NULL,
  voter_hash TEXT NOT NULL,
  value INTEGER NOT NULL CHECK (value IN (-1, 1)),
  ts INTEGER NOT NULL,
  PRIMARY KEY (pin_id, voter_hash)
);
CREATE TABLE IF NOT EXISTS spend (
  day TEXT PRIMARY KEY,
  completion_tokens INTEGER NOT NULL DEFAULT 0
);
`;

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken(bytes = 24): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Control characters other than newline and tab never belong in a poem.
function clean(value: unknown, max: number): string {
  let out = "";
  for (const ch of String(value ?? "")) {
    const code = ch.codePointAt(0) ?? 0;
    const control = (code < 32 && code !== 10 && code !== 9) || code === 127;
    if (!control) out += ch;
  }
  return out.trim().slice(0, max);
}

function encodeCursor(ts: number, id: string): string {
  return btoa(`${ts}:${id}`).replace(/=+$/, "");
}

function decodeCursor(cursor: string | null): { ts: number; id: string } | null {
  if (!cursor) return null;
  try {
    const [ts, id] = atob(cursor).split(":");
    const n = Number(ts);
    if (!Number.isSafeInteger(n) || !id) return null;
    return { ts: n, id };
  } catch {
    return null;
  }
}

function toItem(row: PinRow): WallItem {
  const upvotes = Number(row.upvotes) || 0;
  const downvotes = Number(row.downvotes) || 0;
  return {
    id: row.id,
    name: row.name,
    title: row.title ?? "",
    poem: row.poem,
    analysis: row.analysis,
    ts: new Date(row.ts).toISOString(),
    upvotes,
    downvotes,
    score: upvotes - downvotes,
  };
}

const PIN_SELECT = `
SELECT p.id, p.name, p.title, p.poem, p.analysis, p.ts,
  COALESCE(SUM(CASE WHEN v.value = 1 THEN 1 END), 0) AS upvotes,
  COALESCE(SUM(CASE WHEN v.value = -1 THEN 1 END), 0) AS downvotes
FROM pins p LEFT JOIN votes v ON v.pin_id = p.id
WHERE p.removed_at IS NULL`;

export class CadavreStore extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(SCHEMA);
    // Pins made before titles existed: add the column in place.
    const columns = ctx.storage.sql.exec<{ name: string }>("PRAGMA table_info(pins)").toArray().map((c) => c.name);
    if (!columns.includes("title")) ctx.storage.sql.exec("ALTER TABLE pins ADD COLUMN title TEXT NOT NULL DEFAULT ''");
  }

  // -- wall -----------------------------------------------------------------

  async listPins(limit: number, cursor: string | null): Promise<{ items: WallItem[]; nextCursor: string | null }> {
    const size = Math.min(WALL_LIMITS.page, Math.max(1, Math.floor(limit) || WALL_LIMITS.page));
    const after = decodeCursor(cursor);
    const rows = after
      ? this.ctx.storage.sql
          .exec<PinRow>(
            `${PIN_SELECT} AND (p.ts < ? OR (p.ts = ? AND p.id < ?)) GROUP BY p.id ORDER BY p.ts DESC, p.id DESC LIMIT ?`,
            after.ts, after.ts, after.id, size + 1,
          )
          .toArray()
      : this.ctx.storage.sql
          .exec<PinRow>(`${PIN_SELECT} GROUP BY p.id ORDER BY p.ts DESC, p.id DESC LIMIT ?`, size + 1)
          .toArray();
    const page = rows.slice(0, size);
    const last = page[page.length - 1];
    return {
      items: page.map(toItem),
      nextCursor: rows.length > size && last ? encodeCursor(last.ts, last.id) : null,
    };
  }

  async pin(input: { name?: unknown; poem?: unknown; analysis?: unknown; title?: unknown }): Promise<{ item: WallItem; deleteToken: string } | { error: string }> {
    const poem = clean(input.poem, WALL_LIMITS.poem);
    if (!poem) return { error: "a corpse needs at least one line" };
    const name = clean(input.name, WALL_LIMITS.name) || "anonymous";
    const analysis = clean(input.analysis, WALL_LIMITS.analysis);
    const title = clean(input.title, WALL_LIMITS.title);
    const id = crypto.randomUUID();
    const deleteToken = randomToken();
    const ts = Date.now();
    this.ctx.storage.sql.exec(
      "INSERT INTO pins (id, name, title, poem, analysis, delete_hash, ts) VALUES (?, ?, ?, ?, ?, ?, ?)",
      id, name, title, poem, analysis, await sha256(deleteToken), ts,
    );
    return { item: { id, name, title, poem, analysis, ts: new Date(ts).toISOString(), upvotes: 0, downvotes: 0, score: 0 }, deleteToken };
  }

  // The hand that pinned a corpse (it holds the delete token) may correct the name on it.
  async renamePin(id: string, deleteToken: unknown, name: unknown): Promise<"missing" | "forbidden" | "invalid" | { name: string }> {
    const cleaned = clean(name, WALL_LIMITS.name);
    if (!cleaned) return "invalid";
    const row = this.ctx.storage.sql
      .exec<{ delete_hash: string }>("SELECT delete_hash FROM pins WHERE id = ? AND removed_at IS NULL", id)
      .toArray()[0];
    if (!row) return "missing";
    if (typeof deleteToken !== "string" || (await sha256(deleteToken)) !== row.delete_hash) return "forbidden";
    this.ctx.storage.sql.exec("UPDATE pins SET name = ? WHERE id = ?", cleaned, id);
    return { name: cleaned };
  }

  // The same hand may edit the poem, its reading, or its title after pinning.
  async editPin(
    id: string,
    deleteToken: unknown,
    input: { poem?: unknown; analysis?: unknown; title?: unknown },
  ): Promise<"missing" | "forbidden" | "invalid" | { poem: string; analysis: string; title: string }> {
    const row = this.ctx.storage.sql
      .exec<{ delete_hash: string; poem: string; analysis: string; title: string }>(
        "SELECT delete_hash, poem, analysis, title FROM pins WHERE id = ? AND removed_at IS NULL", id,
      )
      .toArray()[0];
    if (!row) return "missing";
    if (typeof deleteToken !== "string" || (await sha256(deleteToken)) !== row.delete_hash) return "forbidden";
    const poem = input.poem === undefined ? row.poem : clean(input.poem, WALL_LIMITS.poem);
    if (!poem) return "invalid";
    const analysis = input.analysis === undefined ? row.analysis : clean(input.analysis, WALL_LIMITS.analysis);
    const title = input.title === undefined ? row.title ?? "" : clean(input.title, WALL_LIMITS.title);
    this.ctx.storage.sql.exec("UPDATE pins SET poem = ?, analysis = ?, title = ? WHERE id = ?", poem, analysis, title, id);
    return { poem, analysis, title };
  }

  async removePin(id: string, deleteToken: unknown): Promise<"removed" | "missing" | "forbidden"> {
    const row = this.ctx.storage.sql
      .exec<{ delete_hash: string }>("SELECT delete_hash FROM pins WHERE id = ? AND removed_at IS NULL", id)
      .toArray()[0];
    if (!row) return "missing";
    if (typeof deleteToken !== "string" || (await sha256(deleteToken)) !== row.delete_hash) return "forbidden";
    this.ctx.storage.sql.exec("UPDATE pins SET removed_at = ? WHERE id = ?", Date.now(), id);
    this.ctx.storage.sql.exec("DELETE FROM votes WHERE pin_id = ?", id);
    return "removed";
  }

  async vote(id: string, voterToken: unknown, value: unknown): Promise<VoteResult | null> {
    const v = Number(value);
    if (![-1, 0, 1].includes(v)) return null;
    if (typeof voterToken !== "string" || voterToken.length < 8 || voterToken.length > 128) return null;
    const exists = this.ctx.storage.sql
      .exec<{ id: string }>("SELECT id FROM pins WHERE id = ? AND removed_at IS NULL", id)
      .toArray()[0];
    if (!exists) return null;
    const voterHash = await sha256(voterToken);
    if (v === 0) {
      this.ctx.storage.sql.exec("DELETE FROM votes WHERE pin_id = ? AND voter_hash = ?", id, voterHash);
    } else {
      this.ctx.storage.sql.exec(
        `INSERT INTO votes (pin_id, voter_hash, value, ts) VALUES (?, ?, ?, ?)
         ON CONFLICT (pin_id, voter_hash) DO UPDATE SET value = excluded.value, ts = excluded.ts`,
        id, voterHash, v, Date.now(),
      );
    }
    const row = this.ctx.storage.sql
      .exec<PinRow>(`${PIN_SELECT} AND p.id = ? GROUP BY p.id`, id)
      .toArray()[0];
    if (!row) return null;
    return { ...toItem(row), viewerVote: v as -1 | 0 | 1 };
  }

  // -- spend ledger -----------------------------------------------------------

  /** Reserve `tokens` against today's ceiling before generating. */
  async reserveSpend(day: string, tokens: number, ceiling: number): Promise<{ allowed: boolean; total: number }> {
    const row = this.ctx.storage.sql
      .exec<{ completion_tokens: number }>("SELECT completion_tokens FROM spend WHERE day = ?", day)
      .toArray()[0];
    const current = Number(row?.completion_tokens ?? 0);
    if (current + tokens > ceiling) return { allowed: false, total: current };
    this.ctx.storage.sql.exec(
      `INSERT INTO spend (day, completion_tokens) VALUES (?, ?)
       ON CONFLICT (day) DO UPDATE SET completion_tokens = completion_tokens + excluded.completion_tokens`,
      day, tokens,
    );
    return { allowed: true, total: current + tokens };
  }

  /** Replace the reservation with what the model actually used. */
  async settleSpend(day: string, reserved: number, actual: number): Promise<void> {
    const delta = Math.round(actual - reserved);
    if (!Number.isFinite(delta) || delta === 0) return;
    this.ctx.storage.sql.exec(
      "UPDATE spend SET completion_tokens = MAX(0, completion_tokens + ?) WHERE day = ?",
      delta, day,
    );
  }

  async spendToday(day: string): Promise<number> {
    const row = this.ctx.storage.sql
      .exec<{ completion_tokens: number }>("SELECT completion_tokens FROM spend WHERE day = ?", day)
      .toArray()[0];
    return Number(row?.completion_tokens ?? 0);
  }
}
