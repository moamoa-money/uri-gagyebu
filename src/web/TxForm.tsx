// 거래 입력 (세로로 한 칸씩): 날짜 → 대분류 → 카테고리 → 금액 → 계좌 → 내역 → 메모
import { useState } from 'react';
import { parseAmount, won } from '../shared/rules';
import { isSpending, type Group, type Tx } from '../shared/types';
import { api } from './api';
import type { Boot } from './data';
import { DateInput } from './DateInput';
import { ItemChips, useItemSuggest } from './ItemChips';

type Kind = Group | 'transfer';
const KINDS: { key: Kind; name: string }[] = [
  { key: 'var', name: '변동지출' },
  { key: 'fix', name: '고정지출' },
  { key: 'inc', name: '수입' },
  { key: 'sav', name: '저축' },
  { key: 'inv', name: '투자' },
  { key: 'transfer', name: '이체' },
];

export function TxForm({ boot, tx, onDone, onCancel, onDelete, onError }: { boot: Boot; tx?: Tx | null; onDone: (t: Tx) => void; onCancel?: () => void; onDelete?: () => void; onError: (e: unknown) => void }) {
  const catOf = (id: string | null) => boot.categories.find((c) => c.id === id);
  const startKind: Kind = tx ? (tx.categoryId ? (catOf(tx.categoryId)?.grp ?? 'var') : 'transfer') : 'var';
  const [date, setDate] = useState(tx?.date ?? boot.today);
  const [kind, setKind] = useState<Kind>(startKind);
  const [categoryId, setCategoryId] = useState<string | null>(tx?.categoryId ?? null);
  const [amount, setAmount] = useState(tx ? won(tx.amount) : '');
  const [from, setFrom] = useState(tx?.fromAccount ?? '');
  const [to, setTo] = useState(tx?.toAccount ?? '');
  const [title, setTitle] = useState(tx?.title ?? '');
  const [memo, setMemo] = useState(tx?.memo ?? '');
  const [unnecessary, setUnnecessary] = useState(tx?.unnecessary ?? false);
  const [busy, setBusy] = useState(false);

  const cats = boot.categories.filter((c) => c.grp === kind && (!c.hidden || c.id === categoryId));
  const suggest = useItemSuggest(boot, kind === 'transfer' ? null : categoryId, date);
  const accounts = boot.accounts.filter((a) => !a.hidden || a.id === from || a.id === to);
  const needFrom = kind !== 'inc';
  const needTo = !isSpending(kind);

  async function save() {
    const n = parseAmount(amount);
    if (!n) return onError(new Error('금액을 넣어 주세요.'));
    if (kind !== 'transfer' && !categoryId) return onError(new Error('카테고리를 골라 주세요.'));
    setBusy(true);
    try {
      const t = await api<Tx>('/tx', {
        id: tx?.id,
        date,
        amount: n,
        categoryId: kind === 'transfer' ? null : categoryId,
        fromAccount: needFrom ? from || null : null,
        toAccount: needTo ? to || null : null,
        title,
        memo,
        unnecessary,
      });
      onDone(t);
      if (!tx) {
        setAmount('');
        setTitle('');
        setMemo('');
        setUnnecessary(false);
      }
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="vform">
      <label>날짜</label>
      <DateInput value={date} onChange={setDate} />

      <label>대분류</label>
      <select
        className="text"
        value={kind}
        onChange={(e) => {
          const k = e.target.value as Kind;
          setKind(k);
          if (catOf(categoryId)?.grp !== k) setCategoryId(null);
        }}
      >
        {KINDS.map((k) => (
          <option key={k.key} value={k.key}>
            {k.name}
          </option>
        ))}
      </select>

      <label>카테고리</label>
      <select className={`text ${kind === 'transfer' ? 'off' : ''}`} disabled={kind === 'transfer'} value={kind === 'transfer' ? '' : (categoryId ?? '')} onChange={(e) => setCategoryId(e.target.value || null)}>
        <option value="">{kind === 'transfer' ? '이체 (카테고리 없음)' : cats.length ? '골라 주세요' : '이 대분류에 카테고리가 없어요 (설정에서 추가)'}</option>
        {cats.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <label>금액</label>
      <div className="row">
        <input
          className="text money"
          inputMode="numeric"
          placeholder="0"
          value={amount}
          onChange={(e) => {
            const n = parseAmount(e.target.value);
            setAmount(n === null ? '' : won(n));
          }}
        />
        <span>원</span>
      </div>

      <label>결제·출금</label>
      <select className={`text ${needFrom ? '' : 'off'}`} disabled={!needFrom} value={needFrom ? from : ''} onChange={(e) => setFrom(e.target.value)}>
        <option value="">{needFrom ? '골라 주세요' : '— (수입은 입금만)'}</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} ({a.kind})
          </option>
        ))}
      </select>
      <label>입금</label>
      <select className={`text ${needTo ? '' : 'off'}`} disabled={!needTo} value={needTo ? to : ''} onChange={(e) => setTo(e.target.value)}>
        <option value="">{needTo ? (kind === 'sav' || kind === 'inv' ? '선택 (돈이 들어간 곳)' : '골라 주세요') : '— (지출은 결제·출금만)'}</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} ({a.kind})
          </option>
        ))}
      </select>

      <label>내역</label>
      <div>
        <input className="text" placeholder={kind === 'transfer' ? '예: 생활비 → 투자대기' : '예: 마트 장보기'} value={title} onChange={(e) => setTitle(e.target.value)} />
        <ItemChips titles={suggest} current={title} onPick={setTitle} />
      </div>

      <label>메모</label>
      <input className="text" placeholder="선택" value={memo} onChange={(e) => setMemo(e.target.value)} />

      {isSpending(kind) && (
        <>
          <label />
          <label className="check">
            <input type="checkbox" checked={unnecessary} onChange={(e) => setUnnecessary(e.target.checked)} /> 불필요한 지출이었음
          </label>
        </>
      )}

      <div className="row pop-actions">
        {onDelete && (
          <button className="btn sm danger" onClick={onDelete}>
            이 거래 지우기
          </button>
        )}
        <span className="spacer" />
        {onCancel && (
          <button className="btn" onClick={onCancel}>
            닫기
          </button>
        )}
        <button className="btn main" disabled={busy} onClick={save}>
          {tx ? '고치기' : '저장'}
        </button>
      </div>
    </div>
  );
}
