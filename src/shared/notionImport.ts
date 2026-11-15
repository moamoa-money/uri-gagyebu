// 노션 '가계부' 내보내기(Markdown & CSV)를 읽어 가져올 내용으로 바꾸기 — 브라우저에서만 돈다(자료가 밖으로 안 나감).
// 카페에서 같이 쓰는 노션 가계부 양식(거래DB·카테고리 DB·지불계좌DB·머니플랜DB·고정지출목록) 기준.

import type { Group } from './types';

export interface NAccount { name: string; kind: string; start: number }
export interface NCategory { name: string; grp: Group; moneynote: boolean; budget: number }
export interface NBudget { category: string; month: string; amount: number }
export interface NNote { category: string; month: string; title: string; amount: number }
export interface NFixed { title: string; category: string; amount: number }
export interface NTx { date: string; title: string; amount: number; category: string; from: string; to: string; memo: string; unnecessary: boolean }
export interface NotionPlan { year: string; accounts: NAccount[]; categories: NCategory[]; budgets: NBudget[]; notes: NNote[]; fixed: NFixed[]; tx: NTx[]; skipped: number }

/** CSV 한 파일 → 줄 목록(첫 줄 = 칸 이름). 따옴표·줄바꿈 들어간 칸도 처리 */
export function parseCsv(text: string): Record<string, string>[] {
  const s = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; } else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const head = (rows.shift() ?? []).map((h) => h.trim());
  return rows.filter((r) => r.some((v) => v.trim() !== '')).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}

// 관계 칸: "식재료 (%EC%B9%B4…md)" 또는 "이름 (https://app.notion.com/…)" 여러 개는 ", "
const LINK = /\s\((?:https?:\/\/|[^()]*%[0-9A-Fa-f]{2})[^()]*\)/g;
export function relNames(v: string | undefined): string[] {
  if (!v) return [];
  return v.replace(LINK, '\u0000').split('\u0000').map((x) => x.replace(/^,\s*/, '').trim()).filter(Boolean);
}
const rel1 = (v: string | undefined) => relNames(v)[0] ?? '';

export function num(v: string | undefined): number {
  const n = Number(String(v ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? Math.round(n) : 0;
}
const has = (v: string | undefined) => String(v ?? '').replace(/[^0-9]/g, '') !== '';

const EN_MON: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
/** '2026/01/01', '2026-01-01', '2026년 1월 1일', 'January 1, 2026' (뒤에 시간·→ 끝날짜 있어도) → '2026-01-01' */
export function toDate(v: string | undefined): string {
  const s = String(v ?? '').split('→')[0].trim();
  const pad = (n: number) => String(n).padStart(2, '0');
  let m = s.match(/(\d{4})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{1,2})/) ?? s.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = s.match(/([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (m && EN_MON[m[1].toLowerCase()]) return `${m[3]}-${pad(EN_MON[m[1].toLowerCase()])}-${pad(+m[2])}`;
  return '';
}
const yes = (v: string | undefined) => /^(yes|true|예|✓|☑)/i.test(String(v ?? '').trim());

export type NotionKind = 'tx' | 'category' | 'account' | 'moneyplan' | 'fixed';
/** 칸 이름으로 어떤 표인지 알아보기 */
export function kindOf(head: string[]): NotionKind | null {
  const h = new Set(head);
  if (h.has('세부내역') && h.has('금액') && (h.has('출금계좌') || h.has('입금계좌'))) return 'tx';
  if (h.has('카테고리') && h.has('구분') && (h.has('1월예산') || h.has('기본금액'))) return 'category';
  if (h.has('시작잔액')) return 'account';
  if (h.has('세부내역') && h.has('금액') && h.has('월 구분')) return 'moneyplan';
  if (h.has('세부내역') && h.has('금액') && [...h].some((x) => x.startsWith('카테고리')) && h.size <= 4) return 'fixed';
  return null;
}
const col = (r: Record<string, string>, name: string) => r[name] ?? r[`${name} `] ?? '';

function grpOf(div: string, type: string): { grp: Group; moneynote: boolean } {
  if (div.includes('수입')) return { grp: 'inc', moneynote: false };
  if (div.includes('저축')) return { grp: 'sav', moneynote: false };
  if (div.includes('투자')) return { grp: 'inv', moneynote: false };
  if (type.includes('머니플랜') || type.includes('특별')) return { grp: 'spc', moneynote: true };
  if (type.includes('고정')) return { grp: 'fix', moneynote: false };
  return { grp: 'var', moneynote: false };
}
const KINDS = ['은행', '카드', '적금', '목돈', '증권', '청약', '대출', '현금'];

/**
 * 내보낸 파일들(이름, 글) → 가져올 내용.
 * 같은 표가 '…_all.csv'와 '….csv'(보기 거르기) 둘 다 있으면 _all을 쓴다.
 */
export function buildPlan(files: { name: string; text: string }[]): NotionPlan {
  const tables: Partial<Record<NotionKind, { all: boolean; rows: Record<string, string>[] }>> = {};
  for (const f of files) {
    if (!f.name.toLowerCase().endsWith('.csv')) continue;
    const rows = parseCsv(f.text);
    const head = rows.length ? Object.keys(rows[0]) : parseCsv(f.text + '\n_').length ? [] : [];
    const k = kindOf(head);
    if (!k) continue;
    const all = /_all\.csv$/i.test(f.name);
    const cur = tables[k];
    if (!cur || (all && !cur.all) || (all === cur.all && rows.length > cur.rows.length)) tables[k] = { all, rows };
  }
  const T = (k: NotionKind) => tables[k]?.rows ?? [];

  const accounts: NAccount[] = T('account').map((r) => {
    const name = (Object.values(r)[0] ?? '').trim(); // 제목 칸은 맨 앞 (선생님 양식은 이름이 '종류')
    const cls = col(r, '분류');
    return { name, kind: KINDS.find((k) => cls.includes(k)) ?? '은행', start: num(col(r, '시작잔액')) };
  }).filter((a) => a.name);

  const tx: NTx[] = [];
  let skipped = 0;
  for (const r of T('tx')) {
    const date = toDate(col(r, '날짜1')) || toDate(col(r, '날짜'));
    const amount = Math.abs(num(col(r, '금액')));
    if (!date || !amount) { skipped++; continue; }
    tx.push({ date, title: col(r, '세부내역') || '(내역 없음)', amount, category: rel1(col(r, '카테고리')), from: rel1(col(r, '출금계좌')), to: rel1(col(r, '입금계좌')), memo: col(r, '메모'), unnecessary: yes(col(r, '불필요')) });
  }

  // 해: 카테고리 표 '현재연도' > 거래에 가장 많은 해
  const years = new Map<string, number>();
  for (const t of tx) years.set(t.date.slice(0, 4), (years.get(t.date.slice(0, 4)) ?? 0) + 1);
  const catYear = T('category').map((r) => col(r, '현재연도')).find((y) => /^\d{4}$/.test(y));
  const year = catYear ?? [...years.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? String(new Date().getFullYear());

  const categories: NCategory[] = [];
  const budgets: NBudget[] = [];
  for (const r of T('category')) {
    const name = col(r, '카테고리');
    if (!name) continue;
    const g = grpOf(col(r, '구분'), col(r, '유형'));
    categories.push({ name, ...g, budget: num(col(r, '기본금액')) });
    for (let m = 1; m <= 12; m++) {
      const v = col(r, `${m}월예산`);
      if (!has(v)) continue;
      const amount = num(v);
      if (g.moneynote && amount === 0) continue; // 머니노트 칸은 0 줄을 만들면 머니노트 합계가 예산으로 안 잡힘
      budgets.push({ category: name, month: `${year}-${String(m).padStart(2, '0')}`, amount });
    }
  }
  // 카테고리 표가 없어도 거래에 나온 이름은 만들 수 있게
  const known = new Set(categories.map((c) => c.name));
  for (const t of tx) if (t.category && !known.has(t.category)) { known.add(t.category); categories.push({ name: t.category, grp: 'var', moneynote: false, budget: 0 }); }
  const knownAcc = new Set(accounts.map((a) => a.name));
  for (const t of tx) for (const a of [t.from, t.to]) if (a && !knownAcc.has(a)) { knownAcc.add(a); accounts.push({ name: a, kind: '은행', start: 0 }); }

  const notes: NNote[] = [];
  for (const r of T('moneyplan')) {
    if (relNames(col(r, '하위 항목')).length) continue; // 묶음(상위) 줄은 빼고 실제 항목만
    const m = num(col(r, '월 구분'));
    const y = /^\d{4}$/.test(col(r, '연도')) ? col(r, '연도') : year;
    const category = rel1(col(r, '카테고리'));
    const amount = num(col(r, '금액'));
    if (m < 1 || m > 12 || !category || !amount) continue;
    notes.push({ category, month: `${y}-${String(m).padStart(2, '0')}`, title: col(r, '세부내역') || category, amount });
  }

  const fixed: NFixed[] = T('fixed')
    .map((r) => ({ title: col(r, '세부내역'), category: rel1(col(r, '카테고리')), amount: num(col(r, '금액')) }))
    .filter((f) => f.title && f.amount > 0);

  return { year, accounts, categories, budgets, notes, fixed, tx, skipped };
}
