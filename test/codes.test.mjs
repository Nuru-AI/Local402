import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { keyToCode, codeToKey, newCode, codeAddress, CODE_PREFIX } from '../src/codewallet.mjs';

test('a code round-trips to its key', () => {
  for (let i = 0; i < 200; i++) {
    const key = generatePrivateKey();
    const code = keyToCode(key);
    assert.ok(code.startsWith(CODE_PREFIX));
    assert.equal(code.length, CODE_PREFIX.length + 58);
    assert.match(code.slice(CODE_PREFIX.length), /^[0-9a-hjkmnp-tv-z]+$/);
    assert.equal(codeToKey(code), key);
  }
});

test('a code copied by hand still decodes: case, spaces, hyphens, i/l/o', () => {
  const key = generatePrivateKey();
  const code = keyToCode(key);
  const body = code.slice(CODE_PREFIX.length);
  const grouped = `UNLOCK1 ${body.toUpperCase().match(/.{1,6}/g).join('-')}`;
  assert.equal(codeToKey(grouped), key);
  assert.equal(codeToKey(body), key);
  const withLookalikes = code.replace(/1/g, 'l').replace(/0/g, 'o');
  assert.equal(codeToKey(withLookalikes.replace(/^un[l]ock[l]_/, 'unlock1_')), key);
});

test('a typo fails the checksum instead of opening another wallet', () => {
  const { code } = newCode();
  const i = CODE_PREFIX.length + 10;
  const swapped = code.slice(0, i) + (code[i] === 'a' ? 'b' : 'a') + code.slice(i + 1);
  assert.throws(() => codeToKey(swapped), /checksum|valid/);
  assert.throws(() => codeToKey(code.slice(0, -1)), /length/);
  assert.throws(() => codeToKey('unlock_0123456789abcdef01234567'), /length/);
});

test('the code wallet address is the key\'s address', () => {
  const key = generatePrivateKey();
  assert.equal(codeAddress(keyToCode(key)), privateKeyToAccount(key).address);
});

test('the gateway loads no key and holds no wallet', () => {
  const src = fs.readFileSync(new URL('../src/server.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /loadAccount|privateKey|AGENT_KEY|transferTagged|sendTagged/);
});
