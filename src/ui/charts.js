// Minimal, dependency-free SVG charts with hover tooltips.
// Colors come from CSS custom properties (--series-1 .. --series-8) so light/dark
// themes swap in one place. Text always uses text tokens, never series colors.

const NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}, style = {}) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  Object.assign(n.style, style);
  return n;
}

export const SERIES = (i) => `var(--series-${(i % 8) + 1})`;

let tipEl = null;
function tooltip() {
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.className = 'chart-tip';
    document.body.append(tipEl);
  }
  return tipEl;
}

/** rows: [{ color, label, value }] — value text leads, label follows. */
function showTip(evt, title, rows) {
  const t = tooltip();
  t.textContent = '';
  if (title) {
    const h = document.createElement('div');
    h.className = 'chart-tip-title';
    h.textContent = title;
    t.append(h);
  }
  for (const r of rows) {
    const row = document.createElement('div');
    row.className = 'chart-tip-row';
    if (r.color) {
      const key = document.createElement('span');
      key.className = 'chart-tip-key';
      key.style.background = r.color;
      row.append(key);
    }
    const v = document.createElement('b');
    v.textContent = r.value;
    row.append(v);
    if (r.label) {
      const l = document.createElement('span');
      l.textContent = ' ' + r.label;
      row.append(l);
    }
    t.append(row);
  }
  t.style.display = 'block';
  const pad = 14;
  const w = t.offsetWidth;
  const h = t.offsetHeight;
  let x = evt.clientX + pad;
  let y = evt.clientY + pad;
  if (x + w > window.innerWidth - 8) x = evt.clientX - w - pad;
  if (y + h > window.innerHeight - 8) y = evt.clientY - h - pad;
  t.style.left = `${x}px`;
  t.style.top = `${y}px`;
}

function hideTip() {
  if (tipEl) tipEl.style.display = 'none';
}

/** Nice round tick values covering [lo, hi]. */
export function niceTicks(lo, hi, count = 5) {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const span = hi - lo;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const norm = step0 / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const start = Math.floor(lo / step) * step;
  const out = [];
  for (let v = start; v <= hi + step * 0.5; v += step) out.push(+v.toFixed(10));
  return out;
}

const defaultFmt = (v) => {
  const a = Math.abs(v);
  if (a >= 10000) return `${(v / 1000).toFixed(a >= 100000 ? 0 : 1)}K`;
  if (a >= 100 || Number.isInteger(v)) return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return v.toLocaleString('en-US', { maximumFractionDigits: 2 });
};

/** Re-render on container resize. */
function mount(container, render) {
  container.classList.add('chart');
  const draw = () => {
    const w = Math.max(260, container.clientWidth || 600);
    container.textContent = '';
    render(w);
  };
  draw();
  if (container._ro) container._ro.disconnect();
  let last = container.clientWidth;
  container._ro = new ResizeObserver(() => {
    if (Math.abs(container.clientWidth - last) > 4) {
      last = container.clientWidth;
      draw();
    }
  });
  container._ro.observe(container);
}

function legend(container, items) {
  if (items.length < 2) return;
  const lg = document.createElement('div');
  lg.className = 'chart-legend';
  for (const it of items) {
    const s = document.createElement('span');
    s.className = 'chart-legend-item';
    const k = document.createElement('span');
    k.className = it.kind === 'line' ? 'lg-line' : it.kind === 'band' ? 'lg-band' : 'lg-rect';
    k.style.background = it.color;
    if (it.dash) k.classList.add('dash');
    s.append(k, document.createTextNode(it.label));
    lg.append(s);
  }
  container.append(lg);
}

function axes(svg, { W, H, m, xTicks, yTicks, xs, ys, xFmt, yFmt, xLabel, yLabel }) {
  const g = svgEl('g', { class: 'axes' });
  for (const t of yTicks) {
    const y = ys(t);
    g.append(svgEl('line', { x1: m.l, x2: W - m.r, y1: y, y2: y, class: 'grid' }));
    const lab = svgEl('text', { x: m.l - 6, y: y + 4, 'text-anchor': 'end', class: 'tick' });
    lab.textContent = yFmt(t);
    g.append(lab);
  }
  for (const t of xTicks) {
    const x = xs(t);
    const lab = svgEl('text', { x, y: H - m.b + 16, 'text-anchor': 'middle', class: 'tick' });
    lab.textContent = xFmt(t);
    g.append(lab);
  }
  g.append(svgEl('line', { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, class: 'baseline' }));
  if (xLabel) {
    const t = svgEl('text', { x: (m.l + W - m.r) / 2, y: H - 4, 'text-anchor': 'middle', class: 'axis-label' });
    t.textContent = xLabel;
    g.append(t);
  }
  if (yLabel) {
    const t = svgEl('text', { x: 12, y: (m.t + H - m.b) / 2, 'text-anchor': 'middle', class: 'axis-label', transform: `rotate(-90 12 ${(m.t + H - m.b) / 2})` });
    t.textContent = yLabel;
    g.append(t);
  }
  svg.append(g);
}

/**
 * Line chart.
 * opts.series: [{ name, values: number[] (x = index) | points: [x, y][], color?, dash?, width? }]
 * opts.band: { lo: number[], hi: number[], name, color }   shaded interval (x = index)
 * opts.paths: number[][]   faint background paths (e.g. simulated sessions)
 * opts.hlines: [{ y, label }]   reference lines
 */
export function lineChart(container, opts) {
  mount(container, (W) => {
    const H = opts.height || 260;
    const m = { l: 56, r: 16, t: 12, b: opts.xLabel ? 40 : 26 };
    const series = opts.series.map((s, i) => ({
      ...s,
      color: s.color || SERIES(i),
      pts: s.points || s.values.map((v, k) => [(opts.xOffset || 0) + k * (opts.xStep || 1), v]),
    }));
    const allPts = series.flatMap((s) => s.pts);
    let xs0 = allPts.map((p) => p[0]);
    let ys0 = allPts.map((p) => p[1]).filter(Number.isFinite);
    if (opts.band) ys0 = ys0.concat(opts.band.lo.filter(Number.isFinite), opts.band.hi.filter(Number.isFinite));
    if (opts.paths) for (const p of opts.paths) for (const v of p) ys0.push(v);
    if (opts.hlines) for (const h of opts.hlines) ys0.push(h.y);
    let yMin = opts.yMin ?? Math.min(...ys0);
    let yMax = opts.yMax ?? Math.max(...ys0);
    if (opts.includeZero) {
      yMin = Math.min(yMin, 0);
      yMax = Math.max(yMax, 0);
    }
    const yTicks = niceTicks(yMin, yMax, 5);
    yMin = Math.min(yMin, yTicks[0]);
    yMax = Math.max(yMax, yTicks[yTicks.length - 1]);
    const xMin = opts.xMin ?? Math.min(...xs0);
    const xMax = opts.xMax ?? Math.max(...xs0, xMin + 1);
    const xsc = (x) => m.l + ((x - xMin) / (xMax - xMin || 1)) * (W - m.l - m.r);
    const ysc = (y) => m.t + (1 - (y - yMin) / (yMax - yMin || 1)) * (H - m.t - m.b);
    const xFmt = opts.xFmt || defaultFmt;
    const yFmt = opts.yFmt || defaultFmt;
    const svg = svgEl('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.ariaLabel || 'line chart' });
    axes(svg, { W, H, m, xTicks: niceTicks(xMin, xMax, Math.max(3, Math.floor(W / 110))).filter((t) => t >= xMin && t <= xMax), yTicks, xs: xsc, ys: ysc, xFmt, yFmt, xLabel: opts.xLabel, yLabel: opts.yLabel });

    if (opts.hlines) {
      for (const h of opts.hlines) {
        const y = ysc(h.y);
        svg.append(svgEl('line', { x1: m.l, x2: W - m.r, y1: y, y2: y, class: 'refline' }));
        if (h.label) {
          const t = svgEl('text', { x: W - m.r - 4, y: y - 5, 'text-anchor': 'end', class: 'ref-label' });
          t.textContent = h.label;
          svg.append(t);
        }
      }
    }
    if (opts.paths) {
      const step = opts.xStep || 1;
      for (const p of opts.paths) {
        const d = p.map((v, k) => `${k ? 'L' : 'M'}${xsc((opts.xOffset || 0) + k * step).toFixed(1)},${ysc(v).toFixed(1)}`).join('');
        svg.append(svgEl('path', { d, class: 'faint-path' }));
      }
    }
    if (opts.band) {
      const { lo, hi } = opts.band;
      const step = opts.xStep || 1;
      const X = (k) => xsc((opts.xOffset || 0) + k * step);
      let d = '';
      for (let k = 0; k < hi.length; k++) d += `${k ? 'L' : 'M'}${X(k).toFixed(1)},${ysc(hi[k]).toFixed(1)}`;
      for (let k = lo.length - 1; k >= 0; k--) d += `L${X(k).toFixed(1)},${ysc(lo[k]).toFixed(1)}`;
      svg.append(svgEl('path', { d: d + 'Z', class: 'band' }, { fill: opts.band.color || SERIES(0) }));
    }
    for (const s of series) {
      const d = s.pts
        .filter((p) => Number.isFinite(p[1]))
        .map((p, k) => `${k ? 'L' : 'M'}${xsc(p[0]).toFixed(1)},${ysc(p[1]).toFixed(1)}`)
        .join('');
      svg.append(svgEl('path', { d, class: 'line' + (s.dash ? ' dash' : '') }, { stroke: s.color, strokeWidth: s.width || 2 }));
      const last = s.pts[s.pts.length - 1];
      if (last && Number.isFinite(last[1]) && opts.endDots !== false) {
        svg.append(svgEl('circle', { cx: xsc(last[0]), cy: ysc(last[1]), r: 4, class: 'dot' }, { fill: s.color }));
      }
    }

    // crosshair + tooltip
    const cross = svgEl('line', { y1: m.t, y2: H - m.b, class: 'crosshair', visibility: 'hidden' });
    svg.append(cross);
    const hit = svgEl('rect', { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: 'transparent' });
    svg.append(hit);
    const longest = series.reduce((a, s) => (s.pts.length > a.pts.length ? s : a), series[0]);
    hit.addEventListener('pointermove', (e) => {
      const rect = svg.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const xv = xMin + ((px - m.l) / (W - m.l - m.r)) * (xMax - xMin);
      let best = 0;
      let bd = Infinity;
      longest.pts.forEach((p, k) => {
        const d = Math.abs(p[0] - xv);
        if (d < bd) {
          bd = d;
          best = k;
        }
      });
      const xAt = longest.pts[best][0];
      cross.setAttribute('x1', xsc(xAt));
      cross.setAttribute('x2', xsc(xAt));
      cross.setAttribute('visibility', 'visible');
      const rows = series.map((s) => {
        const p = s.pts.reduce((a, q) => (Math.abs(q[0] - xAt) < Math.abs(a[0] - xAt) ? q : a), s.pts[0]);
        return { color: s.color, label: s.name, value: yFmt(p[1]) };
      });
      if (opts.band) {
        const k = Math.round((xAt - (opts.xOffset || 0)) / (opts.xStep || 1));
        if (opts.band.lo[k] !== undefined) rows.push({ label: opts.band.name || 'interval', value: `${yFmt(opts.band.lo[k])} – ${yFmt(opts.band.hi[k])}` });
      }
      showTip(e, `${opts.xName || 'x'}: ${xFmt(xAt)}`, rows);
    });
    hit.addEventListener('pointerleave', () => {
      cross.setAttribute('visibility', 'hidden');
      hideTip();
    });
    container.append(svg);
    legend(container, [
      ...series.filter((s) => s.name).map((s) => ({ label: s.name, color: s.color, kind: 'line', dash: s.dash })),
      ...(opts.band && opts.band.name ? [{ label: opts.band.name, color: opts.band.color || SERIES(0), kind: 'band' }] : []),
    ]);
  });
}

/**
 * Horizontal bar chart. items: [{ label, value, display?, color?, marker? }]
 * opts.max: scale maximum (default: max value). opts.groups: optional 2nd series values for comparison.
 */
export function barChart(container, items, opts = {}) {
  mount(container, (W) => {
    const series = opts.series || [{ name: opts.name || '', key: 'value', color: opts.color || SERIES(0) }];
    const rowH = opts.rowHeight || (series.length > 1 ? 30 : 24);
    const labelW = opts.labelWidth || Math.min(150, Math.max(70, ...items.map((i) => i.label.length * 7.2)));
    const valueW = opts.valueWidth || 64;
    const H = items.length * rowH + 8;
    const max = opts.max ?? Math.max(1e-12, ...items.flatMap((it) => series.map((s) => it[s.key] ?? 0)));
    const plotW = W - labelW - valueW - 8;
    const fmt = opts.fmt || defaultFmt;
    const svg = svgEl('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.ariaLabel || 'bar chart' });
    const barH = Math.min(series.length > 1 ? 10 : 14, (rowH - 8) / series.length);
    items.forEach((it, i) => {
      const y0 = 4 + i * rowH;
      const lab = svgEl('text', { x: labelW - 8, y: y0 + rowH / 2 + 4, 'text-anchor': 'end', class: 'bar-label' });
      lab.textContent = it.label;
      svg.append(lab);
      series.forEach((s, j) => {
        const v = it[s.key] ?? 0;
        const w = Math.max(v > 0 ? 2 : 0, (v / max) * plotW);
        const y = y0 + (rowH - series.length * barH - (series.length - 1) * 2) / 2 + j * (barH + 2);
        const r = Math.min(4, barH / 2, w / 2);
        // square at baseline, rounded at data end
        const d = `M${labelW},${y}h${Math.max(0, w - r)}a${r},${r} 0 0 1 ${r},${r}v${barH - 2 * r}a${r},${r} 0 0 1 ${-r},${r}h${-Math.max(0, w - r)}Z`;
        svg.append(svgEl('path', { d, class: 'bar' }, { fill: it.color && series.length === 1 ? it.color : s.color }));
      });
      if (it.marker !== undefined) {
        const x = labelW + (it.marker / max) * plotW;
        svg.append(svgEl('line', { x1: x, x2: x, y1: y0 + 2, y2: y0 + rowH - 2, class: 'bar-marker' }));
      }
      const vt = svgEl('text', { x: W - 4, y: y0 + rowH / 2 + 4, 'text-anchor': 'end', class: 'bar-value' });
      vt.textContent = it.display ?? series.map((s) => fmt(it[s.key] ?? 0)).join(' / ');
      svg.append(vt);
      const hit = svgEl('rect', { x: 0, y: y0, width: W, height: rowH, fill: 'transparent', class: 'bar-hit' });
      hit.addEventListener('pointermove', (e) =>
        showTip(
          e,
          it.label,
          series.map((s) => ({ color: it.color && series.length === 1 ? it.color : s.color, label: s.name, value: fmt(it[s.key] ?? 0) })).concat(it.tip ? [{ value: it.tip }] : []),
        ),
      );
      hit.addEventListener('pointerleave', hideTip);
      svg.append(hit);
    });
    container.append(svg);
    legend(container, series.filter((s) => s.name).map((s) => ({ label: s.name, color: s.color, kind: 'rect' })));
  });
}

/**
 * Histogram (vertical columns) with optional density overlay and markers.
 * opts: { counts, edges, width, curve?: (x)=>expectedCount, markers?: [{x,label}], xFmt, xLabel }
 */
export function histogramChart(container, opts) {
  mount(container, (W) => {
    const H = opts.height || 220;
    const m = { l: 48, r: 12, t: 12, b: opts.xLabel ? 40 : 26 };
    const { counts, edges, width } = opts;
    const lo = edges[0];
    const hi = edges[edges.length - 1] + width;
    let yMax = Math.max(...counts, 1);
    const curvePts = [];
    if (opts.curve) {
      for (let k = 0; k <= 120; k++) {
        const x = lo + ((hi - lo) * k) / 120;
        const y = opts.curve(x);
        curvePts.push([x, y]);
        yMax = Math.max(yMax, y);
      }
    }
    const yTicks = niceTicks(0, yMax, 4);
    yMax = yTicks[yTicks.length - 1];
    const xsc = (x) => m.l + ((x - lo) / (hi - lo)) * (W - m.l - m.r);
    const ysc = (y) => m.t + (1 - y / yMax) * (H - m.t - m.b);
    const xFmt = opts.xFmt || defaultFmt;
    const svg = svgEl('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.ariaLabel || 'histogram' });
    axes(svg, { W, H, m, xTicks: niceTicks(lo, hi, Math.max(3, Math.floor(W / 100))).filter((t) => t >= lo && t <= hi), yTicks, xs: xsc, ys: ysc, xFmt, yFmt: opts.yFmt || defaultFmt, xLabel: opts.xLabel });
    const colW = (W - m.l - m.r) / counts.length;
    counts.forEach((c, i) => {
      const x = m.l + i * colW + 1;
      const w = Math.max(1, colW - 2); // 2px surface gap between touching columns
      const y = ysc(c);
      const h = H - m.b - y;
      const r = Math.min(4, w / 2, h);
      if (c > 0) {
        const d = `M${x},${H - m.b}v${-(h - r)}a${r},${r} 0 0 1 ${r},${-r}h${w - 2 * r}a${r},${r} 0 0 1 ${r},${r}v${h - r}Z`;
        svg.append(svgEl('path', { d, class: 'bar' }, { fill: (opts.colorFor && opts.colorFor(edges[i] + width / 2)) || opts.color || SERIES(0) }));
      }
      const hit = svgEl('rect', { x: m.l + i * colW, y: m.t, width: colW, height: H - m.t - m.b, fill: 'transparent' });
      hit.addEventListener('pointermove', (e) =>
        showTip(e, `${xFmt(edges[i])} to ${xFmt(edges[i] + width)}`, [{ value: c.toLocaleString(), label: opts.unit || 'count' }]),
      );
      hit.addEventListener('pointerleave', hideTip);
      svg.append(hit);
    });
    if (curvePts.length) {
      const d = curvePts.map((p, k) => `${k ? 'L' : 'M'}${xsc(p[0]).toFixed(1)},${ysc(p[1]).toFixed(1)}`).join('');
      svg.append(svgEl('path', { d, class: 'line', style: 'pointer-events:none' }, { stroke: opts.curveColor || SERIES(1), strokeWidth: 2 }));
    }
    for (const mk of opts.markers || []) {
      const x = xsc(mk.x);
      svg.append(svgEl('line', { x1: x, x2: x, y1: m.t, y2: H - m.b, class: 'refline', style: 'pointer-events:none' }));
      const t = svgEl('text', { x: x + 4, y: m.t + 10, class: 'ref-label' });
      t.textContent = mk.label;
      svg.append(t);
    }
    container.append(svg);
    if (opts.legend) legend(container, opts.legend);
  });
}
