/** 연도 고르기: 제목의 연도를 누르면 세로 목록(작게, 스크롤)이 열리고, 누르면 바로 이동 */
import { useEffect, useRef, useState } from 'react';

export function YearPick({ year, onPick }: { year: string; onPick: (y: string) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  const y = Number(year);
  const now = new Date().getFullYear();
  const from = Math.min(y, now) - 10, to = Math.max(y, now) + 10;
  const list = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    // 지금 해가 목록 가운데 오게
    const on = list.current?.querySelector('.on') as HTMLElement | null;
    if (on && list.current) list.current.scrollTop = on.offsetTop - list.current.clientHeight / 2 + on.clientHeight / 2;
    const close = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <span className="yp" ref={box}>
      <button type="button" className="yp-btn" title="연도 고르기" onClick={() => setOpen(!open)}>
        {year}
      </button>
      {open && (
        <span className="yp-pop" ref={list}>
          {Array.from({ length: to - from + 1 }, (_, i) => from + i).map((v) => (
            <button key={v} type="button" className={`${v === y ? 'on' : ''} ${v === now ? 'now' : ''}`} onClick={() => (setOpen(false), onPick(String(v)))}>
              {v === y ? `✓ ${v}` : v}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
