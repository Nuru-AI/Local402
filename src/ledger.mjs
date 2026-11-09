// Prepaid balances in USD₮ atomic units, keyed by a credit token handed to the depositor once.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const FILE = process.env.LEDGER_FILE || 'data/ledger.json';
function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return { deposits: {}, credits: {}, calls: [] }; }
}
function save(db) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(db, null, 2));
}
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');

export function depositSeen(txHash) { return !!load().deposits[txHash.toLowerCase()]; }

export function recordDeposit(txHash, record) {
  const db = load();
  const token = `l402_${crypto.randomBytes(24).toString('hex')}`;
  db.deposits[txHash.toLowerCase()] = { ...record, credit: hash(token), at: new Date().toISOString() };
  db.credits[hash(token)] = { owner: record.from, balance: record.creditedAtomic, deposits: [txHash.toLowerCase()] };
  // The same deposit is also a channel: drawn with signed cumulative vouchers from the owner's wallet.
  db.channels = db.channels || {};
  db.channels[txHash.toLowerCase()] = {
    owner: record.from, currency: record.currency, credited: record.creditedAtomic,
    spent: '0', calls: 0, credit: hash(token), state: 'open', openedAt: new Date().toISOString(),
  };
  save(db);
  return token;
}

export function channel(id) { return (load().channels || {})[id.toLowerCase()] || null; }

/** Advance a channel to `cumulative` for a draw of exactly `atomic`. Our record is the truth. */
export function draw(id, cumulative, atomic, call) {
  const db = load();
  const ch = db.channels?.[id.toLowerCase()];
  if (!ch || ch.state !== 'open') throw Object.assign(new Error('channel not open'), { status: 409 });
  const expected = BigInt(ch.spent) + BigInt(atomic);
  if (BigInt(cumulative) !== expected) {
    throw Object.assign(new Error(`voucher must carry cumulative ${expected} (spent ${ch.spent} + price ${atomic})`), { status: 409, expected: expected.toString() });
  }
  if (expected > BigInt(ch.credited)) throw Object.assign(new Error('channel balance too low'), { status: 402 });
  ch.spent = expected.toString();
  ch.calls += 1;
  const c = db.credits[ch.credit];
  if (c) c.balance = (BigInt(ch.credited) - expected).toString(); // the bearer view stays in step
  db.calls.push({ ...call, channel: id.toLowerCase().slice(0, 12), cumulative: expected.toString(), at: new Date().toISOString() });
  save(db);
  return ch;
}

export function undraw(id, atomic) {
  const db = load();
  const ch = db.channels?.[id.toLowerCase()];
  if (!ch) return;
  ch.spent = (BigInt(ch.spent) - BigInt(atomic)).toString();
  ch.calls -= 1;
  const c = db.credits[ch.credit];
  if (c) c.balance = (BigInt(ch.credited) - BigInt(ch.spent)).toString();
  save(db);
}

export function closeChannel(id, settlement) {
  const db = load();
  const ch = db.channels?.[id.toLowerCase()];
  if (!ch || ch.state !== 'open') throw Object.assign(new Error('channel not open'), { status: 409 });
  Object.assign(ch, { state: 'closed', closedAt: new Date().toISOString(), ...settlement });
  const c = db.credits[ch.credit];
  if (c) c.balance = '0';
  save(db);
  return ch;
}

export function balance(token) { return load().credits[hash(token)] || null; }

export function debit(token, atomic, call) {
  const db = load();
  const c = db.credits[hash(token)];
  if (!c) throw Object.assign(new Error('unknown credit token'), { status: 401 });
  if (BigInt(c.balance) < BigInt(atomic)) throw Object.assign(new Error('balance too low; deposit more'), { status: 402 });
  c.balance = (BigInt(c.balance) - BigInt(atomic)).toString();
  // Keep the channel view in step with bearer-token spending on the same deposit.
  for (const ch of Object.values(db.channels || {})) {
    if (ch.credit === hash(token)) ch.spent = (BigInt(ch.credited) - BigInt(c.balance)).toString();
  }
  db.calls.push({ ...call, credit: hash(token).slice(0, 12), at: new Date().toISOString() });
  save(db);
  return c.balance;
}

export function refund(token, atomic) {
  const db = load();
  const c = db.credits[hash(token)];
  if (c) {
    c.balance = (BigInt(c.balance) + BigInt(atomic)).toString();
    for (const ch of Object.values(db.channels || {})) {
      if (ch.credit === hash(token)) ch.spent = (BigInt(ch.credited) - BigInt(c.balance)).toString();
    }
    save(db);
  }
}

export function history() {
  const db = load();
  return {
    deposits: Object.entries(db.deposits).map(([tx, d]) => ({ tx, ...d, credit: undefined })),
    calls: db.calls,
  };
}
