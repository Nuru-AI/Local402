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
  save(db);
  return token;
}

export function balance(token) { return load().credits[hash(token)] || null; }

export function debit(token, atomic, call) {
  const db = load();
  const c = db.credits[hash(token)];
  if (!c) throw Object.assign(new Error('unknown credit token'), { status: 401 });
  if (BigInt(c.balance) < BigInt(atomic)) throw Object.assign(new Error('balance too low; deposit more'), { status: 402 });
  c.balance = (BigInt(c.balance) - BigInt(atomic)).toString();
  db.calls.push({ ...call, credit: hash(token).slice(0, 12), at: new Date().toISOString() });
  save(db);
  return c.balance;
}

export function refund(token, atomic) {
  const db = load();
  const c = db.credits[hash(token)];
  if (c) { c.balance = (BigInt(c.balance) + BigInt(atomic)).toString(); save(db); }
}

export function history() {
  const db = load();
  return {
    deposits: Object.entries(db.deposits).map(([tx, d]) => ({ tx, ...d, credit: undefined })),
    calls: db.calls,
  };
}
