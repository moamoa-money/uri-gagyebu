// 휴대폰 빠른 입력: 홈 화면 아이콘으로 열면 바로 이 화면 (#/quick)
// 금액(큰 숫자 키패드) → 내역 → 대분류·카테고리 → 통장 → 저장. 마지막에 고른 것은 기억.
import { useCallback, useEffect, useRef, useState } from 'react';
import { parseAmount, won } from '../shared/rules';
import { isSpending, type Group, type Tx } from '../shared/types';
import { api } from './api';
import { ItemChips, useItemSuggest } from './ItemChips';
import type { Boot, Toast, TxList } from './data';
import { Icon } from './Icon';
import { DateInput } from './DateInput';

type Kind = Group | 'transfer';
const KINDS: { key: Kind; name: string }[] = [
  { key: 'var', name: '변동지출' },
  { key: 'fix', name: '고정지출' },
  { key: 'inc', name: '수입' },
  { key: 'sav', name: '저축' },
  { key: 'inv', name: '투자' },
  { key: 'transfer', name: '이체' },
];
const mem = (k: string, d = '') => localStorage.getItem('gb_q_' + k) ?? d;
const keep = (k: string, v: string) => localStorage.setItem('gb_q_' + k, v);

export function Quick({ boot, onError, toast, go, embedded = false, onSaved }: { boot: Boot; onError: (e: unknown) => void; toast: Toast; go: (h: string) => void; embedded?: boolean; onSaved?: () => void }) {
  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<Kind>(() => (mem('kind', 'var') as Kind));
  const [categoryId, setCategoryId] = useState(() => mem('cat'));
  const [from, setFrom] = useState(() => mem('from'));
  const [to, setTo] = useState(() => mem('to'));
  const [date, setDate] = useState(boot.today);
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<Tx[]>([]);
  const amtRef = useRef<HTMLInputElement>(null);

  const cats = boot.categories.filter((c) => c.grp === kind && !c.hidden);
  const suggest = useItemSuggest(boot, kind === 'transfer' ? null : categoryId || null, date);
  const accounts = boot.accounts.filter((a) => !a.hidden);
  const fromOn = kind !== 'inc';
  const toOn = !isSpending(kind);
  const catName = (id: string | null) => boot.categories.find((c) => c.id === id)?.name ?? '이체';

  const loadRecent = useCallback(() => {
    api<TxList>(`/tx?from=${boot.today}&to=${boot.today}`).then((l) => setRecent(l.rows.slice(0, 8))).catch(onError);
  }, [boot.today, onError]);
  useEffect(() => void loadRecent(), [loadRecent]);
  useEffect(() => { if (!embedded) amtRef.current?.focus(); }, [embedded]); // 홈에 끼울 땐 키보드가 바로 안 뜨게
  // 대분류를 바꾸면 그 대분류의 첫 카테고리로
  useEffect(() => {
    if (kind !== 'transfer' && !cats.some((c) => c.id === categoryId)) setCategoryId(cats[0]?.id ?? '');
  }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    const n = parseAmount(amount);
    if (!n) return onError(new Error('금액을 넣어 주세요.'));
    if (fromOn && !from && kind !== 'transfer') return onError(new Error('어디서 나간 돈인지 통장·카드를 골라 주세요.'));
    if (toOn && !to) return onError(new Error('어디로 들어간 돈인지 통장을 골라 주세요.'));
    setBusy(true);
    try {
      await api('/tx', { date, title: title.trim() || catName(kind === 'transfer' ? null : categoryId), amount: n, categoryId: kind === 'transfer' ? null : categoryId || null, fromAccount: fromOn ? from || null : null, toAccount: toOn ? to || null : null, memo: '' });
      keep('kind', kind);
      keep('cat', categoryId);
      if (fromOn) keep('from', from);
      if (toOn) keep('to', to);
      toast(`${won(n)}원 적었어요`);
      setAmount('');
      setTitle('');
      setDate(boot.today);
      loadRecent();
      onSaved?.();
      if (!embedded) amtRef.current?.focus();
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`quick ${embedded ? 'embedded' : ''}`}>
      <div className="q-top">
        <b>빠른 입력</b>
        <span className="spacer" />
        <a className="click" onClick={() => go('#/tx')}>
          거래 전체 →
        </a>
      </div>

      <div className="q-amt">
        <input ref={amtRef} inputMode="numeric" placeholder="0" value={amount} onChange={(e) => { const v = parseAmount(e.target.value); setAmount(v === null ? '' : won(v)); }} />
        <span>원</span>
      </div>

      <input className="text q-title" placeholder="내역 (예: 쿠팡, 윤주부) — 비우면 카테고리 이름" value={title} onChange={(e) => setTitle(e.target.value)} />
      <ItemChips titles={suggest} current={title} onPick={setTitle} />

      <div className="q-kinds">
        {KINDS.map((k) => (
          <button key={k.key} className={`chip ${kind === k.key ? 'on' : ''}`} onClick={() => setKind(k.key)}>
            {k.name}
          </button>
        ))}
      </div>

      {kind !== 'transfer' && (
        <div className="q-cats">
          {cats.map((c) => (
            <button key={c.id} className={`q-cat ${categoryId === c.id ? 'on' : ''}`} onClick={() => setCategoryId(c.id)}>
              <Icon name={c.icon} size={20} />
              <span>{c.name}</span>
            </button>
          ))}
        </div>
      )}

      <div className="q-acc">
        {fromOn && (
          <label>
            <small>{isSpending(kind) ? '결제·출금' : '나간 통장'}</small>
            <select className="text" value={from} onChange={(e) => setFrom(e.target.value)}>
              <option value="">골라 주세요</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {toOn && (
          <label>
            <small>들어간 통장</small>
            <select className="text" value={to} onChange={(e) => setTo(e.target.value)}>
              <option value="">골라 주세요</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          <small>날짜</small>
          <DateInput value={date} onChange={setDate} />
        </label>
      </div>

      <button className="btn main q-save" disabled={busy || !parseAmount(amount)} onClick={save}>
        {busy ? '저장 중…' : '적기'}
      </button>

      {!embedded && recent.length > 0 && (
        <div className="q-recent">
          <div className="muted small">오늘 적은 것</div>
          {recent.map((t) => (
            <div key={t.id} className="q-row">
              <span>{t.title}</span>
              <span className="muted small">{catName(t.categoryId)}</span>
              <b>{won(t.amount)}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
