// 거래 적을 때 머니노트 세부 항목 추천 단추 — 누르면 내역에 같은 이름이 들어가서 결산에서 항목별로 맞춰짐
import { useEffect, useState } from 'react';
import { api } from './api';
import type { Boot } from './data';

interface NotesData { notes: { categoryId: string; month: string; title: string }[]; items?: { categoryId: string; title: string }[] }
// 같은 해 머니노트를 잠깐(10초)만 기억 — 머니노트를 고친 뒤 거래 화면으로 오면 바로 새 항목이 보이게
const cache = new Map<string, { at: number; p: Promise<NotesData> }>();
const FRESH_MS = 10_000;

export function useItemSuggest(boot: Boot, categoryId: string | null, date: string): string[] {
  const cat = boot.categories.find((c) => c.id === categoryId);
  const year = date.slice(0, 4);
  const [data, setData] = useState<NotesData | null>(null);
  useEffect(() => {
    if (!cat?.moneynote || !/^\d{4}$/.test(year)) return;
    const hit = cache.get(year);
    if (!hit || Date.now() - hit.at > FRESH_MS) cache.set(year, { at: Date.now(), p: api<NotesData>(`/money-notes?year=${year}`).catch(() => ({ notes: [] })) });
    let on = true;
    cache.get(year)!.p.then((d) => on && setData(d));
    return () => void (on = false);
  }, [cat?.moneynote, year, categoryId]);
  if (!cat?.moneynote || !data) return [];
  const month = date.slice(0, 7);
  const mine = data.notes.filter((n) => n.categoryId === categoryId);
  const thisMonth = mine.filter((n) => n.month === month).map((n) => n.title.trim());
  const rest = [...mine.map((n) => n.title.trim()), ...(data.items ?? []).filter((x) => x.categoryId === categoryId).map((x) => x.title.trim())];
  return [...new Set([...thisMonth, ...rest])].filter(Boolean).slice(0, 10);
}

export function ItemChips({ titles, current, onPick }: { titles: string[]; current: string; onPick: (t: string) => void }) {
  if (titles.length === 0) return null;
  return (
    <div className="item-chips">
      <span className="muted small">머니노트 항목:</span>
      {titles.map((t) => (
        <button key={t} type="button" className={`chip sm ${current.trim() === t ? 'on' : ''}`} onClick={() => onPick(t)}>
          {t}
        </button>
      ))}
    </div>
  );
}
