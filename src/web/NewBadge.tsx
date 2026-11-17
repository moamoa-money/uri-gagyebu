// 새 기능 표시: 이 기기에서 처음 본 날부터 이틀 동안만 'NEW' (업데이트를 늦게 받은 사람도 이틀은 보임)
const DAYS = 2;
export function NewBadge({ id }: { id: string }) {
  const key = `new-seen:${id}`;
  const now = Date.now();
  let first = Number(localStorage.getItem(key));
  if (!first) {
    first = now;
    try {
      localStorage.setItem(key, String(now));
    } catch {
      /* 저장 못 해도 그냥 보여 줌 */
    }
  }
  if (now - first > DAYS * 24 * 3600 * 1000) return null;
  return <span className="new-badge">NEW</span>;
}
