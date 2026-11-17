// 한 줄짜리 꺾은선 그래프 (SVG 직접 그림 — 외부 라이브러리 없음)
// 규칙(dataviz): 선 2px · 격자는 옅은 1px 실선 · 끝점에만 값 표시 · 마우스를 올리면 세로선이 가장 가까운 달에 붙고 값 풍선이 뜸
import { useEffect, useRef, useState } from 'react';

export interface Pt {
  label: string; // x축 글자 (예: '3월')
  value: number; // 원
}

const man = (n: number) => Math.round(n / 10000).toLocaleString('ko-KR'); // 만 원 단위

/** 보기 좋은 눈금 (만 원 단위로 1·2·5 × 10ⁿ) */
function ticks(min: number, max: number, count = 4): number[] {
  if (min === max) {
    const pad = Math.max(Math.abs(min) * 0.1, 100000);
    min -= pad;
    max += pad;
  }
  const raw = (max - min) / count;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 5, 10].map((k) => k * p).find((s) => s >= raw) ?? 10 * p;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(v);
  return out;
}

export function LineChart({ points, color, height = 240, valueText, axisText = man, endText = (n: number) => `${man(n)}만` }: { points: Pt[]; color: string; height?: number; valueText: (n: number) => string; axisText?: (n: number) => string; endText?: (n: number) => string }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(800);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  if (points.length === 0) return <p className="muted">아직 기록이 없어요.</p>;

  const padL = 64, padR = 96, padT = 14, padB = 28;
  const vals = points.map((p) => p.value);
  const ys = ticks(Math.min(...vals), Math.max(...vals));
  const yMin = ys[0], yMax = ys[ys.length - 1];
  const iw = Math.max(10, w - padL - padR), ih = height - padT - padB;
  const x = (i: number) => padL + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (v: number) => padT + (1 - (v - yMin) / (yMax - yMin || 1)) * ih;
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
  const last = points.length - 1;

  function move(e: React.PointerEvent<SVGRectElement>) {
    const r = (e.target as SVGRectElement).getBoundingClientRect();
    const px = e.clientX - r.left + padL;
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    setHover(best);
  }

  return (
    <div className="lc" ref={box} style={{ height }}>
      <svg width={w} height={height} role="img" aria-label={`${points[0].label}부터 ${points[last].label}까지 ${valueText(points[0].value)}에서 ${valueText(points[last].value)}`}>
        {ys.map((t) => (
          <g key={t}>
            <line x1={padL} x2={padL + iw} y1={y(t)} y2={y(t)} className="lc-grid" />
            <text x={padL - 8} y={y(t) + 4} textAnchor="end" className="lc-axis">
              {axisText(t)}
            </text>
          </g>
        ))}
        {points.map((p, i) => (
          <text key={p.label} x={x(i)} y={height - 8} textAnchor="middle" className="lc-axis">
            {p.label}
          </text>
        ))}
        <path d={d} fill="none" style={{ stroke: color }} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {/* 달마다 점 (흰 테두리로 선 위에서도 또렷하게) */}
        {points.map((p, i) => (
          <circle key={'pt' + i} cx={x(i)} cy={y(p.value)} r={5.5} style={{ fill: color }} stroke="#fff" strokeWidth={2} />
        ))}
        {/* 끝점 + 값 (선 색이 아니라 글자색으로) */}
        <circle cx={x(last)} cy={y(points[last].value)} r={4.5} style={{ fill: color }} stroke="#fff" strokeWidth={2} />
        <text x={x(last) + 10} y={y(points[last].value) + 4} className="lc-end">
          {endText(points[last].value)}
        </text>
        {hover !== null && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + ih} className="lc-cross" />
            <circle cx={x(hover)} cy={y(points[hover].value)} r={4.5} style={{ fill: color }} stroke="#fff" strokeWidth={2} />
          </g>
        )}
        <rect x={padL} y={padT} width={iw} height={ih} fill="transparent" onPointerMove={move} onPointerLeave={() => setHover(null)} />
      </svg>
      {hover !== null && (
        <div className="lc-tip" style={{ left: x(hover) + 160 > w ? x(hover) - 162 : x(hover) + 12, top: Math.min(Math.max(y(points[hover].value) - 30, 0), height - 70) }}>
          <b>{points[hover].label}</b>
          <div>{valueText(points[hover].value)}</div>
          {hover > 0 && (
            <div className="muted small">
              전달보다 {points[hover].value - points[hover - 1].value >= 0 ? '+' : ''}
              {valueText(points[hover].value - points[hover - 1].value)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
