// 머니노트: 해마다 오는 지출(재산세·명절·생일·여행·계절 옷…)을 1년 × 12달 표에 미리 적어 두는 곳.
// 적어 둔 달은 그 합이 그 카테고리의 그달 예산이 된다 (안 적은 달은 그달 예산·기본 예산). 한 칸에 여러 줄(예: 추석 양가 40만 + 엄마 생일 10만).
import { Fragment, useCallback, useEffect, useState } from 'react';
import { parseAmount, won } from '../shared/rules';
import { api } from './api';
import type { Boot, Toast } from './data';
import type { Category } from '../shared/types';
import { Icon } from './Icon';
import { NewBadge } from './NewBadge';

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
  items?: { categoryId: string; title: string }[];
}

const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
let cellClip: { text: string; notes: { title: string; amount: number }[] } | null = null; // 표에서 복사해 둔 칸

export function MoneyNote({ boot, onError, toast, go, initial, embedded = false, reloadBoot }: { boot: Boot; onError: (e: unknown) => void; toast: Toast; go: (h: string) => void; initial?: { year?: string; month?: string; category?: string }; embedded?: boolean; reloadBoot?: () => void }) {
  const year = initial?.year ?? boot.today.slice(0, 4);
  const setYear = (y: string) => go(`#/plan?tab=note&year=${y}`);
  const [d, setD] = useState<Data | null>(null);
  const [sel, setSel] = useState<{ categoryId: string; month: string } | null>(initial?.month && initial?.category ? { categoryId: initial.category, month: initial.month } : null);
  // 고른 칸 (엑셀처럼): 한 번 누르면 고르기, 고른 칸을 한 번 더 누르면 팝업. 복사·붙여넣기는 고른 칸에
  const [cur, setCur] = useState<{ cid: string; month: string; title?: string } | null>(initial?.month && initial?.category ? { cid: initial.category, month: initial.month } : null);
  const isCur = (cid: string, month: string, title?: string) => !!cur && cur.cid === cid && cur.month === month && cur.title === title;
  // 항목별로 펼쳐 보기 (엑셀처럼 카테고리 아래에 '엄마 생신'·'명절' 줄). 기기마다 기억
  const [expand, setExpandState] = useState(() => localStorage.getItem('mn-expand') === '1');
  const setExpand = (v: boolean) => (localStorage.setItem('mn-expand', v ? '1' : '0'), setExpandState(v));
  const [listEdit, setListEdit] = useState(false);
  const [itemPop, setItemPop] = useState<{ cid: string; title: string; focus?: string } | null>(null); // 세부 항목 팝업 (title '' = 새 항목)
  const load = useCallback(() => api<Data>(`/money-notes?year=${year}`).then(setD).catch(onError), [year, onError]);
  useEffect(() => void load(), [load]);

  // 머니노트 카테고리 + (표시는 안 했지만) 이 해에 적어 둔 게 있는 카테고리는 '참고'로
  // 머니노트 = 지출(변동·고정) 카테고리만. 대분류를 수입·저축 등으로 옮긴 카테고리는 표시가 남아 있어도 빼기
  const cats = boot.categories.filter((c) => (c.moneynote && !c.hidden && (c.grp === 'var' || c.grp === 'fix')) || d?.notes.some((n) => n.categoryId === c.id)).sort((a, b) => Number(b.moneynote) - Number(a.moneynote) || a.sort - b.sort);
  // 엑셀처럼 표 칸 복사·붙여넣기 — 칸을 고르고 Ctrl+C/Ctrl+V, 또는 칸에서 마우스 오른쪽 버튼(태블릿은 길게 누르기) → 복사/붙여넣기
  //  · 가계부 안 칸에서 복사 → 그 칸의 줄(이름·금액)을 그대로 더함 (세부 항목 칸이면 그 항목 금액으로)
  //  · 다른 프로그램에서 복사한 숫자 → 카테고리 칸: 줄이 하나면 금액을 바꾸고, 없으면 카테고리 이름으로 한 줄 / 세부 항목 칸: 그 항목 금액
  type Target = { cid: string; month: string; title?: string };
  const [menu, setMenu] = useState<{ x: number; y: number; t: Target } | null>(null);
  const copyFrom = (t: Target) => {
    if (!d) return '';
    const ns = d.notes.filter((n) => n.categoryId === t.cid && n.month === t.month && (t.title === undefined || n.title.trim() === t.title));
    const text = String(ns.reduce((a, n) => a + n.amount, 0));
    cellClip = { text, notes: ns.map((n) => ({ title: t.title ?? n.title, amount: n.amount })) };
    toast(ns.length ? '복사했어요' : '빈 칸을 복사했어요');
    return text;
  };
  const pasteTo = async (t: Target, raw: string) => {
    if (!d) return;
    const cat = boot.categories.find((c) => c.id === t.cid);
    const fromApp = !!cellClip && raw.trim() === cellClip.text && cellClip.notes.length > 0;
    const m = raw.match(/[\d,]+(?:\.\d+)?/);
    const typed = m ? Number(m[0].replace(/,/g, '').split('.')[0]) : 0;
    try {
      let r: Data | null = null;
      if (t.title !== undefined) {
        // 세부 항목 칸: 그 항목의 그달 금액
        const amount = fromApp ? cellClip!.notes.reduce((a, n) => a + n.amount, 0) : typed;
        if (!amount) return toast('붙여넣을 금액이 없어요');
        r = await api<Data>('/money-item/save', { year, categoryId: t.cid, from: t.title, title: t.title, amounts: { [t.month.slice(5)]: amount } });
      } else if (fromApp) {
        for (const n of cellClip!.notes) r = await api<Data>('/money-note', { categoryId: t.cid, month: t.month, title: n.title, amount: n.amount, memo: '' });
      } else {
        if (!typed) return toast('붙여넣을 금액이 없어요');
        const ns = d.notes.filter((n) => n.categoryId === t.cid && n.month === t.month);
        r = ns.length === 1 ? await api<Data>('/money-note', { ...ns[0], amount: typed }) : await api<Data>('/money-note', { categoryId: t.cid, month: t.month, title: cat?.name ?? '머니노트', amount: typed, memo: '' });
      }
      if (r) {
        setD(r);
        toast(`${Number(t.month.slice(5))}월 ${t.title ?? cat?.name ?? ''}에 붙여넣었어요`);
      }
    } catch (err) {
      onError(err);
    }
  };
  const menuCopy = async () => {
    if (!menu) return;
    const text = copyFrom(menu.t);
    setMenu(null);
    await navigator.clipboard?.writeText(text).catch(() => undefined);
  };
  const menuPaste = async () => {
    if (!menu) return;
    const t = menu.t;
    setMenu(null);
    let raw = '';
    try {
      raw = (await navigator.clipboard?.readText()) ?? '';
    } catch {
      raw = cellClip?.text ?? ''; // 기기가 클립보드를 못 읽게 하면 가계부 안에서 복사한 것만
    }
    if (!raw && cellClip) raw = cellClip.text;
    await pasteTo(t, raw);
  };
  useEffect(() => {
    // 글자 칸(텍스트·숫자)에 커서가 있을 때만 그 칸에 맡김 — 체크칸·버튼에 남은 초점은 무시
    const typing = () => {
      const a = document.activeElement as HTMLElement | null;
      if (!a) return false;
      if (a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable) return true;
      if (a.tagName !== 'INPUT') return false;
      return !['checkbox', 'radio', 'button', 'submit', 'range', 'color', 'file'].includes((a as HTMLInputElement).type);
    };
    let copyDone = false, pasteDone = false;
    const onCopy = (e: ClipboardEvent) => {
      if (!cur || typing() || String(window.getSelection() ?? '').trim()) return;
      copyDone = true;
      e.preventDefault();
      e.clipboardData?.setData('text/plain', copyFrom(cur));
    };
    const onPaste = (e: ClipboardEvent) => {
      if (!cur || typing()) return;
      pasteDone = true;
      e.preventDefault();
      void pasteTo(cur, e.clipboardData?.getData('text') ?? '');
    };
    // 어떤 기기(태블릿 + 자판)는 글자 칸이 없으면 복사·붙여넣기 신호를 안 보냄 → 자판 Ctrl/⌘+C·V를 직접 받아 처리
    const onKey = (e: KeyboardEvent) => {
      if (!cur || typing()) return;
      if (e.key === 'Escape' && !sel && !itemPop) return setCur(null);
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      const t = cur;
      if (k === 'c' || k === 'ㅊ') {
        copyDone = false;
        setTimeout(() => {
          if (copyDone) return;
          const text = copyFrom(t);
          navigator.clipboard?.writeText(text).catch(() => undefined);
        }, 120);
      } else if (k === 'v' || k === 'ㅍ') {
        pasteDone = false;
        setTimeout(async () => {
          if (pasteDone) return;
          let raw = '';
          try {
            raw = (await navigator.clipboard?.readText()) ?? '';
          } catch {
            raw = '';
          }
          if (!raw && cellClip) raw = cellClip.text;
          await pasteTo(t, raw);
        }, 120);
      }
    };
    const close = () => setMenu(null);
    document.addEventListener('copy', onCopy);
    document.addEventListener('paste', onPaste);
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
    };
  });
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
  // 세부 항목 줄 = 저장해 둔 줄(금액 없어도 남음) + 금액을 적은 줄 이름
  const itemsOf = (cid: string) => [...new Set([...(d.items ?? []).filter((x) => x.categoryId === cid).map((x) => x.title.trim()), ...d.notes.filter((n) => n.categoryId === cid).map((n) => n.title.trim())])];
  async function deleteItem(cid: string, title: string) {
    const has = d!.notes.some((n) => n.categoryId === cid && n.title.trim() === title);
    if (!confirm(has ? `'${title}' 줄을 ${year}년 머니노트에서 지울까요? (적어 둔 금액도 함께 지워져요)` : `'${title}' 줄을 지울까요?`)) return;
    try {
      setD(await api<Data>('/money-item/delete', { year, categoryId: cid, title }));
      setItemPop(null);
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
        <div className="head mn-head">
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
          <span className="spacer" />
          <label className="check">
            <input type="checkbox" checked={expand} onChange={(e) => setExpand(e.target.checked)} /> 항목별로 펼쳐 보기 <NewBadge id="mn-expand" />
          </label>
          {reloadBoot && (
            <button className={`btn sm ${listEdit ? 'main' : ''}`} onClick={() => setListEdit(!listEdit)}>
              목록 고치기
            </button>
          )}
          <button className="btn sm" onClick={copyPrev}>
            {Number(year) - 1}년 머니노트 불러오기
          </button>
        </div>
        {listEdit && reloadBoot && <ListEditor boot={boot} onError={onError} toast={toast} reloadBoot={reloadBoot} onClose={() => setListEdit(false)} />}
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
                        const on = isCur(c.id, `${year}-${m}`);
                        const ob = oldBudget(c.id, m);
                        return (
                          <td key={m} className={`r cell-click ${on ? 'on' : ''} ${`${year}-${m}` === thisMonth ? 'now' : ''}`} onClick={() => {
                            (document.activeElement as HTMLElement | null)?.blur();
                            setCur({ cid: c.id, month: `${year}-${m}` });
                            setSel({ categoryId: c.id, month: `${year}-${m}` });
                          }} onContextMenu={(e) => (e.preventDefault(), setCur({ cid: c.id, month: `${year}-${m}` }), setMenu({ x: e.clientX, y: e.clientY, t: { cid: c.id, month: `${year}-${m}` } }))}>
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
                    {expand && (
                      <>
                        {itemsOf(c.id).map((t) => {
                          const amt = (m: string) => notesOf(c.id, m).filter((n) => n.title.trim() === t).reduce((a, n) => a + n.amount, 0);
                          return (
                            <tr key={t} className="mn-item">
                              <td className="cell-click" title="눌러서 이름·금액 고치기, 줄 지우기" onClick={() => setItemPop({ cid: c.id, title: t })}>
                                {t || '(이름 없음)'}
                              </td>
                              {MONTHS.map((m) => (
                                <td key={m} className={`r cell-click ${isCur(c.id, `${year}-${m}`, t) ? 'on' : ''} ${`${year}-${m}` === thisMonth ? 'now' : ''}`} onClick={() => {
                                  (document.activeElement as HTMLElement | null)?.blur();
                                  setCur({ cid: c.id, month: `${year}-${m}`, title: t });
                                  setItemPop({ cid: c.id, title: t, focus: m });
                                }} onContextMenu={(e) => (e.preventDefault(), setCur({ cid: c.id, month: `${year}-${m}`, title: t }), setMenu({ x: e.clientX, y: e.clientY, t: { cid: c.id, month: `${year}-${m}`, title: t } }))}>
                                  {amt(m) ? won(amt(m)) : ''}
                                </td>
                              ))}
                              <td className="r">{won(MONTHS.reduce((a, m) => a + amt(m), 0))}</td>
                            </tr>
                          );
                        })}
                        <tr className="mn-item mn-add">
                          <td colSpan={14}>
                            <button className="btn sm" onClick={() => setItemPop({ cid: c.id, title: '' })}>
                              ＋ 세부 항목
                            </button>
                          </td>
                        </tr>
                      </>
                    )}
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
            <details className="help">
              <summary>머니노트란?</summary>
              <ul>
                <li>가끔 나가는 돈(명절·생신·재산세·검진)을 해당 달에 미리 기록</li>
                <li>기록한 금액 = 그달 예산, 1년 합계 = 미리 떼어 둘 돈</li>
                <li>칸 선택 시 입력</li>
              </ul>
            </details>
          </div>
        )}
        {menu && (
          <div className="cell-menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
            <button onClick={menuCopy}>복사</button>
            <button onClick={menuPaste}>붙여넣기</button>
          </div>
        )}
        {itemPop && (
          <ItemPopup
            key={`${itemPop.cid}-${itemPop.title}`}
            year={year}
            cat={boot.categories.find((c) => c.id === itemPop.cid)?.name ?? ''}
            title={itemPop.title}
            focus={itemPop.focus}
            taken={itemsOf(itemPop.cid).filter((x) => x !== itemPop.title)}
            notes={d.notes.filter((n) => n.categoryId === itemPop.cid && n.title.trim() === itemPop.title && itemPop.title !== '')}
            onClose={() => setItemPop(null)}
            onDelete={() => deleteItem(itemPop.cid, itemPop.title)}
            onSave={async (title, amounts) => {
              try {
                setD(await api<Data>('/money-item/save', { year, categoryId: itemPop.cid, from: itemPop.title, title, amounts }));
                toast('저장했어요');
                setItemPop(null);
              } catch (e) {
                onError(e);
              }
            }}
          />
        )}
        {sel && <CellEditor key={`${sel.categoryId}-${sel.month}`} sel={sel} notes={d.notes.filter((n) => n.categoryId === sel.categoryId && n.month === sel.month)} boot={boot} onClose={() => setSel(null)} onChanged={setD} onError={onError} toast={toast} />}
      </div>
    </div>
  );
}

function CellEditor({ sel, notes, boot, onClose, onChanged, onError, toast }: { sel: { categoryId: string; month: string }; notes: Note[]; boot: Boot; onClose: () => void; onChanged: (d: Data) => void; onError: (e: unknown) => void; toast: Toast }) {
  const cat = boot.categories.find((c) => c.id === sel.categoryId);
  const [edit, setEdit] = useState<Partial<Note> | null>(notes.length ? null : { title: '', amount: 0, memo: '' });
  const [focusOn, setFocusOn] = useState(false); // 칸만 고른 상태에선 커서를 안 둠 → 표에서 Ctrl+V 붙여넣기가 되게
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
    <div className="pop-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card pop">
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
                    <button className="btn sm" onClick={() => (setFocusOn(true), setEdit(n), setAmt(won(n.amount)))}>
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
            <input className="text" autoFocus={focusOn} value={edit.title ?? ''} placeholder="예: 추석 양가, 재산세 1기, 엄마 생일" onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
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
          <button className="btn main" style={{ marginTop: 10 }} onClick={() => (setFocusOn(true), setEdit({ title: '', amount: 0, memo: '' }), setAmt(''))}>
            ＋ 한 줄 더 적기
          </button>
        )}
      </div>
    </div>
  );
}

// 머니노트 목록 고치기: 어떤 지출 카테고리를 머니노트에 넣을지 · 이름 바꾸기 · 새로 추가
function ListEditor({ boot, onError, toast, reloadBoot, onClose }: { boot: Boot; onError: (e: unknown) => void; toast: Toast; reloadBoot: () => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const [names, setNames] = useState<Record<string, string>>({});
  const spend = boot.categories.filter((c) => (c.grp === 'var' || c.grp === 'fix') && !c.hidden).sort((a, b) => Number(b.moneynote) - Number(a.moneynote) || (a.grp === b.grp ? a.sort - b.sort : a.grp === 'var' ? -1 : 1));
  async function save(c: Partial<Category>, msg: string) {
    try {
      await api('/categories', c);
      toast(msg);
      reloadBoot();
    } catch (e) {
      onError(e);
    }
  }
  async function add() {
    if (!name.trim()) return;
    await save({ grp: 'var', name: name.trim(), icon: '', budget: 0, moneynote: true }, `'${name.trim()}' 추가했어요`);
    setName('');
  }
  return (
    <div className="card">
      <h3 className="row">
        머니노트 목록 고치기
        <span className="spacer" />
        <button className="btn sm" onClick={onClose}>
          닫기
        </button>
      </h3>
      <details className="help">
        <summary>쓰는 법</summary>
        <ul>
          <li>체크한 카테고리만 머니노트에 표시</li>
          <li>이름 수정 후 칸 밖을 누르면 저장</li>
          <li>삭제·순서 변경: 설정 › 카테고리 예산</li>
        </ul>
      </details>
      <table className="list">
        <tbody>
          {spend.map((c) => (
            <tr key={c.id}>
              <td style={{ width: 40 }}>
                <input type="checkbox" checked={!!c.moneynote} onChange={(e) => save({ ...c, moneynote: e.target.checked }, e.target.checked ? `'${c.name}' 머니노트에 넣었어요` : `'${c.name}' 머니노트에서 뺐어요`)} />
              </td>
              <td>
                <input
                  className="text"
                  value={names[c.id] ?? c.name}
                  onChange={(e) => setNames({ ...names, [c.id]: e.target.value })}
                  onBlur={() => {
                    const v = (names[c.id] ?? c.name).trim();
                    if (v && v !== c.name) save({ ...c, name: v }, '이름을 바꿨어요');
                  }}
                />
              </td>
              <td className="muted small">{c.grp === 'fix' ? '고정지출' : '변동지출'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row" style={{ marginTop: 10 }}>
        <input className="text" placeholder="새 항목 (예: 보리 병원)" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="btn main" onClick={add}>
          ＋ 추가
        </button>
      </div>
    </div>
  );
}

// 세부 항목 팝업: 이름 + 1~12월 금액을 한 번에 고치고, 줄 지우기도 여기서
function ItemPopup({ year, cat, title, focus, taken, notes, onClose, onDelete, onSave }: { year: string; cat: string; title: string; focus?: string; taken: string[]; notes: Note[]; onClose: () => void; onDelete: () => void; onSave: (title: string, amounts: Record<string, number | null>) => void }) {
  const isNew = title === '';
  const [name, setName] = useState(title);
  const sumOf = (m: string) => notes.filter((n) => n.month === `${year}-${m}`).reduce((a, n) => a + n.amount, 0);
  const multi = (m: string) => notes.filter((n) => n.month === `${year}-${m}`).length > 1;
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(MONTHS.map((m) => [m, sumOf(m) ? won(sumOf(m)) : ''])));
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);
  const [every, setEvery] = useState(1); // 몇 달마다 채우기
  const total = MONTHS.reduce((a, m) => a + (parseAmount(vals[m]) ?? 0), 0);
  // 엑셀에서 한 줄(여러 칸) 복사해 붙여넣으면 그 달부터 차례로 채우기
  function pasteMany(m: string, e: React.ClipboardEvent<HTMLInputElement>) {
    const parts = e.clipboardData.getData('text').trim().split(/[\t\n\r]+|\s{2,}/).filter(Boolean);
    if (parts.length < 2) return; // 하나면 보통 붙여넣기
    e.preventDefault();
    const next = { ...vals };
    let k = MONTHS.indexOf(m);
    for (const p of parts) {
      if (k >= 12) break;
      const mm = MONTHS[k++];
      if (multi(mm)) continue;
      const n = parseAmount(p.replace(/원/g, ''));
      next[mm] = n ? won(n) : '';
    }
    setVals(next);
  }
  function save() {
    const t = name.trim();
    if (!t) return alert('이름을 적어 주세요.');
    if (taken.includes(t)) return alert('같은 이름의 항목이 이미 있어요.');
    const amounts: Record<string, number | null> = {};
    for (const m of MONTHS) if (!multi(m)) amounts[m] = parseAmount(vals[m]) ?? 0;
    onSave(t, amounts);
  }
  return (
    <div className="pop-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card pop">
        <h3>{isNew ? `${cat} · 세부 항목 추가` : `${cat} · ${title}`}</h3>
        <div className="vform">
          <label>이름</label>
          <input className="text" autoFocus={!focus} value={name} placeholder="예: 엄마 생신, 명절, 재산세" onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="pop-months">
          {MONTHS.map((m) => (
            <label key={m} className="pop-month">
              <span>{Number(m)}월</span>
              <input
                className="text money"
                inputMode="numeric"
                placeholder="0"
                autoFocus={focus === m}
                disabled={multi(m)}
                title={multi(m) ? '이 달에는 같은 이름이 여러 줄이라 칸을 눌러 아래에서 고쳐 주세요' : ''}
                value={vals[m]}
                onChange={(e) => {
                  const n = parseAmount(e.target.value);
                  setVals({ ...vals, [m]: n === null ? '' : won(n) });
                }}
                onKeyDown={(e) => e.key === 'Enter' && save()}
                onPaste={(e) => pasteMany(m, e)}
              />
            </label>
          ))}
        </div>
        <div className="row" style={{ gap: 6, marginBottom: 6 }}>
          <span className="muted small">처음 적은 달부터</span>
          <select className="text sm" style={{ width: 'auto' }} value={every} onChange={(e) => setEvery(Number(e.target.value))}>
            {[1, 2, 3, 4, 6].map((n) => (
              <option key={n} value={n}>
                {n === 1 ? '매달' : `${n}달마다`}
              </option>
            ))}
          </select>
          <button
            className="btn sm"
            title="처음 금액을 적은 달부터 고른 간격으로 같은 금액을 채워요 (예: 2월 6만 + 3달마다 → 2·5·8·11월)"
            onClick={() => {
              const k = MONTHS.findIndex((m) => parseAmount(vals[m]));
              if (k < 0) return alert('먼저 시작할 달에 금액을 적어 주세요.');
              const v = vals[MONTHS[k]];
              const next = { ...vals };
              for (let i = k; i < 12; i += every) if (!multi(MONTHS[i])) next[MONTHS[i]] = v;
              setVals(next);
            }}
          >
            채우기
          </button>
        </div>
        <p className="muted small">1년 합계 <b>{won(total)}원</b></p>
        <div className="row">
          {!isNew && (
            <button className="btn sm danger" onClick={onDelete}>
              이 줄 지우기
            </button>
          )}
          <span className="spacer" />
          <button className="btn" onClick={onClose}>
            닫기
          </button>
          <button className="btn main" onClick={save}>
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
