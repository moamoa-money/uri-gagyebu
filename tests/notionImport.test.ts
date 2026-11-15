import { describe, expect, it } from 'vitest';
import { buildPlan, parseCsv, relNames, toDate } from '../src/shared/notionImport';

describe('노션 가져오기', () => {
  it('관계 칸에서 이름만 꺼낸다', () => {
    expect(relNames('식재료 (%EC%B9%B4%ED%85%8C.md)')).toEqual(['식재료']);
    expect(relNames('가 (https://app.notion.com/p/1?pvs=21), 나 (%EA%B0%80.md)')).toEqual(['가', '나']);
    expect(relNames('')).toEqual([]);
  });
  it('날짜 여러 모양', () => {
    expect(toDate('2026/01/05')).toBe('2026-01-05');
    expect(toDate('2026년 3월 7일 오후 2:00')).toBe('2026-03-07');
    expect(toDate('January 9, 2026 → January 10, 2026')).toBe('2026-01-09');
  });
  it('따옴표 안 쉼표·줄바꿈', () => {
    const r = parseCsv('﻿이름,메모\n"a, b","줄\n바꿈"\n');
    expect(r).toEqual([{ 이름: 'a, b', 메모: '줄\n바꿈' }]);
  });
  it('표를 알아보고 _all 을 쓴다, 잔액이 맞는다', () => {
    const files = [
      { name: '지불계좌DB x_all.csv', text: '종류,분류,시작잔액\n생활비,은행,"1,000"\n카드,카드,0\n' },
      { name: '카테고리 DB y_all.csv', text: '카테고리,구분,유형,기본금액,1월예산,2월예산,현재연도\n식재료,지출,변동,"300,000","250,000",,2026\n명절,지출,머니플랜,0,0,,2026\n월급,수입,,0,,,2026\n' },
      { name: '거래DB z.csv', text: '세부내역,금액,날짜1,카테고리,출금계좌,입금계좌,불필요\n옛것,1,2026/01/01,,,,No\n' },
      { name: '거래DB z_all.csv', text: '세부내역,금액,날짜1,카테고리,출금계좌,입금계좌,메모,불필요\n장보기,"12,000",2026/01/03,식재료 (%EC.md),카드 (%EC.md),,,Yes\n월급,"500,000",2026/01/25,월급 (%EC.md),,생활비 (%EC.md),,No\n카드값,"12,000",2026/02/14,,생활비 (%EC.md),카드 (%EC.md),,No\n,0,,,,,,No\n' },
      { name: '머니플랜DB m_all.csv', text: '세부내역,금액,연도,월 구분,카테고리 ,하위 항목\n설날 묶음,"300,000",2026,2,명절 (%EC%84.md),설날 (%EC%84.md)\n설날,"300,000",2026,2,명절 (%EC%84.md),\n' },
    ];
    const p = buildPlan(files);
    expect(p.year).toBe('2026');
    expect(p.tx).toHaveLength(3);
    expect(p.skipped).toBe(1);
    expect(p.tx[0]).toMatchObject({ title: '장보기', amount: 12000, category: '식재료', from: '카드', unnecessary: true });
    expect(p.categories.find((c) => c.name === '명절')).toMatchObject({ grp: 'spc', moneynote: true });
    expect(p.budgets).toEqual([{ category: '식재료', month: '2026-01', amount: 250000 }]); // 머니노트 0 줄·빈 칸은 안 만듦
    expect(p.notes).toEqual([{ category: '명절', month: '2026-02', title: '설날', amount: 300000 }]);
    const bal = (n: string) => p.tx.reduce((b, t) => b + (t.to === n ? t.amount : 0) - (t.from === n ? t.amount : 0), p.accounts.find((a) => a.name === n)!.start);
    expect(bal('생활비')).toBe(1000 + 500000 - 12000);
    expect(bal('카드')).toBe(0);
  });
});
