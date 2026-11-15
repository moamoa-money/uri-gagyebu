// 이번 달 고정지출 한꺼번에 넣기 (노션 '고정지출목록 복사·붙여넣기'를 앱으로)
// 지난번 금액이 미리 채워짐 · 바뀐 것만 고치기 · 상환표 연결 항목은 그달 상환표 금액 · 이미 넣은 건 표시
import { useCallback, useEffect, useRef, useState } from 'react';
import { addMonths } from '../shared/dates';
import { parseAmount, won } from '../shared/rules';
import type { Recurring } from '../shared/types';
import { api } from './api';
import type { Boot, Toast } from './data';
import { DateInput } from './DateInput';

type Item = Recurring & { suggest: number; suggestFrom: string; added: { id: string; date: string; amount: number } | null };

export function BatchFixed({ boot, onError, toast, onSaved }: { boot: Boot; onError: (e: unknown) => void; toast: Toast; onSaved: () => void }) {
  const [month, setMonth] = useState(boot.today.slice(0, 7));
  const [items, setItems] = useState<Item[] | null>(null);
  const jumped = useRef(false);
  const [open, setOpen] = useState(() => localStorage.getItem('gb_batch_open') !== '0'); // 기본 펼침 (선생님: 목록이 바로 보이게)
  useEffect(() => localStorage.setItem('gb_batch_open', open ? '1' : '0'), [open]);
  const [date, setDate] = useState(boot.today);
  const [amt, setAmt] = useState<Record<string, string>>({});
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const load = useCallback(
    () =>
      api<{ items: Item[] }>(`/recurring/batch?month=${month}`)
        .then((d) => {
          // 이번 달에 넣을 게 없으면(목록 시작 전) 다음 달을 먼저 보여 줌 — 처음 한 번만
          if (d.items.length === 0 && !jumped.current && boot.recurring.some((r) => r.active && r.mode === 'batch' && r.startMonth === addMonths(month, 1))) {
            jumped.current = true;
            setMonth(addMonths(month, 1));
            return;
          }
          setItems(d.items);
          setAmt(Object.fromEntries(d.items.map((i) => [i.id, won(i.suggest)])));
          setSkip(new Set());
        })
        .catch(onError),
    [month, onError, boot.recurring],
  );
  useEffect(() => void load(), [load]);
  useEffect(() => setDate(month === boot.today.slice(0, 7) ? boot.today : `${month}-01`), [month, boot.today]);
  if (!items || (items.length === 0 && !boot.recurring.some((r) => r.active && r.mode === 'batch'))) return null;
  const left = items.filter((i) => !i.added);
  const chosen = left.filter((i) => !skip.has(i.id));
  const total = chosen.reduce((s, i) => s + (parseAmount(amt[i.id] ?? '') ?? 0), 0);
  const cat = (id: string | null) => boot.categories.find((c) => c.id === id)?.name ?? '이체';
  const acc = (id: string | null | undefined) => boot.accounts.find((a) => a.id === id)?.name ?? '';
  async function save() {
    try {
      await api('/recurring/batch', { month, date, items: chosen.map((i) => ({ id: i.id, amount: parseAmount(amt[i.id] ?? '') ?? 0 })) });
      toast(`고정지출 ${chosen.length}개를 ${Number(date.slice(5, 7))}월 ${Number(date.slice(8))}일로 넣었어요 (${won(total)}원)`);
      setOpen(false);
      load();
      onSaved();
    } catch (e) {
      onError(e);
    }
  }
  const m = Number(month.slice(5));
  return (
    <div className={`card batch ${left.length ? 'todo' : ''}`}>
      <div className="row">
        <h3 style={{ margin: 0 }}>{m}월 고정지출</h3>
        {items.length === 0 ? <span className="muted small">이 달은 넣을 항목이 없어요 (목록의 시작 달 전)</span> : left.length ? <span className="tag bad">{left.length}개 아직</span> : <span className="tag">모두 넣음 ✓</span>}
        {items.length > 0 && (
          <span className="muted small">
            {items.length}개 중 {items.length - left.length}개 넣음
          </span>
        )}
        <span className="spacer" />
        <button className="btn sm" onClick={() => setMonth(addMonths(month, -1))}>
          ◀
        </button>
        <button className="btn sm" onClick={() => setMonth(addMonths(month, 1))}>
          ▶
        </button>
        <button className={`btn ${left.length ? 'main' : ''}`} disabled={!items.length} onClick={() => setOpen(!open)}>
          {open ? '목록 접기' : '목록 펼치기'}
        </button>
      </div>
      {open && (
        <>
          <table className="list batch-t">
            <thead>
              <tr>
                <th />
                <th>항목</th>
                <th>카테고리</th>
                <th>통장</th>
                <th className="r">금액</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className={i.added ? 'dim' : skip.has(i.id) ? 'dim' : ''}>
                  <td>{i.added ? '✓' : <input type="checkbox" checked={!skip.has(i.id)} onChange={(e) => setSkip((s) => { const n = new Set(s); if (e.target.checked) n.delete(i.id); else n.add(i.id); return n; })} />}</td>
                  <td>
                    <b>{i.title}</b>
                  </td>
                  <td className="muted">{cat(i.categoryId)}</td>
                  <td className="muted small">{[acc(i.fromAccount), acc(i.toAccount)].filter(Boolean).join(' → ')}</td>
                  <td className="r">
                    {i.added ? (
                      <span className="muted">{won(i.added.amount)}</span>
                    ) : (
                      <input className="text sm" inputMode="numeric" style={{ width: 110, textAlign: 'right' }} value={amt[i.id] ?? ''} onChange={(e) => { const n = parseAmount(e.target.value); setAmt({ ...amt, [i.id]: n === null ? '' : won(n) }); }} />
                    )}
                  </td>
                  <td className="muted small">{i.added ? `${Number(i.added.date.slice(5, 7))}/${Number(i.added.date.slice(8))} 넣음` : i.suggestFrom === '상환표' ? <b className="good">상환표</b> : i.suggestFrom}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {left.length > 0 && (
            <div className="row" style={{ marginTop: 8 }}>
              <span>넣을 날짜</span>
              <DateInput className="text sm" value={date} min={`${month}-01`} max={`${month}-31`} onChange={setDate} />
              <span className="spacer" />
              <span>
                {chosen.length}개 · 합계 <b>{won(total)}원</b>
              </span>
              <button className="btn main" disabled={!chosen.length} onClick={save}>
                넣기
              </button>
            </div>
          )}
          <p className="muted small">금액은 지난번에 넣은 금액이 미리 채워져요 — 이번 달 바뀐 것만 고치면 돼요. 빼고 싶은 항목은 체크를 끄세요. 목록은 설정 → 고정지출에서 고쳐요.</p>
        </>
      )}
    </div>
  );
}
