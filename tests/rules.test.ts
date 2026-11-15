import { describe, expect, it } from 'vitest';
import { addMonths, dayInMonth, lastDay } from '../src/shared/dates';
import { accountBalances, budgetLines, compareMilestones, parseLoanTable, valuedAt, eok, longCalc, man, monthTotals, parseAmount, recurringDates, shortSummary, verdictOf } from '../src/shared/rules';
import type { Account, Category, Recurring, Tx } from '../src/shared/types';

const acc = (id: string, startBalance = 0): Account => ({ id, name: id, kind: '은행', startBalance, sort: 0, hidden: false });
const cat = (id: string, grp: Category['grp'], budget = 0): Category => ({ id, name: id, grp, icon: '', moneynote: false, moneynoteAdd: false, inRoadmap: true, budget, sort: 0, hidden: false });
let n = 0;
const tx = (date: string, amount: number, x: Partial<Tx> = {}): Tx => ({
  id: `t${++n}`, date, title: '', amount, categoryId: null, fromAccount: null, toAccount: null, memo: '', unnecessary: false, recurringId: null, createdBy: null, ...x,
});

describe('날짜', () => {
  it('달 더하기·말일', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(lastDay('2026-02')).toBe(28);
    expect(dayInMonth('2026-02', 31)).toBe('2026-02-28');
  });
});

describe('금액 입력', () => {
  it('쉼표·원 글자를 빼고 숫자로', () => {
    expect(parseAmount('84,000원')).toBe(84000);
    expect(parseAmount('abc')).toBeNull();
  });
});

describe('통장 잔액', () => {
  it('시작 잔액 + 입금 − 출금, 이체는 양쪽이 같이 바뀐다', () => {
    const accounts = [acc('생활비', 1_000_000), acc('투자대기', 0), acc('카드')];
    const txs = [
      tx('2026-11-01', 3_000_000, { toAccount: '생활비' }), // 월급
      tx('2026-11-02', 500_000, { fromAccount: '생활비', toAccount: '투자대기' }), // 이체
      tx('2026-11-03', 84_000, { fromAccount: '카드' }), // 카드 결제
    ];
    const b = accountBalances(accounts, txs);
    expect(b.get('생활비')).toBe(3_500_000);
    expect(b.get('투자대기')).toBe(500_000);
    expect(b.get('카드')).toBe(-84_000);
  });
});

describe('달 합계', () => {
  it('대분류별 합계와 남은 돈·저축률', () => {
    const cats = [cat('월급', 'inc'), cat('식재료', 'var'), cat('통신비', 'fix'), cat('청약', 'sav'), cat('주식', 'inv')];
    const txs = [
      tx('2026-11-01', 5_000_000, { categoryId: '월급' }),
      tx('2026-11-03', 600_000, { categoryId: '식재료' }),
      tx('2026-11-15', 100_000, { categoryId: '통신비' }),
      tx('2026-11-20', 1_000_000, { categoryId: '청약' }),
      tx('2026-11-21', 500_000, { categoryId: '주식' }),
      tx('2026-10-31', 999_999, { categoryId: '식재료' }), // 다른 달
      tx('2026-11-05', 300_000, {}), // 이체 (카테고리 없음) → 합계에 안 들어감
    ];
    const t = monthTotals(txs, cats, '2026-11');
    expect(t).toMatchObject({ inc: 5_000_000, var: 600_000, fix: 100_000, sav: 1_000_000, inv: 500_000, spending: 700_000, left: 2_800_000 });
    expect(t.saveRate).toBeCloseTo(0.3);
  });
  it('저축·투자 통장끼리 옮긴 돈은 두 번 세지 않는다 (투자대기 → 딜투자, 대출금으로 투자)', () => {
    const cats = [cat('투자대기', 'sav'), cat('딜', 'inv')];
    const accounts = [{ id: '공과금', kind: '은행' }, { id: '투자대기통장', kind: '목돈' }, { id: '보험대출', kind: '대출' }];
    const txs = [
      tx('2026-02-01', 1_000_000, { categoryId: '투자대기', fromAccount: '공과금', toAccount: '투자대기통장' }),
      tx('2026-02-26', 4_200_000, { categoryId: '딜', fromAccount: '공과금' }),
      tx('2026-02-26', 2_800_000, { categoryId: '딜', fromAccount: '투자대기통장' }),
      tx('2026-02-27', 4_500_000, { categoryId: '딜', fromAccount: '보험대출' }),
    ];
    const t = monthTotals(txs, cats, '2026-02', accounts);
    expect(t.sav).toBe(1_000_000);
    expect(t.inv).toBe(4_200_000);
  });
});

describe('예산 판정', () => {
  it('예산 안 ✅, 10%까지 ⚠, 넘으면 🚨, 예산 없는데 쓰면 ⚠', () => {
    expect(verdictOf(500_000, 450_000)).toBe('good');
    expect(verdictOf(500_000, 500_000)).toBe('ok');
    expect(verdictOf(500_000, 540_000)).toBe('warn');
    expect(verdictOf(500_000, 600_000)).toBe('bad');
    expect(verdictOf(0, 30_000)).toBe('warn');
    expect(verdictOf(0, 0)).toBe('none');
  });
  it('식비 50만 예산에 60만 → 🚨, 차이 +10만', () => {
    const food = cat('식비', 'var', 500_000);
    const [line] = budgetLines([tx('2026-11-10', 600_000, { categoryId: '식비' })], [food], '2026-11', (c) => c.budget);
    expect(line).toMatchObject({ actual: 600_000, diff: 100_000, verdict: 'bad' });
  });
});

describe('고정지출 자동 입력', () => {
  const r: Recurring = { id: 'r1', title: '통신비', categoryId: 'c', amount: 98_000, day: 31, fromAccount: 'a', toAccount: null, startMonth: '2026-11', endMonth: '2027-02', active: true, memo: '' };
  it('시작 달부터 끝 달까지 매달 하루씩, 말일 보정', () => {
    expect(recurringDates(r, '2026-10', '2027-06')).toEqual(['2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28']);
  });
  it('쉬는 항목은 만들지 않는다', () => {
    expect(recurringDates({ ...r, active: false }, '2026-11', '2026-12')).toEqual([]);
  });
});

describe('단기로드맵', () => {
  const row = (plan: number, actual: number[]) => ({ categoryId: 'x', name: 'x', grp: 'sav' as const, plan: Array(12).fill(plan), actual: [...actual, ...Array(12 - actual.length).fill(0)] });
  it('계획 합계·차액·누적 달성률, 아직 안 본 달은 비움', () => {
    const s = shortSummary([row(2_000_000, [2_000_000, 1_000_000]), row(1_000_000, [1_000_000, 1_000_000])], 2);
    expect(s.plan[0]).toBe(3_000_000);
    expect(s.target).toBe(36_000_000); // 목표를 안 정하면 계획 합계
    expect(s.actual.slice(0, 3)).toEqual([3_000_000, 2_000_000, null]);
    expect(s.diff.slice(0, 2)).toEqual([0, -1_000_000]);
    expect(s.cumRate[1]).toBeCloseTo(5 / 36);
    expect(s.remaining).toBe(31_000_000);
    expect(s.perMonth).toBe(3_100_000); // 남은 10달
    expect(s.pace).toBe(30_000_000); // 달 평균 250만 × 12
  });
  it('정한 목표가 있으면 그걸로, 넘치면 남은 돈 0', () => {
    const s = shortSummary([row(0, Array(12).fill(1_000_000))], 12, 10_000_000);
    expect(s.target).toBe(10_000_000);
    expect(s.remaining).toBe(0);
    expect(s.perMonth).toBeNull();
    expect(man(12_345_678)).toBe('1,235');
  });
});

describe('중장기로드맵', () => {
  const M = 10000; // 만 원
  it('선생님 예시: 2029 위기 −20% (투자자산 12,000 → 17,600 → 25,080 → 33,308 → 30,806 → 39,607)', () => {
    const r = longCalc({ startYear: 2026, span: 6, ageStart: 42, startInvest: 12000 * M }, [
      { y: 2026, saving: 4000 * M, rateBp: 1000 },
      { y: 2027, saving: 5200 * M, rateBp: null },
      { y: 2029, saving: null, rateBp: -2000 },
      { y: 2030, saving: null, rateBp: 1000 },
    ], [2e8, 3e8]);
    expect(r.map((x) => Math.round(x.invest / M))).toEqual([12000, 17600, 25080, 33308, 30806, 39607]);
    expect(r[0].total).toBe(16000 * M);
    expect(r[2].saving).toBe(5200 * M); // 앞 해 값 이어 씀
    expect(r[2].savingSet).toBe(false);
    expect(r[3].rateBp).toBe(-2000);
    expect(r.map((x) => x.age)).toEqual([42, 43, 44, 45, 46, 47]);
    expect(r[1].milestones).toEqual([2e8]); // 2027 합계 22,800 → 2억
    expect(r[2].milestones).toEqual([3e8]); // 2028 합계 30,280 → 3억
    expect(eok(2e8)).toBe('2억');
    expect(eok(15e8)).toBe('15억');
  });
});

describe('로드맵 버전 비교', () => {
  it('이정표가 몇 년 늦어졌는지', () => {
    const base = { startYear: 2026, span: 10, ageStart: 42, startInvest: 12000e4 };
    const ms = [2e8, 3e8, 6e8];
    const prev = longCalc(base, [{ y: 2026, saving: 4000e4, rateBp: 1000 }], ms);
    const now = longCalc(base, [{ y: 2026, saving: 4000e4, rateBp: 1000 }, { y: 2027, saving: null, rateBp: -2000 }, { y: 2028, saving: null, rateBp: 1000 }], ms);
    const c = compareMilestones(now, prev, ms);
    expect(c[0]).toEqual({ amount: 2e8, before: 2027, after: 2027, diff: 0 });
    expect(c[1].diff).toBeGreaterThan(0); // 위기로 3억이 늦어짐
  });
});

describe('대출 상환표 붙여넣기', () => {
  it('선생님 Numbers 표 (날짜가 가로)', () => {
    const t = [
      '\t주택담보대출-상환계획표-2026',
      '항목\t2026-01-01\t2026-02-01\t2026-11-01',
      '월 납부금\t1,764,963\t1,764,963\t1,764,963',
      '원금 납부액\t340,089\t341,327\t352,678',
      '이자 납부액\t1,424,874\t1,423,635\t1,412,284',
      '남은 대출금\t390,929,628\t390,588,300\t387,459,875',
    ].join('\n');
    const r = parseLoanTable(t);
    expect(r.length).toBe(3);
    expect(r[2]).toEqual({ month: '2026-11', payment: 1764963, principal: 352678, interest: 1412284, balance: 387459875 });
    expect(r[0].principal + r[0].interest).toBe(r[0].payment);
  });
  it('세로형 표도', () => {
    const t = '날짜\t원금\t이자\t잔액\n2027.1.1\t355,256\t1,409,707\t386,750,656\n2027.2.1\t356,552\t1,408,411\t386,394,104';
    const r = parseLoanTable(t);
    expect(r.map((x) => x.month)).toEqual(['2027-01', '2027-02']);
    expect(r[1].interest).toBe(1408411);
  });
});

describe('주식 평가금액', () => {
  // 선생님 예: 넣은 돈 800 → 10월에 50 더 넣어 850, 10월 말 평가 700, 11월에 50 더 넣음
  const book: Record<string, number> = { '2026-09': 800, '2026-10': 850, '2026-11': 900 };
  const bookAt = (m: string) => book[m];
  const vals = [{ month: '2026-10', amount: 700 }];
  it('평가금액 적은 달은 그대로, 없는 달은 넣은 돈', () => {
    expect(valuedAt(bookAt, vals, '2026-10')).toEqual({ value: 700, from: '2026-10' });
    expect(valuedAt(bookAt, vals, '2026-09')).toEqual({ value: 800, from: null });
  });
  it('뒤 달은 최근 평가금액 + 그 뒤 넣은 돈', () => {
    expect(valuedAt(bookAt, vals, '2026-11').value).toBe(750);
  });
});
