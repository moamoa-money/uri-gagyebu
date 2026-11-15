// 통장·카드 잔액 + 투자 목록
import { useCallback, useEffect, useState } from 'react';
import { parseAmount, parseSignedAmount, won } from '../shared/rules';
import type { Investment } from '../shared/types';
import { api } from './api';
import { LoanSchedules } from './Loans';
import { Valuations } from './Valuations';
import { DAILY_KINDS, isPinned, type AccountWithBalance, type Boot, type Toast } from './data';

export function Accounts({ boot, onError, toast, go, reloadBoot }: { boot: Boot; onError: (e: unknown) => void; toast: Toast; go: (h: string) => void; reloadBoot: () => void }) {
  const [list, setList] = useState<AccountWithBalance[] | null>(null);
  const [inv, setInv] = useState<Investment[]>([]);
  const [edit, setEdit] = useState<(Partial<AccountWithBalance> & { pin?: boolean }) | null>(null);
  const [editInv, setEditInv] = useState<Partial<Investment> | null>(null);
  // 시작 잔액 칸 글자 (마이너스 입력 중 '-'만 있는 상태도 지키려고 따로 둠)
  const [startText, setStartText] = useState('');
  const editKey = edit === null ? null : (edit.id ?? 'new');
  useEffect(() => {
    if (editKey === null) return;
    const n = edit?.startBalance ?? 0;
    setStartText(n === 0 ? '' : (n < 0 ? '-' : '') + won(Math.abs(n)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editKey]);
  const load = useCallback(() => {
    api<AccountWithBalance[]>('/accounts').then(setList).catch(onError);
    api<Investment[]>('/investments').then(setInv).catch(onError);
  }, [onError]);
  useEffect(load, [load]);

  async function saveAcc() {
    if (!edit) return;
    try {
      const saved = await api<AccountWithBalance[]>('/accounts', { ...edit, startBalance: parseSignedAmount(startText) ?? 0 });
      setList(saved);
      // 거래 화면 잔액 칸에 보일지: 지금 보이는 목록에서 이 통장만 켜고/끄기
      const id = edit.id ?? saved.find((a) => a.name === edit.name?.trim())?.id;
      if (id) {
        const now = saved.filter((a) => a.id !== id && isPinned(boot, a)).map((a) => a.id);
        const want = edit.pin ?? DAILY_KINDS.includes(edit.kind ?? '');
        await api('/balance-accounts', { ids: want ? [...now, id] : now });
      }
      setEdit(null);
      toast('저장했어요');
      reloadBoot();
    } catch (e) {
      onError(e);
    }
  }
  async function saveInv() {
    if (!editInv) return;
    try {
      setInv(await api<Investment[]>('/investments', { ...editInv, amount: parseAmount(String(editInv.amount ?? 0)) ?? 0 }));
      setEditInv(null);
      toast('저장했어요');
    } catch (e) {
      onError(e);
    }
  }

  if (!list) return <p className="muted">불러오는 중…</p>;
  const shown = list.filter((a) => !a.hidden);
  const total = shown.reduce((s, a) => s + a.balance, 0);
  const invTotal = inv.filter((i) => i.status !== '만기완료').reduce((s, i) => s + i.amount, 0);

  return (
    <div className="split">
      <div className="main-col">
        <div className="card">
          <h3 className="row">
            통장·카드 <span className="muted">합계 {won(total)}원</span>
            <span className="spacer" />
            <button className="btn sm" onClick={() => setEdit({ name: '', kind: '은행', startBalance: 0 })}>
              ＋ 통장 추가
            </button>
          </h3>
          <table className="list">
            <thead>
              <tr>
                <th>이름</th>
                <th>분류</th>
                <th className="r">잔액</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((a) => (
                <tr key={a.id} className={a.hidden ? 'dim' : ''}>
                  <td className="click" onClick={() => go(`#/tx?account=${a.id}`)}>
                    <b>{a.name}</b> {a.hidden && <span className="tag">숨김</span>}
                    {!a.hidden && isPinned(boot, a) && <span className="tag" title="거래 화면 위 잔액 칸에 보여요">거래 화면</span>}
                  </td>
                  <td>{a.kind}</td>
                  <td className={`r ${a.balance < 0 ? 'bad' : ''}`}>{won(a.balance)}</td>
                  <td className="r">
                    <button className="btn sm" onClick={() => go(`#/tx?account=${a.id}`)}>
                      내역
                    </button>
                    <button className="btn sm" onClick={() => setEdit({ ...a, pin: isPinned(boot, a) })}>
                      고치기
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">잔액 = 시작 잔액 + 입금 − 결제·출금. 카드는 쓴 만큼 마이너스로 쌓였다가, 결제일에 통장 → 카드 "이체"로 갚으면 0이 돼요.</p>
        </div>

        <div className="card">
          <h3 className="row">
            투자 목록 <span className="muted">투자 중 {won(invTotal)}원</span>
            <span className="spacer" />
            <button className="btn sm" onClick={() => setEditInv({ name: '', kind: '주식', status: '투자중', amount: 0 })}>
              ＋ 투자 추가
            </button>
          </h3>
          <table className="list">
            <thead>
              <tr>
                <th>상품</th>
                <th>유형</th>
                <th>상태</th>
                <th>시작</th>
                <th>만기</th>
                <th className="r">금액</th>
              </tr>
            </thead>
            <tbody>
              {inv.map((i) => (
                <tr key={i.id} className={`click ${i.status === '만기완료' ? 'dim' : ''}`} onClick={() => setEditInv({ ...i })}>
                  <td>
                    <b>{i.name}</b>
                  </td>
                  <td>{i.kind}</td>
                  <td>
                    <span className="tag">{i.status}</span>
                  </td>
                  <td>{i.startDate ?? ''}</td>
                  <td>{i.maturity ?? ''}</td>
                  <td className="r">{won(i.amount)}</td>
                </tr>
              ))}
              {inv.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    아직 투자 목록이 없어요.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Valuations boot={boot} onError={onError} toast={toast} />
        {boot.featureLoan && <LoanSchedules boot={boot} onError={onError} toast={toast} />}
      </div>

      <div className="side-col">
        {edit && (
          <div className="card sticky">
            <h3>{edit.id ? '통장 고치기' : '통장 추가'}</h3>
            <div className="vform">
              <label>이름</label>
              <input className="text" value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="예: 신한생활비" />
              <label>분류</label>
              <div className="chips">
                {boot.accountKinds.map((k) => (
                  <button key={k} className={`chip ${edit.kind === k ? 'on' : ''}`} onClick={() => setEdit({ ...edit, kind: k })}>
                    {k}
                  </button>
                ))}
              </div>
              <label>시작 잔액</label>
              <input className="text money" inputMode="text" value={startText} onChange={(e) => {
                  const v = e.target.value.replace(/[^\d,\-−]/g, '');
                  const n = parseSignedAmount(v);
                  setStartText(n === null ? (/^\s*[-−]/.test(v) ? '-' : '') : (n < 0 ? '-' : '') + won(Math.abs(n)));
                }} placeholder="0" />
              <span className="muted small">카드처럼 갚을 돈이 남아 있으면 앞에 - 를 붙여요. 예: -120,000</span>
              <label />
              <label className="check">
                <input type="checkbox" checked={edit.pin ?? DAILY_KINDS.includes(edit.kind ?? '')} onChange={(e) => setEdit({ ...edit, pin: e.target.checked })} /> 거래 화면 잔액에 보이기
              </label>
              {edit.id && (
                <>
                  <label />
                  <label className="check">
                    <input type="checkbox" checked={!!edit.hidden} onChange={(e) => setEdit({ ...edit, hidden: e.target.checked })} /> 숨기기 (안 쓰는 통장)
                  </label>
                </>
              )}
              <label />
              <div className="row">
                <button className="btn main" onClick={saveAcc}>
                  저장
                </button>
                <button className="btn" onClick={() => setEdit(null)}>
                  닫기
                </button>
              </div>
            </div>
          </div>
        )}
        {editInv && (
          <div className="card sticky">
            <h3>{editInv.id ? '투자 고치기' : '투자 추가'}</h3>
            <div className="vform">
              <label>이름</label>
              <input className="text" value={editInv.name ?? ''} onChange={(e) => setEditInv({ ...editInv, name: e.target.value })} />
              <label>유형</label>
              <div className="chips">
                {['주식', '딜투자', '기타'].map((k) => (
                  <button key={k} className={`chip ${editInv.kind === k ? 'on' : ''}`} onClick={() => setEditInv({ ...editInv, kind: k })}>
                    {k}
                  </button>
                ))}
              </div>
              <label>상태</label>
              <div className="chips">
                {['투자중', '재투자', '만기완료'].map((k) => (
                  <button key={k} className={`chip ${editInv.status === k ? 'on' : ''}`} onClick={() => setEditInv({ ...editInv, status: k })}>
                    {k}
                  </button>
                ))}
              </div>
              <label>금액</label>
              <input className="text money" inputMode="numeric" value={won(editInv.amount ?? 0)} onChange={(e) => setEditInv({ ...editInv, amount: parseAmount(e.target.value) ?? 0 })} />
              <label>통장</label>
              <select className="text" value={editInv.accountId ?? ''} onChange={(e) => setEditInv({ ...editInv, accountId: e.target.value || null })}>
                <option value="">고르지 않음</option>
                {list.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <label>시작일</label>
              <input className="text" type="date" value={editInv.startDate ?? ''} onChange={(e) => setEditInv({ ...editInv, startDate: e.target.value || null })} />
              <label>만기일</label>
              <input className="text" type="date" value={editInv.maturity ?? ''} onChange={(e) => setEditInv({ ...editInv, maturity: e.target.value || null })} />
              <label>메모</label>
              <input className="text" value={editInv.memo ?? ''} onChange={(e) => setEditInv({ ...editInv, memo: e.target.value })} />
              <label />
              <div className="row">
                <button className="btn main" onClick={saveInv}>
                  저장
                </button>
                <button className="btn" onClick={() => setEditInv(null)}>
                  닫기
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
