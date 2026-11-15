// 주식 평가금액: 증권 통장마다 달마다 평가금액 한 칸 (거래는 안 건드림). 넣은 돈과 평가손익을 옆에
import { Fragment, useCallback, useEffect, useState } from 'react';
import { parseAmount, won } from '../shared/rules';
import { api } from './api';
import type { Boot, Toast } from './data';

interface ValData {
  year: string;
  months: string[];
  accounts: { id: string; name: string; book: number[]; vals: Record<string, number> }[];
}

export function Valuations({ boot, onError, toast }: { boot: Boot; onError: (e: unknown) => void; toast: Toast }) {
  const [year, setYear] = useState(boot.today.slice(0, 4));
  const [d, setD] = useState<ValData | null>(null);
  const load = useCallback(() => api<ValData>(`/valuations?year=${year}`).then(setD).catch(onError), [year, onError]);
  useEffect(() => void load(), [load]);
  if (!d || d.accounts.length === 0) return null;
  const thisMonth = boot.today.slice(0, 7);
  async function save(accountId: string, month: string, text: string, before: number | undefined) {
    const n = text.trim() === '' ? null : parseAmount(text);
    if ((n ?? undefined) === before) return;
    try {
      setD(await api<ValData>('/valuation', { accountId, month, amount: n, year }));
      toast(n === null ? `${Number(month.slice(5))}월 평가금액을 지웠어요` : `${Number(month.slice(5))}월 평가금액 ${won(n)}원`);
    } catch (e) {
      onError(e);
    }
  }
  return (
    <div className="card">
      <h3 className="row">
        주식 평가금액 <span className="muted small">— 달마다 증권 앱에서 본 평가금액을 한 번 적어요. 거래(넣은 돈)는 그대로, 자산 추이·로드맵 실제 줄은 평가금액으로 계산해요</span>
        <span className="spacer" />
        <button className="btn sm" onClick={() => setYear(String(Number(year) - 1))}>
          ◀
        </button>
        <b>{year}</b>
        <button className="btn sm" onClick={() => setYear(String(Number(year) + 1))}>
          ▶
        </button>
      </h3>
      <div style={{ overflowX: 'auto' }}>
        <table className="list val">
          <thead>
            <tr>
              <th />
              <th />
              {d.months.map((m) => (
                <th key={m} className="r">
                  {Number(m.slice(5))}월
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.accounts.map((a) => (
              <Fragment key={a.id}>
                <tr key={a.id + 'v'} className="val-in">
                  <td rowSpan={3}>
                    <b>{a.name}</b>
                  </td>
                  <td className="muted small">평가금액</td>
                  {d.months.map((m) => (
                    <td key={m} className="r">
                      {m <= thisMonth ? (
                        <input key={`${a.id}${m}${a.vals[m] ?? ''}`} className="text sm" inputMode="numeric" defaultValue={a.vals[m] !== undefined ? won(a.vals[m]) : ''} placeholder="—" onBlur={(e) => save(a.id, m, e.target.value, a.vals[m])} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
                      ) : null}
                    </td>
                  ))}
                </tr>
                <tr key={a.id + 'b'}>
                  <td className="muted small">넣은 돈</td>
                  {d.months.map((m, i) => (
                    <td key={m} className="r muted small">
                      {m <= thisMonth ? won(a.book[i]) : ''}
                    </td>
                  ))}
                </tr>
                <tr key={a.id + 'g'} className="val-gain">
                  <td className="muted small">평가손익</td>
                  {d.months.map((m, i) => {
                    const v = a.vals[m];
                    if (v === undefined) return <td key={m} />;
                    const g = v - a.book[i];
                    const p = a.book[i] ? Math.round((g / a.book[i]) * 1000) / 10 : null;
                    return (
                      <td key={m} className={`r small ${g > 0 ? 'good' : g < 0 ? 'bad' : ''}`}>
                        {g > 0 ? '+' : g < 0 ? '−' : ''}
                        {won(Math.abs(g))}
                        {p !== null && <div>({g > 0 ? '+' : ''}{p}%)</div>}
                      </td>
                    );
                  })}
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">평가금액을 안 적은 달은 '가장 최근 평가금액 + 그 뒤에 넣은 돈'으로 계산해요. 칸을 비우면 지워져요.</p>
    </div>
  );
}
