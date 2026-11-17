// 홈: 이번 달 숫자, 예산 주의 카테고리, 빠른 입력
import { useCallback, useEffect, useState } from 'react';
import { addMonths, monthLabel, monthOf } from '../shared/dates';
import { parseAmount, rateText, won, type BudgetLine, type MonthTotals, leftLabel, LEFT_HINT } from '../shared/rules';
import { isSpending } from '../shared/types';
import { NoSpendCard } from './NoSpend';
import { useLookImage } from './Look';
import { api } from './api';
import { GROUP_ICON, Icon, UiIcon } from './Icon';
import type { Boot, Toast } from './data';
import { TxForm } from './TxForm';
import { Quick } from './Quick';

interface MonthData {
  month: string;
  totals: MonthTotals;
  prevTotals: MonthTotals;
  lines: (BudgetLine & { prevActual: number })[];
}

export const VERDICT: Record<string, { text: (l: BudgetLine) => string; cls: string }> = {
  good: { text: (l) => rateText(l.budget, l.actual), cls: 'good' },
  ok: { text: (l) => rateText(l.budget, l.actual), cls: 'good' },
  warn: { text: (l) => rateText(l.budget, l.actual), cls: 'warn' },
  bad: { text: (l) => rateText(l.budget, l.actual), cls: 'bad' },
  none: { text: () => '', cls: '' },
};

interface YearData {
  year: string;
  target: number;
  saved: number;
  savOnly: number;
  invOnly: number;
  basis: 'sav' | 'sav_inv';
  counted?: string[];
  left?: string[];
  months: (MonthTotals & { month: string; count: number })[];
}
const pct = (r: number | null) => (r === null ? '—' : `${(r * 100).toFixed(1)}%`);

// 연간 리포트: 올해 목표 저축 · 누적 실제 저축 · 달성률 (노션 '연간 리포트'처럼)
function YearReport({ y, onSave }: { y: YearData; onSave: (n: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');
  const rate = y.target > 0 ? y.saved / y.target : null;
  return (
    <div className="card">
      <div className="row" style={{ marginBottom: 6 }}>
        <h3 style={{ margin: 0 }} className="withico"><UiIcon name="chart" /> {y.year}년 연간 리포트</h3>
        <span className="spacer" />
        {!editing && (
          <button className="btn sm" onClick={() => (setVal(y.target ? won(y.target) : ''), setEditing(true))}>
            목표 고치기
          </button>
        )}
      </div>
      <div className="yr">
        <small className="withico"><UiIcon name="target" size={14} /> 연간 목표 저축</small>
        {editing ? (
          <div className="row">
            <input className="text money" autoFocus inputMode="numeric" value={val} onChange={(e) => { const n = parseAmount(e.target.value); setVal(n === null ? '' : won(n)); }} onKeyDown={(e) => e.key === 'Enter' && (onSave(parseAmount(val) ?? 0), setEditing(false))} />
            <button className="btn sm main" onClick={() => (onSave(parseAmount(val) ?? 0), setEditing(false))}>저장</button>
            <button className="btn sm" onClick={() => setEditing(false)}>닫기</button>
          </div>
        ) : (
          <b>{y.target ? `${won(y.target)}원` : <span className="muted">아직 안 정했어요</span>}</b>
        )}
        <small className="withico" title={`단기로드맵에 넣은 곳: ${(y.counted ?? []).join(' · ') || '없음'}${(y.left ?? []).length ? ` (제외: ${y.left!.join(' · ')})` : ''}`}>
          <UiIcon name="coins" size={14} /> 누적 실제 저축
        </small>
        <b>{won(y.saved)}원</b>
        <small className="withico"><UiIcon name="pin" size={14} /> 누적 달성률</small>
        <Donut rate={rate} left={y.target ? Math.max(0, y.target - y.saved) : null} />
      </div>
    </div>
  );
}

export function Home({ boot, onError, toast, go }: { boot: Boot; onError: (e: unknown) => void; toast: Toast; go: (hash: string) => void }) {
  const cover = useLookImage('cover', boot.coverVer);
  const [month, setMonth] = useState(monthOf(boot.today));
  const [d, setD] = useState<MonthData | null>(null);
  const load = useCallback(() => api<MonthData>(`/month?month=${month}`).then(setD).catch(onError), [month, onError]);
  useEffect(() => void load(), [load]);
  const year = month.slice(0, 4);
  const [y, setY] = useState<YearData | null>(null);
  const loadYear = useCallback(() => api<YearData>(`/year?year=${year}`).then(setY).catch(onError), [year, onError]);
  useEffect(() => void loadYear(), [loadYear]);
  type HP = { id: string; kind: 'num' | 'text'; section?: string; categoryId: string | null; limitAmount: number | null; body: string; result: string | null; actual: number | null; auto: string | null };
  const [pledges, setPledges] = useState<HP[]>([]);
  useEffect(() => void api<HP[]>(`/pledges?month=${month}`).then(setPledges).catch(onError), [month, onError]);
  const saveTarget = (n: number) => api<YearData>('/year-target', { year, amount: n }).then(setY).catch(onError);
  if (!d) return <p className="muted">불러오는 중…</p>;
  const t = d.totals;
  const spend = d.lines.filter((l) => isSpending(l.category.grp));
  const watch = spend.filter((l) => l.verdict === 'bad' || l.verdict === 'warn' || (l.ratio !== null && l.ratio >= 0.8)).sort((a, b) => (b.ratio ?? 9) - (a.ratio ?? 9));
  const isNow = month === monthOf(boot.today);

  return (
    <div className="home-wrap">
        <div className="head">
          {cover && <img className="avatar" src={cover} alt="" />}
          <button className="btn sm" onClick={() => setMonth(addMonths(month, -1))}>
            ◀
          </button>
          <h1>{monthLabel(month)}</h1>
          <button className="btn sm" onClick={() => setMonth(addMonths(month, 1))}>
            ▶
          </button>
          {isNow && <span className="muted">{Number(boot.today.slice(8))}일까지</span>}
          <span className="spacer" />
          <span className="muted small">
            단위 원 · 저축률 {t.saveRate === null ? '-' : `${(t.saveRate * 100).toFixed(1)}%`} · 지난달 지출 {won(d.prevTotals.spending)}
          </span>
        </div>
      {/* 위아래 줄을 맞춘 바둑판: [다짐·요약칸 | 연간 리포트] / [월별 요약… | 무지출·빠른 입력] */}
      <div className="home-grid">
      <div className="hg-a">
        {pledges.length > 0 && (
          <div className="card home-pl">
            <b className="withico">
              <UiIcon name="pin" /> {Number(month.slice(5))}월 다짐
            </b>
            {(
              [
                ['var', '변동지출'],
                ['fix', '고정지출'],
                ['inc', '수입'],
                ['sav', '저축·투자'],
                ['', '기타'],
              ] as const
            ).map(([key, name]) => {
              // 구역: 적을 때 고른 구역, 없으면(예전 금액 다짐) 카테고리 대분류
              const secOf = (p: HP) => {
                if (p.section) return p.section;
                const g = boot.categories.find((c) => c.id === p.categoryId)?.grp;
                return p.kind === 'num' && g ? (g === 'inv' ? 'sav' : g) : '';
              };
              const these = pledges.filter((p) => secOf(p) === key);
              if (!these.length) return null;
              return (
                <div key={key} className="home-pl-row">
                  <span className="home-pl-sec">{name}</span>
                  <div>
                    {these.map((p) => {
                      const cn = boot.categories.find((c) => c.id === p.categoryId)?.name ?? '';
                      const st = p.kind === 'num' ? p.auto : p.result;
                      return (
                        <div key={p.id} className="home-pl-item">
                          <span>{p.kind === 'num' ? `${cn} ${won(p.limitAmount ?? 0)}원 이하` : p.body}</span>
                          {p.kind === 'num' && <span className="muted small"> 지금 {won(p.actual ?? 0)}</span>}
                          <span className={`tag ${st === 'kept' ? 'good' : st === 'missed' ? 'bad' : ''}`}>{st === 'kept' ? '지킴' : st === 'missed' ? '못 지킴' : '진행 중'}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="card only-mobile">
          <Quick boot={boot} onError={onError} toast={toast} go={go} embedded onSaved={load} />
        </div>
        <div className="tiles">
          {(
            [
              ['수입', t.inc, 'inc'],
              ['지출', t.spending, 'spend'],
              ['저축', t.sav, 'sav'],
              ['투자', t.inv, 'inv'],
              ['남은 돈', t.left, 'left'],
            ] as const
          ).map(([n, v, k]) => (
            <div className="tile" key={k} title={k === 'left' ? LEFT_HINT : undefined}>
              <small className={`tl-${k}`}>
                {k === 'left' ? leftLabel(v) : n}
                {k === 'left' && <span className="tile-hint"> ({LEFT_HINT})</span>}
              </small>
              <b className={k === 'left' && v < 0 ? 'bad' : ''}>{won(k === 'left' ? Math.abs(v) : v)}</b>
            </div>
          ))}
        </div>
      </div>
      <div className="hg-b">{y && <YearReport y={y} onSave={saveTarget} />}</div>
      <div className="hg-c">
        {y && (
          <div className="card">
            <h3 className="withico"><UiIcon name="search" /> {year}년 월별 가계부 요약 <span className="muted small">— 줄을 누르면 그 달로 가요</span></h3>
            <div className="tablewrap">
              <table className="list months">
                <thead>
                  <tr>
                    <th>달</th>
                    <th className="r">총수입</th>
                    <th className="r">총지출</th>
                    <th className="r">총저축</th>
                    <th className="r">총투자</th>
                    <th className="r" title="남은 돈 (마이너스 = 모자란 돈)">수입−지출−저축</th>
                    <th className="r">저축·투자 비율</th>
                  </tr>
                </thead>
                <tbody>
                  {y.months
                    .filter((m) => m.count > 0 || m.month === month)
                    .map((m) => (
                      <tr key={m.month} className={`click ${m.month === month ? 'sel' : ''}`} onClick={() => setMonth(m.month)}>
                        <td>
                          <b>{Number(m.month.slice(5))}월</b>
                        </td>
                        <td className="r">{won(m.inc)}</td>
                        <td className="r">{won(m.spending)}</td>
                        <td className="r">{won(m.sav)}</td>
                        <td className="r">{won(m.inv)}</td>
                        <td className={`r ${m.left < 0 ? 'bad' : ''}`}>{won(m.left)}</td>
                        <td className="r">{pct(m.saveRate)}</td>
                      </tr>
                    ))}
                  <tr className="sum">
                    <td>합계</td>
                    {(['inc', 'spending', 'sav', 'inv', 'left'] as const).map((k) => (
                      <td key={k} className="r">
                        {won(y.months.reduce((n, m) => n + m[k], 0))}
                      </td>
                    ))}
                    <td className="r">
                      {(() => {
                        const inc = y.months.reduce((n, m) => n + m.inc, 0);
                        return pct(inc > 0 ? y.saved / inc : null);
                      })()}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="card">
          <h3 className="withico"><UiIcon name="alert" /> 예산 주의 (80% 넘은 카테고리)</h3>
          {watch.length === 0 ? (
            <p className="muted">아직 예산을 넘은 카테고리가 없어요.</p>
          ) : (
            <table className="list">
              <thead>
                <tr>
                  <th>카테고리</th>
                  <th className="r">예산</th>
                  <th className="r">지금</th>
                  <th className="r" title="예산 − 지금">잔액</th>
                  <th className="r">달성률</th>
                </tr>
              </thead>
              <tbody>
                {watch.map((l) => (
                  <tr key={l.category.id} className="click" onClick={() => go(`#/tx?category=${l.category.id}&month=${month}`)}>
                    <td>
                      <span className="withico"><Icon name={l.category.icon} /> {l.category.name}</span>
                    </td>
                    <td className="r">{won(l.budget)}</td>
                    <td className="r">{won(l.actual)}</td>
                    <td className={`r ${l.budget > 0 && l.budget - l.actual < 0 ? 'bad' : ''}`}>{l.budget > 0 ? won(l.budget - l.actual) : '—'}</td>
                    <td className={`r ${VERDICT[l.verdict].cls}`}>{VERDICT[l.verdict].text(l)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h3>대분류별 이번 달</h3>
          <table className="list">
            <thead>
              <tr>
                <th>대분류</th>
                <th className="r">예산</th>
                <th className="r">실제</th>
                <th className="r">지난달</th>
              </tr>
            </thead>
            <tbody>
              {boot.groups.map((g) => {
                const ls = d.lines.filter((l) => l.category.grp === g.key);
                return (
                  <tr key={g.key} className="click" onClick={() => go(`#/tx?grp=${g.key}&month=${month}`)}>
                    <td>
                      <span className="withico"><Icon name={GROUP_ICON[g.key]} /> {g.name}</span>
                    </td>
                    <td className="r">{won(ls.reduce((s, l) => s + l.budget, 0))}</td>
                    <td className="r">{won(ls.reduce((s, l) => s + l.actual, 0))}</td>
                    <td className="r muted">{won(ls.reduce((s, l) => s + l.prevActual, 0))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div className="hg-d">
        {boot.nospendCal !== false && <NoSpendCard month={month} onError={onError} go={go} />}
        <div className="card only-desktop">
          <h3 className="withico"><UiIcon name="plus" /> 빠른 입력</h3>
          <TxForm
            boot={boot}
            onError={onError}
            onDone={() => {
              toast('저장했어요');
              load();
            }}
          />
        </div>
      </div>
      </div>
    </div>
  );
}

// 누적 달성률 도넛: 띠가 찬 만큼 = 모은 비율, 가운데 퍼센트 (100% 넘으면 띠는 꽉 참)
function Donut({ rate, left }: { rate: number | null; left: number | null }) {
  const r = 52;
  const len = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, rate ?? 0));
  return (
    <div className="donut">
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={r} fill="none" stroke="#ece6df" strokeWidth="16" />
        {p > 0 && <circle cx="70" cy="70" r={r} fill="none" style={{ stroke: "var(--accent)" }} strokeWidth="16" strokeLinecap="round" strokeDasharray={`${len * p} ${len}`} transform="rotate(-90 70 70)" />}
        <text x="70" y="74" textAnchor="middle" fontSize="24" fontWeight="800" fill="#2e2a27">
          {rate === null ? '-' : `${(rate * 100).toFixed(1)}%`}
        </text>
        <text x="70" y="94" textAnchor="middle" fontSize="11" fill="#857b74">
          목표 저축의
        </text>
      </svg>
      {left !== null && (
        <span className="muted small">
          목표까지 <b>{won(left)}원</b>
        </span>
      )}
    </div>
  );
}
