// 표 안에서 바로 입력하는 줄 (노션의 "새 줄"처럼). Enter나 [추가]를 누르면 저장되고 빈 줄이 다시 생긴다.
import { useRef, useState } from 'react';
import { parseAmount, won } from '../shared/rules';
import { isSpending, type Group } from '../shared/types';
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

export function TxRow({ boot, onSaved, onError }: { boot: Boot; onSaved: () => void; onError: (e: unknown) => void }) {
  const [date, setDate] = useState(boot.today);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<Kind>('var');
  const [categoryId, setCategoryId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  const cats = boot.categories.filter((c) => c.grp === kind && !c.hidden);
  const accounts = boot.accounts.filter((a) => !a.hidden);
  // 칸은 항상 같은 자리: [결제·출금] [입금]. 대분류에 안 맞는 칸은 흐리게 막아 둔다.
  const fromOn = kind !== 'inc';
  const toOn = !isSpending(kind);
  const accSelect = (value: string, set: (v: string) => void, on: boolean, need: boolean) => (
    <select className={`cell ${on ? '' : 'off'}`} disabled={!on} value={on ? value : ''} onChange={(e) => set(e.target.value)}>
      <option value="">{on ? (need ? '골라 주세요' : '선택') : '—'}</option>
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </select>
  );

  async function save() {
    const n = parseAmount(amount);
    if (!n) return onError(new Error('금액을 넣어 주세요.'));
    if (kind !== 'transfer' && !categoryId) return onError(new Error('카테고리를 골라 주세요.'));
    setBusy(true);
    try {
      await api('/tx', {
        date,
        title,
        amount: n,
        categoryId: kind === 'transfer' ? null : categoryId,
        fromAccount: fromOn ? from || null : null,
        toAccount: toOn ? to || null : null,
        memo,
      });
      // 날짜·대분류·카테고리·통장은 그대로 두고 내역·금액만 비운다 (같은 카드로 여러 줄 넣기 편하게)
      setTitle('');
      setAmount('');
      setMemo('');
      onSaved();
      titleRef.current?.focus();
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  }
  const enter = (e: React.KeyboardEvent) => e.key === 'Enter' && !busy && save();
  const suggest = useItemSuggest(boot, kind === 'transfer' ? null : categoryId || null, date);

  return (
    <>
    <tr className="newrow" onKeyDown={enter}>
      <td>
        <DateInput className="cell" value={date} onChange={setDate} />
      </td>
      <td>
        <input ref={titleRef} className="cell" placeholder="내역" value={title} onChange={(e) => setTitle(e.target.value)} />
      </td>
      <td>
        <div className="cellpair">
          <select
            className="cell"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as Kind);
              setCategoryId('');
            }}
          >
            {KINDS.map((k) => (
              <option key={k.key} value={k.key}>
                {k.name}
              </option>
            ))}
          </select>
          <select className={`cell ${kind === 'transfer' ? 'off' : ''}`} disabled={kind === 'transfer'} value={kind === 'transfer' ? '' : categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">{kind === 'transfer' ? '이체 (카테고리 없음)' : '카테고리'}</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </td>
      <td>{accSelect(from, setFrom, fromOn, kind !== 'inc')}</td>
      <td>{accSelect(to, setTo, toOn, kind === 'inc' || kind === 'transfer')}</td>
      <td className="r">
        <input
          className="cell money"
          inputMode="numeric"
          placeholder="금액"
          value={amount}
          onChange={(e) => {
            const n = parseAmount(e.target.value);
            setAmount(n === null ? '' : won(n));
          }}
        />
      </td>
      <td>
        <input className="cell" placeholder="메모" value={memo} onChange={(e) => setMemo(e.target.value)} />
      </td>
      <td>
        <button className="btn sm main" disabled={busy} onClick={save}>
          추가
        </button>
      </td>
    </tr>
    {suggest.length > 0 && (
      <tr className="newrow">
        <td />
        <td colSpan={8}>
          <ItemChips titles={suggest} current={title} onPick={(t) => (setTitle(t), titleRef.current?.focus())} />
        </td>
      </tr>
    )}
    </>
  );
}
