import { application, isApp, type AppId } from './applications.ts';
export { APPS, isApp, type AppId } from './applications.ts';
export type Contribution = { role: 'user' | 'assistant'; content: string; model?: string };
export type EntryContent = {
  schemaVersion: 1;
  contributions: Contribution[];
  text: string;
  reading: string;
  settings: Record<string, string | number | boolean | string[]>;
  record: Record<string, unknown>;
};
export type EntryInput = { id: string; app: AppId; kind: string; title: string; content: EntryContent; expectedRevision: number };
export type EntryRow = {id: string; app: AppId; kind: string; title: string; content: string; pinned: number; revision: number; created_at: number; updated_at: number};
export class InputError extends Error {}
export const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
export function exact(input: unknown, allowed: string[]): Record<string, unknown> {
  if (!isRecord(input) || Object.keys(input).some(k => !allowed.includes(k))) throw new InputError('Unexpected fields.');
  return input;
}
export function boundedText(input: unknown, max: number, required = false): string {
  if (typeof input !== 'string' || input.length > max || (required && !input.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(input)) throw new InputError('Invalid text.');
  return input;
}
export function revision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new InputError('A valid revision is required.');
  return value;
}
export function entryId(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) throw new InputError('Invalid record ID.');
  return value;
}
const forbiddenKey = /(?:password|secret|token|authorization|api.?key|cookie|credential|subject|email)/i;
function safeRecord(input: unknown, depth = 0): Record<string, unknown> {
  if (!isRecord(input) || depth > 8) throw new InputError('Invalid related record.');
  for (const [key, value] of Object.entries(input)) {
    if (forbiddenKey.test(key) || ['__proto__','constructor','prototype'].includes(key)) throw new InputError('Credentials and identity do not belong in saved records.');
    if (typeof value === 'object' && value !== null) {
      if (Array.isArray(value)) {
        if (value.length > 200) throw new InputError('Related record is too large.');
        for (const item of value) if (typeof item === 'object' && item !== null) safeRecord(Array.isArray(item) ? {items:item} : item, depth + 1);
      } else safeRecord(value, depth + 1);
    }
  }
  return input;
}
export function parseContent(value: unknown): EntryContent {
  const c = exact(value, ['schemaVersion','contributions','text','reading','settings','record']);
  if (c.schemaVersion !== 1 || !Array.isArray(c.contributions) || c.contributions.length > 300) throw new InputError('Invalid contribution record.');
  const contributions = c.contributions.map(value => {
    const m = exact(value, ['role','content','model']);
    if (m.role !== 'user' && m.role !== 'assistant') throw new InputError('Only user and model contributions can be saved.');
    const result: Contribution = {role:m.role, content:boundedText(m.content, 12000, true)};
    if (m.model !== undefined) result.model = boundedText(m.model, 180, true);
    return result;
  });
  const settings: EntryContent['settings'] = {};
  for (const [key, v] of Object.entries(safeRecord(c.settings))) {
    if (typeof v === 'string') settings[key] = boundedText(v, 12000);
    else if (typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) settings[key] = v;
    else if (Array.isArray(v) && v.length <= 30 && v.every(s => typeof s === 'string' && s.length <= 120)) settings[key] = v;
    else throw new InputError('Invalid saved setting.');
  }
  return {schemaVersion:1, contributions, text:boundedText(c.text, 50000), reading:boundedText(c.reading,12000), settings, record:safeRecord(c.record)};
}
export function parseEntry(value: unknown, scope?: AppId): EntryInput {
  const v = exact(value, ['id','app','kind','title','content','expectedRevision']);
  if (!isApp(v.app) || (scope && v.app !== scope)) throw new InputError('This application cannot save that record.');
  if (v.kind !== application(v.app).kind) throw new InputError('Invalid record kind.');
  return {id:entryId(v.id),app:v.app,kind:application(v.app).kind,title:boundedText(v.title,120,true),content:parseContent(v.content),expectedRevision:revision(v.expectedRevision)};
}
export function publicEntry(row: EntryRow, includeContent = false) {
  return {id:row.id, app:row.app, kind:row.kind, title:row.title, pinned:Boolean(row.pinned), revision:row.revision, createdAt:row.created_at, updatedAt:row.updated_at, ...(includeContent ? {content:JSON.parse(row.content) as EntryContent} : {})};
}
