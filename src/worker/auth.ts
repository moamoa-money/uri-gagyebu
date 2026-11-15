// 로그인: 가족마다 이름 + 비밀번호. 비밀번호는 PBKDF2로만 저장(원문 저장 안 함).
// 로그인 유지 쿠키는 서명 키로 서명 — 서명 키는 처음 실행할 때 만들어 DB에 둔다
// (설치하는 사람이 따로 비밀 값을 넣지 않아도 되게).

import { all, first, getSetting, run, setSetting, toUser, UserError, type Env } from './db';
import type { User } from '../shared/types';

const COOKIE = 'gb_session';
const SESSION_DAYS = 60;
const ITER = 20000; // 무료 요금제 CPU 한도 안에서
const LOCK_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 10;

const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const b64url = (buf: ArrayBuffer) => b64(buf).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function hashPassword(password: string, salt?: string): Promise<{ hash: string; salt: string }> {
  const s = salt ?? b64(crypto.getRandomValues(new Uint8Array(16)));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(s), iterations: ITER }, key, 256);
  return { hash: b64(bits), salt: s };
}

async function secret(env: Env): Promise<string> {
  let s = await getSetting(env, 'session_secret');
  if (!s) {
    s = b64(crypto.getRandomValues(new Uint8Array(32)));
    await setSetting(env, 'session_secret', s);
  }
  return s;
}

async function hmac(key: string, text: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(text)));
}

export async function sessionCookie(env: Env, userId: string): Promise<string> {
  const exp = Date.now() + SESSION_DAYS * 86400 * 1000;
  const body = `${userId}.${exp}`;
  return `${COOKIE}=${body}.${await hmac(await secret(env), body)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
}
export const clearCookie = `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

export async function currentUser(env: Env, request: Request): Promise<User | null> {
  const m = (request.headers.get('Cookie') ?? '').match(new RegExp(`${COOKIE}=([^;]+)`));
  if (!m) return null;
  const parts = m[1].split('.');
  if (parts.length !== 3) return null;
  const [userId, exp, sig] = parts;
  if (Number(exp) < Date.now()) return null;
  if (!sameText(sig, await hmac(await secret(env), `${userId}.${exp}`))) return null;
  return first(env, 'SELECT * FROM users WHERE id = ?', [userId], toUser);
}

export async function hasUsers(env: Env): Promise<boolean> {
  const r = await first(env, 'SELECT COUNT(*) AS n FROM users', [], (r) => Number(r.n));
  return (r ?? 0) > 0;
}

export async function login(env: Env, name: string, password: string): Promise<{ ok: true; user: User } | { ok: false; reason: 'bad' | 'locked' }> {
  const now = Date.now();
  await run(env, 'DELETE FROM login_fails WHERE at < ?', [now - 86400 * 1000]);
  const fails = await first(env, 'SELECT COUNT(*) AS n FROM login_fails WHERE at > ?', [now - LOCK_WINDOW_MS], (r) => Number(r.n));
  if ((fails ?? 0) >= MAX_FAILS) return { ok: false, reason: 'locked' };
  const rows = await all(env, 'SELECT * FROM users WHERE name = ?', [name.trim()], (r) => ({ user: toUser(r), hash: String(r.pw_hash), salt: String(r.pw_salt) }));
  const row = rows[0];
  if (row && password) {
    const { hash } = await hashPassword(password, row.salt);
    if (sameText(hash, row.hash)) return { ok: true, user: row.user };
  }
  if (password) await run(env, 'INSERT INTO login_fails (at) VALUES (?)', [now]);
  return { ok: false, reason: 'bad' };
}

// 비밀번호 잊었을 때 되찾기: Cloudflare 계정 주인만 넣을 수 있는 Secret(RESET_CODE)을 '복구 열쇠'로 쓴다.
// Cloudflare 비밀번호는 메일로 되찾을 수 있으니, 결국 가계부 비밀번호도 되찾을 수 있다.
// 같은 열쇠는 한 번만 쓸 수 있고(쓴 열쇠의 지문을 저장), 틀리면 로그인 실패와 같이 세서 잠근다.
async function digest(text: string): Promise<string> {
  return b64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}
export async function recoverPassword(env: Env, code: string, name: string, password: string): Promise<User> {
  const now = Date.now();
  const fails = await first(env, 'SELECT COUNT(*) AS n FROM login_fails WHERE at > ?', [now - LOCK_WINDOW_MS], (r) => Number(r.n));
  if ((fails ?? 0) >= MAX_FAILS) throw new UserError('여러 번 틀려서 15분 동안 잠겼어요.');
  const key = (env.RESET_CODE ?? '').trim();
  if (key.length < 8) throw new UserError('아직 복구 열쇠가 없어요. 아래 안내대로 Cloudflare에서 먼저 만들어 주세요.');
  const used = await getSetting(env, 'reset_code_used');
  const fp = await digest(key);
  if (!sameText(code.trim(), key)) {
    await run(env, 'INSERT INTO login_fails (at) VALUES (?)', [now]);
    throw new UserError('복구 열쇠가 달라요.');
  }
  if (used === fp) throw new UserError('이 복구 열쇠는 이미 한 번 썼어요. Cloudflare에서 새 열쇠로 바꿔 주세요.');
  if (password.length < 6) throw new UserError('새 비밀번호는 6자 이상이에요.');
  const row = await first(env, 'SELECT * FROM users WHERE name = ?', [name.trim()], toUser);
  if (!row) throw new UserError('그 이름은 이 가계부에 없어요.');
  const { hash, salt } = await hashPassword(password);
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET pw_hash = ?, pw_salt = ? WHERE id = ?').bind(hash, salt, row.id),
    env.DB.prepare('DELETE FROM login_fails').bind(),
  ]);
  await setSetting(env, 'reset_code_used', fp);
  return row;
}
