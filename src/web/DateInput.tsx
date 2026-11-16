// 날짜 고르기: 컴퓨터(마우스)에서는 큼직한 달력을 직접 띄우고, 휴대폰·패드(손가락)는 기기 달력이 커서 그대로 쓴다.
import { useEffect, useRef, useState } from 'react';

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const todayStr = () => {
  const t = new Date();
  return ymd(t.getFullYear(), t.getMonth() + 1, t.getDate());
};
const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

export function DateInput({ value, onChange, className = 'text', min, max }: { value: string; onChange: (v: string) => void; className?: string; min?: string; max?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const base = /^\d{4}-\d{2}/.test(value) ? value : todayStr();
  const [view, setView] = useState({ y: Number(base.slice(0, 4)), m: Number(base.slice(5, 7)) });
  const box = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const off = () => setOpen(false);
    window.addEventListener('scroll', off, true);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
      window.removeEventListener('scroll', off, true);
    };
  }, [open]);

  if (touch) return <input className={className} type="date" value={value} min={min} max={max} onChange={(e) => onChange(e.target.value)} />;

  const show = () => {
    const b = /^\d{4}-\d{2}/.test(value) ? value : todayStr();
    setView({ y: Number(b.slice(0, 4)), m: Number(b.slice(5, 7)) });
    // 표가 옆으로 밀리는 상자 안에 있어도 잘리지 않게 화면 기준(fixed)으로 띄운다
    const r = box.current?.getBoundingClientRect();
    if (r) {
      const W = 300, H = 340;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - W - 8));
      const top = r.bottom + 6 + H > window.innerHeight && r.top - 6 - H > 0 ? r.top - 6 - H : r.bottom + 6;
      setPos({ top, left });
    }
    setOpen((o) => !o);
  };
  const move = (k: number) => setView(({ y, m }) => ({ y: m + k > 12 ? y + 1 : m + k < 1 ? y - 1 : y, m: ((m + k + 11) % 12) + 1 }));
  const first = new Date(view.y, view.m - 1, 1).getDay();
  const days = new Date(view.y, view.m, 0).getDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const today = todayStr();
  const label = value ? `${value.slice(0, 4)}. ${Number(value.slice(5, 7))}. ${Number(value.slice(8, 10))}. (${WEEK[new Date(`${value}T00:00`).getDay()]})` : '날짜 고르기';
  const ok = (d: string) => (!min || d >= min) && (!max || d <= max);

  return (
    <span className="dpick" ref={box}>
      <button type="button" className={`${className} dpick-btn`} onClick={show}>
        {label}
      </button>
      {open && (
        <div className="dpick-pop" role="dialog" style={{ top: pos.top, left: pos.left }}>
          <div className="dpick-head">
            <button type="button" onClick={() => move(-1)} aria-label="지난달">
              ◀
            </button>
            <b>
              {view.y}년 {view.m}월
            </b>
            <button type="button" onClick={() => move(1)} aria-label="다음 달">
              ▶
            </button>
          </div>
          <div className="dpick-grid">
            {WEEK.map((w, i) => (
              <span key={w} className={`dpick-w ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}`}>
                {w}
              </span>
            ))}
            {cells.map((d, i) => {
              if (!d) return <span key={i} />;
              const s = ymd(view.y, view.m, d);
              return (
                <button
                  type="button"
                  key={i}
                  disabled={!ok(s)}
                  className={`dpick-d ${s === value ? 'on' : ''} ${s === today ? 'today' : ''} ${i % 7 === 0 ? 'sun' : i % 7 === 6 ? 'sat' : ''}`}
                  onClick={() => {
                    onChange(s);
                    setOpen(false);
                  }}
                >
                  {d}
                </button>
              );
            })}
          </div>
          <div className="dpick-foot">
            <button
              type="button"
              disabled={!ok(today)}
              onClick={() => {
                onChange(today);
                setOpen(false);
              }}
            >
              오늘
            </button>
          </div>
        </div>
      )}
    </span>
  );
}
