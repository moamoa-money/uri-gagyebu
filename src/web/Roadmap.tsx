// 로드맵 (3단계) — 단기로드맵: 저축·투자한 곳별 12달 계획(= 결산의 저축 예산과 같은 숫자) vs 실제(거래에서 자동)
// 금액은 만 원 단위. 카페 이미지 2(단기로드맵)도 여기서 만든다.
import { useCallback, useEffect, useRef, useState } from 'react';
import { man, parseAmount, shortSummary, won, type ShortRow } from '../shared/rules';
import { addMonths } from '../shared/dates';
import { api } from './api';
import type { Boot, Toast } from './data';
import { Feedback } from './Review';
import { LongRoadmap } from './LongRoadmap';
import { toBlob, toPng } from 'html-to-image';

export interface ShortData {
  year: string;
  target: number; // 홈에서 정한 올해 목표 (0이면 계획 합계)
  rows: (ShortRow & { hidden: boolean; included: boolean })[];
  notes: Record<string, string>;
}

/** 실제를 몇 월까지 보여 줄지: 올해면 이번 달까지, 지난해면 12월까지, 내년이면 0 */
export const uptoOf = (year: string, today: string) => (year < today.slice(0, 4) ? 12 : year > today.slice(0, 4) ? 0 : Number(today.slice(5, 7)));

/** 단기로드맵에 넣기로 고른 곳만 */
export const inRows = (d: ShortData) => d.rows.filter((r) => r.included);
const rate = (r: number | null) => (r === null ? '' : `${Math.round(r * 100)}%`);
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${man(Math.abs(n))}`;

export function Roadmap({ boot, onError, toast, go, tab, initialYear }: { boot: Boot; onError: (e: unknown) => void; toast: Toast; go: (h: string) => void; tab: 'short' | 'long'; initialYear?: string }) {
  const year = initialYear ?? boot.today.slice(0, 4);
  return (
    <div>
      <div className="tabs">
        <button className={tab === 'short' ? 'on' : ''} onClick={() => go(`#/roadmap?tab=short&year=${year}`)}>
          ① 단기로드맵 (올해)
        </button>
        <button className={tab === 'long' ? 'on' : ''} onClick={() => go(`#/roadmap?tab=long&year=${year}`)}>
          ② 중장기로드맵 (30년)
        </button>
      </div>
      {tab === 'short' ? (
        <ShortPage key={year} year={year} boot={boot} onError={onError} toast={toast} go={go} />
      ) : (
        <LongRoadmap key={year} year={year} boot={boot} onError={onError} toast={toast} go={go} />
      )}
    </div>
  );
}

function ShortPage({ year, boot, onError, toast, go }: { year: string; boot: Boot; onError: (e: unknown) => void; toast: Toast; go: (h: string) => void }) {
  const [d, setD] = useState<ShortData | null>(null);
  const load = useCallback(() => api<ShortData>(`/roadmap/short?year=${year}`).then(setD).catch(onError), [year, onError]);
  const [month, setMonth] = useState(() => defaultRoadmapMonth(year, boot.today));
  useEffect(() => void load(), [load]);
  if (!d) return <p className="muted">불러오는 중…</p>;
  const upto = Math.min(Number(month.slice(5)), uptoOf(year, boot.today) || 12);
  const noteMonth = month;
  return (
    <div>
      <div className="head">
        <button className="btn sm" onClick={() => go(`#/roadmap?tab=short&year=${Number(year) - 1}`)}>
          ◀
        </button>
        <h1>{year} 단기로드맵</h1>
        <button className="btn sm" onClick={() => go(`#/roadmap?tab=short&year=${Number(year) + 1}`)}>
          ▶
        </button>
        <span className="muted small">단위 만 원</span>
      </div>
      <details className="help" style={{ marginTop: -8, marginBottom: 12 }}>
        <summary>단기로드맵이란?</summary>
        <ul>
          <li>올해 저축·투자 계획과 실제를 달마다 비교</li>
          <li>계획: 월말 결산에서 정한 저축·투자 예산</li>
          <li>실제: 거래에 기록한 저축·투자에서 자동 계산</li>
        </ul>
      </details>
      <TargetBar d={d} year={year} onError={onError} reload={load} />
      <IncludePicker d={d} year={year} onError={onError} setD={setD} />
      <div className="card row">
        <MonthPicker year={year} month={month} setMonth={setMonth} />
      </div>
      <ShortImage d={d} upto={upto} boot={boot} toast={toast} onError={onError} />
      {upto > 0 && <Feedback required={false} month={noteMonth} section="short" label={`${Number(noteMonth.slice(5))}월 단기로드맵`} value={d.notes[noteMonth] ?? ''} onSaved={(v) => setD({ ...d, notes: { ...d.notes, [noteMonth]: v } })} onError={onError} />}
      <PlanEditor d={d} year={year} onError={onError} toast={toast} reload={load} />
    </div>
  );
}

// 올해 목표: 홈에서 정한 목표와 같은 숫자. 안 정했으면 달마다 계획을 더한 값
function TargetBar({ d, year, onError, reload }: { d: ShortData; year: string; onError: (e: unknown) => void; reload: () => void }) {
  const s = shortSummary(inRows(d), 0, d.target);
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState('');
  async function save() {
    const n = parseAmount(v);
    try {
      await api('/year-target', { year, amount: n === null ? 0 : n * 10000 });
      setEdit(false);
      reload();
    } catch (e) {
      onError(e);
    }
  }
  return (
    <div className="card row">
      <b>올해 목표</b>
      {edit ? (
        <>
          <input className="text amt" autoFocus value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} placeholder="만 원" style={{ width: 110 }} />
          <span className="muted small">만 원 (비우면 계획 합계로)</span>
          <button className="btn sm main" onClick={save}>
            저장
          </button>
          <button className="btn sm" onClick={() => setEdit(false)}>
            취소
          </button>
        </>
      ) : (
        <>
          <span style={{ fontSize: 18, fontWeight: 800 }}>{man(s.target)}</span>
          <span className="muted small">{d.target > 0 ? '(홈의 올해 목표와 같은 숫자)' : '(따로 정한 목표가 없어서 달마다 계획 합계)'}</span>
          <button className="btn sm" onClick={() => (setV(d.target > 0 ? String(Math.round(d.target / 10000)) : ''), setEdit(true))}>
            고치기
          </button>
        </>
      )}
      <span className="spacer" />
      <span className="muted">달마다 계획 합계 {man(s.planYear)}</span>
      {d.target > 0 && s.planYear !== d.target && <span className={s.planYear < d.target ? 'warn small' : 'muted small'}>(목표와 {signed(s.planYear - d.target)})</span>}
    </div>
  );
}

// ---------- 카페 이미지 2: 단기로드맵 (미리보기 = 이미지) ----------
export function ShortImage({ d, upto, boot, toast, onError, note }: { d: ShortData; upto: number; boot: Boot; toast: Toast; onError: (e: unknown) => void; note?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const s = shortSummary(inRows(d), upto, d.target);
  const noteMonth = `${d.year}-${String(Math.max(upto, 1)).padStart(2, '0')}`;
  const fb = (note ?? d.notes[noteMonth] ?? '').trim();
  const rows = inRows(d).filter((r) => r.plan.some(Boolean) || r.actual.slice(0, upto).some(Boolean));
  const months = Array.from({ length: 12 }, (_, i) => i);
  const done = (i: number) => i < upto;
  const p = useCafePrefs();
  const ranges: [number, number, string][] = p.layout === 'wide' ? [[0, 12, '올해 합계']] : [[0, 6, '1~6월 계'], [6, 12, '올해 합계']];
  return (
    <div>
      <div className="card">
        <div className="row">
          <h3 style={{ margin: 0 }}>카페 이미지 — 단기로드맵</h3>
          <span className="muted small">아래 모양 그대로 고해상도(2배) 이미지가 돼요</span>
          <span className="spacer" />
          <ImageButtons target={ref} fileName={`${noteMonth} 단기로드맵.png`} toast={toast} onError={onError} />
        </div>
        <CafeOptions p={p} feedback={fb} toast={toast} />
      </div>
      <div className="cf-wrap">
        <div className={`cf rm ${p.layout} ${p.hideMoney ? `hidemoney m-${p.maskStyle}` : ''}`} ref={ref}>
          <div className="cf-title">
            <b>
              {d.year}년 {upto > 0 ? `${upto}월 · ` : ''}단기로드맵
            </b>
            <span>올해 저축 목표 vs 실제 · 단위 만 원</span>
          </div>
          {ranges.map(([a, b, totalName]) => {
            const ms = months.filter((i) => i >= (a as number) && i < (b as number));
            // 합계 칸: 앞 반은 1~6월 계, 뒤 반은 올해 합계 (지금까지 본 달만)
            const from = totalName === '올해 합계' ? 0 : (a as number);
            const to = Math.min(b as number, upto);
            const sumOf = (xs: number[]) => xs.slice(from, Math.max(from, to)).reduce((x, y) => x + y, 0);
            const planTo = totalName === '올해 합계' ? 12 : (b as number);
            const actualSum = sumOf(s.actual.map((x) => x ?? 0));
            const planSeen = sumOf(s.plan);
            const any = to > from;
            return (
              <table key={String(a)} className="cf-table rm">
                <thead>
                  <tr>
                    <th />
                    {ms.map((i) => (
                      <th key={i}>{i + 1}월</th>
                    ))}
                    <th className="rm-tot">{totalName}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.categoryId}>
                      <td>{r.name}</td>
                      {ms.map((i) => (
                        <td key={i} className={done(i) ? 'money' : ''}>
                          {done(i) ? man(r.actual[i]) : ''}
                        </td>
                      ))}
                      <td className="rm-tot money">
                        <b>{any ? man(sumOf(r.actual)) : ''}</b>
                      </td>
                    </tr>
                  ))}
                  <tr className="cf-sum">
                    <td>실제 합계</td>
                    {ms.map((i) => (
                      <td key={i} className={s.actual[i] === null ? '' : 'money'}>
                        {s.actual[i] === null ? '' : man(s.actual[i]!)}
                      </td>
                    ))}
                    <td className="rm-tot money">{any ? man(actualSum) : ''}</td>
                  </tr>
                  <tr className="rm-plan">
                    <td>계획</td>
                    {ms.map((i) => (
                      <td key={i} className="money">
                        {man(s.plan[i])}
                      </td>
                    ))}
                    <td className="rm-tot money">{man(s.plan.slice(from, planTo).reduce((x, y) => x + y, 0))}</td>
                  </tr>
                  <tr>
                    <td>차액</td>
                    {ms.map((i) => (
                      <td key={i} className={s.diff[i] === null ? '' : `money ${s.diff[i]! < 0 ? 'bad' : 'good'}`}>
                        {s.diff[i] === null ? '' : signed(s.diff[i]!)}
                      </td>
                    ))}
                    <td className={`rm-tot money ${actualSum - planSeen < 0 ? 'bad' : 'good'}`}>{any ? signed(actualSum - planSeen) : ''}</td>
                  </tr>
                  <tr>
                    <td>누적 달성률</td>
                    {ms.map((i) => (
                      <td key={i}>{rate(s.cumRate[i])}</td>
                    ))}
                    <td className="rm-tot" />
                  </tr>
                </tbody>
              </table>
            );
          })}
          <div className="rm-line">
            {p.hideMoney ? (
              upto === 0 ? (
                <>아직 시작 전</>
              ) : (
                <>
                  올해 목표의 <em>{Math.round((s.actualYear / s.target) * 100)}%</em> 모음
                  {s.pace !== null && s.target > 0 && <> · 지금 속도면 연말 약 {Math.round((s.pace / s.target) * 100)}%</>}
                </>
              )
            ) : upto === 0 ? (
              <>올해 목표 {man(s.target)} · 아직 시작 전</>
            ) : s.remaining === 0 ? (
              <>
                올해 목표 {man(s.target)} <em className="good">달성!</em> (지금까지 {man(s.actualYear)})
              </>
            ) : (
              <>
                올해 목표 {man(s.target)} · 목표까지 남은 돈 <em>{man(s.remaining)}</em>
                {s.perMonth !== null && (
                  <>
                    {' '}
                    · 남은 {s.leftMonths}달 월 <em>{man(s.perMonth)}</em>씩 모으면 달성
                  </>
                )}
                {s.pace !== null && s.target > 0 && (
                  <>
                    {' '}
                    · 지금 속도면 연말 약 {man(s.pace)} ({Math.round((s.pace / s.target) * 100)}%)
                  </>
                )}
              </>
            )}
          </div>
          {fb && p.withFb && (
            <div className="cf-fb">
              <div className="cf-fbt">피드백</div>
              <div className="cf-note">{fb}</div>
            </div>
          )}
          <div className="cf-foot">{boot.household}</div>
        </div>
      </div>
    </div>
  );
}

export function ImageButtons({ target, fileName, toast, onError }: { target: React.RefObject<HTMLDivElement | null>; fileName: string; toast: Toast; onError: (e: unknown) => void }) {
  const [busy, setBusy] = useState(false);
  const opts = { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true };
  async function run(kind: 'copy' | 'save') {
    if (!target.current) return;
    setBusy(true);
    try {
      if (kind === 'copy') {
        const blob = await toBlob(target.current, opts);
        if (!blob) throw new Error('이미지를 만들지 못했어요.');
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        toast('복사했어요 — 카페 글쓰기에서 붙여넣기(⌘V) 하세요');
      } else {
        const a = document.createElement('a');
        a.href = await toPng(target.current, opts);
        a.download = fileName;
        a.click();
        toast('이미지를 저장했어요 (다운로드 폴더)');
      }
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button className="btn main" disabled={busy} onClick={() => run('copy')}>
        복사하기
      </button>
      <button className="btn" disabled={busy} onClick={() => run('save')}>
        이미지로 저장
      </button>
    </>
  );
}

// ---------- 달마다 계획 고치기: 결산의 저축·투자 예산과 같은 칸 (원 단위) ----------
function PlanEditor({ d, year, onError, toast, reload, startOpen = false }: { d: ShortData; year: string; onError: (e: unknown) => void; toast: Toast; reload: () => void; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  async function save(categoryId: string, i: number, text: string, before: number) {
    if (text.trim() === '' && before === 0) return;
    const n = parseAmount(text) ?? 0; // 비우면 0
    if (n === before) return;
    try {
      await api('/budgets', { categoryId, month: `${year}-${String(i + 1).padStart(2, '0')}`, amount: n });
      toast('계획을 고쳤어요 (월말 결산 저축 예산도 같이 바뀌어요)');
      reload();
    } catch (e) {
      onError(e);
    }
  }
  const months = Array.from({ length: 12 }, (_, i) => i);
  return (
    <div className="card">
      <h3 className="row click" onClick={() => setOpen(!open)}>
        {open ? '▾' : '▸'} 달마다 계획 고치기 <span className="muted small">— 저축·투자한 곳별 월 계획 (원 단위). 여기서 고치면 월말 결산의 저축 예산도 같이 바뀌어요</span>
      </h3>
      {open && (
        <div style={{ overflowX: 'auto' }}>
          <table className="list rm-edit">
            <thead>
              <tr>
                <th>모은 곳</th>
                {months.map((i) => (
                  <th key={i} className="r">
                    {i + 1}월
                  </th>
                ))}
                <th className="r">합계</th>
              </tr>
            </thead>
            <tbody>
              {inRows(d).map((r) => (
                <tr key={r.categoryId}>
                  <td>{r.name}</td>
                  {months.map((i) => (
                    <td key={i} className="r">
                      <input key={`${r.categoryId}-${i}-${r.plan[i]}`} className="text amt" defaultValue={r.plan[i] ? won(r.plan[i]) : ''} placeholder="0" onBlur={(e) => save(r.categoryId, i, e.target.value, r.plan[i])} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
                    </td>
                  ))}
                  <td className="r">
                    <b>{won(r.plan.reduce((a, b) => a + b, 0))}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// 단기로드맵에 넣을 곳 고르기 — 사람마다 다름 (예: 딜 투자처럼 목돈을 잠깐 묶어 두는 곳은 빼기)
function IncludePicker({ d, year, onError, setD }: { d: ShortData; year: string; onError: (e: unknown) => void; setD: (x: ShortData) => void }) {
  async function toggle(categoryId: string, on: boolean) {
    try {
      setD(await api<ShortData>('/roadmap/short/include', { categoryId, on, year }));
    } catch (e) {
      onError(e);
    }
  }
  return (
    <div className="card row">
      <b>단기로드맵에 넣을 곳</b>
      <span className="muted small">눌러서 넣기·빼기 (계획·실제·목표 계산 모두 따라 바뀌어요)</span>
      {d.rows.map((r) => (
        <button key={r.categoryId} className={`chip ${r.included ? 'on' : ''}`} onClick={() => toggle(r.categoryId, !r.included)}>
          {r.included ? '✓ ' : ''}
          {r.name}
        </button>
      ))}
    </div>
  );
}

// ---------- 카페 이미지 공통 옵션: 넓게(PC형)/좁게(휴대폰형) · 금액 가리기 · 피드백 넣기 (고른 것 기억) ----------
export type CafeLayout = 'wide' | 'narrow';
export function useCafePrefs() {
  const [layout, setLayout] = useState<CafeLayout>(() => (localStorage.getItem('gb_cafe_layout') === 'narrow' ? 'narrow' : 'wide'));
  const [hideMoney, setHideMoney] = useState(() => localStorage.getItem('gb_rm_hide') === '1');
  const withFb = true; // 피드백은 늘 이미지 안에 (선생님: 한 번에 복사)
  const maskStyle = 'solid'; // 가리기 모양: 옅은 단색 막대 (선생님 2026-11-15 — 모자이크·별표와 비교해 고름)
  useEffect(() => localStorage.setItem('gb_cafe_layout', layout), [layout]);
  useEffect(() => localStorage.setItem('gb_rm_hide', hideMoney ? '1' : '0'), [hideMoney]);
  return { layout, setLayout, hideMoney, setHideMoney, withFb, maskStyle };
}
export function CafeOptions({ p, money = true }: { p: ReturnType<typeof useCafePrefs>; feedback?: string; toast?: Toast; money?: boolean }) {
  return (
    <div className="cafeopt">
      <b className="small">모양</b>
      <span className="seg">
        <button className={p.layout === 'wide' ? 'on' : ''} onClick={() => p.setLayout('wide')}>
          넓게 (PC형)
        </button>
        <button className={p.layout === 'narrow' ? 'on' : ''} onClick={() => p.setLayout('narrow')}>
          좁게 (휴대폰형)
        </button>
      </span>
      {money && (
        <>
          <b className="small">금액</b>
          <span className="seg">
            <button className={!p.hideMoney ? 'on' : ''} onClick={() => p.setHideMoney(false)}>
              보이기
            </button>
            <button className={p.hideMoney ? 'on' : ''} onClick={() => p.setHideMoney(true)}>
              가리기
            </button>
          </span>
        </>
      )}
      <span className="muted small">고른 것은 다음에도 그대로예요</span>
    </div>
  );
}

/** 로드맵 기준 달 기본값: 올해면 지난달(지난달 결산을 이번 달에 하니까), 지난해면 12월, 내년이면 1월 */
export function defaultRoadmapMonth(year: string, today: string) {
  const ty = today.slice(0, 4);
  if (year < ty) return `${year}-12`;
  if (year > ty) return `${year}-01`;
  const m = today.slice(0, 7);
  return m.endsWith('-01') ? m : addMonths(m, -1);
}

/** 기준 달 고르기 (그 로드맵 해 안에서만) */
export function MonthPicker({ year, month, setMonth }: { year: string; month: string; setMonth: (m: string) => void }) {
  const m = Number(month.slice(5));
  return (
    <span className="row" style={{ gap: 4 }}>
      <span className="muted small">기준 달</span>
      <button className="btn sm" disabled={m <= 1} onClick={() => setMonth(addMonths(month, -1))}>
        ◀
      </button>
      <b style={{ minWidth: 40, textAlign: 'center' }}>{m}월</b>
      <button className="btn sm" disabled={m >= 12} onClick={() => setMonth(addMonths(month, 1))}>
        ▶
      </button>
      <span className="muted small">— 버전·피드백·카페 이미지가 이 달 것으로 나와요{year ? '' : ''}</span>
    </span>
  );
}

/** 연간 결산 '새해 계획'에 끼워 넣는 단기로드맵 계획: 올해 목표 · 넣을 곳 · 달마다 계획 (실제 표는 빼고) */
export function ShortPlanSection({ year, onError, toast }: { year: string; onError: (e: unknown) => void; toast: Toast }) {
  const [d, setD] = useState<ShortData | null>(null);
  const load = useCallback(() => api<ShortData>(`/roadmap/short?year=${year}`).then(setD).catch(onError), [year, onError]);
  useEffect(() => void load(), [load]);
  if (!d) return <p className="muted">불러오는 중…</p>;
  return (
    <>
      <TargetBar d={d} year={year} onError={onError} reload={load} />
      <IncludePicker d={d} year={year} onError={onError} setD={setD} />
      <PlanEditor d={d} year={year} onError={onError} toast={toast} reload={load} startOpen />
    </>
  );
}
