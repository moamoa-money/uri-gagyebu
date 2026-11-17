// 무지출 달력: 그달 변동·고정 지출이 없었던 날에 초록 동그라미 (고정지출 자동·한꺼번에 넣기는 빼고 셈)
import { useEffect, useState } from 'react';
import { won } from '../shared/rules';
import { api } from './api';
import { NewBadge } from './NewBadge';

interface Data { month: string; today: string; spent: { date: string; amount: number; count: number }[]; passedDays: number; prevNoSpend: number }
const WD = ['일', '월', '화', '수', '목', '금', '토'];

export function NoSpendCard({ month, onError, go }: { month: string; onError: (e: unknown) => void; go: (h: string) => void }) {
  const [d, setD] = useState<Data | null>(null);
  useEffect(() => {
    api<Data>(`/nospend?month=${month}`).then(setD).catch(onError);
  }, [month, onError]);
  if (!d) return null;
  const y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7));
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const spent = new Map(d.spent.map((s) => [s.date, s]));
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const noSpend = d.passedDays - d.spent.filter((s) => Number(s.date.slice(8)) <= d.passedDays).length;
  return (
    <div className="card nospend">
      <h3 className="row">
        {m}월 무지출 <NewBadge id="nospend" />
        <span className="ns-count">{noSpend}일</span>
        <span className="muted small">/ 지난 {d.passedDays}일</span>
        <span className="spacer" />
        <span className="muted small">지난달 {d.prevNoSpend}일</span>
      </h3>
      <div className="ns-grid">
        {WD.map((w, i) => (
          <div key={w} className={`ns-wd ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}`}>{w}</div>
        ))}
        {cells.map((n, i) => {
          if (!n) return <div key={i} />;
          const ds = `${month}-${String(n).padStart(2, '0')}`;
          const s = spent.get(ds);
          const past = n <= d.passedDays;
          const cls = !past ? 'future' : s ? 'spent' : 'free';
          return (
            <button
              key={i}
              type="button"
              className={`ns-day ${cls} ${ds === d.today ? 'today' : ''}`}
              title={!past ? '' : s ? `${s.count}건 ${won(s.amount)}원` : '무지출'}
              onClick={() => s && go(`#/tx?day=${ds}`)}
            >
              {n}
            </button>
          );
        })}
      </div>
      <details className="help">
        <summary>무지출 기준</summary>
        <ul>
          <li>초록: 변동·고정 지출이 없는 날</li>
          <li>제외: 고정지출 자동 입력, 저축·투자, 통장 간 이체</li>
          <li>날짜 선택 시 그날 거래 보기</li>
        </ul>
      </details>
    </div>
  );
}

/** 월말 결산 변동지출 머리에 붙는 '무지출 ○일' */
export function NoSpendStat({ month, onError }: { month: string; onError: (e: unknown) => void }) {
  const [d, setD] = useState<Data | null>(null);
  useEffect(() => {
    api<Data>(`/nospend?month=${month}`).then(setD).catch(onError);
  }, [month, onError]);
  if (!d || d.passedDays === 0) return null;
  const n = d.passedDays - d.spent.filter((s) => Number(s.date.slice(8)) <= d.passedDays).length;
  const diff = n - d.prevNoSpend;
  return (
    <span title={`지난달 ${d.prevNoSpend}일`}>
      <small>
        무지출 <NewBadge id="nospend-review" />
      </small>
      {n}일{diff !== 0 && <em className={diff > 0 ? 'good' : 'bad'} style={{ fontStyle: 'normal', fontSize: 12, marginLeft: 4 }}>{diff > 0 ? `+${diff}` : diff}</em>}
    </span>
  );
}

/** 카페 이미지 안에 들어가는 작은 무지출 달력 (누르는 기능 없이 그림만) */
export function NoSpendMini({ month, onError }: { month: string; onError: (e: unknown) => void }) {
  const [d, setD] = useState<Data | null>(null);
  useEffect(() => {
    api<Data>(`/nospend?month=${month}`).then(setD).catch(onError);
  }, [month, onError]);
  if (!d) return null;
  const y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7));
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const spent = new Set(d.spent.map((s) => s.date));
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const n = d.passedDays - d.spent.filter((s) => Number(s.date.slice(8)) <= d.passedDays).length;
  return (
    <div className="cf-ns">
      <div className="cf-ns-head">
        <b>{m}월 무지출</b> <span className="cf-ns-n">{n}일</span> <span className="cf-ns-prev">지난달 {d.prevNoSpend}일</span>
      </div>
      <div className="cf-ns-grid">
        {WD.map((w) => (
          <div key={w} className="cf-ns-wd">{w}</div>
        ))}
        {cells.map((x, i) => {
          if (!x) return <div key={i} />;
          const ds = `${month}-${String(x).padStart(2, '0')}`;
          const past = x <= d.passedDays;
          return (
            <div key={i} className={`cf-ns-day ${!past ? 'future' : spent.has(ds) ? 'spent' : 'free'}`}>
              {x}
            </div>
          );
        })}
      </div>
    </div>
  );
}
