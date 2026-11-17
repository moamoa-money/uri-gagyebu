// 가계부 작업: 화면 API가 부르는 곳

import { addMonths, isDate, isMonth, kstToday, monthOf, nextMonth } from '../shared/dates';
import { accountBalances, budgetLines, DEFAULT_CATEGORIES, longCalc, monthTotals, recurringDates, valuedAt } from '../shared/rules';
import { ACCOUNT_KINDS, GROUPS, isSpending, type Account, type Category, type Group, type Tx, type User } from '../shared/types';
import { hashPassword } from './auth';
import {
  all,
  first,
  getAccounts,
  getCategories,
  getRecurring,
  getSetting,
  getUsers,
  log,
  newId,
  run,
  setSetting,
  toInvestment,
  toTx,
  UserError,
  type Env,
} from './db';

export const today = () => kstToday(Date.now());
const text = (v: unknown, max = 200) => String(v ?? '').trim().slice(0, max);
const int = (v: unknown, label: string) => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^\d-]/g, ''));
  if (!Number.isSafeInteger(n)) throw new UserError(`${label}은(는) 숫자로 넣어 주세요.`);
  return n;
};

// ---------- 처음 설치 ----------

export async function setup(env: Env, input: { name: string; password: string; household?: string }) {
  const name = text(input.name, 30);
  if (!name) throw new UserError('이름을 넣어 주세요.');
  if (String(input.password ?? '').length < 6) throw new UserError('비밀번호는 6자 이상으로 정해 주세요.');
  const { hash, salt } = await hashPassword(String(input.password));
  const now = Date.now();
  const user: User = { id: newId(), name, role: 'owner' };
  const stmts = [
    env.DB.prepare('INSERT INTO users (id, name, pw_hash, pw_salt, role, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(user.id, name, hash, salt, 'owner', now),
    env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').bind('household', text(input.household, 30) || '우리집 가계부'),
    ...DEFAULT_CATEGORIES.map((c, i) =>
      env.DB.prepare('INSERT INTO categories (id, name, grp, icon, emoji, budget, sort, hidden, created_at, moneynote) VALUES (?, ?, ?, ?, ?, 0, ?, 0, ?, ?)').bind(newId(), c.name, c.grp, c.icon, c.icon, i, now, c.moneynote ? 1 : 0),
    ),
  ];
  await env.DB.batch(stmts);
  await log(env, name, 'setup', { household: input.household });
  return user;
}

// ---------- 고정지출 자동 입력 ----------

/** 지난번 이후 시작된 달마다 고정 항목 거래를 만든다 (같은 항목·같은 날은 한 번만) */
export async function runRecurring(env: Env, upToMonth = monthOf(today())) {
  const through = (await getSetting(env, 'recurring_through')) ?? addMonths(upToMonth, -1);
  if (through >= upToMonth) return 0;
  const items = await getRecurring(env);
  let made = 0;
  for (const r of items) {
    for (const date of recurringDates(r, nextMonth(through), upToMonth)) {
      const res = await env.DB.prepare(
        `INSERT OR IGNORE INTO transactions (id, date, title, amount, category_id, from_account, to_account, memo, recurring_id, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, '', ?, '자동', ?, ?)`,
      )
        .bind(newId(), date, r.title, r.amount, r.categoryId, r.fromAccount, r.toAccount, r.id, Date.now(), Date.now())
        .run();
      made += res.meta.changes ?? 0;
    }
  }
  await setSetting(env, 'recurring_through', upToMonth);
  if (made) await log(env, '자동', 'recurring.run', { month: upToMonth, made });
  return made;
}

// ---------- 처음 화면에 필요한 것 ----------

/** 무지출 달력 켜기/끄기 (이 사람만) */
export async function setNospendCal(env: Env, user: User, on: unknown) {
  await run(env, "INSERT INTO user_prefs (user_id, key, value) VALUES (?, 'nospend_cal', ?) ON CONFLICT (user_id, key) DO UPDATE SET value = excluded.value", [user.id, on ? '1' : '0']);
  return { ok: true };
}

/** 무지출 달력: 그달 '쓴 날' 목록. 쓴 날 = 변동·고정 카테고리 거래가 있는 날(고정지출 자동·한꺼번에 넣기로 들어간 것은 빼고) */
export async function nospendView(env: Env, month: string) {
  if (!isMonth(month)) throw new UserError('달이 이상해요.');
  const spentIn = (m: string) =>
    all(
      env,
      "SELECT t.date AS d, SUM(t.amount) AS s, COUNT(*) AS n FROM transactions t JOIN categories c ON c.id = t.category_id WHERE c.grp IN ('var', 'fix', 'spc') AND t.recurring_id IS NULL AND t.amount > 0 AND t.date >= ? AND t.date <= ? GROUP BY t.date",
      [`${m}-01`, `${m}-31`],
      (r) => ({ date: String(r.d), amount: Number(r.s), count: Number(r.n) }),
    );
  const prev = addMonths(month, -1);
  const [spent, prevSpent] = await Promise.all([spentIn(month), spentIn(prev)]);
  const t = today();
  const daysIn = (m: string) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).getUTCDate();
  // 지난 날 수: 이번 달이면 오늘까지, 지난 달이면 전부, 앞으로 올 달이면 0
  const passed = (m: string) => (m < monthOf(t) ? daysIn(m) : m === monthOf(t) ? Number(t.slice(8, 10)) : 0);
  return { month, today: t, spent, passedDays: passed(month), prevNoSpend: passed(prev) - prevSpent.length };
}

// ---------- 꾸미기 (가족 공용) ----------
const THEMES = ['green', 'pink', 'sky', 'violet', 'brown', 'charcoal'];
export async function setTheme(env: Env, user: User, name: unknown) {
  const t = String(name);
  if (!THEMES.includes(t)) throw new UserError('없는 색이에요.');
  await setSetting(env, 'look_theme', t);
  await log(env, user.name, 'look.theme', { t });
  return { ok: true };
}
/** 표지(cover)·스티커(sticker) 그림: 화면에서 작게 줄인 data URL을 그대로 저장 (900KB까지). 빈 값이면 지움 */
export async function setLookImage(env: Env, user: User, kind: string, data: unknown) {
  if (kind !== 'cover' && kind !== 'sticker') throw new UserError('잘못된 그림 종류예요.');
  const v = data ? String(data) : '';
  if (v && !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v)) throw new UserError('그림 파일이 아니에요.');
  if (v.length > 900_000) throw new UserError('그림이 너무 커요. 더 작은 그림을 골라 주세요.');
  if (v) {
    await setSetting(env, `look_${kind}`, v);
    await setSetting(env, `look_${kind}_ver`, String(Date.now()));
  } else {
    await run(env, 'DELETE FROM settings WHERE key IN (?, ?)', [`look_${kind}`, `look_${kind}_ver`]);
  }
  await log(env, user.name, 'look.image', { kind, size: v.length });
  return { ok: true };
}
/** 스티커 보관함 (최대 6장) */
export async function listStickers(env: Env) {
  return all(env, "SELECT id, data FROM look_images WHERE kind = 'sticker' ORDER BY sort, created_at", [], (r) => ({ id: String(r.id), data: String(r.data) }));
}
export async function addSticker(env: Env, user: User, data: unknown) {
  const v = String(data ?? '');
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v)) throw new UserError('그림 파일이 아니에요.');
  if (v.length > 600_000) throw new UserError('그림이 너무 커요. 더 작은 그림을 골라 주세요.');
  const n = (await first(env, "SELECT COUNT(*) AS n FROM look_images WHERE kind = 'sticker'", [], (r) => Number(r.n))) ?? 0;
  if (n >= 6) throw new UserError('스티커는 6장까지예요. 안 쓰는 것을 지우고 넣어 주세요.');
  const now = Date.now();
  await run(env, "INSERT INTO look_images (id, kind, data, sort, created_by, created_at) VALUES (?, 'sticker', ?, ?, ?, ?)", [newId(), v, n, user.name, now]);
  await log(env, user.name, 'look.sticker.add', { size: v.length });
  return listStickers(env);
}
export async function deleteSticker(env: Env, user: User, id: string) {
  await run(env, "DELETE FROM look_images WHERE id = ? AND kind = 'sticker'", [id]);
  await log(env, user.name, 'look.sticker.delete', { id });
  return listStickers(env);
}

/** 홈 그림을 보관함에서 고르기: 고른 그림을 홈 그림 칸(look_cover)에 그대로 옮겨 씀 (id 빈 값이면 홈 그림 지움) */
export async function pickHomeImage(env: Env, user: User, id: unknown) {
  const k = String(id ?? '');
  if (!k) return setLookImage(env, user, 'cover', '');
  const data = await first(env, "SELECT data FROM look_images WHERE id = ? AND kind = 'sticker'", [k], (r) => String(r.data));
  if (!data) throw new UserError('없는 그림이에요.');
  await setSetting(env, 'look_home_id', k);
  return setLookImage(env, user, 'cover', data);
}

export async function getLookImage(env: Env, kind: string) {
  if (kind !== 'cover' && kind !== 'sticker') throw new UserError('잘못된 그림 종류예요.');
  return { data: await getSetting(env, `look_${kind}`) };
}

export async function bootstrap(env: Env, user: User) {
  await runRecurring(env);
  const [categories, accounts, recurring, users, household] = await Promise.all([
    getCategories(env),
    getAccounts(env),
    getRecurring(env),
    getUsers(env),
    getSetting(env, 'household'),
  ]);
  const pinned = await first(env, "SELECT value FROM user_prefs WHERE user_id = ? AND key = 'balance_accounts'", [user.id], (r) => String(r.value));
  const featureLoan = (await getSetting(env, 'feature_loan')) === '1';
  // 무지출 달력: 사람마다 켜고 끔 (기본 켜짐)
  const nospendCal = (await first(env, "SELECT value FROM user_prefs WHERE user_id = ? AND key = 'nospend_cal'", [user.id], (r) => String(r.value))) !== '0';
  // 꾸미기 (가족 공용): 테마 색 이름, 표지·스티커 그림이 바뀐 때(있으면 숫자, 없으면 null — 그림 자체는 /look/:kind 로 따로)
  const [theme, coverVer, homeId] = await Promise.all([getSetting(env, 'look_theme'), getSetting(env, 'look_cover_ver'), getSetting(env, 'look_home_id')]);
  // 스티커 보관함이 바뀐 표시 (장 수 + 마지막으로 바뀐 때). 0024 표가 아직 없으면 없음으로
  const st = await first(env, "SELECT COUNT(*) AS n, MAX(created_at) AS t FROM look_images WHERE kind = 'sticker'", [], (r) => ({ n: Number(r.n), t: Number(r.t ?? 0) })).catch(() => null);
  const stickerVer = st && st.n > 0 ? `${st.n}-${st.t}` : null;
  return { user, users, household: household ?? '우리집 가계부', today: today(), categories, accounts, recurring, groups: GROUPS, accountKinds: ACCOUNT_KINDS, balanceAccounts: pinned ? (JSON.parse(pinned) as string[]) : null, featureLoan, nospendCal, theme: theme ?? 'green', coverVer, stickerVer, homeId: coverVer ? homeId : null };
}

// 거래 화면 위 "통장 잔액"에 보일 통장 (사람마다 따로 기억)
export async function setBalanceAccounts(env: Env, user: User, ids: unknown) {
  if (!Array.isArray(ids)) throw new UserError('통장 목록이 이상해요.');
  const clean = ids.map(String).slice(0, 200);
  await run(env, "INSERT INTO user_prefs (user_id, key, value) VALUES (?, 'balance_accounts', ?) ON CONFLICT (user_id, key) DO UPDATE SET value = excluded.value", [user.id, JSON.stringify(clean)]);
  return { balanceAccounts: clean };
}

// ---------- 거래 ----------

export interface TxQuery {
  from?: string;
  to?: string;
  q?: string;
  account?: string;
  grp?: string; // var,fix,inc,sav,inv,transfer (쉼표로 여러 개)
  category?: string;
  limit?: number;
}

export async function listTx(env: Env, query: TxQuery) {
  const where: string[] = [];
  const binds: unknown[] = [];
  if (isDate(query.from)) (where.push('t.date >= ?'), binds.push(query.from));
  if (isDate(query.to)) (where.push('t.date <= ?'), binds.push(query.to));
  if (query.q) {
    where.push('(t.title LIKE ? OR t.memo LIKE ?)');
    binds.push(`%${query.q}%`, `%${query.q}%`);
  }
  if (query.account) (where.push('(t.from_account = ? OR t.to_account = ?)'), binds.push(query.account, query.account));
  if (query.category) (where.push('t.category_id = ?'), binds.push(query.category));
  // 대분류는 여러 개 고를 수 있다: grp=var,fix,transfer
  const grps = (query.grp ?? '').split(',').filter((g) => ['var', 'fix', 'spc', 'inc', 'sav', 'inv', 'transfer', 'unc'].includes(g));
  if (grps.length) {
    const parts: string[] = [];
    const real = grps.filter((g) => g !== 'transfer' && g !== 'unc');
    if (real.length) (parts.push(`c.grp IN (${real.map(() => '?').join(',')})`), binds.push(...real));
    // 이체 = 카테고리 없이 양쪽 통장이 다 있는 것, 미분류 = 카테고리도 없고 한쪽 통장만 있는 것(노션에서 옮긴 기록 중 확인 필요)
    if (grps.includes('transfer')) parts.push('(t.category_id IS NULL AND t.from_account IS NOT NULL AND t.to_account IS NOT NULL)');
    if (grps.includes('unc')) parts.push('(t.category_id IS NULL AND (t.from_account IS NULL OR t.to_account IS NULL))');
    where.push(`(${parts.join(' OR ')})`);
  }
  const sql = `SELECT t.* FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY t.date DESC, t.created_at DESC LIMIT ?`;
  // 한 번에 최대 5000건 (주별로 묶어 접어 두니 1~2년치도 무리 없음). 넘으면 화면에 '기간을 좁혀 달라'고 알림
  const max = Math.min(query.limit ?? 5000, 5000);
  const rows = await all(env, sql, [...binds, max + 1], toTx);
  const more = rows.length > max;
  if (more) rows.length = max;
  // 합계: 계좌를 골랐으면 그 계좌 기준 들어온 돈 − 나간 돈, 아니면 금액 합
  const total = query.account
    ? rows.reduce((s, t) => s + (t.toAccount === query.account ? t.amount : 0) - (t.fromAccount === query.account ? t.amount : 0), 0)
    : rows.reduce((s, t) => s + t.amount, 0);
  return { rows, total, count: rows.length, more };
}

export async function saveTx(env: Env, user: User, input: Partial<Tx> & { id?: string }) {
  if (!isDate(input.date)) throw new UserError('날짜를 골라 주세요.');
  const amount = int(input.amount, '금액');
  if (amount <= 0) throw new UserError('금액을 넣어 주세요.');
  const categories = await getCategories(env);
  const cat = input.categoryId ? categories.find((c) => c.id === input.categoryId) : null;
  if (input.categoryId && !cat) throw new UserError('없는 카테고리예요.');
  let from = input.fromAccount || null;
  let to = input.toAccount || null;
  // 대분류에 맞게 계좌 정리: 지출은 나간 계좌만, 수입은 들어온 계좌만
  if (cat && isSpending(cat.grp)) to = null;
  if (cat && cat.grp === 'inc') from = null;
  if (!cat && (!from || !to)) throw new UserError('이체는 보내는 통장과 받는 통장을 둘 다 골라 주세요.');
  if (from && to && from === to) throw new UserError('보내는 통장과 받는 통장이 같아요.');
  const title = text(input.title, 100) || cat?.name || '이체';
  const now = Date.now();
  const id = input.id || newId();
  const exists = input.id ? await first(env, 'SELECT id FROM transactions WHERE id = ?', [input.id], (r) => r) : null;
  if (exists) {
    await run(
      env,
      `UPDATE transactions SET date = ?, title = ?, amount = ?, category_id = ?, from_account = ?, to_account = ?, memo = ?, unnecessary = ?, updated_at = ? WHERE id = ?`,
      [input.date, title, amount, cat?.id ?? null, from, to, text(input.memo, 500), input.unnecessary ? 1 : 0, now, id],
    );
  } else {
    await run(
      env,
      `INSERT INTO transactions (id, date, title, amount, category_id, from_account, to_account, memo, unnecessary, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, input.date, title, amount, cat?.id ?? null, from, to, text(input.memo, 500), input.unnecessary ? 1 : 0, user.name, now, now],
    );
  }
  await log(env, user.name, exists ? 'tx.update' : 'tx.create', { id, date: input.date, title, amount });
  return first(env, 'SELECT * FROM transactions WHERE id = ?', [id], toTx);
}

export async function deleteTx(env: Env, user: User, id: string) {
  const t = await first(env, 'SELECT * FROM transactions WHERE id = ?', [id], toTx);
  if (!t) throw new UserError('이미 지워진 거래예요.');
  await run(env, 'DELETE FROM transactions WHERE id = ?', [id]);
  await log(env, user.name, 'tx.delete', t);
  return { ok: true };
}

// ---------- 이번 달 (홈) ----------

export async function monthView(env: Env, month: string) {
  if (!isMonth(month)) throw new UserError('달은 2026-11 같은 형식이어야 해요.');
  const [categories, txs, budgets, accounts] = await Promise.all([
    getCategories(env),
    all(env, 'SELECT * FROM transactions WHERE date >= ? AND date <= ?', [`${addMonths(month, -1)}-01`, `${month}-31`], toTx),
    all(env, 'SELECT * FROM budgets WHERE month = ?', [month], (r) => ({ categoryId: String(r.category_id), amount: Number(r.amount) })),
    getAccounts(env),
  ]);
  const monthBudget = new Map(budgets.map((b) => [b.categoryId, b.amount]));
  // 특별지출은 그달 머니노트 합계가 예산 (적어 둔 게 없으면 달별 예산 → 기본 예산)
  const notesNow = await moneyNoteSums(env, month);
  // 그달 예산: 머니노트에 적어 둔 게 있으면 그 합계 → 그달 따로 정한 예산 → 기본 월 예산 (계획 없이 간 여행도 기본 예산 안에서 판단)
  const loanAdd = await loanAdds(env, month);
  const budgetOf = (c: Category) => budgetWithNotes(c, monthBudget.get(c.id), notesNow.get(c.id)) + (loanAdd.get(c.id) ?? 0);
  const lines = budgetLines(txs, categories, month, budgetOf, 10, accounts);
  const prevLines = new Map(budgetLines(txs, categories, addMonths(month, -1), budgetOf, 10, accounts).map((l) => [l.category.id, l.actual]));
  return {
    month,
    totals: monthTotals(txs, categories, month, accounts),
    prevTotals: monthTotals(txs, categories, addMonths(month, -1), accounts),
    lines: lines.map((l) => ({ ...l, prevActual: prevLines.get(l.category.id) ?? 0 })),
  };
}

// ---------- 연간 리포트 (홈) ----------

export async function yearView(env: Env, year: string) {
  if (!/^\d{4}$/.test(year)) throw new UserError('연도는 2026 같은 형식이어야 해요.');
  const [categories, txs, target, accounts] = await Promise.all([
    getCategories(env),
    all(env, 'SELECT * FROM transactions WHERE date >= ? AND date <= ?', [`${year}-01-01`, `${year}-12-31`], toTx),
    first(env, 'SELECT save_target FROM year_goals WHERE year = ?', [year], (r) => Number(r.save_target)),
    getAccounts(env),
  ]);
  const basis = (await getSetting(env, 'save_basis')) === 'sav_inv' ? 'sav_inv' : 'sav';
  const months = Array.from({ length: 12 }, (_, i) => {
    const m = `${year}-${String(i + 1).padStart(2, '0')}`;
    return { month: m, count: txs.filter((t) => t.date.startsWith(m)).length, ...monthTotals(txs, categories, m, accounts) };
  });
  // 누적 실제 저축 = 단기로드맵 '넣을 곳'으로 고른 저축·투자만 (선생님 2026-11-15: 홈·단기로드맵·연간 결산 한 기준. 상환·청약은 빼고 딜 투자는 넣음)
  const savOnly = months.reduce((n, m) => n + m.sav, 0);
  const invOnly = months.reduce((n, m) => n + m.inv, 0);
  const short = await shortRoadmap(env, year);
  const included = short.rows.filter((r) => r.included);
  const saved = included.reduce((n, r) => n + r.actual.reduce((a, b) => a + b, 0), 0);
  const counted = included.map((r) => r.name);
  const left = short.rows.filter((r) => !r.included && r.actual.some(Boolean)).map((r) => r.name);
  return { year, target: target ? Number(target) : 0, saved, savOnly, invOnly, basis, months, counted, left };
}

export async function setSaveBasis(env: Env, user: User, basis: unknown, year: unknown) {
  const b = basis === 'sav_inv' ? 'sav_inv' : 'sav';
  await setSetting(env, 'save_basis', b);
  await log(env, user.name, '누적 저축 기준', b === 'sav' ? '저축만' : '저축+투자');
  return yearView(env, String(year));
}

export async function setYearTarget(env: Env, user: User, year: unknown, amount: unknown) {
  const y = String(year);
  const n = Math.round(Number(amount));
  if (!/^\d{4}$/.test(y) || !Number.isFinite(n) || n < 0) throw new UserError('목표 금액을 확인해 주세요.');
  await run(env, 'INSERT INTO year_goals (year, save_target, updated_by, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (year) DO UPDATE SET save_target = excluded.save_target, updated_by = excluded.updated_by, updated_at = excluded.updated_at', [y, n, user.name, Date.now()]);
  await log(env, user.name, '연간 목표', `${y}년 ${n}`);
  return yearView(env, y);
}

// ---------- 카테고리 · 예산 ----------

export async function saveCategory(env: Env, user: User, input: Partial<Category> & { id?: string }) {
  const name = text(input.name, 30);
  if (!name) throw new UserError('카테고리 이름을 넣어 주세요.');
  const grp = input.grp as Group;
  if (!GROUPS.some((g) => g.key === grp)) throw new UserError('대분류를 골라 주세요.');
  const budget = input.budget === undefined ? 0 : int(input.budget, '예산');
  // 머니노트는 지출(변동·고정)만 — 대분류를 수입·저축 등으로 옮기면 머니노트 표시도 끔
  const mn = input.moneynote && (grp === 'var' || grp === 'fix') ? 1 : 0;
  if (input.id) {
    await run(env, 'UPDATE categories SET name = ?, grp = ?, icon = ?, emoji = ?, moneynote = ?, moneynote_add = ?, budget = ?, hidden = ? WHERE id = ?', [name, grp, text(input.icon, 40), text(input.icon, 40), mn, mn && input.moneynoteAdd ? 1 : 0, budget, input.hidden ? 1 : 0, input.id]);
  } else {
    const max = (await first(env, 'SELECT MAX(sort) AS m FROM categories WHERE grp = ?', [grp], (r) => Number(r.m ?? 0))) ?? 0;
    await run(env, 'INSERT INTO categories (id, name, grp, icon, emoji, moneynote, budget, sort, hidden, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)', [newId(), name, grp, text(input.icon, 40), text(input.icon, 40), mn, budget, max + 1, Date.now()]);
  }
  await log(env, user.name, 'category.save', { name, grp, budget, hidden: input.hidden });
  return getCategories(env);
}

export async function moveCategory(env: Env, id: string, dir: -1 | 1) {
  const cats = await getCategories(env);
  const c = cats.find((x) => x.id === id);
  if (!c) throw new UserError('없는 카테고리예요.');
  const same = cats.filter((x) => x.grp === c.grp);
  const i = same.findIndex((x) => x.id === id);
  const j = i + dir;
  if (j < 0 || j >= same.length) return cats;
  const order = [...same];
  [order[i], order[j]] = [order[j], order[i]];
  await env.DB.batch(order.map((x, k) => env.DB.prepare('UPDATE categories SET sort = ? WHERE id = ?').bind(k, x.id)));
  return getCategories(env);
}

/** 카테고리 순서를 통째로 정한다 (끌어서 옮기기). ids = 같은 대분류 안의 새 순서 */
export async function orderCategories(env: Env, ids: unknown) {
  if (!Array.isArray(ids) || ids.length === 0) throw new UserError('순서가 비어 있어요.');
  const cats = await getCategories(env);
  const first = cats.find((x) => x.id === ids[0]);
  if (!first) throw new UserError('없는 카테고리예요.');
  const same = cats.filter((x) => x.grp === first.grp);
  if (ids.length !== same.length || !same.every((c) => ids.includes(c.id))) throw new UserError('목록이 바뀌었어요. 새로고침해 주세요.');
  await env.DB.batch(ids.map((id, k) => env.DB.prepare('UPDATE categories SET sort = ? WHERE id = ?').bind(k, String(id))));
  return getCategories(env);
}

/** 이 카테고리를 쓰는 곳 수 (지우기 전에 보여 줌) */
export async function categoryUsage(env: Env, id: string) {
  const n = (sql: string) => first(env, sql, [id], (r) => Number(r.n)).then((v) => v ?? 0);
  return {
    tx: await n('SELECT COUNT(*) AS n FROM transactions WHERE category_id = ?'),
    recurring: await n('SELECT COUNT(*) AS n FROM recurring WHERE category_id = ?'),
    notes: await n('SELECT COUNT(*) AS n FROM money_notes WHERE category_id = ?'),
    loans: await n('SELECT COUNT(*) AS n FROM loan_links WHERE principal_category = ?1 OR interest_category = ?1'),
  };
}

const sideOf = (g: string) => (g === 'var' || g === 'fix' || g === 'spc' ? 'out' : g);

/** 카테고리 지우기. 쓰는 곳이 있으면 moveTo 카테고리로 옮긴 뒤 지운다 (돈 기록은 하나도 안 사라짐).
 *  그 카테고리만의 달별 예산·예산 메모·바뀐 기록·결산 원인은 함께 지움. 다짐은 옮김. */
export async function deleteCategory(env: Env, user: User, id: string, moveTo: string | null) {
  const cats = await getCategories(env);
  const c = cats.find((x) => x.id === id);
  if (!c) throw new UserError('없는 카테고리예요.');
  const u = await categoryUsage(env, id);
  const used = u.tx + u.recurring + u.notes + u.loans > 0;
  let to: Category | undefined;
  if (used) {
    to = cats.find((x) => x.id === moveTo);
    if (!to || to.id === id) throw new UserError('옮길 카테고리를 골라 주세요.');
    if (sideOf(to.grp) !== sideOf(c.grp)) throw new UserError('지출은 지출 카테고리로, 수입은 수입 카테고리로 옮길 수 있어요.');
  }
  const st = (sql: string, ...b: unknown[]) => env.DB.prepare(sql).bind(...b);
  const steps = [];
  if (to) {
    steps.push(
      st('UPDATE transactions SET category_id = ? WHERE category_id = ?', to.id, id),
      st('UPDATE recurring SET category_id = ? WHERE category_id = ?', to.id, id),
      st('UPDATE money_notes SET category_id = ? WHERE category_id = ?', to.id, id),
      st('UPDATE OR IGNORE money_note_items SET category_id = ? WHERE category_id = ?', to.id, id),
      st('UPDATE loan_links SET principal_category = ? WHERE principal_category = ?', to.id, id),
      st('UPDATE loan_links SET interest_category = ? WHERE interest_category = ?', to.id, id),
      st('UPDATE pledges SET category_id = ? WHERE category_id = ?', to.id, id),
    );
  } else {
    steps.push(st('UPDATE pledges SET category_id = NULL WHERE category_id = ?', id));
  }
  steps.push(
    st('DELETE FROM money_note_items WHERE category_id = ?', id),
    st('DELETE FROM budgets WHERE category_id = ?', id),
    st('DELETE FROM budget_notes WHERE category_id = ?', id),
    st('DELETE FROM budget_changes WHERE category_id = ?', id),
    st('DELETE FROM review_causes WHERE category_id = ?', id),
    st('DELETE FROM categories WHERE id = ?', id),
  );
  await env.DB.batch(steps);
  await log(env, user.name, 'category.delete', { name: c.name, movedTo: to?.name ?? null, ...u });
  return getCategories(env);
}

export async function setMonthBudget(env: Env, user: User, input: { categoryId: string; month: string; amount: number | null; reason?: string }) {
  if (!isMonth(input.month)) throw new UserError('달이 이상해요.');
  // 바꾸기 전 값을 기록해 두면 나중에 그대로 되돌릴 수 있다
  const old = await first(env, 'SELECT amount FROM budgets WHERE category_id = ? AND month = ?', [input.categoryId, input.month], (r) => Number(r.amount));
  await run(env, 'INSERT INTO budget_changes (id, category_id, month, old_amount, new_amount, reason, changed_by, changed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
    newId(),
    input.categoryId,
    input.month,
    old,
    input.amount,
    input.reason === 'review' ? 'review' : 'settings',
    user.name,
    Date.now(),
  ]);
  if (input.amount === null) await run(env, 'DELETE FROM budgets WHERE category_id = ? AND month = ?', [input.categoryId, input.month]);
  else
    await run(env, 'INSERT INTO budgets (category_id, month, amount) VALUES (?, ?, ?) ON CONFLICT (category_id, month) DO UPDATE SET amount = excluded.amount', [
      input.categoryId,
      input.month,
      int(input.amount, '예산'),
    ]);
  await log(env, user.name, 'budget.month', input);
  return monthView(env, input.month);
}

// ---------- 통장 ----------

export async function accountsView(env: Env) {
  const [accounts, txs] = await Promise.all([getAccounts(env), all(env, 'SELECT * FROM transactions WHERE from_account IS NOT NULL OR to_account IS NOT NULL', [], toTx)]);
  const bal = accountBalances(accounts, txs);
  return accounts.map((a) => ({ ...a, balance: bal.get(a.id) ?? a.startBalance }));
}

export async function saveAccount(env: Env, user: User, input: { id?: string; name: string; kind: string; startBalance?: number; hidden?: boolean }) {
  const name = text(input.name, 30);
  if (!name) throw new UserError('통장 이름을 넣어 주세요.');
  const kind = (ACCOUNT_KINDS as readonly string[]).includes(input.kind) ? input.kind : '은행';
  const start = input.startBalance === undefined ? 0 : int(input.startBalance, '시작 잔액');
  if (input.id) await run(env, 'UPDATE accounts SET name = ?, kind = ?, start_balance = ?, hidden = ? WHERE id = ?', [name, kind, start, input.hidden ? 1 : 0, input.id]);
  else {
    const max = (await first(env, 'SELECT MAX(sort) AS m FROM accounts', [], (r) => Number(r.m ?? 0))) ?? 0;
    await run(env, 'INSERT INTO accounts (id, name, kind, start_balance, sort, hidden, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)', [newId(), name, kind, start, max + 1, Date.now()]);
  }
  await log(env, user.name, 'account.save', { name, kind, start });
  return accountsView(env);
}

// ---------- 고정지출 ----------

export async function saveRecurring(
  env: Env,
  user: User,
  input: { id?: string; title: string; categoryId: string | null; amount: number; day: number; fromAccount?: string | null; toAccount?: string | null; startMonth?: string; endMonth?: string | null; active?: boolean; memo?: string; mode?: string; loanAccount?: string | null; loanPart?: string | null },
) {
  const title = text(input.title, 60);
  if (!title) throw new UserError('항목 이름을 넣어 주세요.');
  const amount = int(input.amount, '금액');
  const day = Math.min(31, Math.max(1, int(input.day, '날짜')));
  const start = isMonth(input.startMonth) ? input.startMonth : monthOf(today());
  const end = isMonth(input.endMonth) ? input.endMonth : null;
  const id = input.id || newId();
  const mode = input.mode === 'batch' ? 'batch' : 'auto';
  const loanPart = input.loanAccount && (input.loanPart === 'principal' || input.loanPart === 'interest') ? input.loanPart : null;
  const vals = [title, input.categoryId || null, amount, day, input.fromAccount || null, input.toAccount || null, start, end, input.active === false ? 0 : 1, text(input.memo, 300), mode, loanPart ? input.loanAccount : null, loanPart];
  if (input.id)
    await run(env, 'UPDATE recurring SET title = ?, category_id = ?, amount = ?, day = ?, from_account = ?, to_account = ?, start_month = ?, end_month = ?, active = ?, memo = ?, mode = ?, loan_account = ?, loan_part = ? WHERE id = ?', [...vals, id]);
  else
    await run(env, 'INSERT INTO recurring (title, category_id, amount, day, from_account, to_account, start_month, end_month, active, memo, mode, loan_account, loan_part, id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
      ...vals,
      id,
      Date.now(),
    ]);
  // 새 항목이면 이번 달 몫을 바로 만든다
  if (!input.id) {
    const m = monthOf(today());
    for (const date of recurringDates({ id, title, categoryId: input.categoryId || null, amount, day, fromAccount: input.fromAccount || null, toAccount: input.toAccount || null, startMonth: start, endMonth: end, active: input.active !== false, memo: '', mode }, m, m))
      await run(
        env,
        `INSERT OR IGNORE INTO transactions (id, date, title, amount, category_id, from_account, to_account, memo, recurring_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, '', ?, '자동', ?, ?)`,
        [newId(), date, title, amount, input.categoryId || null, input.fromAccount || null, input.toAccount || null, id, Date.now(), Date.now()],
      );
  }
  await log(env, user.name, 'recurring.save', { title, amount, day });
  return getRecurring(env);
}

export async function deleteRecurring(env: Env, user: User, id: string) {
  await run(env, 'UPDATE recurring SET active = 0 WHERE id = ?', [id]);
  await log(env, user.name, 'recurring.stop', { id });
  return getRecurring(env);
}

// ---------- 투자 ----------

export const listInvestments = (env: Env) => all(env, 'SELECT * FROM investments ORDER BY status, maturity', [], toInvestment);

/** 투자 목록 한 줄 지우기 (통장·거래는 그대로) */
export async function deleteInvestment(env: Env, user: User, id: string) {
  const name = await first(env, 'SELECT name FROM investments WHERE id = ?', [id], (r) => String(r.name));
  if (!name) throw new UserError('이미 지워졌어요.');
  await run(env, 'DELETE FROM investments WHERE id = ?', [id]);
  await log(env, user.name, 'investment.delete', { name });
  return listInvestments(env);
}

/** 이 통장을 쓰는 곳 수 (지우기 전에 보여 줌) */
export async function accountUsage(env: Env, id: string) {
  const n = (sql: string) => first(env, sql, [id], (r) => Number(r.n)).then((v) => v ?? 0);
  return {
    tx: await n('SELECT COUNT(*) AS n FROM transactions WHERE from_account = ?1 OR to_account = ?1'),
    recurring: await n('SELECT COUNT(*) AS n FROM recurring WHERE from_account = ?1 OR to_account = ?1 OR loan_account = ?1'),
    investments: await n('SELECT COUNT(*) AS n FROM investments WHERE account_id = ?'),
    valuations: await n('SELECT COUNT(*) AS n FROM account_valuations WHERE account_id = ?'),
    loan: await n('SELECT (SELECT COUNT(*) FROM loan_schedule WHERE account_id = ?1) + (SELECT COUNT(*) FROM loan_links WHERE account_id = ?1) AS n'),
    startBalance: (await first(env, 'SELECT start_balance FROM accounts WHERE id = ?', [id], (r) => Number(r.start_balance))) ?? 0,
  };
}

/** 통장 지우기. 쓰는 곳이 있으면 moveTo 통장으로 합친 뒤 지운다:
 *  거래·고정지출·투자 목록은 옮기고, 시작 잔액은 더하고, 평가금액은 같은 달끼리 더함 → 두 통장 잔액 합계가 그대로 유지됨.
 *  상환표(대출)는 합칠 수 없어 지움. */
export async function deleteAccount(env: Env, user: User, id: string, moveTo: string | null) {
  const name = await first(env, 'SELECT name FROM accounts WHERE id = ?', [id], (r) => String(r.name));
  if (!name) throw new UserError('없는 통장이에요.');
  const u = await accountUsage(env, id);
  const used = u.tx + u.recurring + u.investments + u.valuations + u.loan > 0 || u.startBalance !== 0;
  let toName: string | null = null;
  if (used) {
    if (!moveTo || moveTo === id) throw new UserError('합칠 통장을 골라 주세요.');
    toName = await first(env, 'SELECT name FROM accounts WHERE id = ?', [moveTo], (r) => String(r.name));
    if (!toName) throw new UserError('합칠 통장을 골라 주세요.');
  }
  const st = (sql: string, ...b: unknown[]) => env.DB.prepare(sql).bind(...b);
  const steps = [];
  if (moveTo && toName) {
    steps.push(
      st('UPDATE accounts SET start_balance = start_balance + ? WHERE id = ?', u.startBalance, moveTo),
      st('UPDATE transactions SET from_account = ? WHERE from_account = ?', moveTo, id),
      st('UPDATE transactions SET to_account = ? WHERE to_account = ?', moveTo, id),
      st('UPDATE recurring SET from_account = ? WHERE from_account = ?', moveTo, id),
      st('UPDATE recurring SET to_account = ? WHERE to_account = ?', moveTo, id),
      st('UPDATE recurring SET loan_account = NULL, loan_part = NULL WHERE loan_account = ?', id),
      st('UPDATE investments SET account_id = ? WHERE account_id = ?', moveTo, id),
      st('UPDATE account_valuations SET amount = amount + (SELECT a.amount FROM account_valuations a WHERE a.account_id = ?1 AND a.month = account_valuations.month), updated_at = ?3 WHERE account_id = ?2 AND month IN (SELECT month FROM account_valuations WHERE account_id = ?1)', id, moveTo, Date.now()),
      st('UPDATE OR IGNORE account_valuations SET account_id = ? WHERE account_id = ?', moveTo, id),
    );
  }
  steps.push(
    st('DELETE FROM account_valuations WHERE account_id = ?', id),
    st('DELETE FROM loan_schedule WHERE account_id = ?', id),
    st('DELETE FROM loan_links WHERE account_id = ?', id),
    st('DELETE FROM accounts WHERE id = ?', id),
  );
  await env.DB.batch(steps);
  await log(env, user.name, 'account.delete', { name, mergedInto: toName, ...u });
  return { ok: true };
}

export async function saveInvestment(env: Env, user: User, input: Record<string, unknown>) {
  const name = text(input.name, 60);
  if (!name) throw new UserError('투자 이름을 넣어 주세요.');
  const vals = [
    name,
    text(input.kind, 20) || '주식',
    text(input.status, 20) || '투자중',
    input.accountId || null,
    int(input.amount ?? 0, '금액'),
    isDate(input.startDate) ? input.startDate : null,
    isDate(input.maturity) ? input.maturity : null,
    input.returned === null || input.returned === undefined || input.returned === '' ? null : int(input.returned, '돌려받은 금액'),
    text(input.memo, 300),
    Date.now(),
  ];
  if (input.id) await run(env, 'UPDATE investments SET name = ?, kind = ?, status = ?, account_id = ?, amount = ?, start_date = ?, maturity = ?, returned = ?, memo = ?, updated_at = ? WHERE id = ?', [...vals, input.id]);
  else await run(env, 'INSERT INTO investments (name, kind, status, account_id, amount, start_date, maturity, returned, memo, updated_at, id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [...vals, newId(), Date.now()]);
  await log(env, user.name, 'investment.save', { name });
  return listInvestments(env);
}

// ---------- 가족 ----------

export async function addUser(env: Env, owner: User, input: { name: string; password: string }) {
  if (owner.role !== 'owner') throw new UserError('가족 추가는 처음 만든 사람만 할 수 있어요.');
  const name = text(input.name, 30);
  if (!name) throw new UserError('이름을 넣어 주세요.');
  if (String(input.password ?? '').length < 6) throw new UserError('비밀번호는 6자 이상이에요.');
  if (await first(env, 'SELECT id FROM users WHERE name = ?', [name], (r) => r)) throw new UserError('같은 이름이 이미 있어요.');
  const { hash, salt } = await hashPassword(String(input.password));
  await run(env, 'INSERT INTO users (id, name, pw_hash, pw_salt, role, created_at) VALUES (?, ?, ?, ?, ?, ?)', [newId(), name, hash, salt, 'member', Date.now()]);
  await log(env, owner.name, 'user.add', { name });
  return getUsers(env);
}

export async function changePassword(env: Env, user: User, input: { password: string }) {
  if (String(input.password ?? '').length < 6) throw new UserError('비밀번호는 6자 이상이에요.');
  const { hash, salt } = await hashPassword(String(input.password));
  await run(env, 'UPDATE users SET pw_hash = ?, pw_salt = ? WHERE id = ?', [hash, salt, user.id]);
  await log(env, user.name, 'user.password', {});
  return { ok: true };
}

// ---------- 월말 결산 (2단계) ----------

export const CAUSES = ['small_budget', 'yearly', 'new_fixed', 'once', 'reducible', 'good'] as const;
export const SECTIONS = ['var', 'fix', 'spc', 'inc', 'sav', 'asset', 'pledge', 'short', 'long'] as const;

interface Pledge {
  id: string;
  month: string;
  kind: 'num' | 'text';
  categoryId: string | null;
  limitAmount: number | null;
  body: string;
  result: string | null;
  section: string;
}
const toPledge = (r: Record<string, unknown>): Pledge => ({
  id: String(r.id),
  month: String(r.month),
  kind: r.kind === 'num' ? 'num' : 'text',
  categoryId: r.category_id ? String(r.category_id) : null,
  limitAmount: r.limit_amount === null || r.limit_amount === undefined ? null : Number(r.limit_amount),
  body: String(r.body ?? ''),
  result: r.result ? String(r.result) : null,
  section: String(r.section ?? ''),
});

/** 다짐 판정: 숫자 다짐은 그 달 카테고리 실제 금액으로 자동 (달이 안 끝났으면 '진행 중'), 글 다짐은 직접 고른 결과 */
function judgePledges(pledges: Pledge[], actualOf: (categoryId: string) => number, monthDone: boolean) {
  return pledges.map((p) => {
    if (p.kind !== 'num' || !p.categoryId || p.limitAmount === null) return { ...p, actual: null, auto: p.result };
    const actual = actualOf(p.categoryId);
    const auto = actual > p.limitAmount ? 'missed' : monthDone ? 'kept' : 'ongoing';
    return { ...p, actual, auto };
  });
}

export async function pledgesFor(env: Env, month: string) {
  const [pledges, categories, txs, accounts] = await Promise.all([
    all(env, 'SELECT * FROM pledges WHERE month = ? ORDER BY created_at', [month], toPledge),
    getCategories(env),
    all(env, 'SELECT * FROM transactions WHERE date >= ? AND date <= ?', [`${month}-01`, `${month}-31`], toTx),
    getAccounts(env),
  ]);
  const lines = new Map(budgetLines(txs, categories, month, () => 0, 10, accounts).map((l) => [l.category.id, l.actual]));
  return judgePledges(pledges, (id) => lines.get(id) ?? 0, month < monthOf(today()));
}

export async function reviewView(env: Env, month: string) {
  if (!isMonth(month)) throw new UserError('달은 2026-11 같은 형식이어야 해요.');
  const prev = addMonths(month, -1);
  const next = addMonths(month, 1);
  const [mv, txs, notes, causes, recurring, thisPledges, nextPledges] = await Promise.all([
    monthView(env, month),
    all(env, 'SELECT * FROM transactions WHERE date >= ? AND date <= ? ORDER BY amount DESC', [`${month}-01`, `${month}-31`], toTx),
    all(env, 'SELECT section, body FROM review_notes WHERE month = ?', [month], (r) => [String(r.section), String(r.body)] as const),
    all(env, 'SELECT category_id, cause, note FROM review_causes WHERE month = ?', [month], (r) => [String(r.category_id), { cause: r.cause ? String(r.cause) : null, note: String(r.note ?? '') }] as const),
    getRecurring(env),
    pledgesFor(env, month),
    all(env, 'SELECT * FROM pledges WHERE month = ? ORDER BY created_at', [next], toPledge),
  ]);
  // 다음 달 예산 (예산 올리기 버튼에서 '지금 얼마'를 보여 주려고)
  const nextBudgetRows = await all(env, 'SELECT category_id, amount FROM budgets WHERE month = ?', [next], (r) => [String(r.category_id), Number(r.amount)] as const);
  // 다음 달 머니노트 (특별지출 예산 + 예산 짤 때 옆에 보여 주기)
  const nextNotes = await all(env, 'SELECT * FROM money_notes WHERE month = ? ORDER BY amount DESC', [next], toMoneyNote);
  // 이번 달 머니노트 (세부 항목별 계획 ↔ 실제 비교)
  const thisNotes = await all(env, 'SELECT * FROM money_notes WHERE month = ? ORDER BY amount DESC', [month], toMoneyNote);
  const nextSums = new Map<string, number>();
  for (const n of nextNotes) nextSums.set(n.categoryId, (nextSums.get(n.categoryId) ?? 0) + n.amount);
  const rowMap = new Map(nextBudgetRows);
  const allCats = await getCategories(env);
  const nextLoan = await loanAdds(env, next);
  const nextBudgets = allCats.filter((c) => rowMap.has(c.id) || (c.moneynote && nextSums.has(c.id)) || nextLoan.has(c.id)).map((c) => [c.id, budgetWithNotes(c, rowMap.get(c.id), nextSums.get(c.id)) + (nextLoan.get(c.id) ?? 0)] as const);
  // 결산에서 바꾼 예산(이번 달 바로잡기 / 다음 달 올리기) — 되돌리기 버튼용
  const changedIn = (m: string) =>
    all(
      env,
      "SELECT category_id, old_amount, new_amount FROM budget_changes c WHERE month = ? AND reason = 'review' AND changed_at = (SELECT MAX(changed_at) FROM budget_changes WHERE category_id = c.category_id AND month = c.month)",
      [m],
      (r) => [String(r.category_id), { old: r.old_amount === null ? null : Number(r.old_amount), amount: Number(r.new_amount) }] as const,
    );
  const [raised, fixedThis] = await Promise.all([changedIn(next), changedIn(month)]);
  return {
    month,
    prev,
    next,
    done: month < monthOf(today()),
    totals: mv.totals,
    prevTotals: mv.prevTotals,
    lines: mv.lines,
    txs, // 그달 거래 (금액 큰 순) — 큰 거래·예산 없던 지출 찾기에 씀
    notes: Object.fromEntries(notes),
    causes: Object.fromEntries(causes),
    recurring: recurring.filter((r) => r.active),
    pledges: thisPledges,
    nextPledges,
    nextBudgets: Object.fromEntries(nextBudgets),
    raised: Object.fromEntries(raised),
    nextBudgetNotes: Object.fromEntries(await all(env, 'SELECT category_id, note FROM budget_notes WHERE month = ?', [next], (r) => [String(r.category_id), String(r.note)] as const)),
    nextNotes,
    thisNotes,
    fixedThis: Object.fromEntries(fixedThis),
  };
}

export async function saveReviewNote(env: Env, user: User, input: { month?: unknown; section?: unknown; body?: unknown }) {
  const month = String(input.month);
  const section = String(input.section);
  if (!isMonth(month) || !SECTIONS.includes(section as never)) throw new UserError('결산 칸이 이상해요.');
  await run(
    env,
    'INSERT INTO review_notes (month, section, body, updated_by, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (month, section) DO UPDATE SET body = excluded.body, updated_by = excluded.updated_by, updated_at = excluded.updated_at',
    [month, section, text(input.body, 3000), user.name, Date.now()],
  );
  return { ok: true };
}

export async function saveReviewCause(env: Env, user: User, input: { month?: unknown; categoryId?: unknown; cause?: unknown; note?: unknown }) {
  const month = String(input.month);
  const categoryId = String(input.categoryId);
  const cause = input.cause ? String(input.cause) : null;
  if (!isMonth(month) || (cause && !CAUSES.includes(cause as never))) throw new UserError('원인이 이상해요.');
  await run(
    env,
    'INSERT INTO review_causes (month, category_id, cause, note, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (month, category_id) DO UPDATE SET cause = excluded.cause, note = excluded.note, updated_by = excluded.updated_by, updated_at = excluded.updated_at',
    [month, categoryId, cause, text(input.note, 300), user.name, Date.now()],
  );
  // '줄일 수 있었음' → 다음 달 숫자 다짐을 자동으로 하나 걸어 둔다 (이미 있으면 그대로)
  if (cause === 'reducible') {
    const next = addMonths(month, 1);
    const has = await first(env, "SELECT id FROM pledges WHERE month = ? AND kind = 'num' AND category_id = ?", [next, categoryId], (r) => r.id);
    if (!has) {
      const b = await first(env, 'SELECT amount FROM budgets WHERE category_id = ? AND month = ?', [categoryId, month], (r) => Number(r.amount));
      const c = await first(env, 'SELECT budget FROM categories WHERE id = ?', [categoryId], (r) => Number(r.budget));
      const limit = b ?? c ?? 0;
      const grp = await first(env, 'SELECT grp FROM categories WHERE id = ?', [categoryId], (r) => String(r.grp));
      if (limit > 0) await run(env, "INSERT INTO pledges (id, month, kind, category_id, limit_amount, body, created_by, created_at, section) VALUES (?, ?, 'num', ?, ?, '', ?, ?, ?)", [newId(), next, categoryId, limit, user.name, Date.now(), grp ?? '']);
    }
  }
  return reviewView(env, month);
}

export async function savePledge(env: Env, user: User, input: { id?: unknown; month?: unknown; kind?: unknown; categoryId?: unknown; limitAmount?: unknown; body?: unknown; section?: unknown }) {
  const section = ['var', 'fix', 'inc', 'sav'].includes(String(input.section)) ? String(input.section) : '';
  const month = String(input.month);
  if (!isMonth(month)) throw new UserError('달이 이상해요.');
  const kind = input.kind === 'num' ? 'num' : 'text';
  const categoryId = kind === 'num' ? String(input.categoryId ?? '') : null;
  const limit = kind === 'num' ? Math.round(Number(input.limitAmount)) : null;
  if (kind === 'num' && (!categoryId || !Number.isFinite(limit) || (limit as number) < 0)) throw new UserError('카테고리와 금액을 넣어 주세요.');
  const body = text(input.body, 200);
  if (kind === 'text' && !body) throw new UserError('다짐을 적어 주세요.');
  if (input.id) await run(env, 'UPDATE pledges SET kind = ?, category_id = ?, limit_amount = ?, body = ? WHERE id = ?', [kind, categoryId, limit, body, String(input.id)]);
  else await run(env, 'INSERT INTO pledges (id, month, kind, category_id, limit_amount, body, created_by, created_at, section) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [newId(), month, kind, categoryId, limit, body, user.name, Date.now(), section]);
  return { ok: true };
}

export async function setPledgeResult(env: Env, id: string, result: unknown) {
  const r = result === 'kept' || result === 'missed' ? result : null;
  await run(env, 'UPDATE pledges SET result = ? WHERE id = ?', [r, id]);
  return { ok: true };
}

export async function deletePledge(env: Env, id: string) {
  await run(env, 'DELETE FROM pledges WHERE id = ?', [id]);
  return { ok: true };
}

// ---------- 자산 추이 (월말 결산 ⑥) ----------

/** 통장 종류 → 묶음: 생활 통장 / 저축·투자 / 대출 */
export const ASSET_GROUP: Record<string, 'live' | 'save' | 'loan'> = { 은행: 'live', 카드: 'live', 현금: 'live', 적금: 'save', 목돈: 'save', 증권: 'save', 청약: 'save', 투자: 'save', 대출: 'loan' };

/** 그해 1월부터 upto 달까지, 달마다 말일 기준 통장 잔액 (계산만, 저장 안 함) */
export async function assetsView(env: Env, upto: string) {
  if (!isMonth(upto)) throw new UserError('달은 2026-11 같은 형식이어야 해요.');
  const [accounts, txs] = await Promise.all([getAccounts(env), all(env, 'SELECT * FROM transactions WHERE date <= ? AND (from_account IS NOT NULL OR to_account IS NOT NULL)', [`${upto}-31`], toTx)]);
  const months: string[] = [];
  for (let m = `${upto.slice(0, 4)}-01`; m <= upto; m = addMonths(m, 1)) months.push(m);
  const vals = await getValuations(env);
  const rows = months.map((m) => {
    const bal = withValuations(accounts, txs, vals, m);
    const sum = { live: 0, save: 0, loan: 0 };
    for (const a of accounts) sum[ASSET_GROUP[a.kind] ?? 'live'] += bal.get(a.id) ?? 0;
    return { month: m, ...sum, assets: sum.live + sum.save, net: sum.live + sum.save + sum.loan, byAccount: Object.fromEntries(accounts.map((a) => [a.id, bal.get(a.id) ?? 0])) };
  });
  let exclude: string[] = [];
  try {
    exclude = JSON.parse((await getSetting(env, 'asset_trend_exclude')) ?? '[]');
  } catch {
    exclude = [];
  }
  return { accounts: accounts.map((a) => ({ id: a.id, name: a.name, kind: a.kind, group: ASSET_GROUP[a.kind] ?? 'live', hidden: a.hidden })), months: rows, exclude };
}

/** 자산 추이에서 뺄 통장 (가족 공용) */
export async function setAssetTrendExclude(env: Env, user: User, input: { ids?: unknown }) {
  const ids = Array.isArray(input.ids) ? input.ids.map(String).slice(0, 200) : [];
  await setSetting(env, 'asset_trend_exclude', JSON.stringify(ids));
  await log(env, user.name, 'assets.exclude', { n: ids.length });
  return { ok: true };
}

/** 가장 최근에 바꾼 달별 예산을 바꾸기 전 값으로 되돌린다 */
export async function undoMonthBudget(env: Env, user: User, input: { categoryId?: unknown; month?: unknown }) {
  const categoryId = String(input.categoryId);
  const month = String(input.month);
  const ch = await first(env, 'SELECT id, old_amount FROM budget_changes WHERE category_id = ? AND month = ? ORDER BY changed_at DESC LIMIT 1', [categoryId, month], (r) => ({ id: String(r.id), old: r.old_amount === null ? null : Number(r.old_amount) }));
  if (!ch) throw new UserError('되돌릴 예산 변경이 없어요.');
  if (ch.old === null) await run(env, 'DELETE FROM budgets WHERE category_id = ? AND month = ?', [categoryId, month]);
  else await run(env, 'INSERT INTO budgets (category_id, month, amount) VALUES (?, ?, ?) ON CONFLICT (category_id, month) DO UPDATE SET amount = excluded.amount', [categoryId, month, ch.old]);
  await run(env, 'DELETE FROM budget_changes WHERE id = ?', [ch.id]);
  await log(env, user.name, 'budget.undo', { categoryId, month, back: ch.old });
  return { ok: true };
}

// ---------- 머니노트 (연간 계획) ----------

/** 그달 예산 정하기: 머니노트 표시가 없으면 그달 예산 → 기본 예산.
 *  머니노트 '바꾸기'(경조사·여행): 적은 달은 머니노트 합계, 아니면 그달 예산 → 기본 예산.
 *  머니노트 '더하기'(보리): (그달 예산 또는 기본 예산) + 머니노트 합계 */
export function budgetWithNotes(c: Category, monthAmount: number | undefined, noteSum: number | undefined) {
  const base = monthAmount ?? c.budget;
  if (!c.moneynote || noteSum === undefined) return base;
  return c.moneynoteAdd ? base + noteSum : noteSum;
}

export interface MoneyNote {
  id: string;
  categoryId: string;
  month: string;
  title: string;
  amount: number;
  memo: string;
}
const toMoneyNote = (r: Record<string, unknown>): MoneyNote => ({
  id: String(r.id),
  categoryId: String(r.category_id),
  month: String(r.month),
  title: String(r.title),
  amount: Number(r.amount),
  memo: String(r.memo ?? ''),
});

/** 그달 카테고리별 머니노트 합계 */
async function moneyNoteSums(env: Env, month: string) {
  const rows = await all(env, 'SELECT category_id, SUM(amount) AS s FROM money_notes WHERE month = ? GROUP BY category_id', [month], (r) => [String(r.category_id), Number(r.s)] as const);
  return new Map(rows);
}

export async function listMoneyNotes(env: Env, year: string) {
  if (!/^\d{4}$/.test(year)) throw new UserError('연도는 2026 같은 형식이어야 해요.');
  const [notes, budgets, items] = await Promise.all([
    all(env, 'SELECT * FROM money_notes WHERE month >= ? AND month <= ? ORDER BY month, amount DESC', [`${year}-01`, `${year}-12`], toMoneyNote),
    // 머니노트를 아직 안 적은 칸은 예전 달별 예산을 흐리게 보여 주려고
    all(env, "SELECT b.category_id, b.month, b.amount FROM budgets b JOIN categories c ON c.id = b.category_id WHERE c.moneynote = 1 AND b.month >= ? AND b.month <= ?", [`${year}-01`, `${year}-12`], (r) => ({ categoryId: String(r.category_id), month: String(r.month), amount: Number(r.amount) })),
    // 0023 표가 아직 없는 DB(업데이트 직후)에서도 머니노트가 열리게
    all(env, 'SELECT category_id, title FROM money_note_items WHERE year = ? ORDER BY sort, created_at', [year], (r) => ({ categoryId: String(r.category_id), title: String(r.title) })).catch(() => []),
  ]);
  return { year, notes, budgets, items };
}

export async function saveMoneyNote(env: Env, user: User, input: { id?: unknown; categoryId?: unknown; month?: unknown; title?: unknown; amount?: unknown; memo?: unknown }) {
  const month = String(input.month);
  const categoryId = String(input.categoryId ?? '');
  if (!isMonth(month)) throw new UserError('달이 이상해요.');
  const cat = await first(env, 'SELECT grp FROM categories WHERE id = ?', [categoryId], (r) => String(r.grp));
  if (!cat) throw new UserError('카테고리를 골라 주세요.');
  const title = text(input.title, 60);
  if (!title) throw new UserError('무엇인지 적어 주세요 (예: 추석 양가).');
  const amount = int(input.amount, '금액');
  const now = Date.now();
  if (input.id) await run(env, 'UPDATE money_notes SET category_id = ?, month = ?, title = ?, amount = ?, memo = ?, updated_at = ? WHERE id = ?', [categoryId, month, title, amount, text(input.memo, 200), now, String(input.id)]);
  else await run(env, 'INSERT INTO money_notes (id, category_id, month, title, amount, memo, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [newId(), categoryId, month, title, amount, text(input.memo, 200), user.name, now, now]);
  await log(env, user.name, 'moneynote.save', { month, title, amount });
  return listMoneyNotes(env, month.slice(0, 4));
}

export async function deleteMoneyNote(env: Env, user: User, id: string) {
  const m = await first(env, 'SELECT month, title FROM money_notes WHERE id = ?', [id], (r) => ({ month: String(r.month), title: String(r.title) }));
  if (!m) throw new UserError('이미 지워졌어요.');
  await run(env, 'DELETE FROM money_notes WHERE id = ?', [id]);
  await log(env, user.name, 'moneynote.delete', m);
  return listMoneyNotes(env, m.month.slice(0, 4));
}

/** 머니노트 세부 항목 줄 만들기 (금액 없이 이름만) */
export async function addMoneyItem(env: Env, user: User, input: { year?: unknown; categoryId?: unknown; title?: unknown }) {
  const year = String(input.year);
  if (!/^\d{4}$/.test(year)) throw new UserError('해가 이상해요.');
  const categoryId = String(input.categoryId ?? '');
  if (!(await first(env, 'SELECT 1 AS x FROM categories WHERE id = ?', [categoryId], (r) => r.x))) throw new UserError('카테고리를 골라 주세요.');
  const title = text(input.title, 60);
  if (!title) throw new UserError('이름을 적어 주세요.');
  const max = (await first(env, 'SELECT MAX(sort) AS m FROM money_note_items WHERE year = ? AND category_id = ?', [year, categoryId], (r) => Number(r.m ?? 0))) ?? 0;
  await run(env, 'INSERT OR IGNORE INTO money_note_items (id, category_id, year, title, sort, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [newId(), categoryId, year, title, max + 1, user.name, Date.now()]);
  return listMoneyNotes(env, year);
}

/** 세부 항목 한 줄을 팝업에서 한 번에 저장: 이름 + 1~12월 금액 (0이면 그달 지움). 같은 칸에 같은 이름이 여러 줄이면 그 달은 건드리지 않음 */
export async function saveMoneyItem(env: Env, user: User, input: { year?: unknown; categoryId?: unknown; from?: unknown; title?: unknown; amounts?: unknown }) {
  const year = String(input.year);
  if (!/^\d{4}$/.test(year)) throw new UserError('해가 이상해요.');
  const categoryId = String(input.categoryId ?? '');
  if (!(await first(env, 'SELECT 1 AS x FROM categories WHERE id = ?', [categoryId], (r) => r.x))) throw new UserError('카테고리를 골라 주세요.');
  const title = text(input.title, 60);
  if (!title) throw new UserError('이름을 적어 주세요.');
  const from = String(input.from ?? '').trim() || title;
  if (from !== title) await renameMoneyItem(env, user, { year, categoryId, from, to: title });
  await run(env, 'INSERT OR IGNORE INTO money_note_items (id, category_id, year, title, sort, created_by, created_at) VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(sort), 0) + 1 FROM money_note_items WHERE year = ? AND category_id = ?), ?, ?)', [newId(), categoryId, year, title, year, categoryId, user.name, Date.now()]).catch(() => undefined); // 0023 전 DB에서도 금액 저장은 되게
  const amounts = (input.amounts ?? {}) as Record<string, unknown>;
  const now = Date.now();
  for (let i = 1; i <= 12; i++) {
    const mm = String(i).padStart(2, '0');
    if (!(mm in amounts)) continue;
    const amount = amounts[mm] === null || amounts[mm] === '' ? 0 : int(amounts[mm], '금액');
    const month = `${year}-${mm}`;
    const rows = await all(env, 'SELECT id, amount FROM money_notes WHERE category_id = ? AND month = ? AND TRIM(title) = ?', [categoryId, month, title], (r) => ({ id: String(r.id), amount: Number(r.amount) }));
    if (rows.length > 1) continue;
    if (rows.length === 0 && amount > 0) await run(env, 'INSERT INTO money_notes (id, category_id, month, title, amount, memo, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [newId(), categoryId, month, title, amount, '', user.name, now, now]);
    else if (rows.length === 1 && amount === 0) await run(env, 'DELETE FROM money_notes WHERE id = ?', [rows[0].id]);
    else if (rows.length === 1 && amount !== rows[0].amount) await run(env, 'UPDATE money_notes SET amount = ?, updated_at = ? WHERE id = ?', [amount, now, rows[0].id]);
  }
  await log(env, user.name, 'moneynote.saveItem', { year, title });
  return listMoneyNotes(env, year);
}

/** 머니노트 세부 항목(같은 이름 줄) 이름 바꾸기 — 그 해 그 카테고리의 같은 이름 줄 모두 */
export async function renameMoneyItem(env: Env, user: User, input: { year?: unknown; categoryId?: unknown; from?: unknown; to?: unknown }) {
  const year = String(input.year);
  if (!/^\d{4}$/.test(year)) throw new UserError('해가 이상해요.');
  const to = text(input.to, 60);
  if (!to) throw new UserError('새 이름을 적어 주세요.');
  await run(env, "UPDATE money_notes SET title = ?, updated_at = ? WHERE category_id = ? AND TRIM(title) = ? AND month LIKE ?", [to, Date.now(), String(input.categoryId), String(input.from ?? '').trim(), `${year}-%`]);
  await run(env, 'UPDATE OR IGNORE money_note_items SET title = ? WHERE category_id = ? AND year = ? AND title = ?', [to, String(input.categoryId), year, String(input.from ?? '').trim()]).catch(() => undefined);
  await run(env, 'DELETE FROM money_note_items WHERE category_id = ? AND year = ? AND title = ?', [String(input.categoryId), year, String(input.from ?? '').trim()]).catch(() => undefined);
  await log(env, user.name, 'moneynote.rename', { year, from: input.from, to });
  return listMoneyNotes(env, year);
}

/** 머니노트 세부 항목 줄 통째로 지우기 (그 해 그 카테고리의 같은 이름 줄 모두) */
export async function deleteMoneyItem(env: Env, user: User, input: { year?: unknown; categoryId?: unknown; title?: unknown }) {
  const year = String(input.year);
  if (!/^\d{4}$/.test(year)) throw new UserError('해가 이상해요.');
  await run(env, "DELETE FROM money_notes WHERE category_id = ? AND TRIM(title) = ? AND month LIKE ?", [String(input.categoryId), String(input.title ?? '').trim(), `${year}-%`]);
  await run(env, 'DELETE FROM money_note_items WHERE category_id = ? AND year = ? AND title = ?', [String(input.categoryId), year, String(input.title ?? '').trim()]).catch(() => undefined);
  await log(env, user.name, 'moneynote.deleteItem', { year, title: input.title });
  return listMoneyNotes(env, year);
}

// ---------- 머니플랜 (연간 계획) ----------
// 달마다: 수입·고정·변동 = 카테고리 예산 합계(자동, 고친 칸은 money_plan), 특별 = 머니노트 합계, 목표 저축 = 나머지

export async function planView(env: Env, year: string) {
  if (!/^\d{4}$/.test(year)) throw new UserError('연도는 2026 같은 형식이어야 해요.');
  const from = `${year}-01`, to = `${year}-12`;
  const [cats, budgets, notes, over] = await Promise.all([
    getCategories(env),
    all(env, 'SELECT category_id, month, amount FROM budgets WHERE month >= ? AND month <= ?', [from, to], (r) => ({ c: String(r.category_id), m: String(r.month), a: Number(r.amount) })),
    all(env, 'SELECT category_id, month, SUM(amount) s FROM money_notes WHERE month >= ? AND month <= ? GROUP BY category_id, month', [from, to], (r) => ({ c: String(r.category_id), m: String(r.month), s: Number(r.s) })),
    all(env, 'SELECT month, row, amount FROM money_plan WHERE month >= ? AND month <= ?', [from, to], (r) => ({ m: String(r.month), row: String(r.row), a: Number(r.amount) })),
  ]);
  const bMap = new Map(budgets.map((b) => [`${b.c}|${b.m}`, b.a]));
  // 수입은 예산이 아니라 최근 석 달(이번 달 빼고) 실제 평균으로 — 러프한 계획용 (선생님 결정)
  const thisM = monthOf(today());
  const incFrom = addMonths(thisM, -3);
  const incTx = await all(env, 'SELECT * FROM transactions WHERE date >= ? AND date < ?', [`${incFrom}-01`, `${thisM}-01`], toTx);
  const incAvg = Math.round([0, 1, 2].reduce((n, i) => n + monthTotals(incTx, cats, addMonths(incFrom, i)).inc, 0) / 3);
  const nMap = new Map(notes.map((n) => [`${n.c}|${n.m}`, n.s]));
  const months = Array.from({ length: 12 }, (_, i) => {
    const m = `${year}-${String(i + 1).padStart(2, '0')}`;
    const auto = { inc: 0, fix: 0, var: 0 };
    let spc = 0;
    for (const c of cats) {
      if (c.hidden) continue;
      const monthAmt = bMap.get(`${c.id}|${m}`);
      const note = c.moneynote ? nMap.get(`${c.id}|${m}`) : undefined;
      if (note !== undefined) spc += note;
      // 특별지출(머니노트)은 따로 세고, 남은 '평소 몫'만 수입·고정·변동에
      const base = note !== undefined && !c.moneynoteAdd ? 0 : monthAmt ?? c.budget;
      if (c.grp === 'fix' || c.grp === 'var') auto[c.grp] += base;
    }
    auto.inc = incAvg;
    const pick = (row: 'inc' | 'fix' | 'var') => over.find((o) => o.m === m && o.row === row)?.a;
    const v = { inc: pick('inc') ?? auto.inc, fix: pick('fix') ?? auto.fix, var: pick('var') ?? auto.var };
    return { month: m, auto, edited: { inc: pick('inc') !== undefined, fix: pick('fix') !== undefined, var: pick('var') !== undefined }, ...v, spc, save: v.inc - v.fix - v.var - spc };
  });
  return { year, months };
}

export async function setPlanCell(env: Env, user: User, input: { month?: unknown; row?: unknown; amount?: unknown }) {
  const month = String(input.month), row = String(input.row);
  if (!isMonth(month) || !['inc', 'fix', 'var'].includes(row)) throw new UserError('칸이 이상해요.');
  if (input.amount === null || input.amount === undefined) await run(env, 'DELETE FROM money_plan WHERE month = ? AND row = ?', [month, row]);
  else await run(env, 'INSERT INTO money_plan (month, row, amount, updated_by, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (month, row) DO UPDATE SET amount = excluded.amount, updated_by = excluded.updated_by, updated_at = excluded.updated_at', [month, row, int(input.amount, '금액'), user.name, Date.now()]);
  return planView(env, month.slice(0, 4));
}

/** 작년 머니노트를 올해 같은 달로 복사 (이미 같은 달·같은 이름이 있으면 건너뜀) */
export async function copyMoneyNotes(env: Env, user: User, year: unknown) {
  const y = String(year);
  if (!/^\d{4}$/.test(y)) throw new UserError('연도가 이상해요.');
  const prev = String(Number(y) - 1);
  const now = Date.now();
  const rows = await all(env, 'SELECT * FROM money_notes WHERE month >= ? AND month <= ?', [`${prev}-01`, `${prev}-12`], toMoneyNote);
  let n = 0;
  for (const r of rows) {
    const m = `${y}${r.month.slice(4)}`;
    const has = await first(env, 'SELECT 1 AS x FROM money_notes WHERE category_id = ? AND month = ? AND title = ?', [r.categoryId, m, r.title], (x) => x.x);
    if (has) continue;
    await run(env, 'INSERT INTO money_notes (id, category_id, month, title, amount, memo, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [newId(), r.categoryId, m, r.title, r.amount, `${prev}년에서 불러옴`, user.name, now, now]);
    n++;
  }
  await run(env, 'INSERT OR IGNORE INTO money_note_items (id, category_id, year, title, sort, created_by, created_at) SELECT lower(hex(randomblob(16))), category_id, ?, title, sort, ?, ? FROM money_note_items WHERE year = ?', [y, user.name, now, prev]);
  await log(env, user.name, 'moneynote.copy', { from: prev, to: y, n });
  return { copied: n, ...(await listMoneyNotes(env, y)) };
}

export async function saveBudgetNote(env: Env, user: User, input: { categoryId?: unknown; month?: unknown; note?: unknown }) {
  const month = String(input.month);
  if (!isMonth(month)) throw new UserError('달이 이상해요.');
  await run(
    env,
    'INSERT INTO budget_notes (category_id, month, note, updated_by, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (category_id, month) DO UPDATE SET note = excluded.note, updated_by = excluded.updated_by, updated_at = excluded.updated_at',
    [String(input.categoryId), month, text(input.note, 200), user.name, Date.now()],
  );
  return { ok: true };
}

// ---------- 단기로드맵 (3단계): 저축·투자 카테고리별 12달 계획(= 그달 예산) vs 실제 ----------

export async function shortRoadmap(env: Env, year: string) {
  if (!/^\d{4}$/.test(year)) throw new UserError('연도는 2026 같은 형식이어야 해요.');
  const [categories, txs, budgets, notes, target, accounts] = await Promise.all([
    getCategories(env),
    all(env, 'SELECT * FROM transactions WHERE date >= ? AND date <= ?', [`${year}-01-01`, `${year}-12-31`], toTx),
    all(env, 'SELECT category_id, month, amount FROM budgets WHERE month >= ? AND month <= ?', [`${year}-01`, `${year}-12`], (r) => [`${r.category_id}|${r.month}`, Number(r.amount)] as const),
    all(env, 'SELECT category_id, month, SUM(amount) AS s FROM money_notes WHERE month >= ? AND month <= ? GROUP BY category_id, month', [`${year}-01`, `${year}-12`], (r) => [`${r.category_id}|${r.month}`, Number(r.s)] as const),
    first(env, 'SELECT save_target FROM year_goals WHERE year = ?', [year], (r) => Number(r.save_target)),
    getAccounts(env),
  ]);
  const bMap = new Map(budgets);
  const nMap = new Map(notes);
  const cats = categories.filter((c) => c.grp === 'sav' || c.grp === 'inv');
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  // 결산과 같은 규칙으로 (예산 = 그달 예산 → 기본 예산, 실제 = 저축 통장끼리 옮긴 돈 뺌)
  const adds = await Promise.all(months.map((m) => loanAdds(env, m)));
  const perMonth = months.map((m, i) => new Map(budgetLines(txs, cats, m, (c) => budgetWithNotes(c, bMap.get(`${c.id}|${m}`), nMap.get(`${c.id}|${m}`)) + (adds[i].get(c.id) ?? 0), 10, accounts).map((l) => [l.category.id, l])));
  const rows = cats
    .map((c) => ({
      categoryId: c.id,
      name: c.name,
      grp: c.grp,
      hidden: c.hidden,
      included: c.inRoadmap,
      plan: perMonth.map((pm) => pm.get(c.id)?.budget ?? 0),
      actual: perMonth.map((pm) => pm.get(c.id)?.actual ?? 0),
    }))
    .filter((r) => !r.hidden || r.plan.some(Boolean) || r.actual.some(Boolean));
  const notesRows = await all(env, "SELECT month, body FROM review_notes WHERE section = 'short' AND month >= ? AND month <= ?", [`${year}-01`, `${year}-12`], (r) => [String(r.month), String(r.body)] as const);
  return { year, target: target ?? 0, rows, notes: Object.fromEntries(notesRows) };
}

/** 단기로드맵에 넣을지 뺄지 (저축·투자 카테고리만) */
export async function setRoadmapInclude(env: Env, user: User, input: { categoryId?: unknown; on?: unknown; year?: unknown }) {
  const id = String(input.categoryId ?? '');
  const c = (await getCategories(env)).find((x) => x.id === id);
  if (!c || (c.grp !== 'sav' && c.grp !== 'inv')) throw new UserError('저축·투자 카테고리만 고를 수 있어요.');
  await run(env, 'UPDATE categories SET in_roadmap = ? WHERE id = ?', [input.on ? 1 : 0, id]);
  await log(env, user.name, '단기로드맵 넣기', { name: c.name, on: !!input.on });
  return shortRoadmap(env, String(input.year));
}

// ---------- 중장기로드맵 (3단계): 해마다 새로 (plan_year), 저축액·수익률은 해마다, 빈 해는 앞 해 값 이어 씀 ----------

const planYearOk = (v: unknown) => {
  const y = String(v ?? '');
  if (!/^\d{4}$/.test(y)) throw new UserError('로드맵 연도는 2026 같은 형식이어야 해요.');
  return y;
};

export async function longRoadmap(env: Env, planYear: string) {
  const year = planYearOk(planYear);
  const plan = await first(env, 'SELECT * FROM long_roadmaps WHERE plan_year = ?', [year], (r) => ({
    planYear: String(r.plan_year),
    span: Number(r.span),
    ageStart: Number(r.age_start),
    startInvest: Number(r.start_invest),
  }));
  const [years, milestones, others] = await Promise.all([
    all(env, 'SELECT y, saving, rate_bp, crisis FROM long_roadmap_years WHERE plan_year = ? ORDER BY y', [year], (r) => ({ y: Number(r.y), saving: r.saving === null ? null : Number(r.saving), rateBp: r.rate_bp === null ? null : Number(r.rate_bp), crisis: Number(r.crisis ?? 0) === 1 })),
    all(env, 'SELECT amount FROM long_roadmap_milestones WHERE plan_year = ? ORDER BY amount', [year], (r) => Number(r.amount)),
    all(env, 'SELECT plan_year FROM long_roadmaps ORDER BY plan_year', [], (r) => String(r.plan_year)),
  ]);
  const rows = await all(env, 'SELECT id, name, sort FROM long_roadmap_rows WHERE plan_year = ? ORDER BY sort, created_at', [year], (r) => ({ id: String(r.id), name: String(r.name), sort: Number(r.sort) }));
  const notes = await all(env, "SELECT n.row_id, n.y, n.body, n.photo FROM long_roadmap_notes n JOIN long_roadmap_rows r ON r.id = n.row_id WHERE r.plan_year = ? AND (n.body != '' OR n.photo IS NOT NULL)", [year], (r) => ({ rowId: String(r.row_id), y: Number(r.y), body: String(r.body), photo: r.photo ? String(r.photo) : null }));
  const versions = await all(env, 'SELECT month, saved_by, saved_at FROM long_roadmap_versions WHERE plan_year = ? ORDER BY month', [year], (r) => ({ month: String(r.month), savedBy: String(r.saved_by ?? ''), savedAt: Number(r.saved_at) }));
  const feedback = Object.fromEntries(await all(env, "SELECT month, body FROM review_notes WHERE section = 'long' AND month >= ? AND month <= ?", [`${year}-01`, `${Number(year) + 1}-12`], (r) => [String(r.month), String(r.body)] as const));
  // 실제 줄: 로드맵 첫해 ~ 올해까지 (직접 적은 값이 있으면 그것, 없으면 고른 통장 잔액 합계 — 올해는 오늘까지)
  const actuals = plan ? await assetActuals(env, Number(year), Math.min(Number(year) + plan.span - 1, Number(today().slice(0, 4)))) : [];
  const assetAccounts = await all(env, 'SELECT id, name, kind, in_assets FROM accounts WHERE hidden = 0 OR in_assets = 1 ORDER BY sort, name', [], (r) => ({ id: String(r.id), name: String(r.name), kind: String(r.kind), on: Number(r.in_assets) === 1 }));
  const carry = !plan && others.includes(String(Number(year) - 1)) ? await carryPreview(env, Number(year)) : null;
  return { year, plan, years, milestones, planYears: others, rows, notes, versions, feedback, actuals, assetAccounts, carry };
}

export async function setupLongRoadmap(env: Env, user: User, input: { year?: unknown; ageStart?: unknown; startInvest?: unknown; saving?: unknown; rateBp?: unknown; span?: unknown }) {
  const year = planYearOk(input.year);
  const age = Math.round(Number(input.ageStart));
  if (!Number.isFinite(age) || age < 0 || age > 120) throw new UserError('나이를 확인해 주세요.');
  const span = Math.min(60, Math.max(5, Math.round(Number(input.span ?? 30)) || 30));
  const startInvest = int(input.startInvest ?? 0, '투자자산');
  const now = Date.now();
  await run(
    env,
    'INSERT INTO long_roadmaps (plan_year, span, age_start, start_invest, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (plan_year) DO UPDATE SET span = excluded.span, age_start = excluded.age_start, start_invest = excluded.start_invest, updated_by = excluded.updated_by, updated_at = excluded.updated_at',
    [year, span, age, startInvest, user.name, now],
  );
  // 처음 만들 때만 첫해 저축액·수익률을 넣어 둠 (뒤 해들은 이어 씀)
  if (input.saving !== undefined || input.rateBp !== undefined)
    await run(env, 'INSERT INTO long_roadmap_years (plan_year, y, saving, rate_bp, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (plan_year, y) DO NOTHING', [
      year,
      Number(year),
      input.saving === undefined ? null : int(input.saving, '저축액'),
      input.rateBp === undefined ? null : rateOk(input.rateBp),
      user.name,
      now,
    ]);
  const hasRows = await first(env, 'SELECT 1 AS x FROM long_roadmap_rows WHERE plan_year = ? LIMIT 1', [year], (r) => r.x);
  if (!hasRows)
    await env.DB.batch(LONG_DEFAULT_ROWS.map((name, i) => env.DB.prepare('INSERT INTO long_roadmap_rows (id, plan_year, name, sort, created_at) VALUES (?, ?, ?, ?, ?)').bind(newId(), year, name, i, now)));
  await log(env, user.name, '중장기로드맵 기본값', { year, age, span, startInvest });
  return longRoadmap(env, year);
}

const rateOk = (v: unknown) => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < -10000 || n > 10000) throw new UserError('수익률은 −100% ~ 100% 사이로 넣어 주세요.');
  return n;
};

/** 여러 해를 골라 한 번에: field = saving | rate, value = 원 / 만분율, null이면 '앞 해와 같게'로 되돌림 */
export async function setLongYears(env: Env, user: User, input: { year?: unknown; ys?: unknown; field?: unknown; value?: unknown }) {
  const year = planYearOk(input.year);
  const ys = Array.isArray(input.ys) ? input.ys.map(Number).filter((y) => Number.isInteger(y) && y >= 1900 && y <= 2200) : [];
  if (!ys.length) throw new UserError('바꿀 해를 골라 주세요.');
  const field = input.field === 'rate' ? 'rate_bp' : input.field === 'saving' ? 'saving' : input.field === 'crisis' ? 'crisis' : null;
  if (!field) throw new UserError('무엇을 바꿀지 모르겠어요.');
  const value = field === 'crisis' ? (input.value ? 1 : 0) : input.value === null || input.value === undefined || input.value === '' ? null : field === 'rate_bp' ? rateOk(input.value) : int(input.value, '저축액');
  const now = Date.now();
  await env.DB.batch(
    ys.map((y) =>
      env.DB.prepare(`INSERT INTO long_roadmap_years (plan_year, y, ${field}, updated_by, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (plan_year, y) DO UPDATE SET ${field} = excluded.${field}, updated_by = excluded.updated_by, updated_at = excluded.updated_at`).bind(year, y, value, user.name, now),
    ),
  );
  await log(env, user.name, '중장기로드맵 칸', { year, ys, field, value });
  return longRoadmap(env, year);
}

export async function setLongMilestones(env: Env, user: User, input: { year?: unknown; amounts?: unknown }) {
  const year = planYearOk(input.year);
  const amounts = [...new Set((Array.isArray(input.amounts) ? input.amounts : []).map((n) => Math.round(Number(n))).filter((n) => Number.isSafeInteger(n) && n > 0))].slice(0, 20);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM long_roadmap_milestones WHERE plan_year = ?').bind(year),
    ...amounts.map((a) => env.DB.prepare('INSERT INTO long_roadmap_milestones (plan_year, amount) VALUES (?, ?)').bind(year, a)),
  ]);
  await log(env, user.name, '중장기로드맵 이정표', { year, amounts });
  return longRoadmap(env, year);
}

export const LONG_DEFAULT_ROWS = ['일', '가족', '투자공부', '성장', '버킷리스트'];

/** 글 줄: 추가(id 없음) · 이름 바꾸기 · 지우기(remove) · 순서(dir) */
export async function saveLongRow(env: Env, user: User, input: { year?: unknown; id?: unknown; name?: unknown; remove?: unknown; dir?: unknown }) {
  const year = planYearOk(input.year);
  const id = input.id ? String(input.id) : '';
  if (id && input.remove) {
    await env.DB.batch([env.DB.prepare('DELETE FROM long_roadmap_notes WHERE row_id = ?').bind(id), env.DB.prepare('DELETE FROM long_roadmap_rows WHERE id = ? AND plan_year = ?').bind(id, year)]);
    await log(env, user.name, '중장기로드맵 줄 지움', { year, id });
  } else if (id && (input.dir === 1 || input.dir === -1)) {
    const rows = await all(env, 'SELECT id FROM long_roadmap_rows WHERE plan_year = ? ORDER BY sort, created_at', [year], (r) => String(r.id));
    const i = rows.indexOf(id);
    const j = i + Number(input.dir);
    if (i >= 0 && j >= 0 && j < rows.length) {
      [rows[i], rows[j]] = [rows[j], rows[i]];
      await env.DB.batch(rows.map((rid, k) => env.DB.prepare('UPDATE long_roadmap_rows SET sort = ? WHERE id = ?').bind(k, rid)));
    }
  } else {
    const name = text(input.name, 20);
    if (!name) throw new UserError('줄 이름을 넣어 주세요.');
    if (id) await run(env, 'UPDATE long_roadmap_rows SET name = ? WHERE id = ? AND plan_year = ?', [name, id, year]);
    else {
      const max = (await first(env, 'SELECT MAX(sort) AS m FROM long_roadmap_rows WHERE plan_year = ?', [year], (r) => Number(r.m ?? -1))) ?? -1;
      await run(env, 'INSERT INTO long_roadmap_rows (id, plan_year, name, sort, created_at) VALUES (?, ?, ?, ?, ?)', [newId(), year, name, max + 1, Date.now()]);
    }
    await log(env, user.name, '중장기로드맵 줄', { year, id, name });
  }
  return longRoadmap(env, year);
}

export async function saveLongNote(env: Env, user: User, input: { rowId?: unknown; y?: unknown; body?: unknown; photo?: unknown }) {
  const rowId = String(input.rowId ?? '');
  const y = Number(input.y);
  const row = await first(env, 'SELECT plan_year FROM long_roadmap_rows WHERE id = ?', [rowId], (r) => String(r.plan_year));
  if (!row || !Number.isInteger(y)) throw new UserError('칸이 이상해요.');
  const body = String(input.body ?? '').trim().slice(0, 300);
  if (input.photo !== undefined) {
    // 사진: data:image/jpeg;base64,… 만 받고 크기 제한 (화면에서 작게 줄여서 보냄)
    const photo = input.photo === null ? null : String(input.photo);
    if (photo && (!/^data:image\/(jpeg|png|webp);base64,/.test(photo) || photo.length > 400_000)) throw new UserError('사진이 너무 크거나 형식이 이상해요.');
    await run(env, 'INSERT INTO long_roadmap_notes (row_id, y, body, photo, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (row_id, y) DO UPDATE SET photo = excluded.photo, updated_by = excluded.updated_by, updated_at = excluded.updated_at', [rowId, y, body, photo, user.name, Date.now()]);
    return { ok: true };
  }
  await run(env, 'INSERT INTO long_roadmap_notes (row_id, y, body, updated_by, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (row_id, y) DO UPDATE SET body = excluded.body, updated_by = excluded.updated_by, updated_at = excluded.updated_at', [rowId, y, body, user.name, Date.now()]);
  return { ok: true };
}

/** 이번 달 버전 저장 (같은 달이면 덮어씀) — 지금 로드맵을 통째로 */
export async function saveLongVersion(env: Env, user: User, input: { year?: unknown; month?: unknown }) {
  const year = planYearOk(input.year);
  const month = String(input.month ?? '');
  if (!isMonth(month)) throw new UserError('달이 이상해요.');
  const cur = await longRoadmap(env, year);
  if (!cur.plan) throw new UserError('로드맵을 먼저 만들어 주세요.');
  const snapshot = JSON.stringify({ plan: cur.plan, years: cur.years, milestones: cur.milestones, rows: cur.rows, notes: cur.notes });
  await run(env, 'INSERT INTO long_roadmap_versions (plan_year, month, snapshot, saved_by, saved_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (plan_year, month) DO UPDATE SET snapshot = excluded.snapshot, saved_by = excluded.saved_by, saved_at = excluded.saved_at', [year, month, snapshot, user.name, Date.now()]);
  await log(env, user.name, '중장기로드맵 버전 저장', { year, month });
  return longRoadmap(env, year);
}

export async function getLongVersion(env: Env, year: string, month: string) {
  const y = planYearOk(year);
  const snap = await first(env, 'SELECT snapshot, saved_at FROM long_roadmap_versions WHERE plan_year = ? AND month = ?', [y, month], (r) => ({ ...JSON.parse(String(r.snapshot)), month, savedAt: Number(r.saved_at) }));
  if (!snap) throw new UserError('그 달 버전이 없어요.');
  return snap;
}

// ---------- 실제 자산 (로드맵 '실제' 줄) ----------

export async function assetActuals(env: Env, fromYear: number, toYear: number) {
  if (toYear < fromYear) return [];
  const [accounts, txs, ids, overrides] = await Promise.all([
    getAccounts(env),
    all(env, 'SELECT * FROM transactions WHERE date <= ?', [`${toYear}-12-31`], toTx),
    all(env, 'SELECT id FROM accounts WHERE in_assets = 1', [], (r) => String(r.id)),
    all(env, 'SELECT y, amount FROM asset_actuals WHERE y >= ? AND y <= ?', [fromYear, toYear], (r) => [Number(r.y), Number(r.amount)] as const),
  ]);
  const on = new Set(ids);
  const over = new Map(overrides);
  const out: { y: number; auto: number; override: number | null }[] = [];
  const vals = await getValuations(env);
  const nowMonth = today().slice(0, 7);
  for (let y = fromYear; y <= toYear; y++) {
    const bal = withValuations(accounts, txs, vals, `${y}-12` > nowMonth ? nowMonth : `${y}-12`);
    let auto = 0;
    for (const [id, b] of bal) if (on.has(id)) auto += b;
    out.push({ y, auto, override: over.get(y) ?? null });
  }
  return out;
}

export async function setAssetActual(env: Env, user: User, input: { y?: unknown; amount?: unknown; year?: unknown }) {
  const y = Number(input.y);
  if (!Number.isInteger(y) || y < 1900 || y > 2200) throw new UserError('연도가 이상해요.');
  if (input.amount === null || input.amount === undefined || input.amount === '') await run(env, 'DELETE FROM asset_actuals WHERE y = ?', [y]);
  else await run(env, 'INSERT INTO asset_actuals (y, amount, updated_by, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (y) DO UPDATE SET amount = excluded.amount, updated_by = excluded.updated_by, updated_at = excluded.updated_at', [y, int(input.amount, '금액'), user.name, Date.now()]);
  await log(env, user.name, '실제 자산 직접 입력', { y, amount: input.amount ?? null });
  return longRoadmap(env, planYearOk(input.year));
}

export async function setAccountInAssets(env: Env, user: User, input: { id?: unknown; on?: unknown; year?: unknown }) {
  await run(env, 'UPDATE accounts SET in_assets = ? WHERE id = ?', [input.on ? 1 : 0, String(input.id ?? '')]);
  await log(env, user.name, '실제 자산 통장', { id: input.id, on: !!input.on });
  return longRoadmap(env, planYearOk(input.year));
}

// ---------- 대출 상환표 (설정에서 켠 사람만) ----------

/** 그달 예산에 더할 상환표 금액: 카테고리 → 금액 (연결한 달부터만, 기능 꺼져 있으면 없음) */
export async function loanAdds(env: Env, month: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if ((await getSetting(env, 'feature_loan')) !== '1') return out;
  const rows = await all(
    env,
    'SELECT l.principal_category pc, l.interest_category ic, s.principal, s.interest FROM loan_links l JOIN loan_schedule s ON s.account_id = l.account_id AND s.month = ? WHERE l.start_month IS NOT NULL AND l.start_month <= ?',
    [month, month],
    (r) => ({ pc: r.pc ? String(r.pc) : null, ic: r.ic ? String(r.ic) : null, p: Number(r.principal), i: Number(r.interest) }),
  );
  for (const r of rows) {
    if (r.pc) out.set(r.pc, (out.get(r.pc) ?? 0) + r.p);
    if (r.ic) out.set(r.ic, (out.get(r.ic) ?? 0) + r.i);
  }
  return out;
}

export async function loansView(env: Env) {
  const feature = (await getSetting(env, 'feature_loan')) === '1';
  const accounts = (await getAccounts(env)).filter((a) => a.kind === '대출');
  const [schedule, links, txs] = await Promise.all([
    all(env, 'SELECT * FROM loan_schedule ORDER BY month', [], (r) => ({ accountId: String(r.account_id), month: String(r.month), payment: Number(r.payment), principal: Number(r.principal), interest: Number(r.interest), balance: r.balance === null ? null : Number(r.balance) })),
    all(env, 'SELECT * FROM loan_links', [], (r) => ({ accountId: String(r.account_id), principalCategory: r.principal_category ? String(r.principal_category) : null, interestCategory: r.interest_category ? String(r.interest_category) : null, startMonth: r.start_month ? String(r.start_month) : null })),
    all(env, 'SELECT * FROM transactions', [], toTx),
  ]);
  const all_ = await getAccounts(env);
  return {
    feature,
    loans: accounts.map((a) => {
      const rows = schedule.filter((x) => x.accountId === a.id);
      // 상환표 달마다: 그달 말 앱 잔액 (대출은 마이너스로 쌓임 → 양수로 바꿔 비교)
      const withApp = rows.map((x) => {
        const bal = accountBalances(all_, txs, `${x.month}-31`).get(a.id) ?? 0;
        return { ...x, appBalance: -bal };
      });
      return { account: { id: a.id, name: a.name }, link: links.find((l) => l.accountId === a.id) ?? null, rows: withApp };
    }),
  };
}

export async function setFeatureLoan(env: Env, user: User, on: unknown) {
  await setSetting(env, 'feature_loan', on ? '1' : '0');
  await log(env, user.name, '대출 상환표 기능', on ? '켬' : '끔');
  return loansView(env);
}

export async function saveLoanSchedule(env: Env, user: User, input: { accountId?: unknown; rows?: unknown }) {
  const accountId = String(input.accountId ?? '');
  const acc = (await getAccounts(env)).find((a) => a.id === accountId && a.kind === '대출');
  if (!acc) throw new UserError('대출 통장을 골라 주세요.');
  const rows = Array.isArray(input.rows) ? input.rows : [];
  const ok = rows
    .map((r: Record<string, unknown>) => ({ month: String(r.month ?? ''), payment: Math.round(Number(r.payment) || 0), principal: Math.round(Number(r.principal) || 0), interest: Math.round(Number(r.interest) || 0), balance: r.balance === null || r.balance === undefined ? null : Math.round(Number(r.balance)) }))
    .filter((r) => isMonth(r.month) && (r.principal || r.interest));
  if (!ok.length) throw new UserError('읽은 줄이 없어요. 표를 다시 복사해 주세요.');
  const now = Date.now();
  await env.DB.batch(
    ok.map((r) =>
      env.DB.prepare('INSERT INTO loan_schedule (account_id, month, payment, principal, interest, balance, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (account_id, month) DO UPDATE SET payment = excluded.payment, principal = excluded.principal, interest = excluded.interest, balance = excluded.balance, updated_by = excluded.updated_by, updated_at = excluded.updated_at').bind(accountId, r.month, r.payment || r.principal + r.interest, r.principal, r.interest, r.balance, user.name, now),
    ),
  );
  await log(env, user.name, '대출 상환표 넣기', { account: acc.name, months: `${ok[0].month}~${ok[ok.length - 1].month}`, n: ok.length });
  return loansView(env);
}

/** 예산 연결: 원금·이자 카테고리, 시작 달, 그리고 '대출 말고 다른 몫'(그 달부터 카테고리 기본 예산·달별 예산을 이 금액으로) */
export async function saveLoanLink(env: Env, user: User, input: { accountId?: unknown; principalCategory?: unknown; interestCategory?: unknown; startMonth?: unknown; principalBase?: unknown; interestBase?: unknown }) {
  const accountId = String(input.accountId ?? '');
  const start = input.startMonth ? String(input.startMonth) : null;
  if (start && !isMonth(start)) throw new UserError('시작 달이 이상해요.');
  const pc = input.principalCategory ? String(input.principalCategory) : null;
  const ic = input.interestCategory ? String(input.interestCategory) : null;
  const now = Date.now();
  await run(env, 'INSERT INTO loan_links (account_id, principal_category, interest_category, start_month, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (account_id) DO UPDATE SET principal_category = excluded.principal_category, interest_category = excluded.interest_category, start_month = excluded.start_month, updated_by = excluded.updated_by, updated_at = excluded.updated_at', [accountId, pc, ic, start, user.name, now]);
  // 다른 몫: 시작 달부터 그 카테고리 예산을 이 금액으로 (상환표 금액은 앱이 더함). 시작 달 이전 결산은 안 건드림
  for (const [cat, base] of [[pc, input.principalBase], [ic, input.interestBase]] as const) {
    if (!cat || !start || base === undefined || base === null || base === '') continue;
    const n = int(base, '다른 몫');
    const months = await all(env, 'SELECT month FROM budgets WHERE category_id = ? AND month >= ?', [cat, start], (r) => String(r.month));
    for (const m of months) await setMonthBudget(env, user, { categoryId: cat, month: m, amount: n });
    await run(env, 'UPDATE categories SET budget = ? WHERE id = ?', [n, cat]);
  }
  await log(env, user.name, '대출 상환표 예산 연결', { accountId, pc, ic, start, principalBase: input.principalBase, interestBase: input.interestBase });
  return loansView(env);
}

// ---------- 주식 평가금액 (월말 한 번) ----------

type Vals = Map<string, { month: string; amount: number }[]>;
async function getValuations(env: Env): Promise<Vals> {
  const rows = await all(env, 'SELECT account_id, month, amount FROM account_valuations ORDER BY month', [], (r) => ({ id: String(r.account_id), month: String(r.month), amount: Number(r.amount) }));
  const out: Vals = new Map();
  for (const r of rows) out.set(r.id, [...(out.get(r.id) ?? []), { month: r.month, amount: r.amount }]);
  return out;
}

/** 그달 말 통장 잔액, 평가금액을 적어 둔 통장은 평가 기준으로 */
function withValuations(accounts: Account[], txs: Tx[], vals: Vals, month: string) {
  const bal = accountBalances(accounts, txs, `${month}-31`);
  for (const [id, list] of vals) {
    if (!bal.has(id)) continue;
    const bookAt = (m: string) => (m === month ? bal.get(id)! : accountBalances(accounts.filter((a) => a.id === id), txs, `${m}-31`).get(id) ?? 0);
    bal.set(id, valuedAt(bookAt, list, month).value);
  }
  return bal;
}

/** 평가금액 표: 증권 통장 × 그해 12달 (넣은 돈 · 적은 평가금액) */
export async function valuationsView(env: Env, year: string) {
  if (!/^\d{4}$/.test(year)) throw new UserError('연도는 2026 같은 형식이어야 해요.');
  const [accounts, txs, vals] = await Promise.all([getAccounts(env), all(env, 'SELECT * FROM transactions WHERE date <= ? AND (from_account IS NOT NULL OR to_account IS NOT NULL)', [`${year}-12-31`], toTx), getValuations(env)]);
  const stocks = accounts.filter((a) => a.kind === '증권' && (!a.hidden || vals.has(a.id)));
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  const books = months.map((m) => accountBalances(stocks, txs, `${m}-31`));
  return {
    year,
    months,
    accounts: stocks.map((a) => ({
      id: a.id,
      name: a.name,
      book: books.map((b) => b.get(a.id) ?? 0),
      vals: Object.fromEntries((vals.get(a.id) ?? []).filter((v) => v.month.startsWith(year)).map((v) => [v.month, v.amount])),
    })),
  };
}

export async function setValuation(env: Env, user: User, input: { accountId?: unknown; month?: unknown; amount?: unknown; year?: unknown }) {
  const id = String(input.accountId ?? '');
  const month = String(input.month ?? '');
  if (!isMonth(month)) throw new UserError('달이 이상해요.');
  if (input.amount === null || input.amount === undefined || input.amount === '') await run(env, 'DELETE FROM account_valuations WHERE account_id = ? AND month = ?', [id, month]);
  else await run(env, 'INSERT INTO account_valuations (account_id, month, amount, updated_by, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (account_id, month) DO UPDATE SET amount = excluded.amount, updated_by = excluded.updated_by, updated_at = excluded.updated_at', [id, month, int(input.amount, '평가금액'), user.name, Date.now()]);
  await log(env, user.name, '평가금액', { id, month, amount: input.amount ?? null });
  return valuationsView(env, String(input.year ?? month.slice(0, 4)));
}

// ---------- 이번 달 고정지출 한꺼번에 넣기 (mode = batch) ----------

/** 그달 넣을 목록: 금액은 상환표 연결 → 그달 상환표, 아니면 지난번에 넣은 금액, 처음이면 등록 금액. 이미 넣은 건 표시 */
export async function batchView(env: Env, month: string) {
  if (!isMonth(month)) throw new UserError('달이 이상해요.');
  const items = (await getRecurring(env)).filter((r) => r.active && r.mode === 'batch' && r.startMonth <= month && (!r.endMonth || r.endMonth >= month));
  const loanOn = (await getSetting(env, 'feature_loan')) === '1';
  const out = [];
  for (const r of items) {
    const added = await first(env, 'SELECT id, date, amount FROM transactions WHERE recurring_id = ? AND date >= ? AND date <= ? LIMIT 1', [r.id, `${month}-01`, `${month}-31`], (x) => ({ id: String(x.id), date: String(x.date), amount: Number(x.amount) }));
    let amount = r.amount;
    let from = '등록 금액';
    const last = await first(env, 'SELECT amount, date FROM transactions WHERE recurring_id = ? AND date < ? ORDER BY date DESC LIMIT 1', [r.id, `${month}-01`], (x) => ({ amount: Number(x.amount), date: String(x.date) }));
    if (last) (amount = last.amount), (from = `${Number(last.date.slice(5, 7))}월 금액`);
    if (loanOn && r.loanAccount && r.loanPart) {
      const s = await first(env, 'SELECT principal, interest FROM loan_schedule WHERE account_id = ? AND month = ?', [r.loanAccount, month], (x) => ({ p: Number(x.principal), i: Number(x.interest) }));
      if (s) (amount = r.loanPart === 'principal' ? s.p : s.i), (from = '상환표');
    }
    out.push({ ...r, suggest: amount, suggestFrom: from, added });
  }
  return { month, items: out };
}

export async function saveBatch(env: Env, user: User, input: { month?: unknown; date?: unknown; items?: unknown }) {
  const month = String(input.month ?? '');
  const date = String(input.date ?? '');
  if (!isMonth(month) || !isDate(date) || !date.startsWith(month)) throw new UserError('날짜는 그 달 안에서 골라 주세요.');
  const want = new Map((Array.isArray(input.items) ? input.items : []).map((x: Record<string, unknown>) => [String(x.id), Math.round(Number(x.amount))] as const));
  const view = await batchView(env, month);
  const now = Date.now();
  const todo = view.items.filter((r) => want.has(r.id) && !r.added && Number.isSafeInteger(want.get(r.id)) && want.get(r.id)! > 0);
  if (!todo.length) throw new UserError('넣을 항목이 없어요.');
  await env.DB.batch(
    todo.flatMap((r) => [
      env.DB.prepare('INSERT INTO transactions (id, date, title, amount, category_id, from_account, to_account, memo, recurring_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, \'\', ?, ?, ?, ?)').bind(newId(), date, r.title, want.get(r.id)!, r.categoryId, r.fromAccount, r.toAccount, r.id, user.name, now, now),
      // 목록 금액도 이번 금액으로 (노션 목록을 고쳐 두던 것처럼)
      env.DB.prepare('UPDATE recurring SET amount = ? WHERE id = ?').bind(want.get(r.id)!, r.id),
    ]),
  );
  await log(env, user.name, '고정지출 한꺼번에 넣기', { month, date, n: todo.length, total: todo.reduce((s, r) => s + want.get(r.id)!, 0) });
  return batchView(env, month);
}

// ---------- 새해 로드맵 이어받기: 작년 로드맵 → 올해 로드맵 ----------

interface CarryPreview { from: string; age: number; planned: number; actual: number | null; actualIsOverride: boolean }
async function carryPreview(env: Env, y: number): Promise<CarryPreview | null> {
  const prev = await longRoadmap(env, String(y - 1));
  if (!prev.plan) return null;
  const calc = longCalc({ startYear: y - 1, span: prev.plan.span, ageStart: prev.plan.ageStart, startInvest: prev.plan.startInvest }, prev.years, prev.milestones);
  const at = calc.find((r) => r.y === y);
  const act = (await assetActuals(env, y - 1, y - 1))[0];
  return {
    from: String(y - 1),
    age: prev.plan.ageStart + 1,
    planned: at?.invest ?? 0, // 작년 로드맵대로라면 올해 시작 투자자산
    actual: act ? (act.override ?? act.auto) : null, // 작년 실제 연말 자산 (실제 줄)
    actualIsOverride: act ? act.override !== null : false,
  };
}

export async function carryLongRoadmap(env: Env, user: User, input: { year?: unknown; start?: unknown }) {
  const year = planYearOk(input.year);
  const y = Number(year);
  if (await first(env, 'SELECT 1 AS x FROM long_roadmaps WHERE plan_year = ?', [year], (r) => r.x)) throw new UserError(`${year} 로드맵이 이미 있어요.`);
  const prev = await longRoadmap(env, String(y - 1));
  if (!prev.plan) throw new UserError(`${y - 1} 로드맵이 없어요.`);
  const pv = (await carryPreview(env, y))!;
  const startInvest = input.start === 'actual' && pv.actual !== null ? pv.actual : pv.planned;
  const calc = longCalc({ startYear: y - 1, span: prev.plan.span, ageStart: prev.plan.ageStart, startInvest: prev.plan.startInvest }, prev.years, prev.milestones);
  const first0 = calc.find((r) => r.y === y);
  const now = Date.now();
  const stmts: D1PreparedStatement[] = [
    env.DB.prepare('INSERT INTO long_roadmaps (plan_year, span, age_start, start_invest, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(year, prev.plan.span, pv.age, startInvest, user.name, now),
    // 첫해는 이어 쓰던 값도 못 박아 둠 (저축액·수익률)
    env.DB.prepare('INSERT INTO long_roadmap_years (plan_year, y, saving, rate_bp, crisis, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(year, y, first0?.saving ?? 0, first0?.rateBp ?? 1000, prev.years.find((x) => x.y === y)?.crisis ? 1 : 0, user.name, now),
    ...prev.years.filter((x) => x.y > y).map((x) => env.DB.prepare('INSERT INTO long_roadmap_years (plan_year, y, saving, rate_bp, crisis, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(year, x.y, x.saving, x.rateBp, x.crisis ? 1 : 0, user.name, now)),
    ...prev.milestones.map((m) => env.DB.prepare('INSERT INTO long_roadmap_milestones (plan_year, amount) VALUES (?, ?)').bind(year, m)),
  ];
  // 글 줄과 올해부터의 칸 글
  for (const r of prev.rows) {
    const id = newId();
    stmts.push(env.DB.prepare('INSERT INTO long_roadmap_rows (id, plan_year, name, sort, created_at) VALUES (?, ?, ?, ?, ?)').bind(id, year, r.name, r.sort, now));
    for (const n of prev.notes.filter((n) => n.rowId === r.id && n.y >= y)) stmts.push(env.DB.prepare('INSERT INTO long_roadmap_notes (row_id, y, body, photo, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(id, n.y, n.body, n.photo, user.name, now));
  }
  await env.DB.batch(stmts);
  await log(env, user.name, '새해 로드맵 이어받기', { from: y - 1, to: y, start: input.start === 'actual' ? '실제' : '계획', startInvest });
  return longRoadmap(env, year);
}

// ---------- ④ 연간 결산 (한 해 돈 관리 회고) ----------

export async function annualView(env: Env, year: string) {
  if (!/^\d{4}$/.test(year)) throw new UserError('연도는 2026 같은 형식이어야 해요.');
  const nowMonth = today().slice(0, 7);
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`).filter((m) => m <= nowMonth);
  // 달마다 결산과 같은 계산 (예산·실제·합계)
  const views = await Promise.all(months.map((m) => monthView(env, m)));
  const monthsOut = views.map((v) => ({ month: v.month, ...v.totals }));
  // 카테고리별 1년 예산 vs 실제
  const cats = new Map<string, { category: Category; budget: number; actual: number; over: number; months: number[] }>();
  views.forEach((v, i) => {
    for (const l of v.lines) {
      const c = cats.get(l.category.id) ?? { category: l.category, budget: 0, actual: 0, over: 0, months: Array(12).fill(0) };
      c.budget += l.budget;
      c.actual += l.actual;
      if (l.budget > 0 && l.actual > l.budget) c.over += 1;
      c.months[Number(months[i].slice(5)) - 1] = l.actual;
      cats.set(l.category.id, c);
    }
  });
  // 다짐 1년치 (지킴·못 지킴)
  const pledges = (await Promise.all(months.map((m) => pledgesFor(env, m)))).flat();
  // 해마다 비교: 직접 적은 기록 + 앱 기록이 있는 해는 계산값
  const records = await all(env, 'SELECT * FROM year_records ORDER BY year', [], (r) => ({ year: String(r.year), saveTarget: r.save_target === null ? null : Number(r.save_target), saveActual: r.save_actual === null ? null : Number(r.save_actual), returnBp: r.return_bp === null ? null : Number(r.return_bp), endAssets: r.end_assets === null ? null : Number(r.end_assets), memo: String(r.memo ?? '') }));
  const short = await shortRoadmap(env, year);
  const included = short.rows.filter((r) => r.included);
  const savedApp = included.reduce((s, r) => s + r.actual.reduce((a, b) => a + b, 0), 0);
  const actualEnd = (await assetActuals(env, Number(year), Number(year)))[0];
  const app = { year, saveTarget: short.target || included.reduce((s, r) => s + r.plan.reduce((a, b) => a + b, 0), 0), saveActual: savedApp, endAssets: actualEnd ? actualEnd.override ?? actualEnd.auto : null };
  const notes = Object.fromEntries(await all(env, 'SELECT section, body FROM year_notes WHERE year = ?', [year], (r) => [String(r.section), String(r.body)] as const));
  return { year, months: monthsOut, categories: [...cats.values()], pledges, records, app, notes, upto: months.at(-1) ?? null };
}

export async function saveYearRecord(env: Env, user: User, input: Record<string, unknown>) {
  const year = String(input.year ?? '');
  if (!/^\d{4}$/.test(year)) throw new UserError('연도를 확인해 주세요.');
  const n = (v: unknown) => (v === null || v === undefined || v === '' ? null : int(v, '금액'));
  const bp = input.returnBp === null || input.returnBp === undefined || input.returnBp === '' ? null : Math.round(Number(input.returnBp));
  if (bp !== null && (!Number.isFinite(bp) || bp < -10000 || bp > 100000)) throw new UserError('수익률을 확인해 주세요.');
  await run(
    env,
    'INSERT INTO year_records (year, save_target, save_actual, return_bp, end_assets, memo, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (year) DO UPDATE SET save_target = excluded.save_target, save_actual = excluded.save_actual, return_bp = excluded.return_bp, end_assets = excluded.end_assets, memo = excluded.memo, updated_by = excluded.updated_by, updated_at = excluded.updated_at',
    [year, n(input.saveTarget), n(input.saveActual), bp, n(input.endAssets), text(input.memo, 300), user.name, Date.now()],
  );
  await log(env, user.name, '해마다 비교 기록', { year });
  return { ok: true };
}

export async function saveYearNote(env: Env, user: User, input: { year?: unknown; section?: unknown; body?: unknown }) {
  const year = String(input.year ?? '');
  const section = String(input.section ?? '');
  if (!/^\d{4}$/.test(year) || !['review', 'plan'].includes(section)) throw new UserError('칸이 이상해요.');
  await run(env, 'INSERT INTO year_notes (year, section, body, updated_by, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (year, section) DO UPDATE SET body = excluded.body, updated_by = excluded.updated_by, updated_at = excluded.updated_at', [year, section, text(input.body, 5000), user.name, Date.now()]);
  return { ok: true };
}

/** 가계부 이름 바꾸기 (예: 다희네 가계부) — 위 메뉴·카페 이미지에 나옴 */
export async function setHousehold(env: Env, user: User, name: unknown) {
  const n = text(name, 30);
  if (!n) throw new UserError('가계부 이름을 넣어 주세요.');
  await setSetting(env, 'household', n);
  await log(env, user.name, '가계부 이름', n);
  return { household: n };
}

/** 관리자가 가족의 비밀번호를 새로 정해 주기 (가족이 잊었을 때) — 관리자 자신은 '내 비밀번호 바꾸기'로 */
export async function resetMemberPassword(env: Env, owner: User, input: { userId?: unknown; password?: unknown }) {
  if (owner.role !== 'owner') throw new UserError('관리자만 할 수 있어요.');
  const id = String(input.userId ?? '');
  const target = (await getUsers(env)).find((u) => u.id === id);
  if (!target || target.role === 'owner') throw new UserError('가족을 골라 주세요.');
  if (String(input.password ?? '').length < 6) throw new UserError('비밀번호는 6자 이상이에요.');
  const { hash, salt } = await hashPassword(String(input.password));
  await env.DB.batch([env.DB.prepare('UPDATE users SET pw_hash = ?, pw_salt = ? WHERE id = ?').bind(hash, salt, id), env.DB.prepare('DELETE FROM login_fails').bind()]);
  await log(env, owner.name, 'user.password.reset', { name: target.name });
  return { ok: true };
}

// ---------- 노션에서 가져온 것 정리 ----------
// (노션 가져오기 기능은 2026-11-15에 뺐다. 그때 가져온 가계부를 정리할 수 있게 지우기만 남김)
const NOTION = '노션 가져오기';

export async function notionImportStatus(env: Env) {
  const v = await getSetting(env, 'notion_imported');
  return { imported: v && v !== 'manual' ? v : null };
}

/** 노션에서 가져온 것 지우기: 가져온 거래·머니노트·고정지출 목록(아직 안 쓴 것)만. 통장·카테고리·예산은 남김 */
export async function clearNotionImport(env: Env, user: User) {
  if (user.role !== 'owner') throw new UserError('관리자만 할 수 있어요.');
  const v = await getSetting(env, 'notion_imported');
  if (!v || v === 'manual') throw new UserError('노션에서 가져온 기록이 없어요.');
  const n = (await first(env, 'SELECT COUNT(*) AS n FROM transactions WHERE created_by = ?', [NOTION], (r) => Number(r.n))) ?? 0;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM transactions WHERE created_by = ?').bind(NOTION),
    env.DB.prepare('DELETE FROM money_notes WHERE created_by = ?').bind(NOTION),
    env.DB.prepare("DELETE FROM recurring WHERE memo = '노션 고정지출목록에서 옮김' AND id NOT IN (SELECT recurring_id FROM transactions WHERE recurring_id IS NOT NULL)").bind(),
    env.DB.prepare("DELETE FROM settings WHERE key = 'notion_imported'").bind(),
  ]);
  await log(env, user.name, 'notion.import.clear', { removed: n });
  return { ok: true, removed: n };
}
