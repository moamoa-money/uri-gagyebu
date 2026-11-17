// 중장기로드맵 (30년) — 연도가 가로로, 10년씩 세 줄 (첫 줄 중기, 나머지 장기). 단위 만 원.
// 해를 눌러 고르고(Shift로 범위) 수익률·저축액을 한 번에 바꾸기. 빈 해는 앞 해 값을 이어 씀(흐리게 보임)
import { useCallback, useEffect, useRef, useState } from 'react';
import { compareMilestones, eok, longCalc, man, parseAmount, type LongYear, type LongYearInput } from '../shared/rules';
import { CafeOptions, defaultRoadmapMonth, ImageButtons, MonthPicker, useCafePrefs } from './Roadmap';
import { Feedback } from './Review';
import { Zap } from 'lucide-react';
import { api } from './api';
import type { Boot, Toast } from './data';

export interface LongSnap {
  plan: { planYear: string; span: number; ageStart: number; startInvest: number };
  years: LongYearInput[];
  milestones: number[];
  rows: { id: string; name: string; sort: number }[];
  notes: { rowId: string; y: number; body: string; photo?: string | null }[];
}
export interface LongData {
  year: string;
  versions: { month: string; savedBy: string; savedAt: number }[];
  feedback: Record<string, string>;
  actuals: { y: number; auto: number; override: number | null }[];
  carry: { from: string; age: number; planned: number; actual: number | null; actualIsOverride: boolean } | null;
  assetAccounts: { id: string; name: string; kind: string; on: boolean }[];
  plan: { planYear: string; span: number; ageStart: number; startInvest: number } | null;
  years: LongYearInput[];
  milestones: number[];
  planYears: string[];
  rows: { id: string; name: string; sort: number }[];
  notes: { rowId: string; y: number; body: string; photo?: string | null }[];
}

const M = 10000;
const pctText = (bp: number) => `${bp < 0 ? '−' : ''}${Math.abs(bp) / 100}%`;
/** '15' '-20' '−20%' → 만분율 */
const parsePct = (t: string): number | null => {
  const s = t.replace(/[%\s]/g, '').replace('−', '-');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};
const parseMan = (t: string) => {
  const n = parseAmount(t);
  return n === null ? null : n * M;
};

export function LongRoadmap({ year, boot, onError, toast, go }: { year: string; boot: Boot; onError: (e: unknown) => void; toast: Toast; go: (h: string) => void }) {
  const [d, setD] = useState<LongData | null>(null);
  const load = useCallback(() => api<LongData>(`/roadmap/long?year=${year}`).then(setD).catch(onError), [year, onError]);
  useEffect(() => void load(), [load]);
  if (!d) return <p className="muted">불러오는 중…</p>;
  return (
    <div>
      <div className="head">
        <button className="btn sm" onClick={() => go(`#/roadmap?tab=long&year=${Number(year) - 1}`)}>
          ◀
        </button>
        <h1>{year} 로드맵</h1>
        <button className="btn sm" onClick={() => go(`#/roadmap?tab=long&year=${Number(year) + 1}`)}>
          ▶
        </button>
        <span className="muted small">단위 만 원</span>
      </div>
      <details className="help" style={{ marginTop: -8, marginBottom: 12 }}>
        <summary>로드맵이란?</summary>
        <ul>
          <li>앞으로 수십 년의 자산 계획과 해마다의 실제 비교</li>
          <li>해마다 새로 작성 (2026 로드맵 → 2027 로드맵)</li>
        </ul>
      </details>
      {d.plan ? <LongTable d={d} setD={setD} onError={onError} toast={toast} boot={boot} /> : d.carry ? <Carry d={d} setD={setD} onError={onError} toast={toast} /> : <Setup year={year} boot={boot} setD={setD} onError={onError} />}
    </div>
  );
}

// 처음 만들기: 첫해 나이 · 지금 투자자산 · 올해 저축액 · 수익률
function Setup({ year, boot, setD, onError }: { year: string; boot: Boot; setD: (d: LongData) => void; onError: (e: unknown) => void }) {
  const [age, setAge] = useState('');
  const [invest, setInvest] = useState('');
  const [saving, setSaving] = useState('');
  const [rate, setRate] = useState('10');
  async function make() {
    try {
      setD(
        await api<LongData>('/roadmap/long/setup', {
          year,
          ageStart: Number(age),
          startInvest: parseMan(invest) ?? 0,
          saving: parseMan(saving) ?? 0,
          rateBp: parsePct(rate) ?? 1000,
          span: 30,
        }),
      );
    } catch (e) {
      onError(e);
    }
  }
  const y = Number(year);
  return (
    <div className="card" style={{ maxWidth: 620 }}>
      <h3>{year} 로드맵 만들기</h3>
      <p className="muted small">
        {y}년부터 30년({y}~{y + 29}) 표를 만들어요. 아래는 첫해 값이고, 나중에 해마다 바꿀 수 있어요. 금액은 만 원 단위.

      </p>
      <div className="vform">
        <label>{y}년 나이</label>
        <input className="text" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, ''))} placeholder="예: 42" />
        <label>지금 투자자산</label>
        <input className="text" inputMode="numeric" value={invest} onChange={(e) => setInvest(e.target.value)} placeholder="만 원, 예: 12,000" />
        <label>올해 저축액</label>
        <input className="text" inputMode="numeric" value={saving} onChange={(e) => setSaving(e.target.value)} placeholder="만 원, 예: 4,000" />
        <label>수익률</label>
        <input className="text" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="%, 예: 10" />
        <label />
        <button className="btn main" disabled={!age} onClick={make}>
          만들기
        </button>
      </div>
    </div>
  );
}

function LongTable({ d, setD, onError, toast, boot }: { d: LongData; setD: (d: LongData) => void; onError: (e: unknown) => void; toast: Toast; boot: Boot }) {
  const plan = d.plan!;
  const startYear = Number(d.year);
  const rows = longCalc({ startYear, span: plan.span, ageStart: plan.ageStart, startInvest: plan.startInvest }, d.years, d.milestones);
  const [month, setMonth] = useState(() => defaultRoadmapMonth(d.year, boot.today));
  const [sel, setSel] = useState<number[]>([]);
  const [anchor, setAnchor] = useState<number | null>(null);
  const [rateIn, setRateIn] = useState('');
  const [saveIn, setSaveIn] = useState('');
  const pick = (y: number, shift: boolean) => {
    if (shift && anchor !== null) {
      const [a, b] = anchor < y ? [anchor, y] : [y, anchor];
      setSel(Array.from({ length: b - a + 1 }, (_, i) => a + i));
    } else {
      setSel(sel.length === 1 && sel[0] === y ? [] : [y]);
      setAnchor(y);
    }
  };
  async function apply(field: 'rate' | 'saving' | 'crisis', value: number | null, msg: string) {
    try {
      // 엑셀처럼 고른 해만 바뀌게: 바로 다음 해가 앞 값을 이어 쓰는 중이면 지금 값으로 못 박아 둠 (위기 −20%가 뒤로 번지지 않게)
      const after = rows.find((r) => r.y === Math.max(...sel) + 1);
      if (field !== 'crisis' && value !== null && after && !(field === 'rate' ? after.rateSet : after.savingSet))
        await api('/roadmap/long/years', { year: d.year, ys: [after.y], field, value: field === 'rate' ? after.rateBp : after.saving });
      setD(await api<LongData>('/roadmap/long/years', { year: d.year, ys: sel, field, value }));
      toast(msg);
    } catch (e) {
      onError(e);
    }
  }
  const selText = sel.length === 0 ? '' : sel.length === 1 ? `${sel[0]}년` : `${sel[0]}~${sel[sel.length - 1]}년 (${sel.length}해)`;
  const blocks: LongYear[][] = [];
  for (let i = 0; i < rows.length; i += 10) blocks.push(rows.slice(i, i + 10));
  const isSel = (y: number) => sel.includes(y);
  const noteOf = (rowId: string, y: number) => d.notes.find((n) => n.rowId === rowId && n.y === y)?.body ?? '';
  const photoOf = (rowId: string, y: number) => d.notes.find((n) => n.rowId === rowId && n.y === y)?.photo ?? null;
  async function savePhoto(rowId: string, y: number, photo: string | null) {
    try {
      await api('/roadmap/long/note', { rowId, y, body: noteOf(rowId, y), photo });
      const rest = d.notes.filter((n) => !(n.rowId === rowId && n.y === y));
      const body = noteOf(rowId, y);
      setD({ ...d, notes: [...rest, ...(body || photo ? [{ rowId, y, body, photo }] : [])] });
      toast(photo ? '사진을 넣었어요' : '사진을 뺐어요');
    } catch (e) {
      onError(e);
    }
  }
  const actualOf = (y: number) => d.actuals.find((a) => a.y === y);
  async function saveActual(y: number, amount: number | null) {
    try {
      setD(await api<LongData>('/roadmap/long/actual', { y, amount, year: d.year }));
      toast(amount === null ? `${y}년 실제를 자동 계산으로 되돌렸어요` : `${y}년 실제 ${man(amount)}만으로 적었어요`);
    } catch (e) {
      onError(e);
    }
  }
  async function saveNote(rowId: string, y: number, body: string) {
    try {
      await api('/roadmap/long/note', { rowId, y, body });
      const photo = d.notes.find((n) => n.rowId === rowId && n.y === y)?.photo ?? null;
      setD({ ...d, notes: [...d.notes.filter((n) => !(n.rowId === rowId && n.y === y)), ...(body.trim() || photo ? [{ rowId, y, body: body.trim(), photo }] : [])] });
    } catch (e) {
      onError(e);
    }
  }
  const cell = (r: LongYear, children: React.ReactNode, cls = '') => (
    <td key={r.y} data-c={r.crisis || undefined} className={`${cls} ${isSel(r.y) ? 'sel' : ''}`} onClick={(e) => pick(r.y, e.shiftKey)}>
      {children}
    </td>
  );
  return (
    <>
      <BaseBar d={d} setD={setD} onError={onError} toast={toast} boot={boot} />
      <div className="card row">
        <MonthPicker year={d.year} month={month} setMonth={setMonth} />
      </div>
      <VersionBar d={d} setD={setD} month={month} onError={onError} toast={toast} />
      <div className={`card lr-act ${sel.length ? 'on' : ''}`}>
        {sel.length === 0 ? (
          <span className="muted">표에서 해를 누르면 골라져요 · Shift 누르고 다른 해를 누르면 그 사이가 한꺼번에 골라져요 (엑셀처럼)</span>
        ) : (
          <>
            <b>{selText}</b>
            <span className="lr-grp">
              수익률
              <input className="text sm" style={{ width: 64, textAlign: 'right' }} value={rateIn} onChange={(e) => setRateIn(e.target.value)} placeholder="%" onKeyDown={(e) => e.key === 'Enter' && parsePct(rateIn) !== null && apply('rate', parsePct(rateIn), `${selText} 수익률 ${pctText(parsePct(rateIn)!)}`)} />
              <button className="btn sm main" disabled={parsePct(rateIn) === null} onClick={() => apply('rate', parsePct(rateIn), `${selText} 수익률 ${pctText(parsePct(rateIn)!)}`)}>
                적용
              </button>
              {(() => {
                const allCrisis = sel.every((y) => rows.find((r) => r.y === y)?.crisis);
                return (
                  <button className={`btn sm ${allCrisis ? '' : 'danger'}`} title="번개 표시만 해요 (수익률은 따로 — 위기에 기회를 잡아 +50%도 가능)" onClick={() => apply('crisis', allCrisis ? 0 : 1, allCrisis ? `${selText} 위기 표시 뺐어요` : `${selText} 위기 연도로 표시했어요`)}>
                    <Zap size={13} strokeWidth={2.4} style={{ verticalAlign: '-2px' }} /> {allCrisis ? '위기 표시 빼기' : '위기 연도 표시'}
                  </button>
                );
              })()}
            </span>
            <span className="lr-grp">
              저축액
              <input className="text sm" style={{ width: 90, textAlign: 'right' }} inputMode="numeric" value={saveIn} onChange={(e) => setSaveIn(e.target.value)} placeholder="만 원" onKeyDown={(e) => e.key === 'Enter' && parseMan(saveIn) !== null && apply('saving', parseMan(saveIn), `${selText} 저축액 ${saveIn}만`)} />
              <button className="btn sm main" disabled={parseMan(saveIn) === null} onClick={() => apply('saving', parseMan(saveIn), `${selText} 저축액 ${saveIn}만`)}>
                적용
              </button>
            </span>
            <span className="lr-grp">
              <button className="btn sm" title="고른 해에 직접 적은 값을 지우고 앞 해 값을 이어 쓰기" onClick={async () => { await apply('rate', null, '앞 해와 같게 되돌렸어요'); await apply('saving', null, '앞 해와 같게 되돌렸어요'); }}>
                앞 해와 같게
              </button>
              <button className="btn sm" onClick={() => setSel([])}>
                고르기 취소
              </button>
            </span>
          </>
        )}
      </div>
      {blocks.map((b, bi) => (
        <div className="card lr-block" key={bi}>
          <h3>
            {bi === 0 ? '중기로드맵' : '장기로드맵'} <span className="muted small">{b[0].y}~{b[b.length - 1].y}</span>
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="list lr">
              <tbody>
                <tr className="lr-year">
                  <th>연도</th>
                  {b.map((r) =>
                    cell(
                      r,
                      r.crisis ? (
                        <span className="lr-crisis" title="위기 연도">
                          <Zap size={15} strokeWidth={2.4} />
                          {r.y}
                        </span>
                      ) : (
                        r.y
                      ),
                      r.crisis ? 'crisis' : '',
                    ),
                  )}
                </tr>
                <tr className="lr-ms">
                  <th>금액</th>
                  {b.map((r) => cell(r, r.milestones.map(eok).join(' · ')))}
                </tr>
                <tr>
                  <th>나이</th>
                  {b.map((r) => cell(r, r.age, 'muted'))}
                </tr>
                <tr>
                  <th>투자자산</th>
                  {b.map((r) => cell(r, man(r.invest)))}
                </tr>
                <tr>
                  <th>저축액</th>
                  {b.map((r) => cell(r, man(r.saving), r.savingSet ? 'set' : 'inh'))}
                </tr>
                <tr className="lr-total">
                  <th>합계</th>
                  {b.map((r) => cell(r, man(r.total)))}
                </tr>
                {b.some((r) => actualOf(r.y)) && (
                  <>
                    <tr className="lr-actual">
                      <th title="연말 실제 자산 — 통장 잔액 자동, 누르면 직접 적기">실제</th>
                      {b.map((r) => {
                        const a = actualOf(r.y);
                        return a ? <ActualCell key={r.y} crisis={r.crisis} a={a} onSave={(n) => saveActual(r.y, n)} /> : <td key={r.y} data-c={r.crisis || undefined} />;
                      })}
                    </tr>
                    <tr className="lr-diff">
                      <th>차이</th>
                      {b.map((r) => {
                        const a = actualOf(r.y);
                        const v = a ? (a.override ?? a.auto) - r.total : null;
                        return (
                          <td key={r.y} data-c={r.crisis || undefined} className={v === null ? '' : v < 0 ? 'bad' : 'good'}>
                            {v === null ? '' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${man(Math.abs(v))}`}
                          </td>
                        );
                      })}
                    </tr>
                  </>
                )}
                <tr className="lr-rate">
                  <th>수익률</th>
                  {b.map((r) =>
                    cell(
                      r,
                      pctText(r.rateBp),
                      `${r.rateSet ? 'set' : 'inh'} ${r.rateBp < 0 ? 'bad' : ''}`,
                    ),
                  )}
                </tr>
                {d.rows.map((row, ri) => (
                  <tr key={row.id} className={`lr-note ${ri === 0 ? 'first' : ''}`}>
                    <th>{row.name}</th>
                    {b.map((r) => (
                      <NoteCell key={r.y} crisis={r.crisis} value={noteOf(row.id, r.y)} photo={photoOf(row.id, r.y)} onSave={(v) => saveNote(row.id, r.y, v)} onPhoto={(p) => savePhoto(row.id, r.y, p)} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      <RowManager d={d} setD={setD} onError={onError} />
      <AssetPicker d={d} setD={setD} onError={onError} />
      <Feedback required={false} month={month} section="long" label={`${Number(month.slice(5))}월 중장기로드맵`} value={d.feedback[month] ?? ''} onSaved={(v) => setD({ ...d, feedback: { ...d.feedback, [month]: v } })} onError={onError} />
      <LongImageFor d={d} month={month} household={boot.household} toast={toast} onError={onError} />
      <p className="muted small">
        진하게 = 그해에 직접 적은 값, 흐리게 = 앞 해 값을 이어 쓰는 중. 고른 해만 바뀌고 뒤 해들은 그대로예요. 합계 = 투자자산 + 저축액, 다음 해 투자자산 = 합계 × (1 + 수익률).
      </p>
    </>
  );
}

// 기본값(첫해 나이·투자자산)과 이정표
function BaseBar({ d, setD, onError, toast }: { d: LongData; setD: (d: LongData) => void; onError: (e: unknown) => void; toast: Toast; boot: Boot }) {
  const plan = d.plan!;
  const [edit, setEdit] = useState(false);
  const [age, setAge] = useState(String(plan.ageStart));
  const [invest, setInvest] = useState(man(plan.startInvest));
  const [ms, setMs] = useState(d.milestones.map((n) => +(n / 1e8).toFixed(1)).join(', '));
  async function save() {
    try {
      await api('/roadmap/long/setup', { year: d.year, ageStart: Number(age), startInvest: parseMan(invest) ?? 0, span: plan.span });
      const amounts = ms
        .split(/[,\s]+/)
        .map((t) => Number(t.replace(/억/g, '')))
        .filter((n) => Number.isFinite(n) && n > 0)
        .map((n) => Math.round(n * 1e8));
      setD(await api<LongData>('/roadmap/long/milestones', { year: d.year, amounts }));
      setEdit(false);
      toast('기본값을 고쳤어요');
    } catch (e) {
      onError(e);
    }
  }
  return (
    <div className="card row">
      {edit ? (
        <>
          <span>{d.year}년 나이</span>
          <input className="text sm" style={{ width: 60 }} value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, ''))} />
          <span>첫해 투자자산</span>
          <input className="text sm" style={{ width: 100, textAlign: 'right' }} value={invest} onChange={(e) => setInvest(e.target.value)} />
          <span className="muted small">만 원</span>
          <span>목표 금액</span>
          <input className="text sm" style={{ width: 160 }} value={ms} onChange={(e) => setMs(e.target.value)} placeholder="억 단위, 예: 2, 3, 6, 10, 20" />
          <span className="muted small">억</span>
          <button className="btn sm main" onClick={save}>
            저장
          </button>
          <button className="btn sm" onClick={() => setEdit(false)}>
            취소
          </button>
        </>
      ) : (
        <>
          <b>기본값</b>
          <span>
            {d.year}년 나이 {plan.ageStart} · 첫해 투자자산 {man(plan.startInvest)}
          </span>
          <span className="muted">· 목표 금액 {d.milestones.length ? d.milestones.map(eok).join(', ') : '없음'}</span>
          <button className="btn sm" onClick={() => setEdit(true)}>
            고치기
          </button>
        </>
      )}
    </div>
  );
}


// 글 칸: 누르면 그 자리에서 쓰기, 칸 밖을 누르면 저장 (Enter = 줄바꿈). 사진 넣기·빼기도 여기서
async function shrinkPhoto(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => bad(new Error('사진을 열지 못했어요 (JPG·PNG로 해 주세요)'));
      i.src = url;
    });
    const max = 360;
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k);
    c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.8);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function NoteCell({ value, photo, onSave, onPhoto, crisis }: { value: string; photo: string | null; onSave: (v: string) => void; onPhoto: (p: string | null) => void; crisis?: boolean }) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const keep = (e: React.MouseEvent) => e.preventDefault(); // 버튼 눌러도 글칸이 닫히지 않게
  if (!edit)
    return (
      <td className="lr-txt" data-c={crisis || undefined} onClick={() => setEdit(true)} title="눌러서 쓰기 · 사진 넣기">
        {photo && <img className="lr-photo" src={photo} alt="" />}
        {value}
      </td>
    );
  return (
    <td className="lr-txt editing">
      {photo && <img className="lr-photo" src={photo} alt="" />}
      <textarea
        autoFocus
        rows={3}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          setEdit(false);
          if (v.trim() !== value) onSave(v);
        }}
        onKeyDown={(e) => e.key === 'Escape' && (setV(value), setEdit(false))}
      />
      <div className="lr-photo-btns">
        <label className="btn sm" onMouseDown={keep}>
          {photo ? '사진 바꾸기' : '사진 넣기'}
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                onPhoto(await shrinkPhoto(f));
              } catch (err) {
                alert(err instanceof Error ? err.message : String(err));
              }
              setEdit(false);
            }}
          />
        </label>
        {photo && (
          <button className="btn sm" onMouseDown={keep} onClick={() => (onPhoto(null), setEdit(false))}>
            사진 빼기
          </button>
        )}
      </div>
    </td>
  );
}

// 글 줄 관리: 이름 바꾸기 · 순서 · 지우기 · 더하기
function RowManager({ d, setD, onError }: { d: LongData; setD: (d: LongData) => void; onError: (e: unknown) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const call = async (body: Record<string, unknown>) => {
    try {
      setD(await api<LongData>('/roadmap/long/row', { year: d.year, ...body }));
    } catch (e) {
      onError(e);
    }
  };
  return (
    <div className="card">
      <h3 className="row click" onClick={() => setOpen(!open)}>
        {open ? '▾' : '▸'} 글 줄 고치기 <span className="muted small">— 지금: {d.rows.map((r) => r.name).join(' · ') || '없음'} (이름·순서 바꾸기, 더하기, 지우기)</span>
      </h3>
      {open && (
        <div>
          {d.rows.map((r, i) => {
            const used = d.notes.filter((n) => n.rowId === r.id).length;
            return (
              <div key={r.id} className="row" style={{ padding: '3px 0' }}>
                <input className="text sm" style={{ width: 160 }} defaultValue={r.name} key={r.name} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== r.name && call({ id: r.id, name: e.target.value })} />
                <button className="btn sm" disabled={i === 0} onClick={() => call({ id: r.id, dir: -1 })}>
                  ↑
                </button>
                <button className="btn sm" disabled={i === d.rows.length - 1} onClick={() => call({ id: r.id, dir: 1 })}>
                  ↓
                </button>
                <button className="btn sm danger" onClick={() => (!used || confirm(`'${r.name}' 줄에 적은 ${used}칸도 함께 지워져요. 지울까요?`)) && call({ id: r.id, remove: true })}>
                  지우기
                </button>
                <span className="muted small">{used ? `${used}칸 적음` : '빈 줄'}</span>
              </div>
            );
          })}
          <div className="row" style={{ marginTop: 6 }}>
            <input className="text sm" style={{ width: 160 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 건강, 여행" onKeyDown={(e) => e.key === 'Enter' && name.trim() && (call({ name }), setName(''))} />
            <button className="btn sm main" disabled={!name.trim()} onClick={() => (call({ name }), setName(''))}>
              줄 더하기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- 매달 버전 ----------

export const calcSnap = (s: LongSnap) => longCalc({ startYear: Number(s.plan.planYear), span: s.plan.span, ageStart: s.plan.ageStart, startInvest: s.plan.startInvest }, s.years, s.milestones);
const monthName = (m: string) => `${Number(m.slice(5))}월`;
/** month보다 앞에 저장한 마지막 버전 */
export const prevVersionOf = (d: LongData, month: string) => [...d.versions].reverse().find((v) => v.month < month)?.month ?? null;

/** 이정표 비교 한 줄: '10억 2034 → 2035 (1년 늦어짐)' 처럼 바뀐 것만 */
export function ShiftLine({ now, prev, prevMonth, hideMoney = false }: { now: LongSnap; prev: LongSnap | null; prevMonth: string | null; hideMoney?: boolean }) {
  if (!prev || !prevMonth) return <span className="muted">비교할 지난 버전이 아직 없어요 — 이번 달 버전을 저장해 두면 다음 달부터 비교돼요.</span>;
  const ms = [...new Set([...now.milestones, ...prev.milestones])].sort((a, b) => a - b);
  const shifts = compareMilestones(calcSnap(now), calcSnap(prev), ms).filter((x) => x.before !== x.after);
  const lastNow = calcSnap(now).at(-1);
  const lastPrev = calcSnap(prev).at(-1);
  const endDiff = lastNow && lastPrev && lastNow.y === lastPrev.y ? lastNow.total - lastPrev.total : null;
  return (
    <span>
      <b>{monthName(prevMonth)} 버전과 비교</b>{' '}
      {shifts.length === 0 ? (
        <>· 목표 달성 연도 그대로</>
      ) : (
        shifts.map((x) => (
          <span key={x.amount}>
            {' '}
            · {eok(x.amount)} {x.before ?? '—'} → {x.after ?? '—'}
            {x.diff !== null && x.diff !== 0 && <em className={x.diff > 0 ? 'bad' : 'good'}> ({Math.abs(x.diff)}년 {x.diff > 0 ? '늦어짐' : '당겨짐'})</em>}
          </span>
        ))
      )}
      {!hideMoney && endDiff !== null && endDiff !== 0 && (
        <>
          {' '}
          · {lastNow!.y}년 합계 <em className={endDiff < 0 ? 'bad' : 'good'}>{endDiff > 0 ? '+' : '−'}{man(Math.abs(endDiff))}</em>
        </>
      )}
    </span>
  );
}

export const snapOf = (d: LongData): LongSnap => ({ plan: d.plan!, years: d.years, milestones: d.milestones, rows: d.rows, notes: d.notes });

function VersionBar({ d, setD, month, onError, toast }: { d: LongData; setD: (d: LongData) => void; month: string; onError: (e: unknown) => void; toast: Toast }) {
  const prevMonth = prevVersionOf(d, month);
  const [prev, setPrev] = useState<LongSnap | null>(null);
  useEffect(() => {
    if (prevMonth) api<LongSnap>(`/roadmap/long/version?year=${d.year}&month=${prevMonth}`).then(setPrev).catch(onError);
    else setPrev(null);
  }, [d.year, prevMonth, onError]);
  const has = d.versions.some((v) => v.month === month);
  async function save() {
    if (has && !confirm(`${monthName(month)} 버전이 이미 있어요. 지금 로드맵으로 덮어쓸까요?`)) return;
    try {
      setD(await api<LongData>('/roadmap/long/version', { year: d.year, month }));
      toast(`${monthName(month)} 버전을 저장했어요`);
    } catch (e) {
      onError(e);
    }
  }
  return (
    <div className="card row">
      <b>버전</b>
      {d.versions.length ? d.versions.map((v) => <span key={v.month} className={`chip sm ${v.month === month ? 'on' : ''}`}>{monthName(v.month)}</span>) : <span className="muted small">아직 없음</span>}
      <button className="btn sm main" onClick={save}>
        {monthName(month)} 버전 {has ? '다시 ' : ''}저장
      </button>
      <span className="spacer" />
      <span className="small">
        <ShiftLine now={snapOf(d)} prev={prev} prevMonth={prevMonth} />
      </span>
    </div>
  );
}

// ---------- 카페 이미지 3: 중장기로드맵 (결산·단기와 같은 폭, 5년씩) ----------
export function LongImage({ snap, prev, prevMonth, month, feedback, household, toast, onError, actuals }: { snap: LongSnap; prev: LongSnap | null; prevMonth: string | null; month: string; feedback: string; household: string; toast: Toast; onError: (e: unknown) => void; actuals?: LongData['actuals'] }) {
  const ref = useRef<HTMLDivElement>(null);
  const p = useCafePrefs();
  const rows = calcSnap(snap);
  const midEnd = rows[0].y + 9;
  const size = p.layout === 'wide' ? 10 : 5;
  const blocks: LongYear[][] = [];
  for (let i = 0; i < rows.length; i += size) blocks.push(rows.slice(i, i + size));
  const noteOf = (rowId: string, y: number) => snap.notes.find((n) => n.rowId === rowId && n.y === y)?.body ?? '';
  const picOf = (rowId: string, y: number) => snap.notes.find((n) => n.rowId === rowId && n.y === y)?.photo ?? null;
  return (
    <div>
      <div className="card">
        <div className="row">
          <h3 style={{ margin: 0 }}>카페 이미지 — 중장기로드맵</h3>
          <span className="muted small">{p.layout === 'wide' ? '10년씩 한 줄' : '5년씩 (휴대폰용)'}</span>
          <span className="spacer" />
          <ImageButtons target={ref} fileName={`${month} 중장기로드맵.png`} toast={toast} onError={onError} />
        </div>
        <CafeOptions p={p} feedback={feedback} toast={toast} />
      </div>
      <div className="cf-wrap">
        <div className={`cf lri ${p.layout} ${p.hideMoney ? `hidemoney m-${p.maskStyle}` : ''}`} ref={ref}>
          <div className="cf-title">
            <b>
              {snap.plan.planYear} 로드맵 · {monthName(month)} 버전
            </b>
            <span>단위 만 원</span>
          </div>
          {blocks.map((b, bi) => {
            const mid = b[0].y <= midEnd;
            const textRows = snap.rows.filter((r) => mid || b.some((x) => noteOf(r.id, x.y) || picOf(r.id, x.y)));
            return (
              <div key={bi}>
                {(bi === 0 || b[0].y === midEnd + 1) && (
                  <div className="lri-head">
                    {mid ? '중기로드맵' : '장기로드맵'} <span>{mid ? `${rows[0].y}~${midEnd}` : `${midEnd + 1}~${rows[rows.length - 1].y}`}</span>
                  </div>
                )}
                <table className="cf-table lri">
                  <thead>
                    <tr>
                      <th />
                      {b.map((r) => (
                        <th key={r.y} className={r.crisis ? 'crisis' : ''} data-c={r.crisis || undefined}>
                          {r.crisis && <Zap size={13} strokeWidth={2.6} style={{ verticalAlign: '-2px' }} />}
                          {r.y}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.some((r) => r.milestones.length) && (
                      <tr className="lri-ms">
                        <td>금액</td>
                        {b.map((r) => (
                          <td key={r.y} data-c={r.crisis || undefined}>{r.milestones.map(eok).join(' ')}</td>
                        ))}
                      </tr>
                    )}
                    <tr className="lri-age">
                      <td>나이</td>
                      {b.map((r) => (
                        <td key={r.y} data-c={r.crisis || undefined}>{r.age}</td>
                      ))}
                    </tr>
                    <tr>
                      <td>투자자산</td>
                      {b.map((r) => (
                        <td key={r.y} data-c={r.crisis || undefined} className="money">
                          {man(r.invest)}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td>저축액</td>
                      {b.map((r) => (
                        <td key={r.y} data-c={r.crisis || undefined} className="money">
                          {man(r.saving)}
                        </td>
                      ))}
                    </tr>
                    <tr className="cf-sum">
                      <td>합계</td>
                      {b.map((r) => (
                        <td key={r.y} data-c={r.crisis || undefined} className="money">
                          {man(r.total)}
                        </td>
                      ))}
                    </tr>
                    {actuals && b.some((r) => actuals.find((a) => a.y === r.y)) && (
                      <>
                        <tr className="lri-actual">
                          <td>실제</td>
                          {b.map((r) => {
                            const a = actuals.find((x) => x.y === r.y);
                            return (
                              <td key={r.y} data-c={r.crisis || undefined} className={a ? 'money' : ''}>
                                {a ? man(a.override ?? a.auto) : ''}
                              </td>
                            );
                          })}
                        </tr>
                        <tr className="lri-diff">
                          <td>차이</td>
                          {b.map((r) => {
                            const a = actuals.find((x) => x.y === r.y);
                            const v = a ? (a.override ?? a.auto) - r.total : null;
                            return (
                              <td key={r.y} data-c={r.crisis || undefined} className={v === null ? '' : `money ${v < 0 ? 'bad' : 'good'}`}>
                                {v === null ? '' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${man(Math.abs(v))}`}
                              </td>
                            );
                          })}
                        </tr>
                      </>
                    )}
                    <tr className="lri-rate">
                      <td>수익률</td>
                      {b.map((r) => (
                        <td key={r.y} data-c={r.crisis || undefined} className={r.rateBp < 0 ? 'bad' : ''}>
                          {pctText(r.rateBp)}
                        </td>
                      ))}
                    </tr>
                    {textRows.map((tr, i) => (
                      <tr key={tr.id} className={`lri-txt ${i === 0 ? 'first' : ''}`}>
                        <td>{tr.name}</td>
                        {b.map((r) => (
                          <td key={r.y} data-c={r.crisis || undefined}>
                            {picOf(tr.id, r.y) && <img className="lri-photo" src={picOf(tr.id, r.y)!} alt="" />}
                            {noteOf(tr.id, r.y)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
          <div className="rm-line">
            <ShiftLine now={snap} prev={prev} prevMonth={prevMonth} hideMoney={p.hideMoney} />
          </div>
          {feedback.trim() && p.withFb && (
            <div className="cf-fb">
              <div className="cf-fbt">피드백</div>
              <div className="cf-note">{feedback.trim()}</div>
            </div>
          )}
          <div className="cf-foot">{household}</div>
        </div>
      </div>
    </div>
  );
}

/** 그달 이미지: 그달 저장한 버전이 있으면 그 버전, 없으면 지금 로드맵. 비교 = 그 앞 버전 */
export function LongImageFor({ d, month, household, toast, onError }: { d: LongData; month: string; household: string; toast: Toast; onError: (e: unknown) => void }) {
  const has = d.versions.some((v) => v.month === month);
  const prevMonth = prevVersionOf(d, month);
  const [snap, setSnap] = useState<LongSnap | null>(has ? null : snapOf(d));
  const [prev, setPrev] = useState<LongSnap | null>(null);
  useEffect(() => {
    if (has) api<LongSnap>(`/roadmap/long/version?year=${d.year}&month=${month}`).then(setSnap).catch(onError);
    else setSnap(snapOf(d));
    if (prevMonth) api<LongSnap>(`/roadmap/long/version?year=${d.year}&month=${prevMonth}`).then(setPrev).catch(onError);
    else setPrev(null);
  }, [d, month, has, prevMonth, onError]);
  if (!snap) return null;
  return (
    <>
      {!has && <p className="warn small">아직 {monthName(month)} 버전을 저장하지 않아서 지금 로드맵으로 보여 드려요. 다 고친 뒤 '{monthName(month)} 버전 저장'을 눌러 두세요.</p>}
      <LongImage snap={snap} prev={prev} prevMonth={prevMonth} month={month} feedback={d.feedback[month] ?? ''} household={household} toast={toast} onError={onError} actuals={d.actuals} />
    </>
  );
}

// 실제 칸: 자동(흐리게, '자동') 또는 직접 적은 값(진하게). 누르면 만 원으로 적기, 비우면 자동으로 돌아감
function ActualCell({ a, onSave, crisis }: { a: { y: number; auto: number; override: number | null }; onSave: (n: number | null) => void; crisis?: boolean }) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState('');
  const value = a.override ?? a.auto;
  if (!edit)
    return (
      <td className={`lr-act-cell ${a.override === null ? 'auto' : 'set'}`} data-c={crisis || undefined} title={a.override === null ? `통장 잔액으로 자동 계산 (${a.y}년 말${a.y === new Date().getFullYear() ? ' — 올해는 오늘까지' : ''}) · 눌러서 직접 적기` : `직접 적은 값 (자동 계산 ${man(a.auto)}) · 비우면 자동으로`} onClick={() => (setV(a.override === null ? '' : man(a.override)), setEdit(true))}>
        {man(value)}
        {a.override === null && <small> 자동</small>}
      </td>
    );
  const done = () => {
    setEdit(false);
    const n = parseAmount(v);
    const next = v.trim() === '' || n === null ? null : n * M;
    if (next !== a.override) onSave(next);
  };
  return (
    <td className="lr-act-cell editing">
      <input autoFocus className="text sm" inputMode="numeric" value={v} placeholder={`자동 ${man(a.auto)}`} onChange={(e) => setV(e.target.value)} onBlur={done} onKeyDown={(e) => (e.key === 'Enter' ? done() : e.key === 'Escape' && setEdit(false))} />
    </td>
  );
}

// 실제 자산에 넣을 통장 고르기
function AssetPicker({ d, setD, onError }: { d: LongData; setD: (d: LongData) => void; onError: (e: unknown) => void }) {
  const [open, setOpen] = useState(false);
  const on = d.assetAccounts.filter((a) => a.on);
  async function toggle(id: string, v: boolean) {
    try {
      setD(await api<LongData>('/roadmap/long/asset-account', { id, on: v, year: d.year }));
    } catch (e) {
      onError(e);
    }
  }
  return (
    <div className="card">
      <h3 className="row click" onClick={() => setOpen(!open)}>
        {open ? '▾' : '▸'} 실제 자산에 넣을 통장 <span className="muted small">— 지금: {on.map((a) => a.name).join(' · ') || '없음'}</span>
      </h3>
      {open && (
        <div className="row">
          {d.assetAccounts.map((a) => (
            <button key={a.id} className={`chip ${a.on ? 'on' : ''}`} onClick={() => toggle(a.id, !a.on)}>
              {a.on ? '✓ ' : ''}
              {a.name} <span className="muted small">{a.kind}</span>
            </button>
          ))}
          <span className="muted small">주식은 넣은 돈 기준이라, 연말엔 증권 앱의 평가금액으로 '실제' 칸을 직접 적으면 정확해요.</span>
        </div>
      )}
    </div>
  );
}

// 새해 로드맵: 작년 로드맵을 이어받아 만들기 (나이 +1, 첫해 투자자산 = 작년 실제 연말 자산 또는 계획대로)
function Carry({ d, setD, onError, toast }: { d: LongData; setD: (d: LongData) => void; onError: (e: unknown) => void; toast: Toast }) {
  const c = d.carry!;
  const [start, setStart] = useState<'actual' | 'plan'>(c.actual !== null ? 'actual' : 'plan');
  async function make() {
    try {
      setD(await api<LongData>('/roadmap/long/carry', { year: d.year, start }));
      toast(`${c.from} 로드맵을 이어받아 ${d.year} 로드맵을 만들었어요`);
    } catch (e) {
      onError(e);
    }
  }
  const diff = c.actual !== null ? c.actual - c.planned : null;
  return (
    <div className="card" style={{ maxWidth: 680 }}>
      <h3>{d.year} 로드맵 만들기 — {c.from} 로드맵 이어받기</h3>
      <p className="muted small">
        {c.from} 로드맵의 {d.year}년 이후 저축액·수익률·위기 표시·목표 금액·글 줄(일·가족·버킷리스트…)을 그대로 가져와요. 나이는 {c.age}세부터. {c.from} 로드맵은 그대로 남아 있어서 비교할 수 있어요.
      </p>
      <b>첫해 투자자산을 어디서 시작할까요?</b>
      <div className="carry-opts">
        <label className={`carry-opt ${start === 'actual' ? 'on' : ''} ${c.actual === null ? 'dim' : ''}`}>
          <input type="radio" disabled={c.actual === null} checked={start === 'actual'} onChange={() => setStart('actual')} />
          <span>
            <b>{c.from}년 실제 연말 자산</b> {c.actual !== null ? <b className="big">{man(c.actual)}</b> : '—'}
            <small className="muted">
              {c.actual === null ? ' 실제 줄이 없어요' : c.actualIsOverride ? ' (직접 적은 값)' : ' (통장 잔액·평가금액으로 계산 — 연말 전이면 오늘까지)'}
              {diff !== null && <> · 계획보다 <em className={diff < 0 ? 'bad' : 'good'}>{diff >= 0 ? '+' : '−'}{man(Math.abs(diff))}</em></>}
            </small>
          </span>
        </label>
        <label className={`carry-opt ${start === 'plan' ? 'on' : ''}`}>
          <input type="radio" checked={start === 'plan'} onChange={() => setStart('plan')} />
          <span>
            <b>{c.from} 로드맵 계획대로</b> <b className="big">{man(c.planned)}</b>
            <small className="muted"> ({c.from} 로드맵의 {d.year}년 투자자산)</small>
          </span>
        </label>
      </div>
      <p className="muted small">추천: 실제 연말 자산에서 시작해야 '계획보다 앞섰는지·늦었는지'가 새 로드맵에 바로 반영돼요. 만든 뒤에도 기본값에서 고칠 수 있어요.</p>
      <button className="btn main" onClick={make}>
        이어받아 만들기
      </button>
    </div>
  );
}
