// 설정 › 노션에서 가져오기: 노션 가계부 내보내기(zip 또는 csv)를 이 브라우저에서 읽어 가계부에 넣는다.
import { unzipSync, strFromU8 } from 'fflate';
import { useState } from 'react';
import { buildPlan, type NotionPlan } from '../shared/notionImport';
import { nextMonth, monthOf } from '../shared/dates';
import { won } from '../shared/rules';
import { api } from './api';

type F = { name: string; text: string };

// zip 안의 이름이 옛 방식(cp437)으로 들어 있어도 글자만 보면 되므로 이름은 그대로, 안쪽 zip은 다시 푼다
function fromZip(buf: Uint8Array, out: F[], depth = 0) {
  if (depth > 3) return;
  const files = unzipSync(buf);
  for (const [name, data] of Object.entries(files)) {
    const low = name.toLowerCase();
    if (low.endsWith('.zip')) fromZip(data, out, depth + 1);
    else if (low.endsWith('.csv')) out.push({ name, text: strFromU8(data) });
  }
}

export function NotionImport({ onDone, onError }: { onDone: () => void; onError: (e: unknown) => void }) {
  const [plan, setPlan] = useState<NotionPlan | null>(null);
  const [reading, setReading] = useState(false);
  const [hideUnused, setHideUnused] = useState(true);
  const [progress, setProgress] = useState<string>('');
  const [already, setAlready] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function read(list: FileList | null) {
    if (!list?.length) return;
    setReading(true);
    setPlan(null);
    setDone(false);
    setAlready(null);
    try {
      const files: F[] = [];
      for (const f of Array.from(list)) {
        const buf = new Uint8Array(await f.arrayBuffer());
        if (f.name.toLowerCase().endsWith('.zip')) fromZip(buf, files);
        else files.push({ name: f.name, text: new TextDecoder().decode(buf) });
      }
      const p = buildPlan(files);
      if (!p.tx.length && !p.categories.length) throw new Error('노션 가계부 표를 찾지 못했어요. 2026 가계부 페이지 전체를 "Markdown & CSV, 하위 페이지 포함"으로 내보낸 파일인지 확인해 주세요.');
      setPlan(p);
    } catch (e) {
      onError(e);
    } finally {
      setReading(false);
    }
  }

  async function run(replace: boolean) {
    if (!plan) return;
    try {
      setProgress('통장·카테고리·예산 넣는 중…');
      // 고정지출 목록의 나간 통장 = 같은 이름 거래에서 가장 많이 쓴 통장
      const fromOf = (title: string) => {
        const cnt = new Map<string, number>();
        for (const t of plan.tx) if (t.title === title && t.from) cnt.set(t.from, (cnt.get(t.from) ?? 0) + 1);
        return [...cnt.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
      };
      const lastMonth = plan.tx.reduce((m, t) => (t.date > m ? t.date : m), '').slice(0, 7) || monthOf(new Date().toISOString().slice(0, 10));
      const r = await api<{ ok?: boolean; already?: string }>('/import/notion/setup', {
        accounts: plan.accounts,
        categories: plan.categories,
        budgets: plan.budgets,
        notes: plan.notes,
        fixed: plan.fixed.map((f) => ({ ...f, from: fromOf(f.title) })),
        fixedStart: nextMonth(lastMonth),
        hideUnused,
        replace,
      });
      if (r.already) {
        setAlready(r.already);
        setProgress('');
        return;
      }
      const step = 250;
      for (let i = 0; i < plan.tx.length; i += step) {
        setProgress(`거래 넣는 중… ${Math.min(i + step, plan.tx.length).toLocaleString()} / ${plan.tx.length.toLocaleString()}건`);
        await api('/import/notion/tx', { tx: plan.tx.slice(i, i + step) });
      }
      setProgress('');
      setAlready(null);
      setDone(true);
      onDone();
    } catch (e) {
      setProgress('');
      onError(e);
    }
  }

  const range = plan?.tx.length ? `${plan.tx.reduce((m, t) => (t.date < m ? t.date : m), '9999')} ~ ${plan.tx.reduce((m, t) => (t.date > m ? t.date : m), '')}` : '';
  const balances = plan
    ? plan.accounts.map((a) => {
        let b = a.start;
        for (const t of plan.tx) {
          if (t.from === a.name) b -= t.amount;
          if (t.to === a.name) b += t.amount;
        }
        return { name: a.name, b };
      })
    : [];

  return (
    <div className="card col">
      <h3>노션에서 가져오기</h3>
      <p className="muted small">
        노션 가계부를 쓰셨다면 거래·통장·카테고리·예산·머니플랜·고정지출 목록을 한 번에 옮길 수 있어요. 파일은 이 화면 안에서만 읽고, 내 가계부에만 들어가요.
      </p>
      <ol className="small notion-steps">
        <li>노션에서 <b>가계부 페이지</b>(예: 2026 가계부)를 열고 오른쪽 위 <b>···</b> → <b>내보내기</b></li>
        <li>형식 <b>Markdown &amp; CSV</b>, <b>하위 페이지 포함</b> 켜기 → 내보내기</li>
        <li>메일로 온 링크에서 zip 파일을 받아 아래에 올리기 (압축 풀지 않아도 돼요)</li>
      </ol>
      <label className="btn" style={{ alignSelf: 'flex-start' }}>
        {reading ? '읽는 중…' : 'zip 파일 고르기'}
        <input type="file" accept=".zip,.csv" multiple hidden onChange={(e) => {
          read(e.target.files);
          e.target.value = ''; // 같은 파일을 다시 골라도 읽히게
        }} />
      </label>

      {plan && !done && (
        <div className="notion-plan">
          <b>이만큼 가져와요</b>
          <ul className="small">
            <li>거래 {plan.tx.length.toLocaleString()}건 {range && <span className="muted">({range})</span>}</li>
            <li>통장 {plan.accounts.length}개 · 카테고리 {plan.categories.length}개</li>
            <li>{plan.year}년 달별 예산 {plan.budgets.length}칸 · 머니노트 {plan.notes.length}개 · 고정지출 목록 {plan.fixed.length}개</li>
            {plan.skipped > 0 && <li className="muted">날짜나 금액이 비어 있는 줄 {plan.skipped}개는 빼요</li>}
          </ul>
          {balances.length > 0 && (
            <details className="small">
              <summary>가져온 뒤 통장 잔액 미리 보기 (노션 최종잔액과 같은지 확인해 보세요)</summary>
              <table className="mini">
                <tbody>
                  {balances.map((x) => (
                    <tr key={x.name}>
                      <td>{x.name}</td>
                      <td className={`num ${x.b < 0 ? 'bad' : ''}`}>{won(x.b)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
          <label className="small">
            <input type="checkbox" checked={hideUnused} onChange={(e) => setHideUnused(e.target.checked)} /> 처음 들어 있던 기본 카테고리 중 노션에 없는 것은 숨기기
          </label>
          {already ? (
            <div className="notion-again small">
              <p>
                <b>{already}에 이미 노션에서 가져왔어요.</b> 다시 가져오면 그때 가져온 거래·머니노트는 지우고 새로 넣어요. 손으로 적은 거래는 그대로 둬요.
              </p>
              <button className="btn main" onClick={() => run(true)} disabled={!!progress}>
                지우고 다시 가져오기
              </button>
              <button className="btn" onClick={() => setAlready(null)}>
                그만두기
              </button>
            </div>
          ) : (
            <button className="btn main" onClick={() => run(false)} disabled={!!progress} style={{ alignSelf: 'flex-start' }}>
              가져오기
            </button>
          )}
          {progress && <span className="muted small">{progress}</span>}
        </div>
      )}
      {done && <p className="good">다 가져왔어요! 거래 화면에서 통장 잔액이 노션과 같은지 확인해 보세요.</p>}
    </div>
  );
}
