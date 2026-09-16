const fs = require('fs');
const path = require('path');
const { pool, hasDb } = require('./db');

const { TWILIO_NUMBER, TWILIO_NUMBERS } = process.env;

// ── Phone lines ──
// One row per Twilio number the phone can act as. The UI adds, renames and removes them,
// so the list has to outlive the process: Postgres when DATABASE_URL is set (see db.js),
// otherwise a JSON file beside the code. Both backends expose the same four operations
// and the shared layer above them does the validating, seeding and caching.

const FILE = path.join(__dirname, 'lines-store.json');
const E164 = /^\+[1-9]\d{6,14}$/;
const LABEL_MAX = 40;
const MAX_LINES = 20;

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// Accepts what a human pastes — "+1 (417) 759-4208" — and hands back E.164.
const cleanNumber = (v) => String(v == null ? '' : v).replace(/[\s()\-.]/g, '');
const cleanLabel = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, LABEL_MAX);

class LineError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// ── File backend (local dev) ──
const fileBackend = {
  async init() {},
  async all() {
    try {
      const rows = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  },
  async write(rows) {
    fs.writeFileSync(FILE, JSON.stringify(rows, null, 2));
  },
  async insert(line) {
    const rows = await this.all();
    rows.push(line);
    await this.write(rows);
    return line;
  },
  async patch(id, fields) {
    const rows = await this.all();
    const row = rows.find((r) => r.id === id);
    if (!row) return null;
    Object.assign(row, fields);
    await this.write(rows);
    return row;
  },
  async remove(id) {
    const rows = await this.all();
    const next = rows.filter((r) => r.id !== id);
    if (next.length === rows.length) return false;
    await this.write(next);
    return true;
  },
};

// ── Postgres backend ──
const pgBackend = {
  async init() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS phone_lines (
        id         TEXT PRIMARY KEY,
        number     TEXT NOT NULL UNIQUE,
        label      TEXT NOT NULL,
        position   INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
  },
  async all() {
    const { rows } = await pool.query(
      'SELECT id, number, label, position FROM phone_lines ORDER BY position, created_at',
    );
    return rows;
  },
  async insert(line) {
    try {
      await pool.query(
        'INSERT INTO phone_lines (id, number, label, position) VALUES ($1, $2, $3, $4)',
        [line.id, line.number, line.label, line.position],
      );
      return line;
    } catch (e) {
      // Two tabs adding the same number race past the duplicate check above; the UNIQUE
      // index is what actually settles it.
      if (e.code === '23505') throw new LineError('That number is already one of your lines.', 409);
      throw e;
    }
  },
  async patch(id, fields) {
    const sets = [];
    const values = [];
    for (const [key, value] of Object.entries(fields)) {
      values.push(value);
      sets.push(`${key} = $${values.length}`);
    }
    if (!sets.length) return null;
    values.push(id);
    try {
      const { rows } = await pool.query(
        `UPDATE phone_lines SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING id, number, label, position`,
        values,
      );
      return rows[0] || null;
    } catch (e) {
      if (e.code === '23505') throw new LineError('That number is already one of your lines.', 409);
      throw e;
    }
  },
  async remove(id) {
    const { rowCount } = await pool.query('DELETE FROM phone_lines WHERE id = $1', [id]);
    return rowCount > 0;
  },
};

const backend = hasDb ? pgBackend : fileBackend;

// ── Seeding ──
// Only ever runs against an empty store, so it can't fight what the UI has done since.
// TWILIO_NUMBERS ("+1555…|Support,+1555…|Billing") brings a fresh environment up with its
// lines already in place; TWILIO_NUMBER alone seeds the single line this app started with.
function seedLines() {
  const seeds = [];
  for (const entry of String(TWILIO_NUMBERS || '').split(',')) {
    const [rawNumber, rawLabel] = entry.split('|');
    const number = cleanNumber(rawNumber);
    if (E164.test(number)) seeds.push({ number, label: cleanLabel(rawLabel) || 'Line' });
  }
  const fallback = cleanNumber(TWILIO_NUMBER);
  if (!seeds.length && E164.test(fallback)) seeds.push({ number: fallback, label: 'Main line' });
  const seen = new Set();
  return seeds
    .filter((s) => !seen.has(s.number) && seen.add(s.number))
    .map((s, i) => ({ id: newId(), number: s.number, label: s.label, position: i }));
}

// Last list read successfully. Voice webhooks answer from this when the database is
// briefly unreachable — a call in flight shouldn't fail over a caller-ID lookup.
let snapshot = [];

async function init() {
  await backend.init();
  if ((await backend.all()).length) return refresh();
  for (const line of seedLines()) {
    try {
      await backend.insert(line);
    } catch (e) {
      if (e.status !== 409) throw e; // another replica seeded first
    }
  }
  return refresh();
}

async function refresh() {
  snapshot = await backend.all();
  return snapshot;
}

const list = () => refresh();

// For read paths and webhooks: never throw, fall back to the last good list.
async function listSafe() {
  try {
    return await refresh();
  } catch (e) {
    console.error('could not read phone lines —', e.message);
    return snapshot;
  }
}

async function add({ number, label }) {
  const clean = cleanNumber(number);
  const name = cleanLabel(label);
  if (!E164.test(clean)) throw new LineError('Enter the number in E.164 form, e.g. +14155550123');
  if (!name) throw new LineError('Give the line a name.');
  const rows = await list();
  if (rows.length >= MAX_LINES) throw new LineError(`That's the limit of ${MAX_LINES} lines.`);
  if (rows.some((r) => r.number === clean)) throw new LineError('That number is already one of your lines.', 409);
  const position = rows.reduce((max, r) => Math.max(max, r.position ?? 0), -1) + 1;
  const line = await backend.insert({ id: newId(), number: clean, label: name, position });
  await refresh();
  return line;
}

async function update(id, { number, label }) {
  const rows = await list();
  if (!rows.some((r) => r.id === id)) throw new LineError('No such line.', 404);
  const fields = {};
  if (label !== undefined) {
    const name = cleanLabel(label);
    if (!name) throw new LineError('Give the line a name.');
    fields.label = name;
  }
  if (number !== undefined) {
    const clean = cleanNumber(number);
    if (!E164.test(clean)) throw new LineError('Enter the number in E.164 form, e.g. +14155550123');
    if (rows.some((r) => r.number === clean && r.id !== id)) {
      throw new LineError('That number is already one of your lines.', 409);
    }
    fields.number = clean;
  }
  if (!Object.keys(fields).length) throw new LineError('Nothing to change.');
  const line = await backend.patch(id, fields);
  if (!line) throw new LineError('No such line.', 404);
  await refresh();
  return line;
}

async function remove(id) {
  const rows = await list();
  if (!rows.some((r) => r.id === id)) throw new LineError('No such line.', 404);
  // The phone has to be able to dial from something, and every caller ID is one of
  // these rows — so the last one can be renamed or repointed, but not removed.
  if (rows.length === 1) throw new LineError('This is your only line — add another before removing it.');
  await backend.remove(id);
  await refresh();
}

// ── Lookups (webhook + send paths) ──

// The line a number belongs to, or null. Matching is what scopes history and what
// decides whether a requested caller ID is one we actually own.
function match(number, rows = snapshot) {
  const clean = cleanNumber(number);
  return rows.find((r) => r.number === clean) || null;
}

// The caller ID to dial out with. A request for a number we don't own falls back to the
// default line rather than being honoured — Twilio would reject it anyway, and an
// unverified caller ID is not something a client should get to choose.
function callerId(requested, rows = snapshot) {
  const line = match(requested, rows);
  if (line) return line.number;
  return (rows[0] && rows[0].number) || cleanNumber(TWILIO_NUMBER) || null;
}

module.exports = {
  init,
  list,
  listSafe,
  add,
  update,
  remove,
  match,
  callerId,
  LineError,
  E164,
};
