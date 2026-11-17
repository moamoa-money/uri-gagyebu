// ④ 연간 결산 — 한 해 돈 관리 회고(세금 연말정산 아님) + 새해 계획 모아 보기
import { useCallback, useEffect, useRef, useState } from 'react';
import { leftLabel, man, parseAmount, rateText, won, type MonthTotals } from '../shared/rules';
import type { Category } from '../shared/types';
import { api } from './api';
import type { Boot, Toast } from './data';
import { LineChart } from './LineChart';
import { AssetTrend } from './Review';
import { CafeOptions, ImageButtons, ShortImage, ShortPlanSection, uptoOf, useCafePrefs, type ShortData } from './Roadmap';
import { MoneyPlan } from './Plan';
import { MoneyNote } from './MoneyNote';

interface Judged { id: string; month: string; section: string; kind: 'num' | 'text'; categoryId: string | null; limitAmount: number | null; body: string; result: string | null; auto: string | null }
interface YearRec { year: string; saveTarget: number | null; saveActual: number | null; returnBp: number | null; endAssets: number | null; memo: string }
interface AnnualData {
  year: string;
  months: (MonthTotals & { month: string })[];
  categories: { category: Category; budget: number; actual: number; over: number; months: number[] }[];
  pledges: Judged[];
  records: YearRec[];
  app: { year: string; saveTarget: number; saveActual: number; endAssets: number | null };
  notes: Record<string, string>;
  upto: string | null;
}

const GROUPS: [string, string[]][] = [
  ['변동지출', ['var']],
  ['고정지출', ['fix']],
  ['수입', ['inc']],
  ['저축·투자', ['sav', 'inv']],
];

export function Annual({ boot, onError, toast, go, initialYear, tab }: { boot: Boot; onError: (e: unknown) => void; toast: Toast; go: (h: string) => void; initialYear?: string; tab: 'review' | 'plan' }) {
  const year = initialYear ?? (Number(boot.today.slice(5, 7)) <= 2 ? String(Number(boot.today.slice(0, 4)) - 1) : boot.today.slice(0, 4));
  const [d, setD] = useState<AnnualData | null>(null);
  const load = useCallback(() => api<AnnualData>(`/annual?year=${year}`).then(setD).catch(onError), [year, onError]);
  useEffect(() => void load(), [load]);
  const next = String(Number(year) + 1);
  return (
    <div>
      <div className="head">
        <button className="btn sm" onClick={() => go(`#/annual?tab=${tab}&year=${Number(year) - 1}`)}>
          ◀
        </button>
        <h1>{year} 연간 결산</h1>
        <button className="btn sm" onClick={() => go(`#/annual?tab=${tab}&year=${next}`)}>
          ▶
        </button>
        {d?.upto && d.upto < `${year}-12` && <span className="tag">아직 {Number(d.upto.slice(5))}월까지예요</span>}
      </div>
      <div className="tabs">
        <button className={tab === 'review' ? 'on' : ''} onClick={() => go(`#/annual?tab=review&year=${year}`)}>
          ① {year} 회고
        </button>
        <button className={tab === 'plan' ? 'on' : ''} onClick={() => go(`#/annual?tab=plan&year=${year}`)}>
          ② {next} 계획
        </button>
      </div>
      {!d ? <p className="muted">불러오는 중…</p> : tab === 'review' ? <ReviewTab d={d} boot={boot} onError={onError} toast={toast} reload={load} setD={setD} /> : <PlanTab d={d} next={next} go={go} onError={onError} setD={setD} household={boot.household} toast={toast} boot={boot} />}
    </div>
  );
}

function ReviewTab({ d, boot, onError, toast, reload, setD }: { d: AnnualData; boot: Boot; onError: (e: unknown) => void; toast: Toast; reload: () => void; setD: (d: AnnualData) => void }) {
  const sum = (k: keyof MonthTotals) => d.months.reduce((s, m) => s + (m[k] as number), 0);
  const inc = sum('inc');
  const saved = sum('sav') + sum('inv');
  const [sd, setSd] = useState<ShortData | null>(null);
  useEffect(() => void api<ShortData>(`/roadmap/short?year=${d.year}`).then(setSd).catch(onError), [d.year, onError]);
  if (!d.upto) return <p className="muted">{d.year}년 기록이 아직 없어요.</p>;
  const tiles: [string, string, string?][] = [
    ['1년 수입', won(inc)],
    ['1년 지출', won(sum('spending'))],
    ['저축·투자', won(saved)],
    ['저축률', inc > 0 ? `${((saved / inc) * 100).toFixed(1)}%` : '-'],
    [leftLabel(sum('left')), won(Math.abs(sum('left'))), sum('left') < 0 ? 'bad' : ''],
  ];
  return (
    <>
      <div className="card">
        <div className="tiles5">
          {tiles.map(([n, v, cls]) => (
            <div key={n}>
              <small>{n}</small>
              <b className={cls}>{v}</b>
            </div>
          ))}
        </div>
      </div>

      <h2 className="sec">자산 추이</h2>
      <AssetTrend month={d.upto} boot={boot} onError={onError} />

      <h2 className="sec">달별 저축률</h2>
      <div className="card">
        <LineChart
          points={d.months.map((m) => ({ label: `${Number(m.month.slice(5))}월`, value: m.saveRate === null ? 0 : Math.round(m.saveRate * 1000) / 10 }))}
          color="var(--accent)"
          height={220}
          valueText={(n) => `${n}%`}
          axisText={(n) => `${n}%`}
          endText={(n) => `${n}%`}
        />
        <p className="muted small">저축률 = 그달 (저축 + 투자) ÷ 수입. 저축 통장끼리 옮긴 돈은 빼고 계산해요. 1년 평균 {inc > 0 ? `${((saved / inc) * 100).toFixed(1)}%` : '-'}.</p>
      </div>

      <h2 className="sec">단기로드맵 — 1년 실제</h2>
      {sd && <ShortImage d={sd} upto={Math.min(12, uptoOf(d.year, boot.today) || 12)} boot={boot} toast={toast} onError={onError} />}

      <h2 className="sec">해마다 비교</h2>
      <YearCompare d={d} onError={onError} toast={toast} reload={reload} />

      <h2 className="sec">구역별 1년 결산</h2>
      {GROUPS.map(([name, grps]) => (
        <GroupYear key={name} name={name} spend={grps[0] === 'var' || grps[0] === 'fix'} rows={d.categories.filter((c) => grps.includes(c.category.grp) && (c.budget || c.actual))} />
      ))}

      <h2 className="sec">다짐 돌아보기</h2>
      <PledgeYear d={d} boot={boot} />

      <h2 className="sec">회고</h2>
      <NoteBox year={d.year} section="review" value={d.notes.review ?? ''} placeholder={`${d.year}년 돈 관리를 돌아보며: 잘한 것, 아쉬운 것, 배운 것, 내년엔 이렇게`} onSaved={(v) => setD({ ...d, notes: { ...d.notes, review: v } })} onError={onError} />

      <h2 className="sec">카페 이미지 — 한 해 회고</h2>
      <ReviewImage d={d} household={boot.household} toast={toast} onError={onError} />
      <p className="muted small">단기로드맵 1년 이미지는 위 '단기로드맵 — 1년 실제'에서, 중장기로드맵은 로드맵 메뉴에서 복사해요.</p>
    </>
  );
}

// 해마다 비교: 직접 적은 해(2024·2025…) + 앱 기록이 있는 해(비운 칸은 앱 계산)
function YearCompare({ d, onError, toast, reload }: { d: AnnualData; onError: (e: unknown) => void; toast: Toast; reload: () => void }) {
  const [edit, setEdit] = useState<Record<string, string> | null>(null);
  const rec = (y: string) => d.records.find((r) => r.year === y);
  const years = [...new Set([...d.records.map((r) => r.year), d.year])].sort();
  const row = (y: string) => {
    const r = rec(y);
    const isApp = y === d.year;
    const target = r?.saveTarget ?? (isApp ? d.app.saveTarget : null);
    const actual = r?.saveActual ?? (isApp ? d.app.saveActual : null);
    const end = r?.endAssets ?? (isApp ? d.app.endAssets : null);
    const rate = target && actual !== null ? actual / target : null;
    // 수익률 = 목표보다 더 모은 비율 (달성률 − 100%) — 선생님 넘버스 표와 같은 계산. 직접 적은 값이 있으면 그것
    return { y, target, actual, rate, ret: r?.returnBp ?? (rate === null ? null : Math.round((rate - 1) * 10000)), retAuto: r?.returnBp == null, end, memo: r?.memo ?? '', isApp };
  };
  const rows = years.map(row);
  async function save() {
    if (!edit) return;
    try {
      await api('/annual/record', {
        year: edit.year,
        saveTarget: edit.saveTarget ? (parseAmount(edit.saveTarget) ?? 0) * 10000 : null,
        saveActual: edit.saveActual ? (parseAmount(edit.saveActual) ?? 0) * 10000 : null,
        endAssets: edit.endAssets ? (parseAmount(edit.endAssets) ?? 0) * 10000 : null,
        returnBp: edit.returnBp ? Math.round(Number(edit.returnBp.replace(/[%\s]/g, '').replace('−', '-')) * 100) : null,
        memo: edit.memo ?? '',
      });
      toast(`${edit.year}년 기록을 저장했어요`);
      setEdit(null);
      reload();
    } catch (e) {
      onError(e);
    }
  }
  const startEdit = (y: string) => {
    const r = rec(y);
    const m = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(Math.round(n / 10000)));
    setEdit({ year: y, saveTarget: m(r?.saveTarget), saveActual: m(r?.saveActual), endAssets: m(r?.endAssets), returnBp: r?.returnBp != null ? String(r.returnBp / 100) : '', memo: r?.memo ?? '' });
  };
  return (
    <div className="card">
      <table className="list">
        <thead>
          <tr>
            <th>연도</th>
            <th className="r">저축 목표</th>
            <th className="r">실제 저축</th>
            <th className="r">달성률</th>
            <th className="r" title="목표보다 더 모은 비율 = 달성률 − 100%">초과 달성</th>
            <th className="r">연말 자산</th>
            <th>메모</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.y} className={r.y === d.year ? 'sel' : ''}>
              <td>
                <b>{r.y}</b> {r.isApp && <span className="muted small">앱 기록</span>}
              </td>
              <td className="r">{r.target === null ? '-' : man(r.target)}</td>
              <td className="r">{r.actual === null ? '-' : man(r.actual)}</td>
              <td className={`r ${r.rate === null ? '' : r.rate >= 1 ? 'good' : 'warn'}`}>{r.rate === null ? '-' : `${(r.rate * 100).toFixed(1)}%`}</td>
              <td className={`r ${r.ret !== null && r.ret < 0 ? 'bad' : 'good'}`}>{r.ret === null ? '-' : `${r.ret > 0 ? '+' : ''}${(r.ret / 100).toFixed(1)}%`}</td>
              <td className="r">{r.end === null ? '-' : man(r.end)}</td>
              <td className="muted small">{r.memo}</td>
              <td className="r">
                <button className="btn sm" onClick={() => startEdit(r.y)}>
                  고치기
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row" style={{ marginTop: 6 }}>
        <span className="muted small">단위 만 원 · 초과 달성 = 목표보다 더 모은 비율(달성률 − 100%) · {d.year}년은 비운 칸을 앱이 계산해요(실제 저축 = 단기로드맵에 넣은 곳의 1년 합계, 연말 자산 = 로드맵 실제 줄).</span>
        <span className="spacer" />
        <button className="btn sm" onClick={() => setEdit({ year: String(Number(years[0] ?? d.year) - 1), saveTarget: '', saveActual: '', endAssets: '', returnBp: '', memo: '' })}>
          ＋ 지난 해 넣기
        </button>
      </div>
      {edit && (
        <div className="yr-edit">
          <input className="text sm" style={{ width: 70 }} value={edit.year} onChange={(e) => setEdit({ ...edit, year: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
          <span>년</span>
          <span>목표</span>
          <input className="text sm" style={{ width: 90 }} value={edit.saveTarget} onChange={(e) => setEdit({ ...edit, saveTarget: e.target.value })} placeholder="만 원" />
          <span>실제</span>
          <input className="text sm" style={{ width: 90 }} value={edit.saveActual} onChange={(e) => setEdit({ ...edit, saveActual: e.target.value })} placeholder={edit.year === d.year ? '비우면 자동' : '만 원'} />
          <span>초과 달성</span>
          <input className="text sm" style={{ width: 70 }} value={edit.returnBp} onChange={(e) => setEdit({ ...edit, returnBp: e.target.value })} placeholder="비우면 자동" />
          <span>연말 자산</span>
          <input className="text sm" style={{ width: 100 }} value={edit.endAssets} onChange={(e) => setEdit({ ...edit, endAssets: e.target.value })} placeholder={edit.year === d.year ? '비우면 자동' : '만 원'} />
          <input className="text sm" style={{ flex: 1, minWidth: 140 }} value={edit.memo} onChange={(e) => setEdit({ ...edit, memo: e.target.value })} placeholder="메모 (선택)" />
          <button className="btn sm main" onClick={save}>
            저장
          </button>
          <button className="btn sm" onClick={() => setEdit(null)}>
            취소
          </button>
        </div>
      )}
    </div>
  );
}

function GroupYear({ name, spend, rows }: { name: string; spend: boolean; rows: AnnualData['categories'] }) {
  const [open, setOpen] = useState(false);
  const budget = rows.reduce((s, r) => s + r.budget, 0);
  const actual = rows.reduce((s, r) => s + r.actual, 0);
  const sorted = [...rows].sort((a, b) => (spend ? b.actual - b.budget - (a.actual - a.budget) : b.actual - a.actual));
  const shown = open ? sorted : sorted.slice(0, 5);
  return (
    <div className="card">
      <h3 className="row">
        {name}
        <span className="muted small">
          1년 {spend ? '예산' : '계획'} {won(budget)} · 실제 {won(actual)}
        </span>
        {budget > 0 && <b className={spend ? (actual > budget ? 'bad' : 'good') : actual >= budget ? 'good' : 'warn'}>{spend ? rateText(budget, actual) : `${Math.round((actual / budget) * 100)}%`}</b>}
      </h3>
      <table className="list">
        <thead>
          <tr>
            <th>카테고리</th>
            <th className="r">1년 {spend ? '예산' : '계획'}</th>
            <th className="r">실제</th>
            <th className="r">{spend ? '남음(−넘침)' : '차이'}</th>
            <th className="r">{spend ? '달성률' : '달성'}</th>
            {spend && <th className="r">넘친 달</th>}
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.category.id}>
              <td>{r.category.name}</td>
              <td className="r">{won(r.budget)}</td>
              <td className="r">
                <b>{won(r.actual)}</b>
              </td>
              <td className={`r ${spend && r.budget - r.actual < 0 ? 'bad' : ''}`}>{won(spend ? r.budget - r.actual : r.actual - r.budget)}</td>
              <td className={`r ${spend ? (r.actual > r.budget ? 'bad' : 'good') : ''}`}>{spend ? rateText(r.budget, r.actual) : r.budget ? `${Math.round((r.actual / r.budget) * 100)}%` : '-'}</td>
              {spend && <td className={`r ${r.over >= 3 ? 'bad' : 'muted'}`}>{r.over ? `${r.over}번` : '-'}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {sorted.length > 5 && (
        <button className="btn sm" onClick={() => setOpen(!open)}>
          {open ? '접기' : `${sorted.length}개 모두 보기`}
        </button>
      )}
      {spend && <p className="muted small">{spend ? '많이 넘친 순서예요.' : ''} 넘친 달이 3번 넘으면 예산을 다시 잡아 볼 만해요.</p>}
    </div>
  );
}

function PledgeYear({ d, boot }: { d: AnnualData; boot: Boot }) {
  const st = (p: Judged) => (p.kind === 'num' ? p.auto : p.result);
  const kept = d.pledges.filter((p) => st(p) === 'kept').length;
  const judged = d.pledges.filter((p) => st(p) === 'kept' || st(p) === 'missed').length;
  const cat = (id: string | null) => boot.categories.find((c) => c.id === id)?.name ?? '';
  const months = [...new Set(d.pledges.map((p) => p.month))].sort();
  return (
    <div className="card">
      {d.pledges.length === 0 ? (
        <p className="muted">올해 적은 다짐이 아직 없어요.</p>
      ) : (
        <>
          <p>
            다짐 <b>{d.pledges.length}개</b> 중 지킴 <b className="good">{kept}개</b>
            {judged ? <> · 지킨 비율 <b>{Math.round((kept / judged) * 100)}%</b></> : ''}
          </p>
          {months.map((m) => (
            <div key={m} className="pl-year">
              <b>{Number(m.slice(5))}월</b>
              <div>
                {d.pledges
                  .filter((p) => p.month === m)
                  .map((p) => (
                    <div key={p.id}>
                      · {p.kind === 'num' ? `${cat(p.categoryId)} ${won(p.limitAmount ?? 0)}원 이하` : p.body}{' '}
                      <em className={st(p) === 'kept' ? 'good' : st(p) === 'missed' ? 'bad' : 'muted'}>{st(p) === 'kept' ? '지킴' : st(p) === 'missed' ? '못 지킴' : '—'}</em>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function NoteBox({ year, section, value, placeholder, onSaved, onError }: { year: string; section: string; value: string; placeholder: string; onSaved: (v: string) => void; onError: (e: unknown) => void }) {
  const [v, setV] = useState(value);
  const [st, setSt] = useState('');
  useEffect(() => setV(value), [value]);
  return (
    <div className="card">
      <textarea
        className="text fb"
        rows={6}
        value={v}
        placeholder={placeholder}
        onChange={(e) => (setV(e.target.value), setSt(''))}
        onBlur={async () => {
          if (v === value) return;
          try {
            await api('/annual/note', { year, section, body: v });
            onSaved(v);
            setSt('저장됐어요');
          } catch (e) {
            onError(e);
          }
        }}
      />
      <div className="muted small">{st || '칸 밖을 누르면 저장돼요'}</div>
    </div>
  );
}

// ② 새해 계획: 이미 있는 화면(머니노트·머니플랜·단기로드맵 계획·중장기로드맵)을 모아 보기 + 새해 다짐
function PlanTab({ d, next, go, onError, setD, household, toast, boot }: { d: AnnualData; next: string; go: (h: string) => void; onError: (e: unknown) => void; setD: (d: AnnualData) => void; household: string; toast: Toast; boot: Boot }) {
  return (
    <>
      <p className="muted small">{next}년 계획을 이 한 페이지에서 모두 해요. 여기서 고친 것은 머니플랜·로드맵 메뉴에도 똑같이 들어가요(같은 숫자).</p>
      <MoneyPlan year={next} go={go} onError={onError} toast={toast} embedded />
      <MoneyNote boot={boot} onError={onError} toast={toast} go={go} initial={{ year: next }} embedded />
      <h2 className="sec">3. {next}년 단기로드맵 계획</h2>
      <ShortPlanSection year={next} onError={onError} toast={toast} />
      <h2 className="sec">4·5. 중장기로드맵</h2>
      <div className="card row">
        <span>{next} 로드맵은 {d.year} 로드맵을 이어받아 만들어요 (나이 +1, 실제 연말 자산에서 시작).</span>
        <span className="spacer" />
        <button className="btn main" onClick={() => go(`#/roadmap?tab=long&year=${next}`)}>
          {next} 로드맵 열기 →
        </button>
      </div>
      <h2 className="sec">{next}년 돈 관리 다짐</h2>
      <NoteBox year={d.year} section="plan" value={d.notes.plan ?? ''} placeholder={`${next}년엔 이렇게: 저축 목표, 줄일 것, 꼭 할 것`} onSaved={(v) => setD({ ...d, notes: { ...d.notes, plan: v } })} onError={onError} />
      <h2 className="sec">카페 이미지 — {next} 계획</h2>
      <PlanImage year={next} household={household} note={d.notes.plan ?? ''} onError={onError} toast={toast} categories={boot.categories} />
    </>
  );
}

// ---------- 연간 카페 이미지 ① 한 해 회고 ----------
function ReviewImage({ d, household, toast, onError }: { d: AnnualData; household: string; toast: Toast; onError: (e: unknown) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const p = useCafePrefs();
  const sum = (k: keyof MonthTotals) => d.months.reduce((s, m) => s + (m[k] as number), 0);
  const inc = sum('inc');
  const saved = sum('sav') + sum('inv');
  const st = (x: Judged) => (x.kind === 'num' ? x.auto : x.result);
  const kept = d.pledges.filter((x) => st(x) === 'kept').length;
  const judged = d.pledges.filter((x) => st(x) === 'kept' || st(x) === 'missed').length;
  const years = [...new Set([...d.records.map((r) => r.year), d.year])].sort();
  const yr = (y: string) => {
    const r = d.records.find((x) => x.year === y);
    const isApp = y === d.year;
    const t = r?.saveTarget ?? (isApp ? d.app.saveTarget : null);
    const a = r?.saveActual ?? (isApp ? d.app.saveActual : null);
    const rate = t && a !== null ? a / t : null;
    return { y, t, a, rate, ret: r?.returnBp ?? (rate === null ? null : Math.round((rate - 1) * 10000)), memo: r?.memo ?? '' };
  };
  const groups = GROUPS.map(([name, gs]) => {
    const rows = d.categories.filter((c) => gs.includes(c.category.grp));
    const b = rows.reduce((s, r) => s + r.budget, 0);
    const a = rows.reduce((s, r) => s + r.actual, 0);
    const spend = gs[0] === 'var' || gs[0] === 'fix';
    const worst = spend ? [...rows].sort((x, y) => y.actual - y.budget - (x.actual - x.budget)).filter((r) => r.actual > r.budget).slice(0, 2) : [];
    return { name, b, a, spend, worst };
  });
  const last = d.upto ? Number(d.upto.slice(5)) : 12;
  return (
    <div>
      <div className="card">
        <div className="row">
          <h3 style={{ margin: 0 }}>카페 이미지 — {d.year} 회고</h3>
          <span className="spacer" />
          <ImageButtons target={ref} fileName={`${d.year} 연간 회고.png`} toast={toast} onError={onError} />
        </div>
        <CafeOptions p={p} />
      </div>
      <div className="cf-wrap">
        <div className={`cf an ${p.layout} ${p.hideMoney ? `hidemoney m-${p.maskStyle}` : ''}`} ref={ref}>
          <div className="cf-title">
            <b>{d.year}년 돈 관리 회고</b>
            <span>{last < 12 ? `${last}월까지 · ` : ''}{household}</span>
          </div>
          <div className="cf-tiles">
            {(
              [
                ['1년 수입', won(inc), true],
                ['1년 지출', won(sum('spending')), true],
                ['저축·투자', won(saved), true],
                ['저축률', inc > 0 ? `${((saved / inc) * 100).toFixed(1)}%` : '-', false],
                ['다짐 지킴', judged ? `${Math.round((kept / judged) * 100)}%` : '-', false],
              ] as const
            ).map(([n, v, money]) => (
              <div key={n}>
                <small>{n}</small>
                <b className={money ? 'money-t' : ''}>{v}</b>
              </div>
            ))}
          </div>
          <div className="an-sec">달별 저축률</div>
          <div className="an-chart">
            <LineChart points={d.months.map((m) => ({ label: `${Number(m.month.slice(5))}월`, value: m.saveRate === null ? 0 : Math.round(m.saveRate * 1000) / 10 }))} color="var(--accent)" height={190} valueText={(n) => `${n}%`} axisText={(n) => `${n}%`} endText={(n) => `${n}%`} />
          </div>
          <div className="an-sec">해마다 비교 <span>단위 만 원</span></div>
          <table className="cf-table an-t">
            <thead>
              <tr>
                <th>연도</th>
                <th>저축 목표</th>
                <th>실제 저축</th>
                <th>달성률</th>
                <th>초과 달성</th>
                <th>메모</th>
              </tr>
            </thead>
            <tbody>
              {years.map(yr).map((r) => (
                <tr key={r.y} className={r.y === d.year ? 'cf-sum' : ''}>
                  <td>{r.y}</td>
                  <td className="money">{r.t === null ? '-' : man(r.t)}</td>
                  <td className="money">{r.a === null ? '-' : man(r.a)}</td>
                  <td className={r.rate === null ? '' : r.rate >= 1 ? 'good' : 'warn'}>{r.rate === null ? '-' : `${(r.rate * 100).toFixed(1)}%`}</td>
                  <td className={r.ret === null ? '' : r.ret < 0 ? 'bad' : 'good'}>{r.ret === null ? '-' : `${r.ret > 0 ? '+' : ''}${(r.ret / 100).toFixed(1)}%`}</td>
                  <td className="an-memo">{r.memo}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="an-sec">구역별 1년 결산</div>
          <table className="cf-table an-t">
            <thead>
              <tr>
                <th>구역</th>
                <th>1년 예산·계획</th>
                <th>실제</th>
                <th>달성률</th>
                <th>많이 넘친 곳</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.name}>
                  <td>{g.name}</td>
                  <td className="money">{won(g.b)}</td>
                  <td className="money">
                    <b>{won(g.a)}</b>
                  </td>
                  <td className={g.spend ? (g.a > g.b ? 'bad' : 'good') : g.a >= g.b ? 'good' : 'warn'}>{g.b ? (g.spend ? rateText(g.b, g.a) : `${Math.round((g.a / g.b) * 100)}%`) : '-'}</td>
                  <td className="an-memo">{g.worst.map((w) => w.category.name).join(' · ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(d.notes.review ?? '').trim() && (
            <div className="cf-fb">
              <div className="cf-fbt">회고</div>
              <div className="cf-note">{d.notes.review!.trim()}</div>
            </div>
          )}
          <div className="cf-foot">단위 원 (해마다 비교는 만 원)</div>
        </div>
      </div>
    </div>
  );
}

// ---------- 연간 카페 이미지 ② 새해 계획: 머니플랜 + 머니노트 + 새해 다짐 ----------
interface PlanM { month: string; inc: number; fix: number; var: number; spc: number; save: number }
interface MNote { id: string; categoryId: string; month: string; title: string; amount: number }
function PlanImage({ year, household, note, onError, toast, categories }: { year: string; household: string; note: string; onError: (e: unknown) => void; toast: Toast; categories: Category[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const p = useCafePrefs();
  const [plan, setPlan] = useState<PlanM[] | null>(null);
  const [notes, setNotes] = useState<MNote[]>([]);
  useEffect(() => {
    api<{ months: PlanM[] }>(`/plan?year=${year}`).then((x) => setPlan(x.months)).catch(onError);
    api<{ notes: MNote[] }>(`/money-notes?year=${year}`).then((x) => setNotes(x.notes)).catch(onError);
  }, [year, onError]);
  if (!plan) return <p className="muted">불러오는 중…</p>;
  const months = plan.map((m) => Number(m.month.slice(5)));
  const rows: [string, keyof PlanM][] = [
    ['수입', 'inc'],
    ['고정지출', 'fix'],
    ['변동지출', 'var'],
    ['특별지출', 'spc'],
    ['목표 저축', 'save'],
  ];
  const total = (k: keyof PlanM) => plan.reduce((s, m) => s + (m[k] as number), 0);
  // 머니노트 표: 카테고리 × 12달 (머니노트 화면과 같은 모양)
  const noteCats = categories.filter((c) => (c.moneynote && !c.hidden) || notes.some((n) => n.categoryId === c.id));
  const cell = (cid: string, mm: number) => notes.filter((n) => n.categoryId === cid && Number(n.month.slice(5)) === mm).reduce((x, n) => x + n.amount, 0);
  const monthTotal = (mm: number) => notes.filter((n) => Number(n.month.slice(5)) === mm).reduce((x, n) => x + n.amount, 0);
  return (
    <div>
      <div className="card">
        <div className="row">
          <h3 style={{ margin: 0 }}>카페 이미지 — {year} 계획</h3>
          <span className="spacer" />
          <ImageButtons target={ref} fileName={`${year} 새해 계획.png`} toast={toast} onError={onError} />
        </div>
        <CafeOptions p={p} />
      </div>
      <div className="cf-wrap">
        <div className={`cf an anp ${p.layout} ${p.hideMoney ? `hidemoney m-${p.maskStyle}` : ''}`} ref={ref}>
          <div className="cf-title">
            <b>{year}년 돈 관리 계획</b>
            <span>{household}</span>
          </div>
          <div className="an-sec">1. 머니플랜 <span>단위 만 원 · 수입 − 고정 − 변동 − 특별 = 목표 저축</span></div>
          <table className="cf-table an-t anp-t">
            <thead>
              <tr>
                <th />
                {months.map((m) => (
                  <th key={m}>{m}월</th>
                ))}
                <th>1년 합계</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([name, k]) => (
                <tr key={k} className={k === 'save' ? 'cf-sum' : ''}>
                  <td>{name}</td>
                  {plan.map((m) => (
                    <td key={m.month} className={`money ${k === 'save' && (m[k] as number) < 0 ? 'bad' : ''}`}>
                      {man(m[k] as number)}
                    </td>
                  ))}
                  <td className="money">
                    <b>{man(total(k))}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="an-sec">2. 머니노트 <span>달마다 특별지출 (생일·명절·경조사·세금·여행…) · 단위 원</span></div>
          <table className="cf-table an-t anp-t anp-mn">
            <thead>
              <tr>
                <th>카테고리</th>
                {months.map((m) => (
                  <th key={m}>{m}월</th>
                ))}
                <th>합계</th>
              </tr>
            </thead>
            <tbody>
              {noteCats.map((c) => {
                const tot = months.reduce((x, mm) => x + cell(c.id, mm), 0);
                return (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    {months.map((mm) => {
                      const v = cell(c.id, mm);
                      return (
                        <td key={mm} className={v ? 'money' : 'muted'}>
                          {v ? won(v) : '·'}
                        </td>
                      );
                    })}
                    <td className="money">
                      <b>{won(tot)}</b>
                    </td>
                  </tr>
                );
              })}
              <tr className="cf-sum">
                <td>달 합계</td>
                {months.map((mm) => (
                  <td key={mm} className="money">
                    {monthTotal(mm) ? won(monthTotal(mm)) : ''}
                  </td>
                ))}
                <td className="money">{won(notes.reduce((x, n) => x + n.amount, 0))}</td>
              </tr>
            </tbody>
          </table>
          {note.trim() && (
            <div className="cf-fb">
              <div className="cf-fbt">{year}년 돈 관리 다짐</div>
              <div className="cf-note">{note.trim()}</div>
            </div>
          )}
          <div className="cf-foot">머니플랜 만 원 · 머니노트 원 · 단기로드맵·중장기로드맵은 따로 붙여요</div>
        </div>
      </div>
    </div>
  );
}
