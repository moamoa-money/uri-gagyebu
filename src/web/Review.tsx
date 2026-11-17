// 월말 결산: 맨 위 지난달 다짐 줄 + 단계 탭 ① 변동 → ③ 고정 → ④ 수입 → ⑤ 저축·투자 → ⑥ 자산 → ⑦ 다음 달 다짐 → (로드맵) → 카페 이미지
// 구역마다 기준표(예산·실제·잔액·달성률·지난달·다음 달 예산) + 넘친 항목 원인 하나 + 피드백(필수)
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { addMonths, monthLabel, monthOf, shortDate } from '../shared/dates';
import { leftLabel, parseAmount, rateText, verdictText, won, type BudgetLine, type MonthTotals } from '../shared/rules';
import { type Group, type Recurring, type Tx } from '../shared/types';
import { api } from './api';
import type { Boot, Toast } from './data';
import { GROUP_ICON, Icon } from './Icon';
import { LineChart } from './LineChart';
import { NoSpendMini, NoSpendStat } from './NoSpend';
import { NewBadge } from './NewBadge';
import { useStickers } from './Look';
import { toBlob, toPng } from 'html-to-image';
import { CafeOptions, ShortImage, uptoOf, useCafePrefs, type ShortData } from './Roadmap';
import { LongImageFor, type LongData } from './LongRoadmap';

type Line = BudgetLine & { prevActual: number };
type Judged = { id: string; month: string; section: string; kind: 'num' | 'text'; categoryId: string | null; limitAmount: number | null; body: string; result: string | null; actual: number | null; auto: string | null };
interface ReviewData {
  month: string;
  prev: string;
  next: string;
  done: boolean;
  totals: MonthTotals;
  prevTotals: MonthTotals;
  lines: Line[];
  txs: Tx[];
  notes: Record<string, string>;
  causes: Record<string, { cause: string | null; note: string }>;
  recurring: Recurring[];
  pledges: Judged[];
  nextPledges: Judged[];
  nextBudgets: Record<string, number>;
  raised: Record<string, { old: number | null; amount: number }>;
  nextNotes: { id: string; categoryId: string; month: string; title: string; amount: number; memo: string }[];
  thisNotes?: { id: string; categoryId: string; month: string; title: string; amount: number; memo: string }[];
  fixedThis: Record<string, { old: number | null; amount: number }>;
  nextBudgetNotes: Record<string, string>;
}

const STEPS = [
  { key: 'var', label: '변동지출', note: 'var' },
  { key: 'fix', label: '고정지출', note: 'fix' },
  { key: 'inc', label: '수입', note: 'inc' },
  { key: 'sav', label: '저축·투자', note: 'sav' },
  { key: 'asset', label: '자산 추이' },
  { key: 'short', label: '단기로드맵' },
  { key: 'long', label: '중장기로드맵' },
  { key: 'cafe', label: '카페 이미지' },
] as const;
type StepKey = (typeof STEPS)[number]['key'];

const CAUSE_LIST = [
  { key: 'small_budget', name: '예산이 작았음' },
  { key: 'yearly', name: '해마다 오는 지출' },
  { key: 'new_fixed', name: '새 고정비' },
  { key: 'once', name: '이번만' },
  { key: 'reducible', name: '줄일 수 있었음' },
] as const;
const CAUSE_HINT: Record<string, string> = {
  small_budget: '이번 달만 예산을 잘못 잡았으면 이번 달 예산만 바로잡고, 앞으로도 모자랄 것 같으면 다음 달 예산 칸을 올려요. 둘 다 되돌릴 수 있어요.',
  yearly: '명절·생일처럼 해마다 오는 돈 — 머니노트에 적어 두면 그달 예산에 미리 잡혀요.',
  new_fixed: '앞으로 매달 나갈 돈이면 고정지출로 등록해 두세요.',
  once: '한 번뿐인 지출 — 한 줄 메모만 남겨 두면 돼요.',
  reducible: '다음 달 다짐에 이 카테고리 예산 이하로 쓰기가 자동으로 들어갔어요.',
};

const pct = (r: number | null) => (r === null ? '—' : `${Math.round(r * 100)}%`);
const defaultMonth = (today: string) => (Number(today.slice(8)) <= 10 ? addMonths(monthOf(today), -1) : monthOf(today));

export function Review({ boot, onError, toast, go, initialMonth }: { boot: Boot; onError: (e: unknown) => void; toast: Toast; go: (h: string) => void; initialMonth?: string }) {
  const [month, setMonth] = useState(initialMonth ?? defaultMonth(boot.today));
  const [step, setStep] = useState<StepKey>('var');
  const [d, setD] = useState<ReviewData | null>(null);
  const load = useCallback(() => api<ReviewData>(`/review?month=${month}`).then(setD).catch(onError), [month, onError]);
  useEffect(() => void load(), [load]);
  if (!d) return <p className="muted">불러오는 중…</p>;

  const idx = STEPS.findIndex((s) => s.key === step);
  const nextStep = () => setStep(STEPS[Math.min(idx + 1, STEPS.length - 1)].key);
  const autoLines = (k: string) => itemLines(d, k);
  const filled = (k: string) => (d.notes[k] ?? '').trim().length > 0 || autoLines(k).length > 0;

  return (
    <div>
      <div className="head">
        <button className="btn sm" onClick={() => setMonth(addMonths(month, -1))}>
          ◀
        </button>
        <h1>{monthLabel(month)} 결산</h1>
        <button className="btn sm" onClick={() => setMonth(addMonths(month, 1))}>
          ▶
        </button>
        {!d.done && <span className="tag">아직 진행 중인 달이에요</span>}
      </div>
      <NextMoneyNote d={d} boot={boot} go={go} onError={onError} reload={load} />
      <div className="steps">
        {STEPS.map((s, i) => (
          <button key={s.key} className={step === s.key ? 'on' : ''} onClick={() => setStep(s.key)}>
            <span className="no">{i + 1}</span> {s.label}
            {'note' in s && (filled(s.note) ? <span className="ok">✓</span> : 'optional' in s ? null : <span className="need" title="피드백이 비어 있어요">•</span>)}
          </button>
        ))}
      </div>

      {(step === 'var' || step === 'fix' || step === 'inc' || step === 'sav') && <PledgeBar key={`pledge-${step}`} grp={step} d={d} boot={boot} onError={onError} reload={load} />}
      {(step === 'var' || step === 'fix' || step === 'inc' || step === 'sav') && <NextPlanBar d={d} boot={boot} step={step} />}
      {(step === 'var' || step === 'fix') && <SpendSection grp={step} d={d} boot={boot} onError={onError} reload={load} go={go} setD={setD} toast={toast} />}
      {(step === 'inc' || step === 'sav') && <GoalSection grp={step} d={d} boot={boot} onError={onError} reload={load} toast={toast} />}
      {step === 'asset' && <AssetTrend month={month} boot={boot} onError={onError} />}
      {step === 'short' && <ShortStep month={month} boot={boot} toast={toast} onError={onError} go={go} />}
      {step === 'long' && <LongStep month={month} boot={boot} toast={toast} onError={onError} go={go} />}
      {step === 'cafe' && <AllCafeImages d={d} boot={boot} filled={filled} toast={toast} onError={onError} month={month} />}

      {step === 'asset' && <Feedback month={month} section="asset" label="자산" required={false} value={d.notes.asset ?? ''} onSaved={(v) => setD({ ...d, notes: { ...d.notes, asset: v } })} onError={onError} />}
      {'note' in STEPS[idx] && <Feedback key={`fb-${step}`} required={!('optional' in STEPS[idx])} auto={autoLines((STEPS[idx] as { note: string }).note)} month={month} section={(STEPS[idx] as { note: string }).note} label={STEPS[idx].label} value={d.notes[(STEPS[idx] as { note: string }).note] ?? ''} onSaved={(v) => setD({ ...d, notes: { ...d.notes, [(STEPS[idx] as { note: string }).note]: v } })} onError={onError} >
          {(step === 'var' || step === 'fix') && <NextBudgetNotes grp={step} d={d} onError={onError} setD={setD} />}
          {(step === 'var' || step === 'fix' || step === 'inc' || step === 'sav') && <SectionPledges grp={step} d={d} boot={boot} onError={onError} reload={load} />}
        </Feedback>}
      {idx < STEPS.length - 1 && (
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn main" onClick={nextStep}>
            다음: {STEPS[idx + 1].label} →
          </button>
        </div>
      )}
    </div>
  );
}

// ---------- 피드백 칸 (필수) ----------
export function Feedback({ month, section, label, value, onSaved, onError, required = true, auto = [], children }: { month: string; section: string; label: string; value: string; onSaved: (v: string) => void; onError: (e: unknown) => void; required?: boolean; auto?: ItemLine[]; children?: React.ReactNode }) {
  const [v, setV] = useState(value);
  const [state, setState] = useState<'' | 'saving' | 'saved'>('');
  useEffect(() => setV(value), [value, month, section]);
  async function save() {
    if (v === value) return;
    setState('saving');
    try {
      await api('/review/note', { month, section, body: v });
      onSaved(v);
      setState('saved');
    } catch (e) {
      onError(e);
      setState('');
    }
  }
  return (
    <div className="card">
      <h3 className="row">
        {label} 피드백 {required ? <span className="tag bad">필수</span> : <span className="tag">선택</span>}
        <span className="spacer" />
        <span className="muted small">{state === 'saving' ? '저장 중…' : state === 'saved' ? '저장됐어요' : '칸 밖을 누르면 저장돼요'}</span>
      </h3>
      {auto.length > 0 && (
        <div className="autofb">
          <div className="muted small">항목별로 적은 것 (위 표에서 고치면 여기도 바로 바뀌어요)</div>
          {(
            [
              ['bad', '아쉬운 점'],
              ['good', '잘한 점'],
              ['neutral', '메모'],
            ] as const
          ).map(([tone, title]) => {
            const these = auto.filter((t) => t.tone === tone);
            if (!these.length) return null;
            return (
              <div key={tone} className={`fbgroup fb-${tone}`}>
                <div className="fbtitle">
                  {title} <span className="muted small">{these.length}</span>
                </div>
                {these.map((t, i) => (
                  <div key={i}>
                    · <b className={tone === 'neutral' ? '' : tone}>{t.head}</b> — {t.rest}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
      {children}
      <textarea className="text fb" rows={auto.length ? 3 : 4} value={v} onChange={(e) => (setV(e.target.value), setState(''))} onBlur={save} placeholder={auto.length ? '총평 한두 줄 (선택) — 항목별 내용은 위에 이미 들어가 있어요' : '이번 달 이 구역을 한두 줄로: 무엇이 넘쳤고 왜, 다음 달엔 어떻게 할지'} />
    </div>
  );
}

// ---------- 맨 위: 지난달에 한 다짐 → 이번 달 결과 (탭이 아니라 항상 보이는 한 줄) ----------
// 지난달에 한 다짐 중 이 구역 것만 (변동지출 탭엔 변동지출 다짐만). 구역 없는 예전 다짐: 금액 다짐은 카테고리 구역, 글 다짐은 변동지출 탭에
function PledgeBar({ grp, d, boot, onError, reload }: { grp: 'var' | 'fix' | 'inc' | 'sav'; d: ReviewData; boot: Boot; onError: (e: unknown) => void; reload: () => void }) {
  const grpOf = (id: string | null) => {
    const g = boot.categories.find((c) => c.id === id)?.grp;
    return g === 'inv' ? 'sav' : g;
  };
  const mine = d.pledges.filter((p) => (p.section ? p.section === grp : p.kind === 'num' ? grpOf(p.categoryId) === grp : grp === 'var'));
  if (mine.length === 0) return null;
  const names: Record<string, string> = { var: '변동지출', fix: '고정지출', inc: '수입', sav: '저축·투자' };
  const catName = (id: string | null) => boot.categories.find((c) => c.id === id)?.name ?? '';
  const res = async (id: string, result: string | null) => {
    try {
      await api(`/pledge/${id}/result`, { result });
      reload();
    } catch (e) {
      onError(e);
    }
  };
  return (
    <div className="card pledgebar">
      <b>
        {Number(d.prev.slice(5))}월에 한 {names[grp]} 다짐
      </b>
      {mine.map((p) =>
        p.kind === 'num' ? (
          <span key={p.id} className="pl">
            {catName(p.categoryId)} {won(p.limitAmount ?? 0)}원 이하 <span className="muted small">(실제 {won(p.actual ?? 0)})</span>{' '}
            <span className={p.auto === 'kept' ? 'good' : p.auto === 'missed' ? 'bad' : 'muted'}>{p.auto === 'kept' ? '지킴' : p.auto === 'missed' ? '못 지킴' : '진행 중'}</span>
          </span>
        ) : (
          <span key={p.id} className="pl">
            {p.body}{' '}
            <span className="seg">
              <button className={p.result === 'kept' ? 'on' : ''} onClick={() => res(p.id, p.result === 'kept' ? null : 'kept')}>
                지킴
              </button>
              <button className={p.result === 'missed' ? 'on' : ''} onClick={() => res(p.id, p.result === 'missed' ? null : 'missed')}>
                못 지킴
              </button>
            </span>
          </span>
        ),
      )}
    </div>
  );
}

// ---------- ②③ 변동·고정 지출: 기준표 + 원인 ----------
function SpendSection({ grp, d, boot, onError, reload, go, setD, toast }: { grp: 'var' | 'fix' | 'spc'; d: ReviewData; boot: Boot; onError: (e: unknown) => void; reload: () => void; go: (h: string) => void; setD: (x: ReviewData) => void; toast: Toast }) {
  // 이번 달·지난달에 쓴 게 있거나, 이번 달·다음 달 예산이 잡힌 줄
  const lines = d.lines.filter((l) => l.category.grp === grp && (l.budget > 0 || l.actual > 0 || l.prevActual > 0 || (d.nextBudgets[l.category.id] ?? 0) > 0));
  const order = (l: Line) => (l.verdict === 'bad' ? 0 : l.verdict === 'warn' ? 1 : 2);
  lines.sort((a, b) => order(a) - order(b) || (b.ratio ?? 0) - (a.ratio ?? 0) || b.actual - a.actual);
  const budget = lines.reduce((n, l) => n + l.budget, 0);
  const actual = lines.reduce((n, l) => n + l.actual, 0);
  const over = budget > 0 ? actual / budget - 1 : null;
  const g = boot.groups.find((x) => x.key === grp)!;
  const accName = (id: string | null) => boot.accounts.find((a) => a.id === id)?.name ?? '';
  const noBudget = d.txs.filter((t) => lines.some((l) => l.category.id === t.categoryId && l.budget === 0));

  async function setCause(categoryId: string, cause: string | null, note?: string) {
    const cur = d.causes[categoryId] ?? { cause: null, note: '' };
    try {
      const nd = await api<ReviewData>('/review/cause', { month: d.month, categoryId, cause, note: note ?? cur.note });
      setD(nd);
      if (cause === 'reducible') toast('다음 달 다짐에 넣었어요');
    } catch (e) {
      onError(e);
    }
  }
  // 큰 거래 펼치기: 결산 화면 안에서 바로 그 카테고리 거래(금액 큰 순)를 보고 피드백
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setOpen((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const [all, setAll] = useState<Set<string>>(new Set());
  const toggleAll = (id: string) => setAll((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const [allNoBudget, setAllNoBudget] = useState(false);
  // 머니노트 카테고리는 표 아래 한 묶음으로 접었다 폈다 (예산은 접혀 있어도 이미 반영됨)
  const [mnOpen, setMnOpen] = useState(() => localStorage.getItem('gb_mnrows_open') === '1');
  useEffect(() => localStorage.setItem('gb_mnrows_open', mnOpen ? '1' : '0'), [mnOpen]);
  const mnLines = lines.filter((l) => l.category.moneynote);
  const mnOver = mnLines.filter((l) => l.verdict === 'bad' || l.verdict === 'warn').length;
  const tableRows: (Line | 'MN')[] = mnLines.length ? [...lines.filter((l) => !l.category.moneynote), 'MN', ...(mnOpen ? mnLines : [])] : lines;
  const mnSum = (f: (l: Line) => number) => mnLines.reduce((n, l) => n + f(l), 0);
  const overIds = lines.filter((l) => l.verdict === 'bad' || l.verdict === 'warn').map((l) => l.category.id);
  async function toggleUnnecessary(t: Tx) {
    try {
      await api('/tx', { ...t, unnecessary: !t.unnecessary });
      setD({ ...d, txs: d.txs.map((x) => (x.id === t.id ? { ...x, unnecessary: !t.unnecessary } : x)) });
    } catch (e) {
      onError(e);
    }
  }
  async function undoBudget(categoryId: string, month = d.next) {
    try {
      await api('/budgets/undo', { categoryId, month });
      toast('예산을 원래대로 돌렸어요');
      reload();
    } catch (e) {
      onError(e);
    }
  }
  async function raiseBudget(categoryId: string, amount: number, month = d.next) {
    try {
      await api('/budgets', { categoryId, month, amount, reason: 'review' });
      toast(`${Number(month.slice(5))}월 예산을 ${won(amount)}원으로 ${month === d.month ? '바로잡았어요' : '정했어요'}`);
      reload();
    } catch (e) {
      onError(e);
    }
  }

  return (
    <div className="card">
      <div className="sechead">
        <h3 className="withico">
          <Icon name={GROUP_ICON[grp]} /> {g.name}
        </h3>
        <div className="secstats">
          <span>
            <small>예산</small>
            {won(budget)}
          </span>
          <span>
            <small>실제</small>
            {won(actual)}
          </span>
          {over !== null && (
            <>
              <span className={budget - actual < 0 ? 'bad' : ''}>
                <small>잔액</small>
                {won(budget - actual)}
              </span>
              <span className={over > 0.1 ? 'bad' : over > 0 ? 'warn' : 'good'}>
                <small>달성률</small>
                {rateText(budget, actual)}
              </span>
            </>
          )}
          {grp === 'var' && boot.nospendCal !== false && <NoSpendStat month={d.month} onError={onError} />}
        </div>
        {overIds.length > 0 && (
          <a className="click small muted" onClick={() => setOpen(overIds.every((i) => open.has(i)) ? new Set() : new Set(overIds))}>
            {overIds.every((i) => open.has(i)) ? '모두 접기' : `넘친 ${overIds.length}개 펼치기`}
          </a>
        )}
      </div>
      <div className="tablewrap">
        <table className="list review">
          <thead>
            <tr>
              <th>카테고리</th>
              <th className="r">예산</th>
              <th className="r">실제</th>
              <th className="r" title="예산 − 실제">잔액</th>
              <th>달성률</th>
              <th className="r">지난달</th>
              <th className="r nextb" title="결산하면서 다음 달 예산을 바로 정해요. 칸 밖을 누르면 저장돼요">{Number(d.next.slice(5))}월 예산</th>
              <th>큰 거래</th>
              <th>원인 · 한 줄</th>
            </tr>
          </thead>
          <tbody>
            {tableRows.map((l) => {
              if (l === 'MN')
                return (
                  <tr key="mn-head" className="mnhead" onClick={() => setMnOpen(!mnOpen)}>
                    <td>
                      <span className="caret">{mnOpen ? '▾' : '▸'}</span> <b>머니노트</b> <span className="muted small">{mnLines.length}개</span>
                      {mnOver > 0 && <span className="tag bad">넘침 {mnOver}</span>}
                    </td>
                    <td className="r">{won(mnSum((x) => x.budget))}</td>
                    <td className="r">
                      <b>{won(mnSum((x) => x.actual))}</b>
                    </td>
                    <td className="r">{won(mnSum((x) => x.budget - x.actual))}</td>
                    <td />
                    <td className="r muted">{won(mnSum((x) => x.prevActual))}</td>
                    <td className="r nextb">
                      <b>{won(mnSum((x) => d.nextBudgets[x.category.id] ?? x.category.budget))}</b>
                    </td>
                    <td colSpan={2} className="muted small">
                      {mnOpen ? '눌러서 접기' : '눌러서 펼치기 — 예산은 이미 반영돼 있어요'}
                    </td>
                  </tr>
                );
              const id = l.category.id;
              const mine = d.txs.filter((t) => t.categoryId === id);
              const top = mine[0];
              const c = d.causes[id] ?? { cause: null, note: '' };
              const overLine = l.verdict === 'bad' || l.verdict === 'warn' || (!!c.cause && c.cause !== 'good');
              const rec = grp === 'fix' ? d.recurring.filter((r) => r.categoryId === id) : [];
              const isOpen = open.has(id);
              return (
                <Fragment key={id}>
                <tr className={`${overLine ? 'over' : ''} ${isOpen ? 'opened' : ''}`}>
                  <td>
                    <a className="click withico" onClick={() => toggle(id)} title="눌러서 이 카테고리 거래 펼치기">
                      <span className="caret">{mine.length ? (isOpen ? '▾' : '▸') : ''}</span>
                      <Icon name={l.category.icon} /> <b>{l.category.name}</b>
                    </a>
                    {l.category.moneynote && <span className="tag" title="머니노트로 예산 잡는 카테고리">머니노트</span>}
                    {rec.map((r) => (
                      <div key={r.id} className="muted small">
                        매월 {r.day}일 · {accName(r.fromAccount)} · {won(r.amount)} 자동
                      </div>
                    ))}
                  </td>
                  <td className="r">{l.budget ? won(l.budget) : <span className="muted">없음</span>}</td>
                  <td className="r">
                    <b>{won(l.actual)}</b>
                  </td>
                  <td className={`r ${l.budget > 0 && l.budget - l.actual < 0 ? 'bad' : ''} ${l.budget > 0 ? '' : 'muted'}`}>{l.budget > 0 ? won(l.budget - l.actual) : '—'}</td>
                  <td className="nowrap">
                    <Verdict l={l} />
                  </td>
                  <td className="r muted">{won(l.prevActual)}</td>
                  <td className="r nextb">
                    {l.category.moneynote && d.nextNotes.some((n) => n.categoryId === id) ? (
                      <a className="click" title="다음 달 머니노트에 적어 둔 합계예요 — 머니노트에서 고쳐요" onClick={() => go(`#/moneynote?year=${d.next.slice(0, 4)}&month=${d.next}&category=${id}`)}>
                        <b>{won(d.nextBudgets[id] ?? 0)}</b> ✎
                      </a>
                    ) : (
                      <NextBudget value={d.nextBudgets[id] ?? l.category.budget} changed={d.raised[id]} onSave={(n) => raiseBudget(id, n)} onUndo={() => undoBudget(id)} />
                    )}
                  </td>
                  <td className="small">
                    {top && (
                      <a className="click" onClick={() => toggle(id)}>
                        {top.title} {won(top.amount)}
                        {mine.length > 1 && <span className="muted"> 외 {mine.length - 1}건</span>} {isOpen ? '▾' : '▸'}
                      </a>
                    )}
                  </td>
                  <td className="cause">
                    {overLine ? (
                      <>
                        <div className="chips">
                          {CAUSE_LIST.map((x) => (
                            <button key={x.key} className={`chip sm ${c.cause === x.key ? 'on' : ''}`} onClick={() => setCause(id, c.cause === x.key ? null : x.key)}>
                              {x.name}
                            </button>
                          ))}
                        </div>
                        {c.cause && <div className="muted small hint">{CAUSE_HINT[c.cause]}</div>}
                        {c.cause === 'small_budget' && (
                          <div className="budfix">
                            {/* 이번 달만 잘못 잡았을 때: 이번 달 예산만 바로잡기 */}
                            {d.fixedThis[id] ? (
                              <div className="row small">
                                <span className="good">이번 달({Number(d.month.slice(5))}월) 예산을 {won(d.fixedThis[id].amount)}원으로 바로잡았어요</span>
                                <button className="btn sm" onClick={() => undoBudget(id, d.month)}>
                                  되돌리기 ({d.fixedThis[id].old === null ? '기본 예산' : `${won(d.fixedThis[id].old!)}원`}으로)
                                </button>
                              </div>
                            ) : (
                              <AmountAction label={`이번 달만 잘못 잡았어요 → ${Number(d.month.slice(5))}월 예산 ${won(l.budget)} →`} start={l.actual} button="바로잡기" onApply={(n) => raiseBudget(id, n, d.month)} />
                            )}
                            <div className="muted small">앞으로도 모자랄 것 같으면 오른쪽 '{Number(d.next.slice(5))}월 예산' 칸을 고치세요.</div>
                          </div>
                        )}
                        {c.cause === 'yearly' && (
                          <button className="btn sm" onClick={() => go(`#/moneynote?year=${Number(d.month.slice(0, 4)) + 1}`)}>
                            내년 머니노트에 미리 적기
                          </button>
                        )}
                        {c.cause === 'new_fixed' && (
                          <button className="btn sm" onClick={() => go('#/settings')}>
                            고정지출 등록하러 가기
                          </button>
                        )}
                      </>
                    ) : null}
                    {/* 칸 모양은 항상 같게: 모든 줄에 한 줄 칸 (넘친 줄은 위에 원인 버튼이 더 있음) */}
                    <NoteInput
                      value={c.note}
                      placeholder={overLine ? '원인 한 줄 (선택)' : l.actual === 0 ? '한 줄 메모 (선택) — 이번 달 안 씀' : l.budget > 0 ? '잘한 이유 한 줄 (선택)' : '한 줄 메모 (선택)'}
                      onSave={(v) => setCause(id, overLine ? c.cause : c.cause ?? (l.budget > 0 && l.actual <= l.budget ? 'good' : null), v)}
                    />
                  </td>
                </tr>
                {isOpen && (
                  <tr className="detail">
                    <td colSpan={9}>
                      <table className="mini">
                        <tbody>
                          {(() => {
                            // 머니노트 세부 항목: 거래 내역 이름이 같으면(띄어쓰기 무시) 그 항목 예산과 비교 — 항목의 첫 거래 줄에 표시
                            const plan = itemPlans((d.thisNotes ?? []).filter((n) => n.categoryId === id));
                            const shown = new Set<string>();
                            const actualOf = (k: string) => mine.filter((x) => normTitle(x.title) === k).reduce((a, x) => a + x.amount, 0);
                            const rows = (all.has(id) ? mine : mine.slice(0, 5)).map((t) => {
                              const k = normTitle(t.title);
                              const p = plan.get(k);
                              const first = p && !shown.has(k);
                              if (p) shown.add(k);
                              return (
                                <tr key={t.id}>
                                  <td className="nowrap muted">{shortDate(t.date)}</td>
                                  <td>
                                    {t.title}
                                    {t.recurringId && <span className="tag">자동</span>}
                                  </td>
                                  {plan.size > 0 && <td className="r nowrap muted small">{first ? `예산 ${won(p.plan)}` : ''}</td>}
                                  <td className="r nowrap">
                                    <b>{won(t.amount)}</b>
                                  </td>
                                  {plan.size > 0 && <td className="nowrap">{first ? <ItemVerdict plan={p.plan} actual={actualOf(k)} /> : null}</td>}
                              <td className="muted nowrap">{accName(t.fromAccount)}</td>
                              <td className="muted small">{t.memo}</td>
                                  <td className="nowrap">
                                    <label className="check small" title="줄일 수 있었던 지출이면 표시">
                                      <input type="checkbox" checked={t.unnecessary} onChange={() => toggleUnnecessary(t)} /> 불필요
                                    </label>
                                  </td>
                                </tr>
                              );
                            });
                            // 예산은 잡았는데 아직 거래가 없는 항목
                            const waiting = [...plan.entries()].filter(([k]) => !mine.some((x) => normTitle(x.title) === k));
                            return (
                              <>
                                {rows}
                                {waiting.map(([k, p]) => (
                                  <tr key={'w' + k}>
                                    <td className="muted">—</td>
                                    <td className="muted">{p.title}</td>
                                    <td className="r nowrap muted small">예산 {won(p.plan)}</td>
                                    <td className="r muted">0</td>
                                    <td>
                                      <span className="ic-tag wait">아직 안 씀</span>
                                    </td>
                                    <td colSpan={3} />
                                  </tr>
                                ))}
                              </>
                            );
                          })()}
                        </tbody>
                      </table>
                      {mine.length > 5 && (
                        <button className="btn sm" style={{ margin: '6px 0 0' }} onClick={() => toggleAll(id)}>
                          {all.has(id) ? '큰 금액 5개만 보기' : `나머지 ${mine.length - 5}건 모두 보기`}
                        </button>
                      )}
                      <div className="muted small" style={{ marginTop: 4 }}>
                        금액 큰 순 · {all.has(id) || mine.length <= 5 ? `${mine.length}건 모두` : `${mine.length}건 중 5건`} · 합계 {won(l.actual)}원 ·{' '}
                        <a className="click" onClick={() => go(`#/tx?category=${id}&month=${d.month}`)}>
                          거래 화면에서 고치기 ▸
                        </a>
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {noBudget.length > 0 && (
        <p className="small">
          <span className="warn">예산에 없던 지출:</span>{' '}
          {(allNoBudget ? noBudget : noBudget.slice(0, 5)).map((t, i) => (
            <span key={t.id}>
              {i > 0 && ' · '}
              {t.title} {won(t.amount)}
            </span>
          ))}
          {noBudget.length > 5 && (
            <a className="click muted" onClick={() => setAllNoBudget(!allNoBudget)}>
              {' '}
              {allNoBudget ? '· 접기' : `· 나머지 ${noBudget.length - 5}건 모두 보기`}
            </a>
          )}
        </p>
      )}
    </div>
  );
}

function Verdict({ l }: { l: BudgetLine }) {
  const cls = l.verdict === 'bad' ? 'bad' : l.verdict === 'warn' ? 'warn' : l.verdict === 'good' || l.verdict === 'ok' ? 'good' : '';
  if (cls) return <span className={cls}>{rateText(l.budget, l.actual)}</span>;
  return <span className="muted">—</span>;
}

function NoteInput({ value, placeholder, onSave }: { value: string; placeholder: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return <input className="text sm note" value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onSave(v)} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />;
}

// ---------- ④⑤ 수입 · 저축·투자: 계획 대비 달성 ----------
function GoalSection({ grp, d, boot, onError, reload, toast }: { grp: 'inc' | 'sav'; d: ReviewData; boot: Boot; onError: (e: unknown) => void; reload: () => void; toast: Toast }) {
  const setNext = async (categoryId: string, amount: number) => {
    try {
      await api('/budgets', { categoryId, month: d.next, amount, reason: 'review' });
      toast(`${Number(d.next.slice(5))}월 계획을 ${won(amount)}원으로 정했어요`);
      reload();
    } catch (e) {
      onError(e);
    }
  };
  const undoNext = async (categoryId: string) => {
    try {
      await api('/budgets/undo', { categoryId, month: d.next });
      reload();
    } catch (e) {
      onError(e);
    }
  };
  const groups: Group[] = grp === 'inc' ? ['inc'] : ['sav', 'inv'];
  const lines = d.lines.filter((l) => groups.includes(l.category.grp) && (l.budget > 0 || l.actual > 0 || l.prevActual > 0));
  const plan = lines.reduce((n, l) => n + l.budget, 0);
  const actual = lines.reduce((n, l) => n + l.actual, 0);
  const prev = lines.reduce((n, l) => n + l.prevActual, 0);
  return (
    <div className="card">
      <div className="sechead">
        <h3 className="withico">
          <Icon name={GROUP_ICON[grp]} /> {grp === 'inc' ? '수입' : '저축·투자'}
        </h3>
        <div className="secstats">
          <span>
            <small>계획</small>
            {won(plan)}
          </span>
          <span>
            <small>실제</small>
            {won(actual)}
          </span>
          <span>
            <small>달성률</small>
            {pct(plan > 0 ? actual / plan : null)}
          </span>
          <span className="muted">
            <small>지난달 대비</small>
            {actual - prev >= 0 ? '+' : ''}
            {won(actual - prev)}
          </span>
        </div>
      </div>
      <div className="tablewrap">
        <table className="list review">
          <thead>
            <tr>
              <th>{grp === 'inc' ? '수입원' : '모은 곳'}</th>
              <th className="r">계획</th>
              <th className="r">실제</th>
              <th className="r">지난달</th>
              <th className="r">달성률</th>
              <th className="r nextb">{Number(d.next.slice(5))}월 계획</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.category.id}>
                <td>
                  <span className="withico">
                    <Icon name={l.category.icon} /> <b>{l.category.name}</b>
                    {grp === 'sav' && <span className="tag">{boot.groups.find((x) => x.key === l.category.grp)?.name}</span>}
                  </span>
                </td>
                <td className="r">{l.budget ? won(l.budget) : <span className="muted">없음</span>}</td>
                <td className="r">
                  <b>{won(l.actual)}</b>
                </td>
                <td className="r muted">{won(l.prevActual)}</td>
                <td className={`r ${l.budget > 0 ? (l.actual >= l.budget ? 'good' : 'warn') : ''}`}>{pct(l.budget > 0 ? l.actual / l.budget : null)}</td>
                <td className="r nextb">
                  <NextBudget value={d.nextBudgets[l.category.id] ?? l.category.budget} changed={d.raised[l.category.id]} onSave={(n) => setNext(l.category.id, n)} onUndo={() => undoNext(l.category.id)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {grp === 'sav' && <p className="muted small">저축·투자 통장끼리 옮긴 돈(예: 투자대기 → 미국주식)은 두 번 세지 않아요.</p>}
    </div>
  );
}


// ---------- ⑥ 자산 추이 ----------
interface AssetRow { month: string; live: number; save: number; loan: number; assets: number; net: number; byAccount: Record<string, number> }
interface AssetData { accounts: { id: string; name: string; kind: string; group: 'live' | 'save' | 'loan'; hidden: boolean }[]; months: AssetRow[]; exclude?: string[] }

export function AssetTrend({ month, boot, onError }: { month: string; boot: Boot; onError: (e: unknown) => void }) {
  const [a, setA] = useState<AssetData | null>(null);
  const [table, setTable] = useState(false);
  useEffect(() => void api<AssetData>(`/assets?upto=${month}`).then(setA).catch(onError), [month, onError]);
  const [pick, setPick] = useState(false);
  if (!a) return <p className="muted">불러오는 중…</p>;
  // 자산 추이에 넣을 통장 고르기: 뺀 통장은 합계에서 빼고 다시 계산
  const ex = new Set(a.exclude ?? []);
  const rows = a.months.map((r) => {
    const sum = { live: 0, save: 0, loan: 0 };
    for (const acc of a.accounts) if (!ex.has(acc.id)) sum[acc.group] += r.byAccount[acc.id] ?? 0;
    return { ...r, ...sum, assets: sum.live + sum.save, net: sum.live + sum.save + sum.loan };
  });
  const toggle = async (id: string) => {
    const next = new Set(ex);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    const ids = [...next];
    setA({ ...a, exclude: ids });
    try {
      await api('/assets/exclude', { ids });
    } catch (e) {
      onError(e);
    }
  };
  const GROUP_NAME = { live: '생활 통장', save: '저축·투자', loan: '대출' } as const;
  const now = rows[rows.length - 1];
  const first = rows[0];
  const prev = rows[rows.length - 2];
  const lbl = (m: string) => `${Number(m.slice(5))}월`;
  const diff = (n: number) => `${n >= 0 ? '+' : ''}${won(n)}`;
  const stat = (name: string, v: number, from: number, sub?: string) => (
    <div className="tile">
      <small>{name}</small>
      <b className={v < 0 ? 'bad' : ''}>{won(v || 0)}</b>
      <div className="muted small">
        {prev ? `전달보다 ${diff(v - (sub === 'loan' ? -prev.loan : sub === 'assets' ? prev.assets : prev.net))}` : ''}
        {rows.length > 1 && ` · 1월보다 ${diff(v - from)}`}
      </div>
    </div>
  );
  return (
    <>
      <div className="tiles three">
        {stat('순자산 (모은 자산 − 대출)', now.net, first.net)}
        {stat('모은 자산 (생활 통장 + 저축·투자)', now.assets, first.assets, 'assets')}
        {stat('남은 대출', -now.loan, -first.loan, 'loan')}
      </div>
      <div className="card">
        <h3 className="row">
          모은 자산 <span className="muted small">— 달마다 말일 잔액 · 생활 통장 + 저축·투자 통장 · 단위 만 원</span>
          <span className="spacer" />
          <button className="btn sm" onClick={() => setPick(!pick)}>
            넣을 통장 고르기{ex.size ? ` (${ex.size}개 뺌)` : ''}
          </button>
          <button className="btn sm" onClick={() => setTable(!table)}>
            {table ? '그래프로 보기' : '표로 보기'}
          </button>
        </h3>
        {pick && (
          <div className="asset-pick">
            {(['live', 'save', 'loan'] as const).map((g) => (
              <div key={g}>
                <b className="small">{GROUP_NAME[g]}</b>
                {a.accounts
                  .filter((acc) => acc.group === g)
                  .map((acc) => (
                    <label key={acc.id} className="check small">
                      <input type="checkbox" checked={!ex.has(acc.id)} onChange={() => toggle(acc.id)} /> {acc.name}
                      <span className="muted"> {won(now ? (a.months[a.months.length - 1].byAccount[acc.id] ?? 0) : 0)}</span>
                    </label>
                  ))}
              </div>
            ))}
            <p className="muted small">체크를 끈 통장은 자산 추이 숫자·그래프에서 빠져요. 통장 잔액이나 거래는 그대로예요. 가족 모두에게 같이 적용돼요.</p>
          </div>
        )}
        {table ? (
          <div className="tablewrap">
            <table className="list">
              <thead>
                <tr>
                  <th>달</th>
                  <th className="r">생활 통장</th>
                  <th className="r">저축·투자</th>
                  <th className="r">모은 자산</th>
                  <th className="r">남은 대출</th>
                  <th className="r">순자산</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.month} className={r.month === month ? 'sel' : ''}>
                    <td>{lbl(r.month)}</td>
                    <td className="r">{won(r.live)}</td>
                    <td className="r">{won(r.save)}</td>
                    <td className="r">
                      <b>{won(r.assets)}</b>
                    </td>
                    <td className="r">{won(-r.loan)}</td>
                    <td className={`r ${r.net < 0 ? 'bad' : ''}`}>{won(r.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <LineChart points={rows.map((r) => ({ label: lbl(r.month), value: r.assets }))} color="var(--accent)" valueText={(n) => `${won(n)}원`} />
        )}
      </div>
      {!table && (
        <div className="card">
          <h3>
            남은 대출 <span className="muted small">— 대출 통장 합계, 줄어들수록 좋아요 · 단위 만 원</span>
          </h3>
          <LineChart points={rows.map((r) => ({ label: lbl(r.month), value: -r.loan }))} color="#2a78d6" height={200} valueText={(n) => `${won(n)}원`} />
        </div>
      )}
      <p className="muted small">통장 잔액은 거래 기록으로 계산해요. 증권은 평가금액을 적은 달은 평가금액, 아니면 넣은 돈 기준이에요(통장·투자 → 주식 평가금액). 딜 투자는 넣은 돈 기준. 딜은 '딜 투자' 바구니(통장 종류 '투자')에 넣고, 만기에 돌려받으면 바구니 → 통장 이체로 적어 주세요.</p>
    </>
  );
}

// 표에서 고른 원인·한 줄 메모를 그 구역 피드백 줄로 (카페 이미지에도 같은 줄이 들어감)
const CAUSE_NAME: Record<string, string> = { small_budget: '예산이 작았음', yearly: '해마다 오는 지출', new_fixed: '새 고정비', once: '이번만', reducible: '줄일 수 있었음', good: '잘한 점' };
export interface ItemLine {
  head: string; // '생활필수품 99,280원 초과 (331%)'
  rest: string; // '줄일 수 있었음: 무인양품…'
  tone: 'good' | 'bad' | 'neutral'; // 아낀 줄 초록 / 넘친 줄 빨강
}
function itemLines(d: ReviewData, section: string): ItemLine[] {
  const groups = section === 'sav' ? ['sav', 'inv'] : [section];
  return d.lines
    .filter((l) => groups.includes(l.category.grp))
    .map((l) => ({ l, c: d.causes[l.category.id] }))
    .filter(({ c }) => c && (c.cause || c.note.trim()))
    .sort((a, b) => (b.l.actual - b.l.budget) - (a.l.actual - a.l.budget))
    .map(({ l, c }) => {
      const head = `${l.category.name} ${verdictText(l.budget, l.actual)}`;
      const why = c!.cause && c!.cause !== 'good' ? CAUSE_NAME[c!.cause] : '';
      const note = c!.note.trim();
      const tone: ItemLine['tone'] = l.budget > 0 && l.actual <= l.budget ? 'good' : l.actual > l.budget ? 'bad' : 'neutral';
      return { head, rest: [why, note].filter(Boolean).join(': ') || CAUSE_NAME.good, tone };
    });
}

// 금액을 직접 넣고 적용 (처음엔 알맞은 값이 채워져 있음)
function AmountAction({ label, start, button, onApply }: { label: string; start: number; button: string; onApply: (n: number) => void }) {
  const [v, setV] = useState(won(start));
  return (
    <div className="row small amtact">
      <span>{label}</span>
      <input className="text sm" inputMode="numeric" value={v} onChange={(e) => { const n = parseAmount(e.target.value); setV(n === null ? '' : won(n)); }} onKeyDown={(e) => e.key === 'Enter' && onApply(parseAmount(v) ?? 0)} />
      <span>원으로</span>
      <button className="btn sm" onClick={() => onApply(parseAmount(v) ?? 0)}>
        {button}
      </button>
    </div>
  );
}

// 다음 달 예산 칸: 결산하면서 바로 고치기 (칸 밖 누르거나 Enter → 저장, 결산에서 바꾼 건 ↺로 되돌리기)
function NextBudget({ value, changed, onSave, onUndo }: { value: number; changed?: { old: number | null; amount: number }; onSave: (n: number) => void; onUndo: () => void }) {
  const [v, setV] = useState(won(value));
  useEffect(() => setV(won(value)), [value]);
  const save = () => {
    const n = parseAmount(v) ?? 0;
    if (n !== value) onSave(n);
  };
  return (
    <span className="nbwrap">
      <input className={`text sm nb ${changed ? 'changed' : ''}`} inputMode="numeric" value={v} onChange={(e) => { const n = parseAmount(e.target.value); setV(n === null ? '' : won(n)); }} onBlur={save} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
      {changed && (
        <button className="undo" title={`되돌리기 (${changed.old === null ? '기본 예산' : won(changed.old) + '원'}으로)`} onClick={onUndo}>
          ↺
        </button>
      )}
    </span>
  );
}

// 결산 맨 위: 다음 달 머니노트 — 평소엔 한 줄(합계), 펼치면 깔끔한 목록 + [＋ 적기]
function NextMoneyNote({ d, boot, go, onError, reload }: { d: ReviewData; boot: Boot; go: (h: string) => void; onError: (e: unknown) => void; reload: () => void }) {
  const [open, setOpen] = useState(() => localStorage.getItem('gb_mn_open') === '1');
  useEffect(() => localStorage.setItem('gb_mn_open', open ? '1' : '0'), [open]);
  const [adding, setAdding] = useState(false);
  const cats = boot.categories.filter((c) => c.moneynote && !c.hidden);
  const [cid, setCid] = useState('');
  const [title, setTitle] = useState('');
  const [amt, setAmt] = useState('');
  const catName = (id: string) => boot.categories.find((c) => c.id === id)?.name ?? '';
  const total = d.nextNotes.reduce((n, x) => n + x.amount, 0);
  const m = Number(d.next.slice(5));
  async function add() {
    try {
      await api('/money-note', { categoryId: cid || cats[0]?.id, month: d.next, title, amount: parseAmount(amt) ?? 0 });
      setTitle('');
      setAmt('');
      setAdding(false);
      reload();
    } catch (e) {
      onError(e);
    }
  }
  return (
    <div className="card mnbox2">
      <div className="mnhead2" onClick={() => setOpen(!open)}>
        <span className="caret">{open ? '▾' : '▸'}</span>
        <Icon name="gift" /> <b>{m}월 머니노트</b>
        <span className="muted small">{d.nextNotes.length ? `${d.nextNotes.length}건` : '없음'}</span>
        <span className="spacer" />
        <b>{won(total)}원</b>
      </div>
      {open && (
        <div className="mnbody">
          {d.nextNotes.length > 0 && (
            <table className="mnlist">
              <tbody>
                {d.nextNotes.map((n) => (
                  <tr key={n.id}>
                    <td>{n.title}</td>
                    <td className="muted small">{catName(n.categoryId)}</td>
                    <td className="r">{won(n.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {adding ? (
            <div className="row small mnadd">
              <select className="text sm" value={cid || cats[0]?.id} onChange={(e) => setCid(e.target.value)}>
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <input className="text sm" autoFocus placeholder="무엇 (예: 캠핑)" value={title} onChange={(e) => setTitle(e.target.value)} />
              <input className="text sm" style={{ width: 110, textAlign: 'right' }} inputMode="numeric" placeholder="금액" value={amt} onChange={(e) => { const v = parseAmount(e.target.value); setAmt(v === null ? '' : won(v)); }} onKeyDown={(e) => e.key === 'Enter' && add()} />
              <button className="btn sm main" onClick={add}>
                적기
              </button>
              <button className="btn sm" onClick={() => setAdding(false)}>
                취소
              </button>
            </div>
          ) : (
            <div className="row small mnfoot">
              <a className="click" onClick={() => setAdding(true)}>
                ＋ {m}월에 적기
              </a>
              <span className="spacer" />
              <a className="click muted" onClick={() => go(`#/plan?tab=note&year=${d.next.slice(0, 4)}`)}>
                1년 머니노트 ▸
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// 피드백 안: 다음 달 예산이 이번 달과 달라진 카테고리마다 이유 한 줄 (예: 원래 없던 여행 예산 → '12월 캠핑')
function NextBudgetNotes({ grp, d, onError, setD }: { grp: 'var' | 'fix'; d: ReviewData; onError: (e: unknown) => void; setD: (x: ReviewData) => void }) {
  const changed = d.lines
    .filter((l) => l.category.grp === grp)
    .map((l) => ({ l, next: d.nextBudgets[l.category.id] ?? l.category.budget }))
    // 크게 바뀐 것만: 새로 생김(0→)·없어짐(→0)·10만 원 이상 차이, 또는 이미 메모가 있는 것
    .filter(({ l, next }) => (d.nextBudgetNotes[l.category.id] ?? '') !== '' || (next !== l.budget && (l.budget === 0 || next === 0 || Math.abs(next - l.budget) >= 100000)));
  const [open, setOpen] = useState(false);
  if (!changed.length) return null;
  const m = Number(d.next.slice(5));
  const save = async (categoryId: string, note: string) => {
    try {
      await api('/budget-note', { categoryId, month: d.next, note });
      setD({ ...d, nextBudgetNotes: { ...d.nextBudgetNotes, [categoryId]: note } });
    } catch (e) {
      onError(e);
    }
  };
  return (
    <div className="nbnotes">
      <a className="click fbtitle" onClick={() => setOpen(!open)}>
        {open ? '▾' : '▸'} {m}월 예산 크게 바뀐 곳 {changed.length}개 <span className="muted small">— 이유 메모 (선택)</span>
      </a>
      {open && (
      <table className="mnlist">
        <tbody>
          {changed.map(({ l, next }) => (
            <tr key={l.category.id}>
              <td className="nowrap">
                <b>{l.category.name}</b>
              </td>
              <td className="nowrap muted small">
                {won(l.budget)} → <b className={next > l.budget ? 'warn' : 'good'}>{won(next)}</b>
              </td>
              <td style={{ width: '60%' }}>
                <NoteInput value={d.nextBudgetNotes[l.category.id] ?? ''} placeholder={`왜 ${next > l.budget ? '늘렸는지' : '줄였는지'} 한 줄 (선택)`} onSave={(v) => save(l.category.id, v)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      )}
    </div>
  );
}

// ---------- 카페 이미지: 가계부 결산 한 장 (변동·고정·수입·저축 기준표 + 피드백) ----------
function CafeImage({ d, boot, filled, toast, onError }: { d: ReviewData; boot: Boot; filled: (k: string) => boolean; toast: Toast; onError: (e: unknown) => void }) {
  // 스티커: 보관함에서 이 달에 쓸 것 고르기 (달마다 기억, 처음엔 지난번 고른 것)
  const stickers = useStickers(boot.stickerVer);
  const [stickerId, setStickerIdState] = useState(() => localStorage.getItem(`gb_cafe_sticker:${d.month}`) ?? localStorage.getItem('gb_cafe_sticker_last') ?? '');
  const setStickerId = (id: string) => {
    localStorage.setItem(`gb_cafe_sticker:${d.month}`, id);
    localStorage.setItem('gb_cafe_sticker_last', id);
    setStickerIdState(id);
  };
  const sticker = stickers.find((x) => x.id === stickerId)?.data ?? null;
  const [withNs, setWithNsState] = useState(() => localStorage.getItem('gb_cafe_nospend') === '1'); // 무지출 달력 넣기 (고른 것 기억)
  const setWithNs = (v: boolean) => (localStorage.setItem('gb_cafe_nospend', v ? '1' : '0'), setWithNsState(v));
  const ref = useRef<HTMLDivElement>(null);
  const prefs = useCafePrefs();
  const [busy, setBusy] = useState(false);
  // 가리기: 미리보기에서 숫자를 누르면 모자이크 (카페에서 따로 모자이크 안 해도 되게). 해마다 같은 칸 기억
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(JSON.parse(localStorage.getItem('gb_cafe_hide') ?? '[]')));
  useEffect(() => localStorage.setItem('gb_cafe_hide', JSON.stringify([...hidden])), [hidden]);
  const toggle = (k: string) => setHidden((h) => { const n = new Set(h); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const setMany = (ks: string[], on: boolean) => setHidden((h) => { const n = new Set(h); ks.forEach((k) => (on ? n.add(k) : n.delete(k))); return n; });
  const M = ({ k, children, className = '' }: { k: string; children: React.ReactNode; className?: string }) => (
    <span className={`cf-m ${hidden.has(k) ? 'mask' : ''} ${className}`} onClick={() => toggle(k)} title="눌러서 가리기/보이기">
      {children}
    </span>
  );
  // 구역별 한 번에 가리기
  const keysOf = (grp: 'var' | 'fix' | 'inc' | 'sav') => {
    const gs = grp === 'sav' ? ['sav', 'inv'] : [grp];
    return [`head:${grp}`, `${grp}:sum:b`, `${grp}:sum:a`, `${grp}:sum:d`, ...d.lines.filter((l) => gs.includes(l.category.grp)).flatMap((l) => [`${grp}:${l.category.id}:b`, `${grp}:${l.category.id}:a`, `${grp}:${l.category.id}:d`])];
  };
  const groupsToHide: [string, string[]][] = [
    ['맨 위 숫자', ['tile:수입', 'tile:지출', 'tile:저축·투자', 'tile:남은 돈', 'tile:저축률']],
    ['변동지출', keysOf('var')],
    ['고정지출', keysOf('fix')],
    ['수입', [...keysOf('inc'), 'tile:수입']],
    ['저축·투자', [...keysOf('sav'), 'tile:저축·투자']],
  ];
  const need = (['var', 'fix', 'inc', 'sav'] as const).filter((k) => !filled(k));
  const names: Record<string, string> = { var: '변동지출', fix: '고정지출', inc: '수입', sav: '저축·투자' };
  const m = Number(d.month.slice(5));
  const t = d.totals;
  const opts = { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true };
  async function save() {
    if (!ref.current) return;
    setBusy(true);
    try {
      const url = await toPng(ref.current, opts);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${d.month} 가계부 결산.png`;
      a.click();
      toast('이미지를 저장했어요 (다운로드 폴더)');
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    if (!ref.current) return;
    setBusy(true);
    try {
      const blob = await toBlob(ref.current, opts);
      if (!blob) throw new Error('이미지를 만들지 못했어요.');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast('복사했어요 — 카페 글쓰기에서 붙여넣기(⌘V) 하세요');
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  }
  const okToMake = () => need.length === 0 || confirm(`${need.map((k) => names[k]).join(' · ')} 피드백이 아직 비어 있어요. 그래도 이미지를 만들까요?`);
  const section = (grp: 'var' | 'fix' | 'inc' | 'sav') => {
    const groups = grp === 'sav' ? ['sav', 'inv'] : [grp];
    const ls = d.lines.filter((l) => groups.includes(l.category.grp) && (l.budget > 0 || l.actual > 0));
    const budget = ls.reduce((n, l) => n + l.budget, 0);
    const actual = ls.reduce((n, l) => n + l.actual, 0);
    const spend = grp === 'var' || grp === 'fix';
    const lines = itemLines(d, grp);
    const note = (d.notes[grp] ?? '').trim();
    return (
      <div className="cf-sec" key={grp}>
        <div className="cf-sechead">
          <b>{names[grp]}</b>
          <span>
            <M k={`head:${grp}`}>
              {spend ? '예산' : '계획'} {won(budget)} · 실제 {won(actual)}
            </M>
            {budget > 0 && <em className={spend ? (actual > budget ? 'bad' : 'good') : actual >= budget ? 'good' : 'warn'}> · {spend ? rateText(budget, actual) : `${Math.round((actual / budget) * 100)}%`}</em>}
          </span>
        </div>
        <table className="cf-table">
          <thead>
            <tr>
              <th>{grp === 'inc' ? '수입원' : grp === 'sav' ? '모은 곳' : '카테고리'}</th>
              <th>{spend ? '예산' : '계획'}</th>
              <th>실제</th>
              <th>{spend ? '잔액' : '차이'}</th>
              <th>{spend ? '달성률' : '달성'}</th>
            </tr>
          </thead>
          <tbody>
            {ls.map((l) => (
              <tr key={l.category.id}>
                <td>{l.category.name}</td>
                <td>
                  <M k={`${grp}:${l.category.id}:b`}>{l.budget ? won(l.budget) : '-'}</M>
                </td>
                <td>
                  <b>
                    <M k={`${grp}:${l.category.id}:a`}>{won(l.actual)}</M>
                  </b>
                </td>
                <td className={spend && l.budget - l.actual < 0 ? 'bad' : ''}>
                  <M k={`${grp}:${l.category.id}:d`}>{l.budget ? won(spend ? l.budget - l.actual : l.actual - l.budget) : '-'}</M>
                </td>
                <td className={spend ? (l.verdict === 'bad' || l.verdict === 'warn' ? 'bad' : 'good') : ''}>{spend ? rateText(l.budget, l.actual) : l.budget ? `${Math.round((l.actual / l.budget) * 100)}%` : '-'}</td>
              </tr>
            ))}
          </tbody>
          {ls.length > 0 && (
            <tfoot>
              <tr className="cf-sum">
                <td>{names[grp]} 합계</td>
                <td>
                  <M k={`${grp}:sum:b`}>{budget ? won(budget) : '-'}</M>
                </td>
                <td>
                  <M k={`${grp}:sum:a`}>{won(actual)}</M>
                </td>
                <td className={spend && budget - actual < 0 ? 'bad' : ''}>
                  <M k={`${grp}:sum:d`}>{budget ? won(spend ? budget - actual : actual - budget) : '-'}</M>
                </td>
                {spend ? <td className={budget && actual > budget ? 'bad' : 'good'}>{rateText(budget, actual)}</td> : <td className={budget ? (actual >= budget ? 'good' : 'warn') : ''}>{budget ? `${Math.round((actual / budget) * 100)}%` : '-'}</td>}
              </tr>
            </tfoot>
          )}
        </table>
        {(lines.length > 0 || note) && (
          <div className="cf-fb">
            {(['bad', 'good', 'neutral'] as const).map((tone) => {
              const these = lines.filter((x) => x.tone === tone);
              if (!these.length) return null;
              return (
                <div key={tone} className="cf-fbg">
                  <div className={`cf-fbt ${tone}`}>{tone === 'bad' ? '아쉬운 점' : tone === 'good' ? '잘한 점' : '메모'}</div>
                  {these.map((x, i) => (
                    <div key={i}>
                      · <b className={tone === 'neutral' ? '' : tone}>{x.head}</b> — {x.rest}
                    </div>
                  ))}
                </div>
              );
            })}
            {note && (
              <div className="cf-fbg">
                <div className="cf-fbt">총평</div>
                <div className="cf-note">{note}</div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };
  return (
    <div>
      <div className="card">
        <div className="row">
          <h3 style={{ margin: 0 }}>카페에 올릴 이미지</h3>
          <span className="muted small">아래 모양 그대로 고해상도(2배) 이미지가 돼요</span>
          <span className="spacer" />
          <button className="btn main" disabled={busy} onClick={() => okToMake() && copy()}>
            복사하기
          </button>
          <button className="btn" disabled={busy} onClick={() => okToMake() && save()}>
            이미지로 저장
          </button>
        </div>
        <div className="row small" style={{ marginTop: 8 }}>
          <span className="muted">가리고 싶은 숫자를 아래 미리보기에서 누르면 모자이크돼요 (다시 누르면 보임).</span>
          <span className="spacer" />
          <span className="muted">한 번에 가리기:</span>
          {groupsToHide.map(([name, ks]) => {
            const all = ks.every((k) => hidden.has(k));
            return (
              <button key={name} className={`chip sm ${all ? 'on' : ''}`} onClick={() => setMany(ks, !all)}>
                {all ? '✓ ' : ''}
                {name}
              </button>
            );
          })}
          {hidden.size > 0 && (
            <button className="btn sm" onClick={() => setHidden(new Set())}>
              모두 보이기 ({hidden.size})
            </button>
          )}
        </div>
        <CafeOptions p={prefs} toast={toast} money={false} />
        {stickers.length > 0 && (
          <div className="sticker-pick">
            <b className="small">스티커</b>
            {stickers.map((st) => (
              <button key={st.id} className={stickerId === st.id ? 'on' : ''} onClick={() => setStickerId(st.id)}>
                <img src={st.data} alt="" />
              </button>
            ))}
            <button className={`none ${!sticker ? 'on' : ''}`} onClick={() => setStickerId('')}>
              없음
            </button>
          </div>
        )}
        {boot.nospendCal !== false && (
          <label className="check small" style={{ marginTop: 6 }}>
            <input type="checkbox" checked={withNs} onChange={(e) => setWithNs(e.target.checked)} /> 무지출 달력 넣기 <NewBadge id="cafe-nospend" />
          </label>
        )}
        {need.length > 0 && <p className="warn small">아직 비어 있는 피드백: {need.map((k) => names[k]).join(' · ')} (비어 있어도 만들 수는 있어요)</p>}
      </div>
      <div className="cf-wrap">
        <div className={`cf ${prefs.layout}`} ref={ref}>
          <div className="cf-title">
            <b>{d.month.slice(0, 4)}년 {m}월 가계부 결산</b>
            <span>
              {boot.household}
              {sticker && <img className="cf-sticker" src={sticker} alt="" />}
            </span>
          </div>
          <div className="cf-tiles">
            {(
              [
                ['수입', t.inc],
                ['지출', t.spending],
                ['저축·투자', t.sav + t.inv],
                ['남은 돈', t.left],
              ] as const
            ).map(([n, v]) => (
              <div key={n}>
                <small>{n === '남은 돈' ? leftLabel(v) : n}</small>
                <b className={v < 0 ? 'bad' : ''}>
                  <M k={`tile:${n}`}>{won(n === '남은 돈' ? Math.abs(v) : v)}</M>
                </b>
              </div>
            ))}
            <div>
              <small>저축률</small>
              <b>
                <M k="tile:저축률">{t.saveRate === null ? '-' : `${(t.saveRate * 100).toFixed(1)}%`}</M>
              </b>
            </div>
          </div>
          {/* 지난달 다짐 결과 + 이번 달 무지출 달력을 한 줄에 나란히 */}
          {(d.pledges.length > 0 || (withNs && boot.nospendCal !== false)) && (
            <div className="cf-plrow">
              {d.pledges.length > 0 && <CafePledges title={`${Number(d.prev.slice(5))}월 다짐 결과`} list={d.pledges} boot={boot} result />}
              {withNs && boot.nospendCal !== false && <NoSpendMini month={d.month} onError={onError} />}
            </div>
          )}
          {section('var')}
          {section('fix')}
          {section('inc')}
          {section('sav')}
          {d.nextPledges.length > 0 && <CafePledges title={`${Number(d.next.slice(5))}월 다짐`} list={d.nextPledges} boot={boot} />}
          <div className="cf-foot">단위 원</div>
        </div>
      </div>
    </div>
  );
}

// 피드백 안: 이 구역의 다음 달 다짐 (변동·고정은 금액 다짐도, 수입·저축은 글 다짐)
function SectionPledges({ grp, d, boot, onError, reload }: { grp: 'var' | 'fix' | 'inc' | 'sav'; d: ReviewData; boot: Boot; onError: (e: unknown) => void; reload: () => void }) {
  const spend = grp === 'var' || grp === 'fix';
  const mine = d.nextPledges.filter((p) => p.section === grp || (!p.section && p.kind === 'num' && boot.categories.find((c) => c.id === p.categoryId)?.grp === grp));
  const cats = boot.categories.filter((c) => c.grp === grp && !c.hidden);
  const [kind, setKind] = useState<'num' | 'text'>('text');
  const [cid, setCid] = useState('');
  const [amt, setAmt] = useState('');
  const [body, setBody] = useState('');
  const m = Number(d.next.slice(5));
  const catName = (id: string | null) => boot.categories.find((c) => c.id === id)?.name ?? '';
  async function add() {
    try {
      await api('/pledge', { month: d.next, section: grp, kind, categoryId: cid || cats[0]?.id, limitAmount: parseAmount(amt), body });
      setAmt('');
      setBody('');
      reload();
    } catch (e) {
      onError(e);
    }
  }
  async function del(id: string) {
    try {
      await api(`/pledge/${id}/delete`, {});
      reload();
    } catch (e) {
      onError(e);
    }
  }
  return (
    <div className="nbnotes">
      <div className="fbtitle">{m}월 다짐</div>
      {mine.map((p) => (
        <div key={p.id} className="row small" style={{ padding: '2px 0' }}>
          · {p.kind === 'num' ? <>{catName(p.categoryId)} <b>{won(p.limitAmount ?? 0)}원 이하</b> <span className="muted">(자동 판정)</span></> : p.body}
          <a className="click muted" onClick={() => del(p.id)}>
            ✕
          </a>
        </div>
      ))}
      <div className="row small" style={{ marginTop: 4 }}>
        {spend && (
          <span className="seg">
            <button className={kind === 'text' ? 'on' : ''} onClick={() => setKind('text')}>
              글
            </button>
            <button className={kind === 'num' ? 'on' : ''} onClick={() => setKind('num')}>
              금액
            </button>
          </span>
        )}
        {spend && kind === 'num' ? (
          <>
            <select className="text sm" value={cid || cats[0]?.id} onChange={(e) => setCid(e.target.value)}>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input className="text sm" style={{ width: 110, textAlign: 'right' }} inputMode="numeric" placeholder="금액" value={amt} onChange={(e) => { const v = parseAmount(e.target.value); setAmt(v === null ? '' : won(v)); }} onKeyDown={(e) => e.key === 'Enter' && add()} />
            <span>원 이하로</span>
          </>
        ) : (
          <input className="text sm" style={{ flex: 1, minWidth: 260 }} placeholder={grp === 'inc' ? '예: 부수입 통장 따로 모으기' : grp === 'sav' ? '예: 미국주식 매달 50만 꼭 넣기' : '예: 커피캡슐 대신 집에서 내려 마시기'} value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        )}
        <button className="btn sm main" onClick={add}>
          다짐 추가
        </button>
      </div>
    </div>
  );
}

// ---------- ⑥ 단기로드맵: 이 달까지의 실제 + 피드백 + 카페 이미지 2 ----------
function ShortStep({ month, boot, toast, onError, go }: { month: string; boot: Boot; toast: Toast; onError: (e: unknown) => void; go: (h: string) => void }) {
  const year = month.slice(0, 4);
  const [d, setD] = useState<ShortData | null>(null);
  useEffect(() => void api<ShortData>(`/roadmap/short?year=${year}`).then(setD).catch(onError), [year, onError]);
  if (!d) return <p className="muted">불러오는 중…</p>;
  const upto = Math.min(Number(month.slice(5)), uptoOf(year, boot.today) || 12);
  return (
    <>
      <p className="muted small">
        {Number(month.slice(5))}월까지의 실제예요. 계획(월 저축 예산)·올해 목표는{' '}
        <a className="click" onClick={() => go(`#/roadmap?tab=short&year=${year}`)}>
          로드맵 메뉴
        </a>
        에서 고쳐요.
      </p>
      <ShortImage d={d} upto={upto} boot={boot} toast={toast} onError={onError} />
      <Feedback required={false} month={month} section="short" label="단기로드맵" value={d.notes[month] ?? ''} onSaved={(v) => setD({ ...d, notes: { ...d.notes, [month]: v } })} onError={onError} />
    </>
  );
}

// 카페 이미지 다짐: 구역 이름 칸 + 다짐 줄 (한 줄에 하나씩, 왼쪽 맞춤)
function CafePledges({ title, list, boot, result = false }: { title: string; list: Judged[]; boot: Boot; result?: boolean }) {
  const names: [string, string][] = [
    ['var', '변동지출'],
    ['fix', '고정지출'],
    ['inc', '수입'],
    ['sav', '저축·투자'],
    ['', '기타'],
  ];
  const catOf = (id: string | null) => boot.categories.find((c) => c.id === id);
  const secOf = (p: Judged) => {
    if (p.section) return p.section;
    const g = catOf(p.categoryId)?.grp;
    return p.kind === 'num' && g ? (g === 'inv' ? 'sav' : g) : '';
  };
  return (
    <div className="cf-pl">
      <div className="cf-plt">{title}</div>
      {names.map(([key, name]) => {
        const these = list.filter((p) => secOf(p) === key);
        if (!these.length) return null;
        return (
          <div key={key} className="cf-plrow">
            <span className="cf-plsec">{name}</span>
            <div>
              {these.map((p) => {
                const st = p.kind === 'num' ? p.auto : p.result;
                return (
                  <div key={p.id}>
                    · {p.kind === 'num' ? `${catOf(p.categoryId)?.name ?? ''} ${won(p.limitAmount ?? 0)}원 이하` : p.body}
                    {result && <em className={st === 'kept' ? 'good' : st === 'missed' ? 'bad' : 'muted'}> {st === 'kept' ? '지킴' : st === 'missed' ? '못 지킴' : '—'}</em>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// 다음 달 예산 계산: 수입 − 고정 − 변동 = 목표 저축 (각 탭의 '다음 달 예산' 칸을 고치면 바로 다시 계산)
function NextPlanBar({ d, boot, step }: { d: ReviewData; boot: Boot; step: 'var' | 'fix' | 'inc' | 'sav' }) {
  const sum = (gs: string[]) => boot.categories.filter((c) => gs.includes(c.grp) && (!c.hidden || c.id in d.nextBudgets)).reduce((n, c) => n + (d.nextBudgets[c.id] ?? c.budget), 0);
  const inc = sum(['inc']);
  const fix = sum(['fix']);
  const vr = sum(['var']);
  const goal = inc - fix - vr;
  const sav = sum(['sav', 'inv']);
  const left = goal - sav;
  const m = Number(d.next.slice(5));
  const T = ({ k, name, v }: { k: string; name: string; v: number }) => (
    <span className={`np-term ${step === k ? 'on' : ''}`}>
      <small>{name}</small>
      <b>{won(v)}</b>
    </span>
  );
  return (
    <div className="card nextplan">
      <span className="np-title">{m}월 예산</span>
      <T k="inc" name="수입" v={inc} />
      <span className="np-op">−</span>
      <T k="fix" name="고정지출" v={fix} />
      <span className="np-op">−</span>
      <T k="var" name="변동지출" v={vr} />
      <span className="np-op">=</span>
      <span className="np-term goal">
        <small>목표 저축</small>
        <b className={goal < 0 ? 'bad' : ''}>{won(goal)}</b>
      </span>
      <span className="spacer" />
      <span className={`np-term ${step === 'sav' ? 'on' : ''}`}>
        <small>저축·투자 계획</small>
        <b>{won(sav)}</b>
      </span>
      <span className={`np-left ${left < 0 ? 'bad' : left > 0 ? 'warn' : 'good'}`}>{left === 0 ? '딱 맞음' : left > 0 ? `${won(left)}원 남음 — 저축 계획에 더 넣을 수 있어요` : `${won(-left)}원 모자람 — 저축 계획을 줄이거나 지출 예산을 줄여요`}</span>
    </div>
  );
}

// ---------- ⑦ 중장기로드맵: 그달 버전 저장 + 지난 버전 비교 + 피드백 + 카페 이미지 3 ----------
function LongStep({ month, boot, toast, onError, go }: { month: string; boot: Boot; toast: Toast; onError: (e: unknown) => void; go: (h: string) => void }) {
  const year = month.slice(0, 4);
  const [d, setD] = useState<LongData | null>(null);
  const load = useCallback(() => api<LongData>(`/roadmap/long?year=${year}`).then(setD).catch(onError), [year, onError]);
  useEffect(() => void load(), [load]);
  if (!d) return <p className="muted">불러오는 중…</p>;
  if (!d.plan)
    return (
      <div className="card">
        <p>
          {year} 로드맵이 아직 없어요.{' '}
          <a className="click" onClick={() => go(`#/roadmap?tab=long&year=${year}`)}>
            로드맵 메뉴에서 만들기 →
          </a>
        </p>
      </div>
    );
  const m = Number(month.slice(5));
  const has = d.versions.some((v) => v.month === month);
  async function save() {
    if (has && !confirm(`${m}월 버전이 이미 있어요. 지금 로드맵으로 덮어쓸까요?`)) return;
    try {
      setD(await api<LongData>('/roadmap/long/version', { year, month }));
      toast(`${m}월 버전을 저장했어요`);
    } catch (e) {
      onError(e);
    }
  }
  return (
    <>
      <div className="card row">
        <span>
          수익률·위기 연도·저축액·인생 계획은{' '}
          <a className="click" onClick={() => go(`#/roadmap?tab=long&year=${year}`)}>
            로드맵 메뉴
          </a>
          에서 고치고, 다 고쳤으면 여기서 {m}월 버전으로 저장해요.
        </span>
        <span className="spacer" />
        <span className="muted small">{has ? `${m}월 버전 저장됨` : '아직 저장 안 함'}</span>
        <button className="btn main" onClick={save}>
          {m}월 버전 {has ? '다시 ' : ''}저장
        </button>
      </div>
      <LongImageFor d={d} month={month} household={boot.household} toast={toast} onError={onError} />
      <Feedback required={false} month={month} section="long" label="중장기로드맵" value={d.feedback[month] ?? ''} onSaved={(v) => setD({ ...d, feedback: { ...d.feedback, [month]: v } })} onError={onError} />
    </>
  );
}

// ---------- ⑧ 카페 이미지: 결산 · 단기로드맵 · 중장기로드맵 세 장 + 한꺼번에 저장 ----------
function AllCafeImages({ d, boot, filled, toast, onError, month }: { d: ReviewData; boot: Boot; filled: (k: string) => boolean; toast: Toast; onError: (e: unknown) => void; month: string }) {
  const box = useRef<HTMLDivElement>(null);
  const year = month.slice(0, 4);
  const [sd, setSd] = useState<ShortData | null>(null);
  const [ld, setLd] = useState<LongData | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<ShortData>(`/roadmap/short?year=${year}`).then(setSd).catch(onError);
    api<LongData>(`/roadmap/long?year=${year}`).then(setLd).catch(onError);
  }, [year, onError]);
  const upto = Math.min(Number(month.slice(5)), uptoOf(year, boot.today) || 12);
  const names = ['① 가계부 결산', '② 단기로드맵', '③ 중장기로드맵'];
  async function saveAll() {
    const els = [...(box.current?.querySelectorAll<HTMLElement>('.cf') ?? [])];
    if (!els.length) return;
    setBusy(true);
    try {
      for (let i = 0; i < els.length; i++) {
        const url = await toPng(els[i], { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true });
        const a = document.createElement('a');
        a.href = url;
        a.download = `${month} ${names[i] ?? i + 1}.png`;
        a.click();
        await new Promise((r) => setTimeout(r, 400)); // 브라우저가 여러 파일을 차례로 받게
      }
      toast(`${els.length}장을 다운로드 폴더에 저장했어요 — 카페 글쓰기 '사진'에서 한꺼번에 골라 올리세요`);
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <div className="card row" style={{ background: 'var(--tint)' }}>
        <b>카페에 올릴 세 장</b>
        <span className="muted small">결산 · 단기로드맵 · 중장기로드맵 — 아래 미리보기 그대로 저장돼요 (각 이미지의 넓게/좁게·금액 가리기도 그대로)</span>
        <span className="spacer" />
        <button className="btn main" disabled={busy} onClick={saveAll}>
          {busy ? '저장 중…' : '세 장 한꺼번에 저장'}
        </button>
      </div>
      {ld && !ld.versions.some((v) => v.month === month) && ld.plan && <p className="warn small">{Number(month.slice(5))}월 중장기로드맵 버전을 아직 저장하지 않았어요 — ⑦탭에서 저장해 두면 다음 달에 비교돼요.</p>}
      <div ref={box}>
        <CafeImage d={d} boot={boot} filled={filled} toast={toast} onError={onError} />
        {sd && <ShortImage d={sd} upto={upto} boot={boot} toast={toast} onError={onError} />}
        {ld?.plan && <LongImageFor d={ld} month={month} household={boot.household} toast={toast} onError={onError} />}
      </div>
    </div>
  );
}

// 머니노트 세부 항목별 예산 ↔ 실제: 거래 내역 이름이 세부 항목 이름과 같으면(띄어쓰기 무시) 그 항목으로 셈
const normTitle = (t: string) => t.replace(/\s+/g, '');
function itemPlans(notes: { title: string; amount: number }[]) {
  const m = new Map<string, { title: string; plan: number }>();
  for (const n of notes) {
    const k = normTitle(n.title);
    const r = m.get(k) ?? { title: n.title.trim(), plan: 0 };
    r.plan += n.amount;
    m.set(k, r);
  }
  return m;
}
function ItemVerdict({ plan, actual }: { plan: number; actual: number }) {
  const d = actual - plan;
  if (d === 0) return <span className="ic-tag save">딱 맞음</span>;
  return (
    <span className={`ic-tag ${d > 0 ? 'over' : 'save'}`}>
      {won(Math.abs(d))}원 {rateText(plan, actual)}
    </span>
  );
}
