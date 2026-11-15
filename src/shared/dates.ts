// 날짜: 모두 한국 시간 기준 문자열 (YYYY-MM-DD, YYYY-MM)

export const kstToday = (now = Date.now()) => new Date(now + 9 * 3600 * 1000).toISOString().slice(0, 10);
export const monthOf = (date: string) => date.slice(0, 7);
export const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z'));
export const isMonth = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}
export const nextMonth = (m: string) => addMonths(m, 1);
export const prevMonth = (m: string) => addMonths(m, -1);

export function lastDay(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** 그 달의 n일 (말일보다 크면 말일) */
export function dayInMonth(month: string, day: number): string {
  return `${month}-${String(Math.min(Math.max(1, day), lastDay(month))).padStart(2, '0')}`;
}

const WD = ['일', '월', '화', '수', '목', '금', '토'];
export function shortDate(date: string): string {
  const d = new Date(date + 'T00:00:00Z');
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WD[d.getUTCDay()]})`;
}
/** 노션과 같은 주차: 1~7일 1주차, 8~14일 2주차 … 29일~말일 5주차 */
export const weekNo = (date: string) => Math.ceil(Number(date.slice(8, 10)) / 7);
export function weekRange(month: string, w: number): { from: string; to: string } {
  const d1 = (w - 1) * 7 + 1;
  const d2 = Math.min(w * 7, lastDay(month));
  const p = (d: number) => `${month}-${String(d).padStart(2, '0')}`;
  return { from: p(d1), to: w >= 5 ? p(lastDay(month)) : p(d2) };
}
export const monthLabel = (m: string) => `${m.slice(0, 4)}년 ${Number(m.slice(5))}월`;
