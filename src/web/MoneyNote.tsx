// 머니노트: 해마다 오는 지출(재산세·명절·생일·여행·계절 옷…)을 1년 × 12달 표에 미리 적어 두는 곳.
// 적어 둔 달은 그 합이 그 카테고리의 그달 예산이 된다 (안 적은 달은 그달 예산·기본 예산). 한 칸에 여러 줄(예: 추석 양가 40만 + 엄마 생일 10만).
import { Fragment, useCallback, useEffect, useState } from 'react';
import { parseAmount, won } from '../shared/rules';
import { api } from './api';
import type { Boot, Toast } from './data';
import { Icon } from './Icon';

interface Note {
  id: string;
  categoryId: string;
  month: string;
  title: string;
  amount: number;
  memo: string;
}
interface Data {
  year: string;
  notes: Note[];
  budgets: { categoryId: string; month: string; amount: number }[];
}

const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));

export function MoneyNote({ boot, onError, toast, go, initial, embedded = false }: { boot: Boot; onError: (e: unknown) => void; toast: Toast; go: (h: string) => void; initial?: { year?: string; month?: string; category?: string }; embedded?: boolean }) {
  const year = initial?.year ?? boot.today.slice(0, 4);
  const setYear = (y: string) => go(`#/plan?tab=note&year=${y}`);
  const [d, setD] = useState<Data | null>(null);
  const [sel, setSel] = useState<{ categoryId: string; month: string } | null>(initial?.month && initial?.category ? { categoryId: initial.category, month: initial.month } : null);
  // 항목별로 펼쳐 보기 (엑셀처럼 카테고리 아래에 '엄마 생신'·'명절' 줄). 기기마다 기억
  const [expand, setExpandState] = useState(() => localStorage.getItem('mn-expand') === '1');
  const setExpand = (v: boolean) => (localStorage.setItem('mn-expand', v ? '1' : '0'), setExpandState(v));
  const load = useCallback(() => api<Data>(`/money-notes?year=${year}`).then(setD).catch(onError), [year, onError]);
  useEffect(() => void load(), [load]);

  // 머니노트 카테고리 + (표시는 안 했지만) 이 해에 적어 둔 게 있는 카테고리는 '참고'로
  const cats = boot.categories.filter((c) => (c.moneynote && !c.hidden) || d?.notes.some((n) => n.categoryId === c.id)).sort((a, b) => Number(b.moneynote) - Number(a.moneynote) || a.sort - b.sort);
  if (!d) return <p className="muted">불러오는 중…</p>;
  const notesOf = (cid: string, m: string) => d.notes.filter((n) => n.categoryId === cid && n.month === `${year}-${m}`);
  const oldBudget = (cid: string, m: string) => d.budgets.find((b) => b.categoryId === cid && b.month === `${year}-${m}`)?.amount ?? 0;
  async function copyPrev() {
    if (!confirm(`${Number(year) - 1}년 머니노트를 ${year}년 같은 달로 불러올까요? (이미 있는 건 그대로 둬요)`)) return;
    try {
      const r = await api<Data & { copied: number }>('/money-notes/copy', { year });
      setD(r);
      toast(`${r.copied}개 불러왔어요 — 금액을 올해에 맞게 고쳐 주세요`);
    } catch (e) {
      onError(e);
    }
  }
  const cellSum = (cid: string, m: string) => notesOf(cid, m).reduce((n, x) => n + x.amount, 0);
  const monthSum = (m: string) => cats.reduce((n, c) => n + cellSum(c.id, m), 0);
  const yearSum = MONTHS.reduce((n, m) => n + monthSum(m), 0);
  const thisMonth = boot.today.slice(0, 7);

  return (
    <div>
      <div>
        <div className="head">
          {!embedded && (
            <button className="btn sm" onClick={() => setYear(String(Number(year) - 1))}>
              ◀
            </button>
          )}
          {embedded ? <h2 className="sec" style={{ margin: 0 }}>2. {year}년 머니노트</h2> : <h1>{year}년 머니노트</h1>}
          {!embedded && (
            <button className="btn sm" onClick={() => setYear(String(Number(year) + 1))}>
              ▶
            </button>
          )}
          <span className="muted">특별지출(생신·명절·재산세·정기 검진·여행…)을 달마다 미리 적어요 → 1년 총액은 미리 떼어 둘 돈, 그달 예산에도 들어가요</span>
          <span className="spacer" />
          <label className="check">
            <input type="checkbox" checked={expand} onChange={(e) => setExpand(e.target.checked)} /> 항목별로 펼쳐 보기
          </label>
          <button className="btn sm" onClick={copyPrev}>
            {Number(year) - 1}년 머니노트 불러오기
          </button>
        </div>
        {cats.length === 0 ? (
          <div className="card">
            <p>머니노트로 예산을 잡을 카테고리가 아직 없어요. 설정 → 카테고리에서 [고치기] → '머니노트로 예산 잡기'를 켜 주세요 (명절·생일·재산세·여행처럼 해마다 오는 것).</p>
            <button className="btn" onClick={() => go('#/settings')}>
              설정으로 가기
            </button>
          </div>
        ) : (
          <div className="card">
            <div className="tablewrap">
              <table className="list mnote">
                <thead>
                  <tr>
                    <th>카테고리</th>
                    {MONTHS.map((m) => (
                      <th key={m} className={`r ${`${year}-${m}` === thisMonth ? 'now' : ''}`}>
                        {Number(m)}월
                      </th>
                    ))}
                    <th className="r">합계</th>
                  </tr>
                </thead>
                <tbody>
                  {cats.map((c) => (
                    <Fragment key={c.id}>
                    <tr className={expand ? 'mn-cat' : ''}>
                      <td>
                        <span className="withico">
                          <Icon name={c.icon} /> <b>{c.name}</b>
                        </span>
                        {!c.moneynote && <div className="muted small" title="이 카테고리는 '머니노트로 예산 잡기'가 꺼져 있어서 예산에 반영되지 않아요">참고용 · 예산 반영 안 함</div>}
                      </td>
                      {MONTHS.map((m) => {
                        const ns = notesOf(c.id, m);
                        const on = sel?.categoryId === c.id && sel.month === `${year}-${m}`;
                        const ob = oldBudget(c.id, m);
                        return (
                          <td key={m} className={`r cell-click ${on ? 'on' : ''} ${`${year}-${m}` === thisMonth ? 'now' : ''}`} onClick={() => setSel({ categoryId: c.id, month: `${year}-${m}` })}>
                            {ns.length > 0 && (
                              <div className="mtip">
                                {ns.map((n) => (
                                  <div key={n.id}>
                                    {n.title} <b>{won(n.amount)}</b>
                                  </div>
                                ))}
                              </div>
                            )}
                            {ns.length ? <b>{won(cellSum(c.id, m))}</b> : ob > 0 ? <span className="muted small" title="머니노트를 적기 전, 예전에 잡아 둔 달별 예산">({won(ob)})</span> : <span className="muted">·</span>}
                          </td>
                        );
                      })}
                      <td className="r">
                        <b>{won(MONTHS.reduce((n, m) => n + cellSum(c.id, m), 0))}</b>
                      </td>
                    </tr>
                    {expand &&
                      [...new Set(d.notes.filter((n) => n.categoryId === c.id).map((n) => n.title.trim()))].map((t) => {
                        const amt = (m: string) => notesOf(c.id, m).filter((n) => n.title.trim() === t).reduce((a, n) => a + n.amount, 0);
                        return (
                          <tr key={t} className="mn-item">
                            <td>{t || '(이름 없음)'}</td>
                            {MONTHS.map((m) => (
                              <td key={m} className={`r cell-click ${`${year}-${m}` === thisMonth ? 'now' : ''}`} onClick={() => setSel({ categoryId: c.id, month: `${year}-${m}` })}>
                                {amt(m) ? won(amt(m)) : ''}
                              </td>
                            ))}
                            <td className="r">{won(MONTHS.reduce((a, m) => a + amt(m), 0))}</td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  ))}
                  <tr className="sum">
                    <td>달 합계</td>
                    {MONTHS.map((m) => (
                      <td key={m} className="r">
                        {monthSum(m) ? won(monthSum(m)) : ''}
                      </td>
                    ))}
                    <td className="r">{won(yearSum)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="muted small">칸을 누르면 아래에서 적을 수 있어요. (괄호 숫자)는 머니노트를 안 적은 달에 쓰이는 예산이에요 — 머니노트를 적으면 그 금액이 그달 예산이 돼요.</p>
          </div>
        )}
        {sel && <CellEditor key={`${sel.categoryId}-${sel.month}`} sel={sel} notes={d.notes.filter((n) => n.categoryId === sel.categoryId && n.month === sel.month)} boot={boot} onClose={() => setSel(null)} onChanged={setD} onError={onError} toast={toast} />}
      </div>
    </div>
  );
}

function CellEditor({ sel, notes, boot, onClose, onChanged, onError, toast }: { sel: { categoryId: string; month: string }; notes: Note[]; boot: Boot; onClose: () => void; onChanged: (d: Data) => void; onError: (e: unknown) => void; toast: Toast }) {
  const cat = boot.categories.find((c) => c.id === sel.categoryId);
  const [edit, setEdit] = useState<Partial<Note> | null>(notes.length ? null : { title: '', amount: 0, memo: '' });
  const [amt, setAmt] = useState('');
  async function save() {
    if (!edit) return;
    try {
      onChanged(await api<Data>('/money-note', { ...edit, categoryId: sel.categoryId, month: sel.month, amount: parseAmount(amt) ?? 0 }));
      toast('머니노트에 적었어요');
      setEdit(null);
    } catch (e) {
      onError(e);
    }
  }
  async function del(id: string) {
    try {
      onChanged(await api<Data>(`/money-note/${id}/delete`, {}));
    } catch (e) {
      onError(e);
    }
  }
  const total = notes.reduce((n, x) => n + x.amount, 0);
  return (
    <div className="mn-editor">
      <div className="card">
        <h3 className="row">
          {Number(sel.month.slice(5))}월 · {cat?.name}
          <span className="spacer" />
          <button className="btn sm" onClick={onClose}>
            닫기
          </button>
        </h3>
        {notes.length > 0 && (
          <table className="list">
            <tbody>
              {notes.map((n) => (
                <tr key={n.id}>
                  <td>
                    {n.title}
                    {n.memo && <div className="muted small">{n.memo}</div>}
                  </td>
                  <td className="r">{won(n.amount)}</td>
                  <td className="r nowrap">
                    <button className="btn sm" onClick={() => (setEdit(n), setAmt(won(n.amount)))}>
                      고치기
                    </button>
                    <button className="btn sm danger" onClick={() => del(n.id)}>
                      지우기
                    </button>
                  </td>
                </tr>
              ))}
              <tr className="sum">
                <td>합계 (= 이 달 {cat?.name} 예산)</td>
                <td className="r">{won(total)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        )}
        {edit ? (
          <div className="vform" style={{ marginTop: 10 }}>
            <label>무엇</label>
            <input className="text" autoFocus value={edit.title ?? ''} placeholder="예: 추석 양가, 재산세 1기, 엄마 생일" onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
            <label>금액</label>
            <div className="row">
              <input className="text money" inputMode="numeric" value={amt} onChange={(e) => { const n = parseAmount(e.target.value); setAmt(n === null ? '' : won(n)); }} onKeyDown={(e) => e.key === 'Enter' && save()} />
              <span>원</span>
            </div>
            <label>메모</label>
            <input className="text" value={edit.memo ?? ''} placeholder="선택" onChange={(e) => setEdit({ ...edit, memo: e.target.value })} />
            <label />
            <div className="row">
              <button className="btn main" onClick={save}>
                {edit.id ? '고치기' : '적기'}
              </button>
              <button className="btn" onClick={() => setEdit(null)}>
                취소
              </button>
            </div>
          </div>
        ) : (
          <button className="btn main" style={{ marginTop: 10 }} onClick={() => (setEdit({ title: '', amount: 0, memo: '' }), setAmt(''))}>
            ＋ 한 줄 더 적기
          </button>
        )}
      </div>
    </div>
  );
}
