// 설정 › 노션 가져온 것 정리: 예전에 '노션에서 가져오기'를 한 가계부에만 보인다.
import { useState } from 'react';
import { api } from './api';

export function NotionCleanup({ date, onDone, onError }: { date: string; onDone: (removed: number) => void; onError: (e: unknown) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="card col">
      <h3>노션에서 가져온 거래 지우기</h3>
      <p className="small">
        {date}에 노션에서 가져온 <b>거래·머니노트·고정지출 목록</b>을 모두 지워요. <b>통장·카테고리·예산은 그대로</b> 남고, 손으로 적은 거래도 그대로예요.
      </p>
      <p className="muted small">지운 다음 통장 잔액이 맞지 않으면 통장·투자 화면에서 통장마다 '고치기' → 시작 잔액을 지금 잔액으로 넣어 주세요.</p>
      <button
        className="btn main"
        style={{ alignSelf: 'flex-start' }}
        disabled={busy}
        onClick={async () => {
          if (!confirm('노션에서 가져온 거래를 모두 지울까요? 되돌릴 수 없어요.')) return;
          setBusy(true);
          try {
            const r = await api<{ removed: number }>('/import/notion/clear', {});
            onDone(r.removed);
          } catch (e) {
            onError(e);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? '지우는 중…' : '가져온 거래 모두 지우기'}
      </button>
    </div>
  );
}
