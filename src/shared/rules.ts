// 가계부 계산 규칙: 통장 잔액, 달 합계, 예산 판정, 고정지출 자동 입력 날짜

import { dayInMonth, nextMonth } from './dates';
import type { Account, Category, Group, Recurring, Tx } from './types';

export const won = (n: number) => Math.round(n).toLocaleString('ko-KR');

/** 금액 입력 글을 숫자로: "84,000원" → 84000. 숫자가 없으면 null */
export function parseAmount(text: string): number | null {
  // '245,600.00'처럼 소수점이 붙어 오면 소수 부분은 버림 (원 단위)
  const digits = String(text).replace(/(\d)\.\d+/g, '$1').replace(/[^\d]/g, '');
  if (!digits) return null;
  const n = Number(digits);
  return Number.isSafeInteger(n) ? n : null;
}

/** 마이너스도 되는 금액 (카드 시작 잔액 등): 앞에 - 가 있으면 음수 */
export function parseSignedAmount(text: string): number | null {
  const n = parseAmount(text);
  if (n === null) return null;
  return /^\s*[-−]/.test(String(text)) ? -n : n;
}

// ---------- 통장 잔액 ----------

/** 통장 잔액 = 시작 잔액 + 들어온 돈 − 나간 돈 (카드는 쓰면 마이너스로 쌓임) */
export function accountBalances(accounts: Account[], txs: Tx[], untilDate?: string): Map<string, number> {
  const bal = new Map(accounts.map((a) => [a.id, a.startBalance]));
  for (const t of txs) {
    if (untilDate && t.date > untilDate) continue;
    if (t.fromAccount && bal.has(t.fromAccount)) bal.set(t.fromAccount, bal.get(t.fromAccount)! - t.amount);
    if (t.toAccount && bal.has(t.toAccount)) bal.set(t.toAccount, bal.get(t.toAccount)! + t.amount);
  }
  return bal;
}

// ---------- 달 합계 ----------

export interface MonthTotals {
  inc: number;
  var: number;
  fix: number;
  spc: number; // 특별지출
  sav: number;
  inv: number;
  spending: number; // var + fix + spc
  left: number; // 수입 − (지출 + 저축 + 투자)
  saveRate: number | null; // (저축+투자) / 수입
}

/** 저축·투자 통장끼리 옮긴 돈은 새로 모은 돈이 아니다 (예: 투자대기 → 미국주식). 이런 통장에서 나간 저축·투자는 합계에서 뺀다. */
export const POCKET_KINDS = ['적금', '목돈', '증권', '청약', '투자', '대출'];

export function monthTotals(txs: Tx[], categories: Category[], month: string, accounts: { id: string; kind: string }[] = []): MonthTotals {
  const grpOf = new Map(categories.map((c) => [c.id, c.grp]));
  const pocket = new Set(accounts.filter((a) => POCKET_KINDS.includes(a.kind)).map((a) => a.id));
  const sum: Record<Group, number> = { var: 0, fix: 0, spc: 0, inc: 0, sav: 0, inv: 0 };
  for (const t of txs) {
    if (!t.date.startsWith(month) || !t.categoryId) continue;
    const g = grpOf.get(t.categoryId);
    if (!g) continue;
    if ((g === 'sav' || g === 'inv') && t.fromAccount && pocket.has(t.fromAccount)) continue;
    sum[g] += t.amount;
  }
  const spending = sum.var + sum.fix + sum.spc;
  return {
    ...sum,
    spending,
    left: sum.inc - spending - sum.sav - sum.inv,
    saveRate: sum.inc > 0 ? (sum.sav + sum.inv) / sum.inc : null,
  };
}

// ---------- 예산 판정 ----------

export type Verdict = 'none' | 'good' | 'ok' | 'warn' | 'bad';
export interface BudgetLine {
  category: Category;
  budget: number;
  actual: number;
  diff: number; // actual − budget (지출: +면 초과)
  ratio: number | null; // actual / budget
  verdict: Verdict;
}

/** 판정 글자는 어디서나 같은 모양: 금액 먼저, 퍼센트는 괄호 — '99,280원 초과 (331%)' / '49,515원 절약 (8%)' */
export function verdictText(budget: number, actual: number): string {
  if (budget <= 0) return actual > 0 ? '예산 없음' : '—';
  const d = actual - budget;
  if (d === 0) return '딱 맞음';
  const p = Math.round((Math.abs(d) / budget) * 100);
  return `${won(Math.abs(d))}원 ${d > 0 ? '초과' : '절약'} (${p}%)`;
}

/** 달성률 칸: 퍼센트만 — '331% 초과' / '8% 절약' (금액은 옆 잔액 칸에서) */
export function rateText(budget: number, actual: number): string {
  if (budget <= 0) return actual > 0 ? '예산 없음' : '—';
  const d = actual - budget;
  if (d === 0) return '딱 맞음';
  return `${Math.round((Math.abs(d) / budget) * 100)}% ${d > 0 ? '초과' : '절약'}`;
}

/** 판정 기준 (지출): 예산 안 ✅ / 기준% 까지 초과 ⚠ / 그 이상 🚨. 예산 0이면 판정 없음 */
export function verdictOf(budget: number, actual: number, warnPct = 10): Verdict {
  if (budget <= 0) return actual > 0 ? 'warn' : 'none';
  if (actual <= budget) return actual < budget ? 'good' : 'ok';
  return (actual / budget - 1) * 100 <= warnPct ? 'warn' : 'bad';
}

export function budgetLines(
  txs: Tx[],
  categories: Category[],
  month: string,
  budgetOf: (c: Category) => number,
  warnPct = 10,
  accounts: { id: string; kind: string }[] = [],
): BudgetLine[] {
  const pocket = new Set(accounts.filter((a) => POCKET_KINDS.includes(a.kind)).map((a) => a.id));
  const grpOf = new Map(categories.map((c) => [c.id, c.grp]));
  const actual = new Map<string, number>();
  for (const t of txs) {
    if (!t.date.startsWith(month) || !t.categoryId) continue;
    const g = grpOf.get(t.categoryId);
    if ((g === 'sav' || g === 'inv') && t.fromAccount && pocket.has(t.fromAccount)) continue; // 저축 통장끼리 옮긴 돈은 빼기
    actual.set(t.categoryId, (actual.get(t.categoryId) ?? 0) + t.amount);
  }
  return categories
    .filter((c) => !c.hidden || actual.has(c.id))
    .map((c) => {
      const b = budgetOf(c);
      const a = actual.get(c.id) ?? 0;
      return { category: c, budget: b, actual: a, diff: a - b, ratio: b > 0 ? a / b : null, verdict: verdictOf(b, a, warnPct) };
    });
}

// ---------- 고정지출 자동 입력 ----------

/** 이 고정 항목이 fromMonth ~ toMonth 사이에 만들어야 하는 거래 날짜들 */
export function recurringDates(r: Recurring, fromMonth: string, toMonth: string): string[] {
  if (!r.active || r.mode === 'batch') return []; // 한꺼번에 넣기 항목은 버튼으로만
  const out: string[] = [];
  const start = r.startMonth > fromMonth ? r.startMonth : fromMonth;
  for (let m = start; m <= toMonth; m = nextMonth(m)) {
    if (r.endMonth && m > r.endMonth) break;
    out.push(dayInMonth(m, r.day));
  }
  return out;
}

// ---------- 처음 설치할 때 기본 카테고리 ----------

export const DEFAULT_CATEGORIES: { name: string; grp: Group; icon: string; moneynote?: boolean }[] = [
  { name: '식재료', grp: 'var', icon: 'shopping-cart' },
  { name: '외식 간식', grp: 'var', icon: 'utensils' },
  { name: '생활필수품', grp: 'var', icon: 'toilet-roll' },
  { name: '의류/미용', grp: 'var', icon: 'sparkles' },
  { name: '병원비', grp: 'var', icon: 'stethoscope' },
  { name: '교육·자기계발', grp: 'var', icon: 'pencil' },
  { name: '취미 문화', grp: 'var', icon: 'film' },
  { name: '경조사·명절', grp: 'var', icon: 'cake', moneynote: true },
  { name: '세금·보험', grp: 'var', icon: 'landmark', moneynote: true },
  { name: '여행', grp: 'var', icon: 'luggage', moneynote: true },
  { name: '계절 옷', grp: 'var', icon: 'shirt', moneynote: true },
  { name: '기타', grp: 'var', icon: 'package' },
  { name: '주거', grp: 'fix', icon: 'house' },
  { name: '통신비', grp: 'fix', icon: 'smartphone' },
  { name: '보험료', grp: 'fix', icon: 'shield' },
  { name: '교통·자동차', grp: 'fix', icon: 'car' },
  { name: '대출이자', grp: 'fix', icon: 'receipt' },
  { name: '용돈', grp: 'fix', icon: 'wallet' },
  { name: '월급', grp: 'inc', icon: 'briefcase' },
  { name: '부수입', grp: 'inc', icon: 'banknote' },
  { name: '이자·배당', grp: 'inc', icon: 'coins' },
  { name: '비상금', grp: 'sav', icon: 'piggy-bank' },
  { name: '적금·청약', grp: 'sav', icon: 'key-round' },
  { name: '대출상환', grp: 'sav', icon: 'trending-down' },
  { name: '주식', grp: 'inv', icon: 'chart-column' },
];

// ---------- 단기로드맵 (올해 저축 목표 vs 실제) ----------

/** 로드맵은 만 원 단위: 12,345,678원 → '1,235' */
export const man = (n: number) => Math.round(n / 10000).toLocaleString('ko-KR');

export interface ShortRow {
  categoryId: string;
  name: string;
  grp: Group;
  plan: number[]; // 12달 계획 (= 그달 저축·투자 예산), 원
  actual: number[]; // 12달 실제 (저축 통장끼리 옮긴 돈 뺌), 원
}

export interface ShortSummary {
  plan: number[]; // 달마다 계획 합계
  actual: (number | null)[]; // 달마다 실제 합계 (아직 안 본 달은 null)
  diff: (number | null)[]; // 실제 − 계획
  cumRate: (number | null)[]; // 누적 실제 / 올해 목표
  target: number; // 올해 목표 (정한 게 없으면 계획 합계)
  planYear: number;
  actualYear: number; // upto 달까지 실제 합계
  remaining: number; // 목표까지 남은 돈 (0 아래로 안 감)
  leftMonths: number;
  perMonth: number | null; // 남은 달에 달마다 모아야 할 돈
  pace: number | null; // 지금 속도면 연말 예상 (달 평균 × 12)
}

/** upto = 실제를 보여 줄 마지막 달 (1~12, 0이면 아직 없음) */
export function shortSummary(rows: ShortRow[], upto: number, target = 0): ShortSummary {
  const plan = Array.from({ length: 12 }, (_, i) => rows.reduce((n, r) => n + (r.plan[i] ?? 0), 0));
  const actualAll = Array.from({ length: 12 }, (_, i) => rows.reduce((n, r) => n + (r.actual[i] ?? 0), 0));
  const planYear = plan.reduce((a, b) => a + b, 0);
  const goal = target > 0 ? target : planYear;
  let cum = 0;
  const actual: (number | null)[] = [];
  const diff: (number | null)[] = [];
  const cumRate: (number | null)[] = [];
  for (let i = 0; i < 12; i++) {
    if (i < upto) {
      cum += actualAll[i];
      actual.push(actualAll[i]);
      diff.push(actualAll[i] - plan[i]);
      cumRate.push(goal > 0 ? cum / goal : null);
    } else {
      actual.push(null);
      diff.push(null);
      cumRate.push(null);
    }
  }
  const remaining = Math.max(0, goal - cum);
  const leftMonths = 12 - upto;
  return {
    plan,
    actual,
    diff,
    cumRate,
    target: goal,
    planYear,
    actualYear: cum,
    remaining,
    leftMonths,
    perMonth: leftMonths > 0 ? remaining / leftMonths : null,
    pace: upto > 0 ? (cum / upto) * 12 : null,
  };
}

// ---------- 중장기로드맵 (30년) ----------

export interface LongYearInput {
  y: number;
  saving: number | null; // 원, null = 앞 해와 같음
  rateBp: number | null; // 만분율 (1000 = 10%), null = 앞 해와 같음
  crisis?: boolean; // 위기 연도 (그해만, 이어 쓰지 않음)
}
export interface LongYear {
  y: number;
  age: number;
  invest: number; // 그해 시작 투자자산
  saving: number;
  total: number; // 투자자산 + 저축액
  rateBp: number;
  savingSet: boolean; // 그해에 직접 적은 값인지 (아니면 앞 해 값을 이어 씀)
  rateSet: boolean;
  milestones: number[]; // 이 해에 처음 넘은 이정표
  crisis: boolean;
}

/** 합계 = 투자자산 + 저축액, 다음 해 투자자산 = 합계 × (1 + 수익률). 비어 있는 해는 앞 해 저축액·수익률을 이어 씀 */
export function longCalc(p: { startYear: number; span: number; ageStart: number; startInvest: number }, inputs: LongYearInput[], milestones: number[] = []): LongYear[] {
  const byY = new Map(inputs.map((x) => [x.y, x]));
  const ms = [...milestones].sort((a, b) => a - b);
  let mi = 0;
  let invest = p.startInvest;
  let saving = 0;
  let rateBp = 1000;
  const out: LongYear[] = [];
  for (let i = 0; i < p.span; i++) {
    const y = p.startYear + i;
    const inp = byY.get(y);
    if (inp?.saving !== null && inp?.saving !== undefined) saving = inp.saving;
    if (inp?.rateBp !== null && inp?.rateBp !== undefined) rateBp = inp.rateBp;
    const total = invest + saving;
    const hit: number[] = [];
    while (mi < ms.length && total >= ms[mi]) hit.push(ms[mi++]);
    out.push({ y, age: p.ageStart + i, invest, saving, total, rateBp, savingSet: inp?.saving != null, rateSet: inp?.rateBp != null, milestones: hit, crisis: !!inp?.crisis });
    invest = Math.round((total * (10000 + rateBp)) / 10000);
  }
  return out;
}

/** 이정표 글자: 200,000,000 → '2억', 50,000,000 → '5천만' */
export const eok = (n: number) => (n >= 1e8 ? `${+(n / 1e8).toFixed(1)}억` : `${Math.round(n / 1e7)}천만`);

/** 이정표마다 처음 넘는 해 (없으면 null) — 두 버전 비교용 */
export function milestoneYears(rows: LongYear[], milestones: number[]): Map<number, number | null> {
  const out = new Map<number, number | null>(milestones.map((m) => [m, null]));
  for (const r of rows) for (const m of r.milestones) out.set(m, r.y);
  return out;
}

export interface MilestoneShift {
  amount: number;
  before: number | null;
  after: number | null;
  diff: number | null; // after − before (해), +면 늦어짐
}
export function compareMilestones(now: LongYear[], prev: LongYear[], milestones: number[]): MilestoneShift[] {
  const a = milestoneYears(now, milestones);
  const b = milestoneYears(prev, milestones);
  return milestones.map((m) => {
    const after = a.get(m) ?? null;
    const before = b.get(m) ?? null;
    return { amount: m, before, after, diff: after !== null && before !== null ? after - before : null };
  });
}

// ---------- 대출 상환표 붙여넣기 ----------

export interface LoanRow {
  month: string; // 2026-11
  payment: number;
  principal: number;
  interest: number;
  balance: number | null;
}

const monthOfCell = (s: string): string | null => {
  const m = s.trim().match(/^(\d{4})\s*[-./년]\s*(\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, '0')}` : null;
};
const numOfCell = (s: string): number | null => {
  const t = s.replace(/[,\s원]/g, '');
  if (!/^-?\d+$/.test(t)) return null;
  return Number(t);
};
const fieldOf = (label: string): keyof Omit<LoanRow, 'month'> | null => {
  const l = label.replace(/\s/g, '');
  if (/남은|잔액|잔금/.test(l)) return 'balance';
  if (/원금/.test(l)) return 'principal';
  if (/이자/.test(l)) return 'interest';
  if (/납부금|납입금|상환금|월납|합계/.test(l)) return 'payment';
  return null;
};

/** 엑셀·Numbers에서 복사한 표(탭으로 나뉜 글)를 달별 줄로. 날짜가 가로(1월~12월이 옆으로)든 세로든 읽음 */
export function parseLoanTable(text: string): LoanRow[] {
  const rows = text
    .split(/\r?\n/)
    .map((l) => l.split('\t'))
    .filter((r) => r.some((c) => c.trim()));
  const out = new Map<string, LoanRow>();
  const get = (m: string) => out.get(m) ?? (out.set(m, { month: m, payment: 0, principal: 0, interest: 0, balance: null }), out.get(m)!);
  // 가로형: 날짜가 줄지어 있는 머리 줄 찾기
  const head = rows.findIndex((r) => r.filter((c) => monthOfCell(c)).length >= 2);
  if (head >= 0 && rows[head].filter((c) => monthOfCell(c)).length >= 2 && !monthOfCell(rows[head + 1]?.[0] ?? '')) {
    const months = rows[head].map((c) => monthOfCell(c));
    for (const r of rows.slice(head + 1)) {
      const f = fieldOf(r.find((c) => c.trim() && numOfCell(c) === null) ?? '');
      if (!f) continue;
      r.forEach((c, i) => {
        const m = months[i];
        const n = numOfCell(c);
        if (m && n !== null) (get(m) as unknown as Record<string, number>)[f] = n;
      });
    }
  } else {
    // 세로형: 첫 칸이 날짜, 머리 줄에 항목 이름
    const hi = rows.findIndex((r) => r.filter((c) => fieldOf(c)).length >= 2);
    const fields = hi >= 0 ? rows[hi].map((c) => fieldOf(c)) : [];
    for (const r of rows) {
      const mi = r.findIndex((c) => monthOfCell(c));
      if (mi < 0) continue;
      const m = monthOfCell(r[mi])!;
      r.forEach((c, i) => {
        const f = fields[i];
        const n = numOfCell(c);
        if (f && n !== null && i !== mi) (get(m) as unknown as Record<string, number>)[f] = n;
      });
    }
  }
  return [...out.values()].filter((r) => r.principal || r.interest || r.payment).sort((a, b) => a.month.localeCompare(b.month));
}

// ---------- 주식 평가금액 ----------

/** 그달 말 평가 기준 금액: 그달(또는 그 전) 가장 최근 평가금액 + 그 뒤로 넣은 돈. 평가금액이 없으면 넣은 돈(통장 잔액) 그대로 */
export function valuedAt(bookAt: (month: string) => number, vals: { month: string; amount: number }[], month: string): { value: number; from: string | null } {
  let last: { month: string; amount: number } | null = null;
  for (const v of vals) if (v.month <= month && (!last || v.month > last.month)) last = v;
  if (!last) return { value: bookAt(month), from: null };
  return { value: last.amount + bookAt(month) - bookAt(last.month), from: last.month };
}

/** '남은 돈'(수입 − 지출 − 저축·투자)을 알기 쉬운 이름으로: 0 이상이면 남은 돈, 마이너스면 통장에서 더 꺼내 쓴 돈 (금액은 부호 없이) */
export const leftLabel = (v: number) => (v >= 0 ? '남은 돈' : '모자란 돈');
export const LEFT_HINT = '수입 − 지출 − 저축·투자';
