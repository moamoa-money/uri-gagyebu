// 대출 상환표 (설정에서 켠 사람만): 은행 상환계획표 붙여넣기 → 달별 원금·이자·남은 대출금,
// 앱 잔액과 비교(1원까지), 예산에 그달 원금·이자 더하기(연결한 달부터)
import { useCallback, useEffect, useState } from 'react';
import { addMonths } from '../shared/dates';
import { parseAmount, parseLoanTable, won, type LoanRow } from '../shared/rules';
import { api } from './api';
import type { Boot, Toast } from './data';

interface LoanData {
  feature: boolean;
  loans: {
    account: { id: string; name: string };
    link: { principalCategory: string | null; interestCategory: string | null; startMonth: string | null } | null;
    rows: (LoanRow & { appBalance: number })[];
  }[];
}

export function LoanSchedules({ boot, onError, toast }: { boot: Boot; onError: (e: unknown) => void; toast: Toast }) {
  const [d, setD] = useState<LoanData | null>(null);
  const load = useCallback(() => api<LoanData>('/loans').then(setD).catch(onError), [onError]);
  useEffect(() => void load(), [load]);
  if (!d || !d.feature) return null;
  return (
    <>
      <details className="help loan-help">
        <summary>대출 상환표 쓰는 법</summary>
        <ul>
          <li>대상: 은행 상환계획표가 있는 대출(주담대 등) — 통장·투자에 분류 '대출' 통장 필요</li>
          <li>① 상환표 붙여넣기: 은행 표 복사 → 붙여넣기 → 넣기</li>
          <li>② 예산 연결: 시작 달 + 원금·이자 카테고리 선택 → 연결</li>
          <li>③ 고정지출 등록(설정 › 고정지출): '한꺼번에 넣기' + 상환표 연결 → 달마다 원금·이자 자동 금액</li>
          <li>표의 '앱 잔액': 거래로 계산한 대출 잔액 — 은행 남은 대출금과 비교(딱 맞음/차이)</li>
          <li>표 칸 선택 시 바로 수정</li>
        </ul>
      </details>
      {d.loans.map((l) => (
        <LoanCard key={l.account.id} l={l} boot={boot} setD={setD} onError={onError} toast={toast} />
      ))}
    </>
  );
}

function LoanCard({ l, boot, setD, onError, toast }: { l: LoanData['loans'][number]; boot: Boot; setD: (d: LoanData) => void; onError: (e: unknown) => void; toast: Toast }) {
  const thisMonth = boot.today.slice(0, 7);
  const [paste, setPaste] = useState('');
  const [open, setOpen] = useState(false); // 처음엔 접어 둠 (상환표 없는 대출도 한 줄로)
  const [showAll, setShowAll] = useState(false);
  const parsed = paste.trim() ? parseLoanTable(paste) : [];
  // 표에서 칸 하나 고치기: 그달 한 줄을 통째로 다시 저장
  async function saveCell(r: LoanRow, field: 'payment' | 'principal' | 'interest' | 'balance', v: number | null) {
    if (v === (r[field] ?? null)) return;
    try {
      setD(await api<LoanData>('/loans/schedule', { accountId: l.account.id, rows: [{ month: r.month, payment: r.payment, principal: r.principal, interest: r.interest, balance: r.balance, [field]: v }] }));
      toast(`${Number(r.month.slice(5))}월 ${field === 'principal' ? '원금' : field === 'interest' ? '이자' : field === 'payment' ? '월 납부금' : '남은 대출금'}을 고쳤어요`);
    } catch (e) {
      onError(e);
    }
  }
  async function saveRows() {
    try {
      setD(await api<LoanData>('/loans/schedule', { accountId: l.account.id, rows: parsed }));
      toast(`${l.account.name} 상환표 ${parsed.length}달을 넣었어요`);
      setPaste('');
      setOpen(false);
    } catch (e) {
      onError(e);
    }
  }
  // 올해 + 지난달까지 차이 난 달만 기본으로 보이게
  const year = thisMonth.slice(0, 4);
  const rows = showAll ? l.rows : l.rows.filter((r) => r.month.startsWith(year));
  const lastPast = [...l.rows].reverse().find((r) => r.month <= thisMonth);
  // 그달에 '새로' 생긴 차이만 (차이는 다음 달로 이어지니까, 앞 달 차이를 빼고 봄)
  const past = l.rows.filter((r) => r.month <= thisMonth && r.balance !== null);
  const off = past
    .map((r, i) => ({ r, delta: r.appBalance - r.balance! - (i ? past[i - 1].appBalance - past[i - 1].balance! : 0) }))
    .filter((x) => x.delta !== 0);
  return (
    <div className="card">
      <h3 className="row">
        {l.account.name} 상환표
        {lastPast?.balance != null && (
          <span className="muted small">
            {Number(lastPast.month.slice(5))}월 낸 뒤 남은 대출금 {won(lastPast.balance)}원 · 앱 잔액 {won(lastPast.appBalance)}원{' '}
            {lastPast.appBalance === lastPast.balance ? <b className="good">딱 맞음</b> : <b className="bad">{won(Math.abs(lastPast.appBalance - lastPast.balance))}원 차이</b>}
          </span>
        )}
        {l.rows.length === 0 && !open && <span className="muted small">상환표 없음</span>}
        <span className="spacer" />
        <button className="btn sm" onClick={() => setOpen(!open)}>
          {open ? '닫기' : '상환표 붙여넣기'}
        </button>
      </h3>

      {open && (
        <div className="loan-paste">
          <details className="help">
            <summary>붙여넣기란?</summary>
            <ul>
              <li>은행 상환계획표(엑셀·Numbers)의 날짜·원금·이자·남은 대출금 칸 통째로 복사 → 붙여넣기(⌘V)</li>
              <li>날짜가 가로·세로인 표 모두 인식</li>
              <li>같은 달: 새 값으로 교체</li>
            </ul>
          </details>
          <textarea className="text" rows={4} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="여기에 붙여넣기" />
          {paste.trim() && (
            <div className="row" style={{ marginTop: 6 }}>
              {parsed.length ? (
                <span>
                  {parsed.length}달 읽음 ({parsed[0].month} ~ {parsed[parsed.length - 1].month}) · 예: {Number(parsed[0].month.slice(5))}월 원금 {won(parsed[0].principal)} / 이자 {won(parsed[0].interest)}
                  {parsed.some((r) => r.payment && r.principal + r.interest !== r.payment) && <span className="warn"> · 원금+이자가 월 납부금과 다른 달이 있어요</span>}
                </span>
              ) : (
                <span className="bad">표를 못 읽었어요 — 날짜 줄과 '원금'·'이자' 줄이 함께 복사됐는지 봐 주세요</span>
              )}
              <span className="spacer" />
              <button className="btn main sm" disabled={!parsed.length} onClick={saveRows}>
                넣기
              </button>
            </div>
          )}
        </div>
      )}

      {l.rows.length > 0 && (
        <>
          {off.some((x) => Math.abs(x.delta) > 1) && (
            <p className="warn small">
              상환표와 어긋나기 시작한 달: {off.map((x) => `${Number(x.r.month.slice(5))}월 ${x.delta > 0 ? '+' : '−'}${won(Math.abs(x.delta))}원`).join(' · ')} · 확인: 그달 '{l.account.name} 상환' 거래 금액 = 상환표 원금 (1원은 은행 반올림일 수 있음)
            </p>
          )}
          <div style={{ overflowX: 'auto' }}>
            <table className="list loan">
              <thead>
                <tr>
                  <th>달</th>
                  <th className="r">월 납부금</th>
                  <th className="r">원금</th>
                  <th className="r">이자</th>
                  <th className="r">남은 대출금</th>
                  <th className="r">앱 잔액</th>
                  <th className="r">차이</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const past = r.month <= thisMonth;
                  const diff = past && r.balance !== null ? r.appBalance - r.balance : null;
                  return (
                    <tr key={r.month} className={r.month === thisMonth ? 'sel' : ''}>
                      <td>{r.month.slice(0, 4) === year ? `${Number(r.month.slice(5))}월` : r.month}</td>
                      <EditCell value={r.payment} onSave={(v) => saveCell(r, 'payment', v)} />
                      <EditCell value={r.principal} bold onSave={(v) => saveCell(r, 'principal', v)} />
                      <EditCell value={r.interest} onSave={(v) => saveCell(r, 'interest', v)} />
                      <EditCell value={r.balance} onSave={(v) => saveCell(r, 'balance', v)} />
                      <td className="r muted">{past ? won(r.appBalance) : ''}</td>
                      <td className={`r ${diff === null ? '' : diff === 0 ? 'good' : 'bad'}`}>{diff === null ? '' : diff === 0 ? '맞음' : `${diff > 0 ? '+' : '−'}${won(Math.abs(diff))}`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {l.rows.some((r) => !r.month.startsWith(year)) && (
            <button className="btn sm" onClick={() => setShowAll(!showAll)}>
              {showAll ? `${year}년만 보기` : `모든 달 보기 (${l.rows.length}달)`}
            </button>
          )}
          <LinkForm l={l} boot={boot} setD={setD} onError={onError} toast={toast} />
          {boot.recurring.some((r) => r.loanAccount === l.account.id) && (
            <p className="small loan-to-fixed">
              연결된 고정지출: {boot.recurring.filter((r) => r.active && r.loanAccount === l.account.id).map((r) => `${r.title}(${r.mode === 'batch' ? '체크해서 넣기' : '매월 자동'})`).join(' · ')} — 그달 상환표 금액으로 들어감.{' '}
              <a className="click" href="#/tx">
                거래 화면에서 고정지출 넣기 →
              </a>
            </p>
          )}
        </>
      )}
    </div>
  );
}

// 예산 연결: 원금 → 상환 카테고리, 이자 → 대출이자 카테고리, 시작 달 + '대출 말고 다른 몫'
function LinkForm({ l, boot, setD, onError, toast }: { l: LoanData['loans'][number]; boot: Boot; setD: (d: LoanData) => void; onError: (e: unknown) => void; toast: Toast }) {
  const cats = boot.categories.filter((c) => !c.hidden);
  const guess = (re: RegExp, grps: string[]) => cats.find((c) => grps.includes(c.grp) && re.test(c.name))?.id ?? '';
  const nextMonth = addMonths(boot.today.slice(0, 7), 1);
  const [pc, setPc] = useState(l.link?.principalCategory ?? guess(/상환/, ['sav', 'fix']));
  const [ic, setIc] = useState(l.link?.interestCategory ?? guess(/이자/, ['fix', 'var']));
  const [start, setStart] = useState(l.link?.startMonth ?? nextMonth);
  const [editBase, setEditBase] = useState(false);
  const budgetOf = (id: string) => won(cats.find((c) => c.id === id)?.budget ?? 0);
  const [pBase, setPBase] = useState(() => budgetOf(l.link?.principalCategory ?? guess(/상환/, ['sav', 'fix'])));
  const [iBase, setIBase] = useState(() => budgetOf(l.link?.interestCategory ?? guess(/이자/, ['fix', 'var'])));
  const [open, setOpen] = useState(!l.link?.startMonth);
  const row = l.rows.find((r) => r.month === start);
  async function save() {
    try {
      setD(await api<LoanData>('/loans/link', { accountId: l.account.id, principalCategory: pc || null, interestCategory: ic || null, startMonth: start, principalBase: pBase === '' ? undefined : parseAmount(pBase), interestBase: iBase === '' ? undefined : parseAmount(iBase) }));
      toast(`${Number(start.slice(5))}월부터 예산에 상환표 금액이 더해져요`);
      setOpen(false);
    } catch (e) {
      onError(e);
    }
  }
  const name = (id: string | null) => cats.find((c) => c.id === id)?.name ?? '없음';
  if (!open)
    return (
      <div className="row small loan-linked">
        <span>
          예산 연결: <b>{l.link?.startMonth ? `${l.link.startMonth.slice(0, 4)}년 ${Number(l.link.startMonth.slice(5))}월부터` : '안 함'}</b> · 원금 → {name(l.link?.principalCategory ?? null)} · 이자 → {name(l.link?.interestCategory ?? null)}
        </span>
        <button className="btn sm" onClick={() => setOpen(true)}>
          고치기
        </button>
      </div>
    );
  return (
    <div className="loan-link">
      <b>{Number(start.slice(5))}월부터 예산에 자동으로 더하기</b>

      <div className="vform">
        <label>시작 달</label>
        <input className="text" type="month" value={start} onChange={(e) => setStart(e.target.value)} />
        <label>원금 →</label>
        <span className="row">
          <select className="text" value={pc} onChange={(e) => (setPc(e.target.value), setPBase(budgetOf(e.target.value)))}>
            <option value="">(더하지 않음)</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </span>
        {pc && (
          <>
            <label />
            <span className="row small loan-formula">
              {editBase ? (
                <>
                  원래 예산
                  <input className="text sm" style={{ width: 110 }} inputMode="numeric" value={pBase} onChange={(e) => { const n = parseAmount(e.target.value); setPBase(n === null ? '' : won(n)); }} placeholder="0" />
                </>
              ) : (
                <span>{name(pc)} {won(parseAmount(pBase) ?? 0)}</span>
              )}
              {row && (
                <>
                  → <b>{won((parseAmount(pBase) ?? 0) + row.principal)}원</b>
                  <span className="muted">(+ {l.account.name} 원금 {won(row.principal)})</span>
                </>
              )}
            </span>
          </>
        )}
        <label>이자 →</label>
        <span className="row">
          <select className="text" value={ic} onChange={(e) => (setIc(e.target.value), setIBase(budgetOf(e.target.value)))}>
            <option value="">(더하지 않음)</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </span>
        {ic && (
          <>
            <label />
            <span className="row small loan-formula">
              {editBase ? (
                <>
                  원래 예산
                  <input className="text sm" style={{ width: 110 }} inputMode="numeric" value={iBase} onChange={(e) => { const n = parseAmount(e.target.value); setIBase(n === null ? '' : won(n)); }} placeholder="0" />
                </>
              ) : (
                <span>{name(ic)} {won(parseAmount(iBase) ?? 0)}</span>
              )}
              {row && (
                <>
                  → <b>{won((parseAmount(iBase) ?? 0) + row.interest)}원</b>
                  <span className="muted">(+ {l.account.name} 이자 {won(row.interest)})</span>
                </>
              )}
            </span>
          </>
        )}
        {!row && (
          <>
            <label />
            <span className="warn small">그 달 상환표 없음</span>
          </>
        )}
        <label />
        <span className="row">
          <button className="btn main" onClick={save}>
            연결
          </button>
          {!editBase && (
            <button className="btn" onClick={() => setEditBase(true)}>
              원래 예산 고치기
            </button>
          )}
          {l.link?.startMonth && (
            <button className="btn" onClick={() => setOpen(false)}>
              취소
            </button>
          )}
        </span>
      </div>
      {(() => {
        const m = Number(start.slice(5));
        const after = l.rows.find((r) => r.month === addMonths(start, 1));
        const ln = l.account.name;
        return (
          <>
            <details className="help">
              <summary>예산에 넣는 법</summary>
              <p>
                예를 들어 <b>{m}월부터</b> 예산에 넣고 싶다면
              </p>
              <ol>
                <li>
                  시작 달을 <b>{m}월</b>로 고르고
                </li>
                <li>
                  <b>[연결]</b>을 누르면
                </li>
                <li>
                  {m}월 예산에 이렇게 더해져요.
                  {row && (
                    <>
                      <br />· 원금 {won(row.principal)} → {name(pc)}
                      <br />· 이자 {won(row.interest)} → {name(ic)}
                    </>
                  )}
                </li>
                <li>{m === 12 ? 1 : m + 1}월부터는 그달 상환표 금액으로 저절로 바뀌어요.</li>
              </ol>
            </details>
            <details className="help">
              <summary>같은 카테고리에 다른 대출이 있다면</summary>
              <p>
                예를 들어 {name(pc)} 카테고리에 <b>다른 대출 50만 원</b>이 이미 있다면
                <br />
                {after ? `${Number(after.month.slice(5))}월` : `${m}월`} {name(pc)} 예산 = 50만 원 + {ln} 원금 {won((after ?? row)?.principal ?? 0)}원 ={' '}
                <b>{won(500000 + ((after ?? row)?.principal ?? 0))}원</b>
              </p>
            </details>
            <details className="help">
              <summary>왜 원금은 저축, 이자는 고정지출인가요?</summary>
              <p>
                원금은 빚이 줄어드는 만큼 내 자산이 늘어나는 돈이라 <b>저축</b>,
                <br />
                이자는 빌린 값으로 그냥 나가는 돈이라 <b>고정지출</b>이에요.
              </p>
            </details>
          </>
        );
      })()}
    </div>
  );
}

// 상환표 칸: 누르면 바로 고치기 (Enter·칸 밖 = 저장, Esc = 취소, 비우면 지움 — 남은 대출금만)
function EditCell({ value, onSave, bold = false }: { value: number | null; onSave: (v: number | null) => void; bold?: boolean }) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState('');
  if (!edit)
    return (
      <td className="r loan-cell" title="눌러서 고치기" onClick={() => (setV(value === null ? '' : won(value)), setEdit(true))}>
        {value === null ? '-' : bold ? <b>{won(value)}</b> : won(value)}
      </td>
    );
  const done = () => {
    setEdit(false);
    onSave(v.trim() === '' ? null : parseAmount(v));
  };
  return (
    <td className="r">
      <input autoFocus className="text sm" inputMode="numeric" style={{ width: 110, textAlign: 'right' }} value={v} onChange={(e) => { const n = parseAmount(e.target.value); setV(n === null ? '' : won(n)); }} onBlur={done} onKeyDown={(e) => (e.key === 'Enter' ? done() : e.key === 'Escape' && setEdit(false))} />
    </td>
  );
}
