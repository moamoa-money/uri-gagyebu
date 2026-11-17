// 머니플랜 · 머니노트 (한 메뉴, 탭 두 개)
// 머니노트: 내년 특별지출을 달마다 적기 → 1년 총액을 미리 떼어 둘(모을) 돈으로
// 머니플랜: 달마다 수입 − 고정 − 변동 − 특별(머니노트) = 목표 저축. 금액은 러프하게 만 원 단위로 보여 줌
import { useCallback, useEffect, useState } from 'react';
import { won } from '../shared/rules';
import { api } from './api';
import type { Boot, Toast } from './data';
import { MoneyNote } from './MoneyNote';

type Row = 'inc' | 'fix' | 'var';
interface PlanMonth { month: string; auto: Record<Row, number>; edited: Record<Row, boolean>; inc: number; fix: number; var: number; spc: number; save: number }
interface PlanData { year: string; months: PlanMonth[] }

/** 러프하게: 10만 원 단위로 반올림해서 '620만' */
export const roughMan = (n: number) => {
  const m = Math.round(n / 100000) * 10;
  return `${m < 0 ? '-' : ''}${Math.abs(m).toLocaleString('ko-KR')}만`;
};

export function Plan({ boot, onError, toast, go, tab, initial, reloadBoot }: { boot: Boot; onError: (e: unknown) => void; toast: Toast; go: (h: string) => void; tab: 'note' | 'plan'; initial?: { year?: string; month?: string; category?: string }; reloadBoot?: () => void }) {
  const nextYear = String(Number(boot.today.slice(0, 4)) + (Number(boot.today.slice(5, 7)) >= 11 ? 1 : 0));
  const year = initial?.year ?? nextYear;
  return (
    <div>
      <div className="tabs">
        <button className={tab === 'note' ? 'on' : ''} onClick={() => go(`#/plan?tab=note&year=${year}`)}>
          ① 머니노트 (특별지출)
        </button>
        <button className={tab === 'plan' ? 'on' : ''} onClick={() => go(`#/plan?tab=plan&year=${year}`)}>
          ② 머니플랜
        </button>
      </div>
      {tab === 'note' ? <MoneyNote boot={boot} onError={onError} toast={toast} go={go} initial={{ ...initial, year }} reloadBoot={reloadBoot} /> : <MoneyPlan year={year} go={go} onError={onError} toast={toast} />}
    </div>
  );
}

export function MoneyPlan({ year, go, onError, toast, embedded = false }: { year: string; go: (h: string) => void; onError: (e: unknown) => void; toast: Toast; embedded?: boolean }) {
  const [d, setD] = useState<PlanData | null>(null);
  const load = useCallback(() => api<PlanData>(`/plan?year=${year}`).then(setD).catch(onError), [year, onError]);
  useEffect(() => void load(), [load]);
  if (!d) return <p className="muted">불러오는 중…</p>;
  const sum = (k: keyof PlanMonth) => d.months.reduce((n, m) => n + (m[k] as number), 0);
  const set = async (month: string, row: Row, man: string | null) => {
    try {
      setD(await api<PlanData>('/plan/cell', { month, row, amount: man === null ? null : Math.round(Number(man.replace(/[^\d.-]/g, '')) * 10000) }));
    } catch (e) {
      onError(e);
    }
  };
  const ROWS: { k: Row | 'spc' | 'save'; name: string; hint?: string }[] = [
    { k: 'inc', name: '수입' },
    { k: 'fix', name: '고정지출' },
    { k: 'var', name: '변동지출' },
    { k: 'spc', name: '특별지출', hint: '머니노트 합계' },
    { k: 'save', name: '목표 저축액', hint: '수입 − 고정 − 변동 − 특별' },
  ];
  return (
    <>
      <div className="head">
        {!embedded && (
          <button className="btn sm" onClick={() => go(`#/plan?tab=plan&year=${Number(year) - 1}`)}>
            ◀
          </button>
        )}
        {embedded ? <h2 className="sec" style={{ margin: 0 }}>1. {year}년 머니플랜</h2> : <h1>{year}년 머니플랜</h1>}
        {!embedded && (
          <button className="btn sm" onClick={() => go(`#/plan?tab=plan&year=${Number(year) + 1}`)}>
            ▶
          </button>
        )}
        <span className="muted">단위: 만 원 (대략)</span>
      </div>
      <div className="tiles three">
        <div className="tile">
          <small>1년 특별지출 (머니노트) — 미리 떼어 둘 돈</small>
          <b>{roughMan(sum('spc'))}</b>
          <div className="muted small">한 달 평균 {roughMan(sum('spc') / 12)}</div>
        </div>
        <div className="tile">
          <small>1년 목표 저축액</small>
          <b className={sum('save') < 0 ? 'bad' : 'good'}>{roughMan(sum('save'))}</b>
          <div className="muted small">한 달 평균 {roughMan(sum('save') / 12)}</div>
        </div>
        <div className="tile">
          <small>1년 수입</small>
          <b>{roughMan(sum('inc'))}</b>
          <div className="muted small">고정 {roughMan(sum('fix'))} · 변동 {roughMan(sum('var'))}</div>
        </div>
      </div>
      <div className="card">
        <div className="tablewrap">
          <table className="list mplan">
            <thead>
              <tr>
                <th />
                {d.months.map((m) => (
                  <th key={m.month} className="r">
                    {Number(m.month.slice(5))}월
                  </th>
                ))}
                <th className="r">1년 합계</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.k} className={r.k === 'save' ? 'sum' : r.k === 'spc' ? 'spcrow' : ''}>
                  <td>
                    <b>{r.name}</b>
                    {r.hint && <div className="muted small">{r.hint}</div>}
                  </td>
                  {d.months.map((m) => (
                    <td key={m.month} className="r">
                      {r.k === 'inc' || r.k === 'fix' || r.k === 'var' ? (
                        <PlanCell value={m[r.k]} edited={m.edited[r.k]} auto={m.auto[r.k]} onSave={(v) => set(m.month, r.k as Row, v)} />
                      ) : r.k === 'spc' ? (
                        <a className="click" onClick={() => go(`#/plan?tab=note&year=${year}`)}>
                          {m.spc ? roughMan(m.spc) : '·'}
                        </a>
                      ) : (
                        <b className={m.save < 0 ? 'bad' : ''}>{roughMan(m.save)}</b>
                      )}
                    </td>
                  ))}
                  <td className="r">
                    <b>{roughMan(sum(r.k as keyof PlanMonth))}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <details className="help">
          <summary>머니플랜이란?</summary>
          <ul>
            <li>목표 저축 = 수입 − 고정 − 변동 − 특별지출</li>
            <li>자동 입력: 수입 = 최근 3개월 평균, 고정·변동 = 카테고리 예산, 특별지출 = 머니노트</li>
            <li>칸 선택 시 수정 (수정한 칸은 초록색, 비우면 자동 값으로 복귀)</li>
          </ul>
        </details>
      </div>
    </>
  );
}

function PlanCell({ value, edited, auto, onSave }: { value: number; edited: boolean; auto: number; onSave: (v: string | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState('');
  if (!editing)
    return (
      <a className={`click ${edited ? 'good' : ''}`} title={edited ? `고친 값 (자동 값 ${won(auto)}원)` : `자동 값 ${won(auto)}원 — 눌러서 고치기`} onClick={() => (setV(String(Math.round(value / 10000))), setEditing(true))}>
        {roughMan(value)}
      </a>
    );
  const done = (save: boolean) => {
    setEditing(false);
    if (!save) return;
    if (v.trim() === '') onSave(null);
    else if (Math.round(Number(v) * 10000) !== value) onSave(v);
  };
  return <input className="text sm" style={{ width: 70, textAlign: 'right' }} autoFocus value={v} placeholder="자동" onChange={(e) => setV(e.target.value.replace(/[^\d.]/g, ''))} onBlur={() => done(true)} onKeyDown={(e) => (e.key === 'Enter' ? done(true) : e.key === 'Escape' ? done(false) : null)} />;
}
