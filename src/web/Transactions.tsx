// 거래: 검색 · 기간 · 계좌 · 대분류 · 카테고리로 바로 걸러 보기 + 입력(세로 칸)
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { addMonths, lastDay, monthOf, shortDate, weekNo, weekRange } from '../shared/dates';
import { POCKET_KINDS, won } from '../shared/rules';
import type { Tx } from '../shared/types';
import { api } from './api';
import { Icon } from './Icon';
import { isPinned, type AccountWithBalance, type Boot, type Toast, type TxList } from './data';
import { TxForm } from './TxForm';
import { TxRow } from './TxRow';
import { BatchFixed } from './BatchFixed';
import { DateInput } from './DateInput';

type Period = 'week' | 'lastweek' | 'month' | 'last' | 'year' | 'all' | 'custom';

export function Transactions({ boot, onError, toast, initial }: { boot: Boot; onError: (e: unknown) => void; toast: Toast; initial?: { account?: string; category?: string; month?: string; grp?: string; day?: string } }) {
  const thisMonth = monthOf(boot.today);
  const [period, setPeriod] = useState<Period>(initial?.month || initial?.day ? 'custom' : 'month');
  const [from, setFrom] = useState(initial?.day ?? (initial?.month ? `${initial.month}-01` : `${thisMonth}-01`));
  const [to, setTo] = useState(initial?.day ?? (initial?.month ? `${initial.month}-31` : `${thisMonth}-31`));
  const [q, setQ] = useState('');
  const [account, setAccount] = useState(initial?.account ?? '');
  const [grps, setGrps] = useState<string[]>(initial?.grp ? initial.grp.split(',') : []);
  const [category, setCategory] = useState(initial?.category ?? '');
  const [list, setList] = useState<TxList | null>(null);
  const [editing, setEditing] = useState<Tx | null | 'new'>(null);
  const [balances, setBalances] = useState<AccountWithBalance[]>([]);
  // 주별로 묶어 보기: 주차마다 제목 줄(합계)을 넣고, 눌러서 접고 펴기. 기간이 길면 최근 주만 펼쳐 둔다.
  const [byWeek, setByWeek] = useState(() => localStorage.getItem('gb_byweek') !== '0');
  useEffect(() => localStorage.setItem('gb_byweek', byWeek ? '1' : '0'), [byWeek]);
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const [showMore, setShowMore] = useState(false);

  const range = useMemo(() => {
    const thisWeek = weekNo(boot.today);
    if (period === 'week') return weekRange(thisMonth, thisWeek);
    if (period === 'lastweek') {
      if (thisWeek > 1) return weekRange(thisMonth, thisWeek - 1);
      const pm = addMonths(thisMonth, -1);
      return weekRange(pm, weekNo(`${pm}-${lastDay(pm)}`));
    }
    if (period === 'month') return { from: `${thisMonth}-01`, to: `${thisMonth}-31` };
    if (period === 'last') {
      const m = addMonths(thisMonth, -1);
      return { from: `${m}-01`, to: `${m}-31` };
    }
    if (period === 'year') return { from: `${thisMonth.slice(0, 4)}-01-01`, to: `${thisMonth.slice(0, 4)}-12-31` };
    if (period === 'all') return { from: '', to: '' };
    return { from, to };
  }, [period, from, to, thisMonth, boot.today]);

  const load = useCallback(() => {
    const p = new URLSearchParams();
    if (range.from) p.set('from', range.from);
    if (range.to) p.set('to', range.to);
    if (q.trim()) p.set('q', q.trim());
    if (account) p.set('account', account);
    if (grps.length) p.set('grp', grps.join(','));
    if (category) p.set('category', category);
    api<TxList>('/tx?' + p.toString()).then(setList).catch(onError);
    // 통장 잔액은 거래가 바뀔 때마다 같이 새로 받아 온다
    api<AccountWithBalance[]>('/accounts').then(setBalances).catch(onError);
  }, [range, q, account, grps, category, onError]);
  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const cat = (id: string | null) => boot.categories.find((c) => c.id === id);
  const accName = (id: string | null) => boot.accounts.find((a) => a.id === id)?.name ?? '';
  const gOrder = (g: string) => boot.groups.findIndex((x) => x.key === g);
  const visibleCats = boot.categories.filter((c) => !c.hidden && grps.includes(c.grp)).sort((a, b) => gOrder(a.grp) - gOrder(b.grp) || a.sort - b.sort);
  const toggleGrp = (k: string) => {
    setGrps((g) => (g.includes(k) ? g.filter((x) => x !== k) : [...g, k]));
    setCategory('');
  };

  const weekKey = (d: string) => `${d.slice(0, 7)}-${weekNo(d)}`;
  const weeksIn = (rows: Tx[]) => new Set(rows.map((r) => weekKey(r.date))).size;
  function weekHead(rows: Tx[], wk: string, isOpen: boolean) {
    const these = rows.filter((r) => weekKey(r.date) === wk);
    const m = wk.slice(0, 7);
    const w = Number(wk.slice(8));
    const r = weekRange(m, w);
    const sum = (gs: string[]) => these.filter((t) => gs.includes(cat(t.categoryId)?.grp ?? '')).reduce((n, t) => n + t.amount, 0);
    const spend = sum(['var', 'fix', 'spc']);
    const inc = sum(['inc']);
    return (
      <tr key={'w' + wk} className="weekhead" onClick={() => setOpened((o) => ({ ...o, [wk]: !isOpen }))}>
        <td colSpan={8}>
          <span className="caret">{isOpen ? '▾' : '▸'}</span> <b>{Number(m.slice(5))}월 {w}주차</b>
          <span className="muted small"> {Number(r.from.slice(8))}일~{Number(r.to.slice(8))}일 · {these.length}건</span>
          <span className="wsum">
            지출 <b>{won(spend)}</b>
            {inc > 0 && (
              <>
                {' '}· 수입 <b className="good">{won(inc)}</b>
              </>
            )}
          </span>
        </td>
      </tr>
    );
  }

  async function remove(t: Tx) {
    if (!confirm(`${shortDate(t.date)} ${t.title} ${won(t.amount)}원을 지울까요?`)) return;
    try {
      await api(`/tx/${t.id}/delete`, {});
      toast('지웠어요');
      setEditing(null);
      load();
    } catch (e) {
      onError(e);
    }
  }

  const shownAccounts = (balances.length ? balances : boot.accounts.map((a) => ({ ...a, balance: a.startBalance }))).filter((a) => !a.hidden);
  const isPicked = (a: AccountWithBalance) => isPinned(boot, a);
  const mainAcc = shownAccounts.filter(isPicked);
  const moreAcc = shownAccounts.filter((a) => !isPicked(a));
  const balCard = (a: AccountWithBalance) => (
    <button key={a.id} className={`bal ${account === a.id ? 'on' : ''}`} onClick={() => setAccount(account === a.id ? '' : a.id)} title="누르면 이 통장 거래만 보여요">
      <small>
        {a.name} <span className="kind">{a.kind}</span>
      </small>
      <b className={a.balance < 0 ? 'neg' : ''}>{won(a.balance)}</b>
    </button>
  );
  return (
    <div className="split">
      <div className="main-col">
        <div className="card balcard">
          <div className="row" style={{ marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>통장 잔액</h3>
            <span className="muted small">지금 잔액 · 칸을 누르면 그 통장 거래만 아래에 보여요</span>
            <span className="spacer" />
            {moreAcc.length > 0 && (
              <button className="btn sm" onClick={() => setShowMore((v) => !v)}>
                {showMore ? '접기' : `나머지 ${moreAcc.length}개 더 보기`}
              </button>
            )}
          </div>
          <div className="balgrid">
            {mainAcc.map(balCard)}
            {showMore && moreAcc.map(balCard)}
            {mainAcc.length === 0 && !showMore && <span className="muted small">보일 통장이 없어요. 통장·투자 화면에서 통장을 고칠 때 [거래 화면에 보이기]를 켜 주세요.</span>}
          </div>
        </div>
        <BatchFixed boot={boot} onError={onError} toast={toast} onSaved={load} />
        <div className="card">
          <input className="text search" placeholder="검색 (예: 쿠팡, 병원, 캡슐) — 기간을 '전체'로 하면 지난 해까지" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="filter">
            <span className="flabel">기간</span>
            {(
              [
                ['week', '이번 주'],
                ['lastweek', '지난주'],
                ['month', '이번 달'],
                ['last', '지난달'],
                ['year', '올해'],
                ['all', '전체'],
                ['custom', '기간 정하기'],
              ] as const
            ).map(([k, n]) => (
              <button key={k} className={`chip ${period === k ? 'on' : ''}`} onClick={() => setPeriod(k)}>
                {n}
              </button>
            ))}
            {period === 'custom' && (
              <>
                <DateInput className="text sm" value={from} onChange={setFrom} /> 부터
                <DateInput className="text sm" value={to} onChange={setTo} /> 까지
              </>
            )}
            <span className="spacer" />
            <label className="check small">
              <input type="checkbox" checked={byWeek} onChange={(e) => setByWeek(e.target.checked)} /> 주별로 묶어 보기
            </label>
          </div>
          {account && (
            <div className="filter">
              <span className="flabel">통장·카드</span>
              <button className="chip on" onClick={() => setAccount('')}>
                {accName(account)} ✕
              </button>
              <span className="muted small">위 잔액 칸을 다시 누르거나 ✕를 누르면 전체로 돌아가요</span>
            </div>
          )}
          <div className="filter">
            <span className="flabel">대분류</span>
            <button className={`chip ${grps.length === 0 ? 'on' : ''}`} onClick={() => (setGrps([]), setCategory(''))}>
              전체
            </button>
            {[...boot.groups.map((g) => [g.key, g.name]), ['transfer', '이체'], ['unc', '미분류']].map(([k, n]) => (
              <button key={k} className={`chip ${grps.includes(k) ? 'on' : ''}`} onClick={() => toggleGrp(k)}>
                {grps.includes(k) ? '✓ ' : ''}
                {n}
              </button>
            ))}
            <span className="muted small">여러 개 골라 볼 수 있어요</span>
          </div>
          {visibleCats.length > 0 && (
            <div className="filter">
              <span className="flabel">카테고리</span>
              <button className={`chip ${category === '' ? 'on' : ''}`} onClick={() => setCategory('')}>
                전체
              </button>
              {visibleCats.map((c) => (
                <button key={c.id} className={`chip ${category === c.id ? 'on' : ''}`} onClick={() => setCategory(c.id)}>
                  <Icon name={c.icon} size={14} /> {c.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="row" style={{ marginBottom: 8 }}>
            <b>{list ? `${list.count}건` : '불러오는 중…'}</b>
            {list?.more && <span className="tag bad">거래가 너무 많아 최근 {list.count}건만 보여요 — 기간을 좁혀 주세요</span>}
            {list &&
              (account ? (
                <span className="muted">
                  이 통장·카드 입금 − 결제·출금 <b className="ink">{won(list.total)}원</b>
                </span>
              ) : (
                <span className="muted">
                  {(() => {
                    // 저축·투자 통장끼리 옮긴 돈은 빼고 센다 (홈·결산과 같은 규칙)
                    const pocket = new Set(boot.accounts.filter((x) => POCKET_KINDS.includes(x.kind)).map((x) => x.id));
                    const sum = (gs: string[]) =>
                      list.rows
                        .filter((t) => gs.includes(cat(t.categoryId)?.grp ?? 'transfer'))
                        .filter((t) => !(['sav', 'inv'].includes(cat(t.categoryId)?.grp ?? '') && t.fromAccount && pocket.has(t.fromAccount)))
                        .reduce((n, t) => n + t.amount, 0);
                    return (
                      <>
                        수입 <b className="good">{won(sum(['inc']))}</b> · 지출 <b className="ink">{won(sum(['var', 'fix', 'spc']))}</b> · 저축·투자 <b className="ink">{won(sum(['sav', 'inv']))}</b>
                      </>
                    );
                  })()}
                </span>
              ))}

          </div>
          <div className="tablewrap">
          <table className="list tx">
            <thead>
              <tr>
                <th>날짜</th>
                <th>내역</th>
                <th>카테고리</th>
                <th>결제·출금</th>
                <th>입금</th>
                <th className="r">금액</th>
                <th>메모</th>
                <th>적은 사람</th>
              </tr>
            </thead>
            <tbody>
              <TxRow boot={boot} onError={onError} onSaved={() => (toast('추가했어요'), load())} />
              {list?.rows.map((t, i) => {
                const c = cat(t.categoryId);
                const wk = `${t.date.slice(0, 7)}-${weekNo(t.date)}`;
                const newWeek = byWeek && (i === 0 || `${list.rows[i - 1].date.slice(0, 7)}-${weekNo(list.rows[i - 1].date)}` !== wk);
                const firstWeek = `${list.rows[0].date.slice(0, 7)}-${weekNo(list.rows[0].date)}`;
                const isOpen = !byWeek || (opened[wk] ?? (weeksIn(list.rows) <= 2 || wk === firstWeek));
                const head = newWeek ? weekHead(list.rows, wk, isOpen) : null;
                if (!isOpen) return head;
                return (<Fragment key={t.id}>{head}
                  <tr key={t.id} className={`click ${editing !== 'new' && editing?.id === t.id ? 'sel' : ''}`} onClick={() => setEditing(t)}>
                    <td>{shortDate(t.date)}</td>
                    <td>
                      {t.title}
                      {t.unnecessary && <span className="tag bad">불필요</span>}
                    </td>
                    <td>{c ? <span className="withico"><Icon name={c.icon} /> {c.name}</span> : t.fromAccount && t.toAccount ? <span className="tag">이체</span> : <span className="tag bad" title="카테고리가 없어요. 눌러서 카테고리를 골라 주세요">미분류</span>}</td>
                    <td className="muted">{accName(t.fromAccount) || '—'}</td>
                    <td className="muted">{accName(t.toAccount) || '—'}</td>
                    <td className={`r ${c?.grp === 'inc' ? 'good' : ''}`}>{won(t.amount)}</td>
                    <td className="muted small">{t.memo}</td>
                    <td className="muted small">{t.createdBy}</td>
                  </tr>
                </Fragment>);
              })}
              {list && list.rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="muted">
                    거래가 없어요.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      </div>

      {editing && (
        <div className="side-col as-modal" onClick={(e) => e.target === e.currentTarget && setEditing(null)}>
          <div className="card sticky">
            <h3>{editing === 'new' ? '거래 입력' : '거래 고치기'}</h3>
            <TxForm
              key={editing === 'new' ? 'new' : editing.id}
              boot={boot}
              tx={editing === 'new' ? null : editing}
              onError={onError}
              onCancel={() => setEditing(null)}
              onDelete={editing !== 'new' ? () => remove(editing) : undefined}
              onDone={() => {
                toast(editing === 'new' ? '저장했어요' : '고쳤어요');
                if (editing !== 'new') setEditing(null);
                load();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
