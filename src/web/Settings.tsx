// 설정: 카테고리(대분류 고정, 아래는 자유) · 고정지출 · 가족 · 비밀번호
import { useEffect, useState } from 'react';
import { won, parseAmount } from '../shared/rules';
import { isSpending, type Category, type Group, type Recurring } from '../shared/types';
import { api } from './api';
import { NewBadge } from './NewBadge';
import { LookSettings } from './Look';
import { GROUP_ICON, Icon, ICONS, iconKey } from './Icon';
import type { Boot, Toast } from './data';
import { NotionCleanup } from './NotionCleanup';

export function Settings({ boot, onError, toast, reloadBoot }: { boot: Boot; onError: (e: unknown) => void; toast: Toast; reloadBoot: () => void }) {
  const [tab, setTab] = useState<'cat' | 'rec' | 'family' | 'feature' | 'look' | 'notion'>('cat');
  // 예전에 노션에서 가져온 가계부만 '정리' 탭을 보여 준다
  const [notionDate, setNotionDate] = useState<string | null>(null);
  useEffect(() => {
    if (boot.user.role !== 'owner') return;
    api<{ imported: string | null }>('/import/notion').then((r) => setNotionDate(r.imported)).catch(() => {});
  }, [boot.user.role]);
  return (
    <>
      <div className="tabs">
        {(
          [
            ['cat', '카테고리', '예산'],
            ['rec', '고정지출', '매월 자동'],
            ['family', '가족', '비밀번호'],
            ['feature', '더 쓰는', '기능'],
            ['look', '꾸미기', ''],
            ...(boot.user.role === 'owner' && notionDate ? ([['notion', '노션 가져온', '것 정리']] as const) : []),
          ] as const
        ).map(([k, a, b]) => (
          <button key={k} className={`tab2 ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>
            <span>{a}</span> <span>{b}</span>
          </button>
        ))}
      </div>
      {tab === 'cat' && <Categories boot={boot} onError={onError} toast={toast} reloadBoot={reloadBoot} />}
      {tab === 'rec' && <RecurringList boot={boot} onError={onError} toast={toast} reloadBoot={reloadBoot} />}
      {tab === 'family' && <Family boot={boot} onError={onError} toast={toast} reloadBoot={reloadBoot} />}
      {tab === 'notion' && notionDate && (
        <NotionCleanup
          date={notionDate}
          onDone={(n) => {
            setNotionDate(null);
            setTab('cat');
            reloadBoot();
            toast(`노션에서 가져온 거래 ${n.toLocaleString()}건을 지웠어요`);
          }}
          onError={onError}
        />
      )}
      {tab === 'look' && <LookSettings boot={boot} onError={onError} toast={toast} reloadBoot={reloadBoot} />}
      {tab === 'feature' && <Features boot={boot} onError={onError} toast={toast} reloadBoot={reloadBoot} />}
    </>
  );
}

type P = { boot: Boot; onError: (e: unknown) => void; toast: Toast; reloadBoot: () => void };

function Categories({ boot, onError, toast, reloadBoot }: P) {
  const [edit, setEdit] = useState<Partial<Category> | null>(null);
  // 머니노트 카테고리: 올해 머니노트에 잡은 이번 달·1년 금액도 같이 보여 줌
  const [mnInfo, setMnInfo] = useState(false); // '머니노트 예산은 머니노트 탭에서' 안내 팝업
  const [mn, setMn] = useState<{ categoryId: string; month: string; amount: number }[]>([]);
  useEffect(() => {
    api<{ notes: { categoryId: string; month: string; amount: number }[] }>(`/money-notes?year=${boot.today.slice(0, 4)}`)
      .then((r) => setMn(r.notes))
      .catch(() => setMn([]));
  }, [boot.today]);
  const mnSum = (cid: string, month?: string) => mn.filter((n) => n.categoryId === cid && (!month || n.month === month)).reduce((a, n) => a + n.amount, 0);
  async function save() {
    try {
      // 머니노트만으로 예산을 잡는 카테고리는 기본 월 예산 0 (예산은 머니노트에서)
      const onlyNote = (edit?.grp === 'var' || edit?.grp === 'fix') && edit?.moneynote && !edit?.moneynoteAdd;
      await api('/categories', { ...edit, budget: onlyNote ? 0 : parseAmount(String(edit?.budget ?? 0)) ?? 0 });
      toast('저장했어요');
      setEdit(null);
      reloadBoot();
    } catch (e) {
      onError(e);
    }
  }
  // 끌어서 순서 바꾸기: 손잡이(⋮⋮)를 누른 채 위아래로 → 놓으면 저장
  const [drag, setDrag] = useState<{ grp: string; id: string; ids: string[]; moved: boolean } | null>(null);
  function dragStart(e: React.PointerEvent, grp: string, id: string, ids: string[]) {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ grp, id, ids, moved: false });
  }
  function dragMove(e: React.PointerEvent) {
    if (!drag) return;
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('tr[data-cat]') as HTMLElement | null;
    const over = el?.dataset.cat;
    if (!over || over === drag.id || el?.dataset.grp !== drag.grp) return;
    const ids = drag.ids.filter((x) => x !== drag.id);
    const at = ids.indexOf(over);
    const from = drag.ids.indexOf(drag.id), to = drag.ids.indexOf(over);
    ids.splice(to > from ? at + 1 : at, 0, drag.id);
    setDrag({ ...drag, ids, moved: true });
  }
  async function dragEnd() {
    if (!drag) return;
    const d = drag;
    if (!d.moved) return setDrag(null);
    try {
      await api('/categories/order', { ids: d.ids });
      reloadBoot();
    } catch (e) {
      onError(e);
    }
    setTimeout(() => setDrag(null), 300); // 새 순서가 올 때까지 끌어 둔 순서 유지
  }

  // 지우기: 쓰는 곳이 있으면 옮길 카테고리 고르기
  const [del, setDel] = useState<{ tx: number; recurring: number; notes: number; loans: number; moveTo: string } | null>(null);
  async function askDelete() {
    if (!edit?.id) return;
    try {
      const u = await api<{ tx: number; recurring: number; notes: number; loans: number }>(`/categories/usage?id=${edit.id}`);
      if (u.tx + u.recurring + u.notes + u.loans === 0) {
        if (!confirm(`'${edit.name}' 카테고리를 지울까요? (쓴 기록이 없어요)`)) return;
        await doDelete(null);
      } else setDel({ ...u, moveTo: '' });
    } catch (e) {
      onError(e);
    }
  }
  async function doDelete(moveTo: string | null) {
    if (!edit?.id) return;
    try {
      await api('/categories/delete', { id: edit.id, moveTo });
      toast(moveTo ? `옮기고 지웠어요` : '지웠어요');
      setDel(null);
      setEdit(null);
      reloadBoot();
    } catch (e) {
      onError(e);
    }
  }
  const sideOf = (g?: string) => (g === 'var' || g === 'fix' || g === 'spc' ? 'out' : g);
  return (
    <div className="split">
      {mnInfo && (
        <div className="pop-bg" style={{ zIndex: 150 }} onClick={(e) => e.target === e.currentTarget && setMnInfo(false)}>
          <div className="card pop" style={{ width: 'min(420px, 100%)' }}>
            <h3>머니노트 예산</h3>
            <p style={{ margin: '4px 0 14px' }}>머니노트 카테고리의 달별 예산은 <b>머니플랜 › 머니노트</b> 탭에서 설정할 수 있습니다.</p>
            <div className="row pop-actions">
              <span className="spacer" />
              <button className="btn" onClick={() => setMnInfo(false)}>
                닫기
              </button>
              <button className="btn main" onClick={() => (window.location.hash = `#/plan?tab=note&year=${boot.today.slice(0, 4)}`)}>
                머니노트로 가기
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="main-col">
        {boot.groups.map((g) => {
          const base = boot.categories.filter((c) => c.grp === g.key);
          const cats = drag?.grp === g.key ? drag.ids.map((id) => base.find((c) => c.id === id)!).filter(Boolean) : base;
          const sum = cats.filter((c) => !c.hidden).reduce((s, c) => s + c.budget, 0);
          return (
            <div className="card" key={g.key}>
              <h3 className="row">
                <Icon name={GROUP_ICON[g.key]} /> {g.name}{' '}
                <span className="muted">월 예산 합계 {won(sum)}원</span>
                <span className="spacer" />
                <button className="btn sm" onClick={() => setEdit({ grp: g.key as Group, name: '', icon: '', budget: 0 })}>
                  ＋ 카테고리
                </button>
              </h3>
              <table className="list">
                <tbody>
                  {cats.map((c) => (
                    <tr key={c.id} data-cat={c.id} data-grp={g.key} className={`${c.hidden ? 'dim' : ''} ${drag?.id === c.id ? 'dragging' : ''}`}>
                      <td>
                        
                        <Icon name={c.icon} /> <b>{c.name}</b> {c.hidden && <span className="tag">숨김</span>}
                      </td>
                      <td className="r">
                        {c.moneynote ? (
                          <span className="budget-pair">
                            {c.budget > 0 && <span>월 {won(c.budget)}원</span>}
                            <span className="click" title="눌러서 머니노트로" onClick={() => setMnInfo(true)}>
                              <span className="tag">머니노트</span> 1년 {won(mnSum(c.id))}원
                            </span>
                          </span>
                        ) : c.budget ? (
                          `월 ${won(c.budget)}원`
                        ) : (
                          <span className="muted">예산 없음</span>
                        )}
                      </td>
                      <td className="r nowrap">
                        <button className="btn sm" onClick={() => (setDel(null), setEdit({ ...c }))}>
                          고치기
                        </button>
                        <span className="drag-handle" title="꾹 누른 채 위아래로 끌면 순서가 바뀌어요" onPointerDown={(e) => dragStart(e, g.key, c.id, base.map((x) => x.id))} onPointerMove={dragMove} onPointerUp={dragEnd} onPointerCancel={dragEnd}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
      <div className={`side-col ${edit ? 'as-modal' : ''}`} onClick={(e) => e.target === e.currentTarget && setEdit(null)}>
        {edit && (
          <div className="card sticky">
            <h3>{edit.id ? '카테고리 고치기' : '카테고리 추가'}</h3>
            <div className="vform">
              <label>대분류</label>
              <div className="chips">
                {boot.groups.map((g) => (
                  <button key={g.key} className={`chip ${edit.grp === g.key ? 'on' : ''}`} onClick={() => setEdit({ ...edit, grp: g.key })}>
                    {g.name}
                  </button>
                ))}
              </div>
              <label>이름</label>
              <input className="text" value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="예: 보리" />
              <label>아이콘</label>
              <div className="iconpick">
                {Object.keys(ICONS).map((k) => (
                  <button key={k} type="button" className={iconKey(edit.icon) === k ? 'on' : ''} title={k} onClick={() => setEdit({ ...edit, icon: k })}>
                    <Icon name={k} size={17} />
                  </button>
                ))}
              </div>
              <label>{edit.moneynote && edit.moneynoteAdd ? '매달 기본 예산' : '월 예산'}</label>
              {edit.moneynote && !edit.moneynoteAdd ? (
                // 머니노트만으로 예산을 잡는 카테고리: 예산은 머니노트 탭에서
                <div>
                  <button type="button" className="btn sm" onClick={() => setMnInfo(true)}>
                    머니노트에서 달별 예산 적기 ▸
                  </button>
                </div>
              ) : (
                <input className="text money" inputMode="numeric" placeholder="0" value={edit.budget ? won(edit.budget) : ''} onChange={(e) => setEdit({ ...edit, budget: parseAmount(e.target.value) ?? 0 })} />
              )}
              {(edit.grp === 'var' || edit.grp === 'fix') && (
                <>
                  <label />
                  <label className="check">
                    <input type="checkbox" checked={!!edit.moneynote} onChange={(e) => setEdit({ ...edit, moneynote: e.target.checked })} /> 머니노트로 예산 잡기 <span className="muted small">(명절·생일·재산세·여행처럼 해마다 오는 것)</span>
                  </label>
                  {edit.moneynote && (
                    <>
                      <label />
                      <div className="mn-mode">
                        <div className="mn-mode-q">머니노트에 금액을 적은 달, 그달 예산은?</div>
                        {[
                          { add: false, t: '머니노트 금액만', ex: (b: string) => `월 예산 ${b} 대신 머니노트 금액만 (예: 경조사·여행처럼 평소엔 안 쓰는 것)` },
                          { add: true, t: '월 예산 + 머니노트', ex: (b: string) => `월 예산 ${b}에 머니노트 금액을 더해서 (예: 자동차 — 기름값은 매달, 정비비는 그달에 더)` },
                        ].map((o) => (
                          <label key={String(o.add)} className={`mn-mode-opt ${!!edit.moneynoteAdd === o.add ? 'on' : ''}`}>
                            <input type="radio" checked={!!edit.moneynoteAdd === o.add} onChange={() => setEdit({ ...edit, moneynoteAdd: o.add })} />
                            <span>
                              <b>{o.t}</b>
                              <span className="muted small"> — {o.ex(edit.budget ? `${won(edit.budget)}원` : '')}</span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
              {edit.id && (
                <>
                  <label />
                  <label className="check">
                    <input type="checkbox" checked={!!edit.hidden} onChange={(e) => setEdit({ ...edit, hidden: e.target.checked })} /> 숨기기 (지난 기록은 그대로)
                  </label>
                </>
              )}
              <label />
              <span className="muted small">이름을 바꾸거나 대분류를 옮겨도 지난 거래는 그대로 따라와요.</span>
              {edit.id && del && (
                <>
                  <label />
                  {(
                    <div className="del-box">
                      <p>
                        <b>{edit.name}</b>에 적힌 것: {[del.tx && `거래 ${del.tx}건`, del.recurring && `고정지출 ${del.recurring}개`, del.notes && `머니노트 ${del.notes}줄`, del.loans && `상환표 연결`].filter(Boolean).join(', ')}
                      </p>
                      <p className="muted small">지우기 전에 이것들을 옮길 카테고리를 골라 주세요. 돈 기록은 하나도 사라지지 않고, 지난 결산 숫자도 옮긴 카테고리에 합쳐져요.</p>
                      <select className="text" value={del.moveTo} onChange={(e) => setDel({ ...del, moveTo: e.target.value })}>
                        <option value="">옮길 카테고리 고르기</option>
                        {boot.groups
                          .filter((g) => sideOf(g.key) === sideOf(boot.categories.find((c) => c.id === edit.id)?.grp))
                          .map((g) => (
                            <optgroup key={g.key} label={g.name}>
                              {boot.categories
                                .filter((c) => c.grp === g.key && c.id !== edit.id)
                                .map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name}
                                    {c.hidden ? ' (숨김)' : ''}
                                  </option>
                                ))}
                            </optgroup>
                          ))}
                      </select>
                      <div className="row" style={{ marginTop: 8 }}>
                        <button className="btn sm danger" disabled={!del.moveTo} onClick={() => doDelete(del.moveTo)}>
                          옮기고 지우기
                        </button>
                        <button className="btn sm" onClick={() => setDel(null)}>
                          그만두기
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
              <div className="row pop-actions">
                {edit.id && !del && (
                  <button className="btn sm danger" onClick={askDelete}>
                    이 카테고리 지우기
                  </button>
                )}
                <span className="spacer" />
                <button className="btn" onClick={() => setEdit(null)}>
                  닫기
                </button>
                <button className="btn main" onClick={save}>
                  저장
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RecurringList({ boot, onError, toast, reloadBoot }: P) {
  const [edit, setEdit] = useState<Partial<Recurring> | null>(null);
  const cat = (id: string | null) => boot.categories.find((c) => c.id === id);
  const acc = (id: string | null) => boot.accounts.find((a) => a.id === id)?.name ?? '';
  async function save() {
    try {
      await api('/recurring', { ...edit, amount: parseAmount(String(edit?.amount ?? 0)) ?? 0 });
      toast(edit?.mode === 'batch' ? '저장했어요 · 거래 화면의 "고정지출 한꺼번에 넣기"에 보여요' : '저장했어요 · 이번 달 몫도 바로 넣었어요');
      setEdit(null);
      reloadBoot();
    } catch (e) {
      onError(e);
    }
  }
  async function stop(r: Recurring) {
    if (!confirm(`"${r.title}" 자동 입력을 멈출까요? 지난 거래는 그대로 남아요.`)) return;
    try {
      await api(`/recurring/${r.id}/stop`, {});
      reloadBoot();
    } catch (e) {
      onError(e);
    }
  }
  const grpOf = (r: Partial<Recurring>) => cat(r.categoryId ?? null)?.grp;
  return (
    <div className="split">
      <div className="main-col">
        <div className="card">
          <h3 className="row">
            고정지출 목록
            <span className="spacer" />
            <button className="btn sm" onClick={() => setEdit({ title: '', amount: 0, day: 1, categoryId: null, mode: 'auto' })}>
              ＋ 고정 항목
            </button>
          </h3>
          <table className="list">
            <thead>
              <tr>
                <th>항목</th>
                <th>카테고리</th>
                <th>넣는 방식</th>
                <th>통장·카드</th>
                <th className="r">금액</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {boot.recurring.map((r) => (
                <tr key={r.id} className={r.active ? '' : 'dim'}>
                  <td>
                    <b>{r.title}</b> {!r.active && <span className="tag">멈춤</span>}
                  </td>
                  <td>{cat(r.categoryId)?.name ?? '이체'}</td>
                  <td>{r.mode === 'batch' ? <span className="tag">한꺼번에 넣기</span> : `매월 ${r.day}일 자동`}{r.loanPart && <span className="muted small"> · 상환표 {r.loanPart === 'principal' ? '원금' : '이자'}</span>}</td>
                  <td className="muted">{[acc(r.fromAccount), acc(r.toAccount)].filter(Boolean).join(' → ')}</td>
                  <td className="r">{won(r.amount)}</td>
                  <td className="r nowrap">
                    <button className="btn sm" onClick={() => setEdit({ ...r })}>
                      고치기
                    </button>
                    {r.active && (
                      <button className="btn sm" onClick={() => stop(r)}>
                        멈추기
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {boot.recurring.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    아직 없어요. 통신비·보험료처럼 매달 같은 날 나가는 걸 넣어 두세요.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="muted small"><b>매월 자동</b>: 정한 날 그달 거래가 저절로 들어가요. <b>한꺼번에 넣기</b>: 거래 화면 위 '고정지출'에서 금액을 확인하고 한 번에 넣어요(날짜·금액이 조금씩 바뀌는 항목에 좋아요).</p>
        </div>
      </div>
      <div className={`side-col ${edit ? 'as-modal' : ''}`} onClick={(e) => e.target === e.currentTarget && setEdit(null)}>
        {edit && (
          <div className="card sticky">
            <h3>{edit.id ? '고정 항목 고치기' : '고정 항목 추가'}</h3>
            <div className="vform">
              <label>항목</label>
              <input className="text" value={edit.title ?? ''} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder="예: 통신비" />
              <label>카테고리</label>
              <select className="text" value={edit.categoryId ?? ''} onChange={(e) => setEdit({ ...edit, categoryId: e.target.value || null })}>
                <option value="">이체 (카테고리 없음)</option>
                {boot.groups.map((g) => (
                  <optgroup key={g.key} label={g.name}>
                    {boot.categories
                      .filter((c) => c.grp === g.key && !c.hidden)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
              <label>금액</label>
              <input className="text money" inputMode="numeric" placeholder="0" value={edit.amount ? won(edit.amount) : ''} onChange={(e) => setEdit({ ...edit, amount: parseAmount(e.target.value) ?? 0 })} />
              <label>넣는 방식</label>
              <span className="seg">
                <button className={edit.mode !== 'batch' ? 'on' : ''} onClick={() => setEdit({ ...edit, mode: 'auto' })}>
                  매월 자동
                </button>
                <button className={edit.mode === 'batch' ? 'on' : ''} onClick={() => setEdit({ ...edit, mode: 'batch' })}>
                  한꺼번에 넣기
                </button>
              </span>
              {edit.mode !== 'batch' && (
                <>
                  <label>매월</label>
                  <div className="row">
                    <input className="text" inputMode="numeric" style={{ width: 80 }} value={edit.day ? String(edit.day) : ''} onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 2); setEdit({ ...edit, day: v ? Math.min(31, Number(v)) : 0 }); }} onBlur={() => !edit.day && setEdit({ ...edit, day: 1 })} />일
                  </div>
                </>
              )}
              {boot.featureLoan && (
                <>
                  <label>상환표 금액</label>
                  <select className="text" value={edit.loanAccount && edit.loanPart ? `${edit.loanAccount}|${edit.loanPart}` : ''} onChange={(e) => { const [a, p] = e.target.value.split('|'); setEdit({ ...edit, loanAccount: a || null, loanPart: (p as 'principal' | 'interest') || null }); }}>
                    <option value="">쓰지 않음</option>
                    {boot.accounts.filter((a) => a.kind === '대출').flatMap((a) => [
                      <option key={a.id + 'p'} value={`${a.id}|principal`}>{a.name} 상환표 원금</option>,
                      <option key={a.id + 'i'} value={`${a.id}|interest`}>{a.name} 상환표 이자</option>,
                    ])}
                  </select>
                </>
              )}
              {grpOf(edit) !== 'inc' && (
                <>
                  <label>나가는 통장·카드</label>
                  <select className="text" value={edit.fromAccount ?? ''} onChange={(e) => setEdit({ ...edit, fromAccount: e.target.value || null })}>
                    <option value="">고르지 않음</option>
                    {boot.accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </>
              )}
              {!isSpending(grpOf(edit)) && (
                <>
                  <label>들어가는 통장</label>
                  <select className="text" value={edit.toAccount ?? ''} onChange={(e) => setEdit({ ...edit, toAccount: e.target.value || null })}>
                    <option value="">고르지 않음</option>
                    {boot.accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </>
              )}
              <label>끝나는 달</label>
              <input className="text" type="month" value={edit.endMonth ?? ''} onChange={(e) => setEdit({ ...edit, endMonth: e.target.value || null })} />
              <div className="row pop-actions">
                <span className="spacer" />
                <button className="btn" onClick={() => setEdit(null)}>
                  닫기
                </button>
                <button className="btn main" onClick={save}>
                  저장
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Family({ boot, onError, toast, reloadBoot }: P) {
  const [name, setName] = useState('');
  const [pw, setPw] = useState('');
  const [myPw, setMyPw] = useState('');
  async function add() {
    try {
      await api('/users', { name, password: pw });
      toast(`${name}님을 추가했어요`);
      setName('');
      setPw('');
      reloadBoot();
    } catch (e) {
      onError(e);
    }
  }
  async function change() {
    try {
      await api('/password', { password: myPw });
      toast('비밀번호를 바꿨어요');
      setMyPw('');
    } catch (e) {
      onError(e);
    }
  }
  return (
    <div className="row" style={{ alignItems: 'flex-start' }}>
      <HouseholdName boot={boot} onError={onError} toast={toast} reloadBoot={reloadBoot} />
        <div className="card col">
        <h3>가족</h3>
        {boot.users.map((u) => (
          <div key={u.id} className="row" style={{ padding: '3px 0' }}>
            <b>{u.name}</b> <span className="muted">{u.role === 'owner' ? '관리자' : '가족'}</span>
            {boot.user.role === 'owner' && u.role !== 'owner' && (
              <button
                className="btn sm"
                onClick={async () => {
                  const p = prompt(`${u.name} 님의 새 비밀번호 (6자 이상) — 알려 드리고, 로그인한 뒤 본인이 바꾸게 해 주세요`);
                  if (p === null) return;
                  try {
                    await api('/users/reset', { userId: u.id, password: p });
                    toast(`${u.name} 님 비밀번호를 새로 정했어요`);
                  } catch (e) {
                    onError(e);
                  }
                }}
              >
                비밀번호 새로 정하기
              </button>
            )}
          </div>
        ))}
        {boot.user.role === 'owner' && (
          <div className="vform" style={{ marginTop: 12 }}>
            <label>이름</label>
            <input className="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 남편" />
            <label>처음 비밀번호</label>
            <input className="text" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="6자 이상" />
            <label />
            <button className="btn main" onClick={add} disabled={!name || pw.length < 6}>
              가족 추가
            </button>
            <label />
            <span className="muted small">추가한 가족은 이 이름과 비밀번호로 로그인해요. 로그인한 뒤 비밀번호를 바꿀 수 있어요.</span>
          </div>
        )}
      </div>
      <div className="card col">
        <h3>내 비밀번호 바꾸기</h3>
        <div className="vform">
          <label>새 비밀번호</label>
          <input className="text" type="password" value={myPw} onChange={(e) => setMyPw(e.target.value)} placeholder="6자 이상" />
          <label />
          <button className="btn main" onClick={change} disabled={myPw.length < 6}>
            바꾸기
          </button>
        </div>
      </div>
    </div>
  );
}

// 원하는 사람만 켜는 기능 (나중에 배포할 때 다른 분들은 꺼진 채로 시작)
function Features({ boot, onError, toast, reloadBoot }: P) {
  async function setNospend(on: boolean) {
    try {
      await api('/prefs/nospend', { on });
      toast(on ? '홈에 무지출 달력을 보여 줘요' : '무지출 달력을 껐어요');
      reloadBoot();
    } catch (e) {
      onError(e);
    }
  }
  async function setLoan(on: boolean) {
    try {
      await api('/loans/feature', { on });
      toast(on ? '대출 상환표를 켰어요 — 통장·투자 화면 아래에 생겨요' : '대출 상환표를 껐어요 (넣어 둔 상환표는 그대로 있어요)');
      reloadBoot();
    } catch (e) {
      onError(e);
    }
  }
  return (
    <div className="card" style={{ maxWidth: 720 }}>
      <h3>더 쓰는 기능</h3>
      <div className="row" style={{ alignItems: 'flex-start', gap: 14 }}>
        <span className="seg">
          <button className={boot.featureLoan ? 'on' : ''} onClick={() => setLoan(true)}>
            켜기
          </button>
          <button className={!boot.featureLoan ? 'on' : ''} onClick={() => setLoan(false)}>
            끄기
          </button>
        </span>
        <div>
          <b>대출 상환표</b>
          <p className="muted small" style={{ margin: '4px 0 0' }}>
            은행 상환계획표를 붙여 넣어 달마다 원금·이자·남은 대출금을 보고, 앱 잔액과 1원까지 비교해요. 고른 달부터는 상환·대출이자 예산에 그달 상환표 금액이 자동으로 더해져요. 원금·이자가 달마다 조금씩 바뀌는 대출(원리금균등)에 좋아요.
          </p>
        </div>
      </div>
      <div className="row" style={{ alignItems: 'flex-start', gap: 14, marginTop: 16 }}>
        <span className="seg">
          <button className={boot.nospendCal !== false ? 'on' : ''} onClick={() => setNospend(true)}>
            켜기
          </button>
          <button className={boot.nospendCal === false ? 'on' : ''} onClick={() => setNospend(false)}>
            끄기
          </button>
        </span>
        <div>
          <b>무지출 달력</b> <NewBadge id="nospend-setting" />
          <p className="muted small" style={{ margin: '4px 0 0' }}>
            홈에 이번 달 무지출한 날을 달력으로 보여 줘요. 나만 켜고 끌 수 있어요(가족은 각자).
          </p>
        </div>
      </div>
    </div>
  );
}

// 가계부 이름 (위 메뉴 왼쪽·카페 이미지에 나옴)
function HouseholdName({ boot, onError, toast, reloadBoot }: P) {
  const [v, setV] = useState(boot.household);
  async function save() {
    try {
      await api('/household', { name: v });
      toast('가계부 이름을 바꿨어요');
      reloadBoot();
    } catch (e) {
      onError(e);
    }
  }
  return (
    <div className="card" style={{ maxWidth: 520 }}>
      <h3>가계부 이름</h3>
      <div className="row">
        <input className="text" value={v} maxLength={30} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} placeholder="예: 다희네 가계부" />
        <button className="btn main" disabled={!v.trim() || v.trim() === boot.household} onClick={save}>
          저장
        </button>
      </div>
      <p className="muted small">맨 위 메뉴 왼쪽과 카페 이미지 아래에 나와요.</p>
    </div>
  );
}
