import type { EquityPoint } from '@/types/calls';
import { kst } from '@/lib/calls/format';

// 자산 곡선(건당 1% 위험 복리, 시작 100). A 실선, B 점선, 최대낙폭 구간 음영. 외부 라이브러리 없이 SVG.
const W = 640;
const H = 240;
const PAD = { l: 40, r: 12, t: 12, b: 28 };

function series(pts: EquityPoint[]): { t: number; v: number }[] {
  const real = pts.filter((p) => p.t !== null) as { t: number; v: number }[];
  if (!real.length) return [];
  const t0 = real[0].t - 86400;
  return [{ t: t0, v: 1 }, ...real];
}

function maxDrawdown(pts: { t: number; v: number }[]): { from: number; to: number; dd: number } | null {
  let peakI = 0;
  let best: { from: number; to: number; dd: number } | null = null;
  for (let i = 0; i < pts.length; i++) {
    if (pts[i].v > pts[peakI].v) peakI = i;
    const dd = pts[i].v / pts[peakI].v - 1;
    if (dd < 0 && (!best || dd < best.dd)) best = { from: peakI, to: i, dd };
  }
  return best;
}

export default function EquityChart({ A, B }: { A: EquityPoint[]; B: EquityPoint[] }) {
  const a = series(A);
  const b = series(B);
  if (a.length < 2) {
    return <p className="text-sm text-muted-foreground">체결이 쌓이면 자산 곡선이 표시됩니다.</p>;
  }
  const all = [...a, ...b];
  const tMin = Math.min(...all.map((p) => p.t));
  const tMax = Math.max(...all.map((p) => p.t));
  const vMin = Math.min(...all.map((p) => p.v), 1) * 0.995;
  const vMax = Math.max(...all.map((p) => p.v), 1) * 1.005;
  const x = (t: number) => PAD.l + ((t - tMin) / Math.max(1, tMax - tMin)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - vMin) / Math.max(1e-9, vMax - vMin)) * (H - PAD.t - PAD.b);
  const path = (pts: { t: number; v: number }[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const dd = maxDrawdown(a);
  const ticks = [vMin, (vMin + vMax) / 2, vMax];
  const y100 = y(1);
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="자산 곡선">
        {dd && (
          <rect x={x(a[dd.from].t)} y={PAD.t} width={Math.max(2, x(a[dd.to].t) - x(a[dd.from].t))} height={H - PAD.t - PAD.b} className="fill-red-500/10" />
        )}
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="stroke-border" strokeWidth={1} />
            <text x={PAD.l - 4} y={y(v) + 4} textAnchor="end" className="fill-muted-foreground" fontSize={10}>
              {(v * 100).toFixed(1)}
            </text>
          </g>
        ))}
        <line x1={PAD.l} x2={W - PAD.r} y1={y100} y2={y100} className="stroke-muted-foreground/60" strokeDasharray="2 3" strokeWidth={1} />
        {b.length > 1 && <path d={path(b)} fill="none" className="stroke-muted-foreground" strokeWidth={1.5} strokeDasharray="5 4" />}
        <path d={path(a)} fill="none" className="stroke-primary" strokeWidth={2.2} />
        {a.slice(1).map((p) => (
          <circle key={`${p.t}-${p.v}`} cx={x(p.t)} cy={y(p.v)} r={2.5} className="fill-primary" />
        ))}
        <text x={PAD.l} y={H - 8} className="fill-muted-foreground" fontSize={10}>{kst(a[1].t, false)}</text>
        <text x={W - PAD.r} y={H - 8} textAnchor="end" className="fill-muted-foreground" fontSize={10}>{kst(a[a.length - 1].t, false)}</text>
      </svg>
      <figcaption className="mt-1 text-xs text-muted-foreground">
        실선 A안(제시 그대로) · 점선 B안(1차 목표 후 본절) · 붉은 음영 최대낙폭 구간
        {dd ? ` (${(dd.dd * 100).toFixed(1)}%)` : ''} · 시작 100, 건당 위험 1% 복리, 청산일 순
      </figcaption>
    </figure>
  );
}
