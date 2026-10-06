import { useState } from 'react';

// Small dependency-free SVG charts for the sales Analytics Dashboard.
// Palettes were checked with the dataviz validator (colour-blind separation, contrast):
export const PALETTE = {
  // categorical, fixed order — one slot per lead stage
  categorical: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
  // ordinal single-hue ramp, darkest = most urgent (Hot → Low)
  priority: ['#7a1a1d', '#b02f34', '#d9524f', '#ee8a82'],
  // reserved status colours — always shown with a text label
  status: { good: '#0ca30c', warning: '#fab219', critical: '#d03b3b' },
  bar: '#1baf7a',
  line: '#2a78d6',
};

function Tooltip({ tip }) {
  if (!tip) return null;
  return (
    <div className="viz-tip" style={{ left: tip.x, top: tip.y }} role="status">
      <b>{tip.title}</b>
      <span>{tip.body}</span>
    </div>
  );
}

const pct = (n, total) => (total ? `${Math.round((n / total) * 1000) / 10}%` : '0%');

// Donut with the total in the middle and a legend (label · count · share) underneath.
// data: [{ label, value, color }]
export function Donut({ data, size = 300, thickness = 50, centerLabel = 'Total' }) {
  const [tip, setTip] = useState(null);
  const [active, setActive] = useState(null);
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <div className="viz-empty">No data available</div>;
  const r = size / 2 - 6;
  const ri = r - thickness;
  const c = size / 2;

  let angle = -Math.PI / 2;
  const arcs = data
    .filter((d) => d.value > 0)
    .map((d) => {
      const sweep = (d.value / total) * Math.PI * 2;
      const a0 = angle;
      const a1 = angle + sweep;
      angle = a1;
      const large = sweep > Math.PI ? 1 : 0;
      const p = (rad, a) => [c + rad * Math.cos(a), c + rad * Math.sin(a)];
      // a full circle can't be drawn as one arc — split it in two
      const path =
        sweep >= Math.PI * 2 - 1e-6
          ? `M ${c} ${c - r} A ${r} ${r} 0 1 1 ${c} ${c + r} A ${r} ${r} 0 1 1 ${c} ${c - r} M ${c} ${c - ri} A ${ri} ${ri} 0 1 0 ${c} ${c + ri} A ${ri} ${ri} 0 1 0 ${c} ${c - ri} Z`
          : `M ${p(r, a0).join(' ')} A ${r} ${r} 0 ${large} 1 ${p(r, a1).join(' ')} L ${p(ri, a1).join(' ')} A ${ri} ${ri} 0 ${large} 0 ${p(ri, a0).join(' ')} Z`;
      return { ...d, path };
    });

  return (
    <div className="viz">
      <div className="viz-plot" style={{ width: size, height: size }} onMouseLeave={() => { setTip(null); setActive(null); }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${centerLabel} ${total}: ${data.map((d) => `${d.label} ${d.value}`).join(', ')}`}>
          {total === 0 && <circle cx={c} cy={c} r={r - thickness / 2} fill="none" stroke="#e5e7eb" strokeWidth={thickness} />}
          {arcs.map((a) => (
            <path
              key={a.label} d={a.path} fill={a.color} fillRule="evenodd"
              stroke="#fff" strokeWidth="2" strokeLinejoin="round"
              opacity={active && active !== a.label ? 0.45 : 1}
              onMouseMove={(e) => {
                const box = e.currentTarget.ownerSVGElement.getBoundingClientRect();
                setActive(a.label);
                setTip({ x: e.clientX - box.left + 12, y: e.clientY - box.top + 12, title: a.label, body: `${a.value} · ${pct(a.value, total)}` });
              }}
            />
          ))}
          <text x={c} y={c + 6} textAnchor="middle" className="viz-total">{total}</text>
          <text x={c} y={c + 34} textAnchor="middle" className="viz-total-label">{centerLabel}</text>
        </svg>
        <Tooltip tip={tip} />
      </div>
      <ul className="viz-legend">
        {data.map((d) => (
          <li key={d.label} onMouseEnter={() => setActive(d.label)} onMouseLeave={() => setActive(null)}>
            <i style={{ background: d.color }} />
            <span>{d.label}</span>
            <b>{d.value}</b>
            <em>{pct(d.value, total)}</em>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Axis top with 4 clean intervals: step is 1, 2, 5 or 10 × 10^k (never fractional — these are counts).
const niceMax = (v) => {
  const raw = Math.max(1, v / 4);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((x) => x >= raw);
  return Math.max(1, Math.ceil(step)) * 4;
};

// Vertical bars with the count on top of each bar. data: [{ label, value }]
export function BarChart({ data, height = 300, color = PALETTE.bar }) {
  const [tip, setTip] = useState(null);
  if (!data.length) return <div className="viz-empty">No data available</div>;
  const max = niceMax(Math.max(...data.map((d) => d.value)));
  const W = Math.max(520, data.length * 64);
  const pad = { l: 36, r: 10, t: 22, b: 64 };
  const ih = height - pad.t - pad.b;
  const slot = (W - pad.l - pad.r) / data.length;
  const bw = Math.min(36, slot * 0.6);
  const ticks = Array.from({ length: 5 }, (_, i) => (max / 4) * i);
  return (
    <div className="viz-plot wide" onMouseLeave={() => setTip(null)}>
      <svg viewBox={`0 0 ${W} ${height}`} width="100%" role="img" aria-label={data.map((d) => `${d.label} ${d.value}`).join(', ')}>
        {ticks.map((t) => {
          const y = pad.t + ih - (t / max) * ih;
          return (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y} y2={y} className="viz-grid" />
              <text x={pad.l - 8} y={y + 4} textAnchor="end" className="viz-axis">{Math.round(t)}</text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const h = (d.value / max) * ih;
          const x = pad.l + slot * i + (slot - bw) / 2;
          const y = pad.t + ih - h;
          return (
            <g key={d.label}>
              {/* generous hit target: the whole column */}
              <rect x={pad.l + slot * i} y={pad.t} width={slot} height={ih} fill="transparent"
                onMouseMove={(e) => {
                  const box = e.currentTarget.ownerSVGElement.getBoundingClientRect();
                  setTip({ x: e.clientX - box.left + 12, y: e.clientY - box.top - 10, title: d.label, body: `${d.value} ${d.value === 1 ? 'enquiry' : 'enquiries'}` });
                }} />
              {h > 0 && <path d={`M ${x} ${y + h} V ${y + 4} Q ${x} ${y} ${x + 4} ${y} H ${x + bw - 4} Q ${x + bw} ${y} ${x + bw} ${y + 4} V ${y + h} Z`} fill={color} pointerEvents="none" />}
              <text x={x + bw / 2} y={y - 6} textAnchor="middle" className="viz-value">{d.value}</text>
              <text x={x + bw / 2} y={pad.t + ih + 16} textAnchor="end" transform={`rotate(-35 ${x + bw / 2} ${pad.t + ih + 16})`} className="viz-axis">{d.label}</text>
            </g>
          );
        })}
      </svg>
      <Tooltip tip={tip} />
    </div>
  );
}

// Line over days with a hover crosshair. data: [{ label: '05 Oct', value }]
export function LineChart({ data, height = 300, color = PALETTE.line }) {
  const [hover, setHover] = useState(null);
  if (!data.length || data.every((d) => d.value === 0)) return <div className="viz-empty">No data available</div>;
  const max = niceMax(Math.max(...data.map((d) => d.value)));
  const W = 620;
  const pad = { l: 36, r: 16, t: 20, b: 40 };
  const iw = W - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const x = (i) => pad.l + (data.length === 1 ? iw / 2 : (iw * i) / (data.length - 1));
  const y = (v) => pad.t + ih - (v / max) * ih;
  const pts = data.map((d, i) => `${x(i)},${y(d.value)}`).join(' ');
  const ticks = Array.from({ length: 5 }, (_, i) => (max / 4) * i);
  const every = Math.ceil(data.length / 7);
  return (
    <div className="viz-plot wide" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${height}`} width="100%" role="img" aria-label={`Enquiries per day: ${data.map((d) => `${d.label} ${d.value}`).join(', ')}`}
        onMouseMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const sx = ((e.clientX - box.left) / box.width) * W;
          const i = Math.max(0, Math.min(data.length - 1, Math.round(((sx - pad.l) / iw) * (data.length - 1))));
          setHover({ i, px: (x(i) / W) * box.width, py: (y(data[i].value) / height) * box.height });
        }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="viz-grid" />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" className="viz-axis">{Math.round(t)}</text>
          </g>
        ))}
        {data.map((d, i) => (i % every === 0 || i === data.length - 1) && (
          <text key={d.label} x={x(i)} y={height - 14} textAnchor="middle" className="viz-axis">{d.label}</text>
        ))}
        <polygon points={`${x(0)},${y(0)} ${pts} ${x(data.length - 1)},${y(0)}`} fill={color} opacity="0.08" />
        <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {hover && (
          <g>
            <line x1={x(hover.i)} x2={x(hover.i)} y1={pad.t} y2={pad.t + ih} stroke="#9ca3af" strokeDasharray="3 3" />
            <circle cx={x(hover.i)} cy={y(data[hover.i].value)} r="5" fill={color} stroke="#fff" strokeWidth="2" />
          </g>
        )}
      </svg>
      {hover && <Tooltip tip={{ x: hover.px + 12, y: hover.py - 40, title: data[hover.i].label, body: `${data[hover.i].value} ${data[hover.i].value === 1 ? 'enquiry' : 'enquiries'}` }} />}
    </div>
  );
}
