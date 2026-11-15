// D1 읽기·쓰기 도우미와 표 한 줄 ↔ 앱 데이터 변환

import type { Account, Category, Group, Investment, Recurring, Tx, User } from '../shared/types';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  RESET_CODE?: string; // 비밀번호 잊었을 때: Cloudflare 대시보드에서 Secret으로 넣는 복구 열쇠(선택)
}

export class UserError extends Error {}

type Row = Record<string, unknown>;
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const strOrNull = (v: unknown) => (v === null || v === undefined || v === '' ? null : String(v));
const num = (v: unknown) => Number(v ?? 0) || 0;

export const newId = () => crypto.randomUUID();

export async function all<T>(env: Env, sql: string, binds: unknown[], map: (r: Row) => T): Promise<T[]> {
  const res = await env.DB.prepare(sql).bind(...binds).all<Row>();
  return res.results.map(map);
}
export async function first<T>(env: Env, sql: string, binds: unknown[], map: (r: Row) => T): Promise<T | null> {
  const r = await env.DB.prepare(sql).bind(...binds).first<Row>();
  return r ? map(r) : null;
}
export async function run(env: Env, sql: string, binds: unknown[]): Promise<void> {
  await env.DB.prepare(sql).bind(...binds).run();
}
export async function log(env: Env, user: string, action: string, detail: unknown) {
  await run(env, 'INSERT INTO activity (at, user_name, action, detail) VALUES (?, ?, ?, ?)', [Date.now(), user, action, JSON.stringify(detail)]);
}

export const toCategory = (r: Row): Category => ({
  id: str(r.id),
  name: str(r.name),
  grp: str(r.grp) as Group,
  icon: str(r.icon) || str(r.emoji),
  moneynote: Number(r.moneynote ?? 0) === 1,
  moneynoteAdd: Number(r.moneynote_add ?? 0) === 1,
  inRoadmap: Number(r.in_roadmap ?? 1) === 1,
  budget: num(r.budget),
  sort: num(r.sort),
  hidden: num(r.hidden) !== 0,
});
export const toAccount = (r: Row): Account => ({
  id: str(r.id),
  name: str(r.name),
  kind: str(r.kind),
  startBalance: num(r.start_balance),
  sort: num(r.sort),
  hidden: num(r.hidden) !== 0,
});
export const toTx = (r: Row): Tx => ({
  id: str(r.id),
  date: str(r.date),
  title: str(r.title),
  amount: num(r.amount),
  categoryId: strOrNull(r.category_id),
  fromAccount: strOrNull(r.from_account),
  toAccount: strOrNull(r.to_account),
  memo: str(r.memo),
  unnecessary: num(r.unnecessary) !== 0,
  recurringId: strOrNull(r.recurring_id),
  createdBy: strOrNull(r.created_by),
});
export const toRecurring = (r: Row): Recurring => ({
  id: str(r.id),
  title: str(r.title),
  categoryId: strOrNull(r.category_id),
  amount: num(r.amount),
  day: num(r.day) || 1,
  fromAccount: strOrNull(r.from_account),
  toAccount: strOrNull(r.to_account),
  startMonth: str(r.start_month),
  endMonth: strOrNull(r.end_month),
  active: num(r.active) !== 0,
  memo: str(r.memo),
  mode: str(r.mode) === 'batch' ? 'batch' : 'auto',
  loanAccount: strOrNull(r.loan_account),
  loanPart: str(r.loan_part) === 'principal' ? 'principal' : str(r.loan_part) === 'interest' ? 'interest' : null,
  sort: num(r.sort),
});
export const toInvestment = (r: Row): Investment => ({
  id: str(r.id),
  name: str(r.name),
  kind: str(r.kind),
  status: str(r.status),
  accountId: strOrNull(r.account_id),
  amount: num(r.amount),
  startDate: strOrNull(r.start_date),
  maturity: strOrNull(r.maturity),
  returned: r.returned === null || r.returned === undefined ? null : num(r.returned),
  memo: str(r.memo),
});
export const toUser = (r: Row): User => ({ id: str(r.id), name: str(r.name), role: str(r.role) === 'owner' ? 'owner' : 'member' });

export const getCategories = (env: Env) => all(env, 'SELECT * FROM categories ORDER BY grp, sort, name', [], toCategory);
export const getAccounts = (env: Env) => all(env, 'SELECT * FROM accounts ORDER BY sort, name', [], toAccount);
export const getRecurring = (env: Env) => all(env, 'SELECT * FROM recurring ORDER BY sort, day, title', [], toRecurring);
export const getUsers = (env: Env) => all(env, 'SELECT * FROM users ORDER BY created_at', [], toUser);

export async function getSetting(env: Env, key: string): Promise<string | null> {
  return first(env, 'SELECT value FROM settings WHERE key = ?', [key], (r) => str(r.value));
}
export async function setSetting(env: Env, key: string, value: string) {
  await run(env, 'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', [key, value]);
}
