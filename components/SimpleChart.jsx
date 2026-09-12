"use client";

const PADDING = { top: 10, right: 44, bottom: 24, left: 44 };
const WIDTH = 600;

function scale(domain, range) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  return (v) => r0 + ((v - d0) / span) * (r1 - r0);
}

function niceDomain(values) {
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const pad = (max - min) * 0.05;
  return [min - pad, max + pad];
}

function buildPath(data, xScale, yScale, xKey, yKey) {
  return data
    .map((d, i) => `${i === 0 ? "M" : "L"}${xScale(d[xKey]).toFixed(2)},${yScale(d[yKey]).toFixed(2)}`)
    .join(" ");
}

export function SimpleLineChart({
  data,
  xKey,
  height = 260,
  series,
  referenceLines = [],
  referenceDots = [],
  xTickCount = 6,
  yTickCount = 5,
  xFormat = (v) => v,
}) {
  const innerWidth = WIDTH - PADDING.left - PADDING.right;
  const innerHeight = height - PADDING.top - PADDING.bottom;

  const xValues = data.map((d) => d[xKey]);
  const xMin = Math.min(...xValues);
  const xMax = Math.max(...xValues);
  const xDomain = xMin === xMax ? [xMin - 1, xMax + 1] : [xMin, xMax];
  const xScale = scale(xDomain, [PADDING.left, PADDING.left + innerWidth]);

  const axes = {};
  for (const s of series) {
    const axisKey = s.axis || "left";
    if (!axes[axisKey]) {
      const vals = series
        .filter((x) => (x.axis || "left") === axisKey)
        .flatMap((x) => data.map((d) => d[x.key]));
      axes[axisKey] = { domain: s.domain || niceDomain(vals) };
    }
  }
  for (const r of referenceLines) {
    const axisKey = r.axis || "left";
    if (axes[axisKey]) {
      axes[axisKey].domain = niceDomain([...axes[axisKey].domain, r.value]);
    }
  }
  for (const key of Object.keys(axes)) {
    axes[key].scale = scale(axes[key].domain, [PADDING.top + innerHeight, PADDING.top]);
  }

  const xTicks = Array.from({ length: xTickCount }, (_, i) =>
    xDomain[0] + ((xDomain[1] - xDomain[0]) * i) / (xTickCount - 1)
  );
  const yTicksLeft = axes.left
    ? Array.from(
        { length: yTickCount },
        (_, i) => axes.left.domain[0] + ((axes.left.domain[1] - axes.left.domain[0]) * i) / (yTickCount - 1)
      )
    : [];
  const yTicksRight = axes.right
    ? Array.from(
        { length: yTickCount },
        (_, i) => axes.right.domain[0] + ((axes.right.domain[1] - axes.right.domain[0]) * i) / (yTickCount - 1)
      )
    : [];

  return (
    <svg viewBox={`0 0 ${WIDTH} ${height}`} style={{ width: "100%", height: "100%", display: "block" }}>
      {yTicksLeft.map((t, i) => (
        <line
          key={`grid-${i}`}
          x1={PADDING.left}
          x2={PADDING.left + innerWidth}
          y1={axes.left.scale(t)}
          y2={axes.left.scale(t)}
          stroke="#252b2f"
          strokeDasharray="2 4"
        />
      ))}

      {yTicksLeft.map((t, i) => (
        <text key={`yl-${i}`} x={PADDING.left - 6} y={axes.left.scale(t) + 3} fontSize="10" fill="#8b9198" textAnchor="end">
          {Number(t.toFixed(1))}
        </text>
      ))}
      {yTicksRight.map((t, i) => (
        <text
          key={`yr-${i}`}
          x={PADDING.left + innerWidth + 6}
          y={axes.right.scale(t) + 3}
          fontSize="10"
          fill="#8b9198"
          textAnchor="start"
        >
          {Number(t.toFixed(1))}
        </text>
      ))}
      {xTicks.map((t, i) => (
        <text key={`x-${i}`} x={xScale(t)} y={PADDING.top + innerHeight + 16} fontSize="10" fill="#8b9198" textAnchor="middle">
          {xFormat(Number(t.toFixed(1)))}
        </text>
      ))}

      {referenceLines.map((r, i) => {
        const s = axes[r.axis || "left"].scale;
        const y = s(r.value);
        return (
          <g key={`ref-${i}`}>
            <line x1={PADDING.left} x2={PADDING.left + innerWidth} y1={y} y2={y} stroke={r.color} strokeDasharray="4 4" />
            {r.label && (
              <text x={PADDING.left + innerWidth} y={y - 4} fontSize="10" fill={r.color} textAnchor="end">
                {r.label}
              </text>
            )}
          </g>
        );
      })}

      {series.map((s) => (
        <path
          key={s.key}
          d={buildPath(data, xScale, axes[s.axis || "left"].scale, xKey, s.key)}
          fill="none"
          stroke={s.color}
          strokeWidth={2}
        />
      ))}

      {referenceDots.map((d, i) => (
        <circle key={`dot-${i}`} cx={xScale(d.x)} cy={axes[d.axis || "left"].scale(d.y)} r={5} fill={d.color} />
      ))}

      <line x1={PADDING.left} x2={PADDING.left} y1={PADDING.top} y2={PADDING.top + innerHeight} stroke="#333a3f" />
      <line
        x1={PADDING.left}
        x2={PADDING.left + innerWidth}
        y1={PADDING.top + innerHeight}
        y2={PADDING.top + innerHeight}
        stroke="#333a3f"
      />
    </svg>
  );
}

export function ChartLegend({ items }) {
  return (
    <div className="flex gap-4 text-[12px] mt-1">
      {items.map((it) => (
        <div key={it.name} className="flex items-center gap-1.5">
          <span style={{ width: 10, height: 2, background: it.color, display: "inline-block" }} />
          <span className="text-ink-300">{it.name}</span>
        </div>
      ))}
    </div>
  );
}
