/**
 * Edge-to-edge MUI X charts for the foot of a dashboard stat tile. Lines are coloured by value: green above a
 * threshold, red below (Adapted from MUI X (MIT), AreaChartFillByValue). Bars take green/red from a piecewise colour
 * map at zero. MUI draws the crosshair and hover mark; the tooltip is the app's own, placed from the hovered point's
 * coordinates inside the chart, so it matches every other chart and never drifts away from the pointer.
 */
import React, { useId, useMemo, useState } from 'react'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import { LineChart } from '@mui/x-charts/LineChart'
import { BarChart } from '@mui/x-charts/BarChart'
import { useDrawingArea, useYScale } from '@mui/x-charts/hooks'
import { Tooltip, TipRows, longDate, useSize } from '../viz'

const POS = '#22c47d'
const NEG = '#f5615a'
const theme = createTheme({ typography: { fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, sans-serif' } })
const MARGIN = { top: 6, right: 0, bottom: 0, left: 0 }
const NO_TOOLTIP = { tooltip: () => null }

// Adapted from MUI X (MIT): one hard stop at the threshold's y, so everything above it is one colour and below the other
function ThresholdPaint({ id, threshold, opacity = 1 }) {
  const { top, height, bottom } = useDrawingArea()
  const y0 = useYScale()(threshold)
  const total = top + height + bottom
  const stop = y0 === undefined ? 1 : Math.max(0, Math.min(1, y0 / total))
  return <defs>
    <linearGradient id={id} x1="0" x2="0" y1="0" y2={`${total}px`} gradientUnits="userSpaceOnUse">
      <stop offset={stop} stopColor={POS} stopOpacity={opacity}/>
      <stop offset={stop} stopColor={NEG} stopOpacity={opacity}/>
    </linearGradient>
  </defs>
}

/** Index of the hovered x position, from MUI's axis highlight. */
function useHovered() {
  const [index, setIndex] = useState(null)
  return [index, (items) => setIndex(items?.[0]?.dataIndex ?? null)]
}

function TileTip({ point, width, date, label, value, tone }) {
  return <Tooltip point={point} width={width} gap={10}>
    {point && <>
      <div className="tip-title">{longDate(date)}</div>
      <TipRows rows={[{ label, value, tone }]}/>
    </>}
  </Tooltip>
}

/** A line split green/red at `threshold`, filled between the line and the threshold in the same split. */
export function ThresholdArea({ values, dates, threshold, label, format }) {
  const [ref, size] = useSize()
  const [hovered, onHover] = useHovered()
  const id = useId().replace(/:/g, '')
  const lo = Math.min(threshold, ...values), hi = Math.max(threshold, ...values)
  const min = lo - (hi - lo) * .04, max = hi + (hi - lo) * .06
  const W = size.width, H = size.height
  // the same mapping MUI uses for this point scale and linear y axis, so the tooltip sits on the hovered point
  const point = hovered == null || !W ? null : {
    x: values.length > 1 ? (hovered / (values.length - 1)) * W : W / 2,
    y: MARGIN.top + (1 - (values[hovered] - min) / ((max - min) || 1)) * (H - MARGIN.top),
  }
  return <div className="tc" ref={ref}>
    {H > 0 && <ThemeProvider theme={theme}>
      <LineChart
        height={H} margin={MARGIN} hideLegend slots={NO_TOOLTIP} onHighlightedAxisChange={onHover}
        // plotted by index: several trades can share a date, and a point axis would merge them
        xAxis={[{ scaleType: 'point', data: values.map((_, index) => index), position: 'none' }]}
        yAxis={[{ position: 'none', min, max }]}
        series={[{ id: 'v', data: values, area: true, showMark: false, curve: 'monotoneX', baseline: threshold }]}
        sx={{
          [`& .MuiLineChart-area[data-series="v"]`]: { fill: `url(#${id}-fill)`, filter: 'none', opacity: 1 },
          [`& .MuiLineChart-line[data-series="v"]`]: { stroke: `url(#${id}-line)`, strokeWidth: 1.75 },
        }}
      >
        <ThresholdPaint id={`${id}-line`} threshold={threshold}/>
        <ThresholdPaint id={`${id}-fill`} threshold={threshold} opacity={.12}/>
      </LineChart>
    </ThemeProvider>}
    <TileTip
      point={point} width={W} date={hovered == null ? null : dates[hovered]} label={label}
      value={hovered == null ? '' : format(values[hovered])} tone={hovered == null ? undefined : values[hovered] >= threshold ? 'pos' : 'neg'}
    />
  </div>
}

/** One bar per session, green when it closed up and red when down. */
export function SessionBars({ values, dates, label, format }) {
  const [ref, size] = useSize()
  const [hovered, onHover] = useHovered()
  const W = size.width, H = size.height
  // band scale: the hovered bar's centre; the tooltip rises from the top of the plot so it never covers the bars
  const point = hovered == null || !W ? null : { x: ((hovered + .5) / values.length) * W, y: MARGIN.top }
  return <div className="tc" ref={ref}>
    {H > 0 && <ThemeProvider theme={theme}>
      <BarChart
        height={H} margin={MARGIN} hideLegend borderRadius={2} slots={NO_TOOLTIP} onHighlightedAxisChange={onHover}
        xAxis={[{ scaleType: 'band', data: values.map((_, index) => index), position: 'none', categoryGapRatio: .32 }]}
        yAxis={[{ position: 'none', colorMap: { type: 'piecewise', thresholds: [0], colors: [NEG, POS] } }]}
        series={[{ data: values }]}
      />
    </ThemeProvider>}
    <TileTip
      point={point} width={W} date={hovered == null ? null : dates[hovered]} label={label}
      value={hovered == null ? '' : format(values[hovered])} tone={hovered == null ? undefined : values[hovered] >= 0 ? 'pos' : 'neg'}
    />
  </div>
}

/**
 * Trading days as a heat grid: weekday rows (Mon–Fri) by week columns, oldest left. A green day's square deepens
 * with its gain and a red day's with its loss; weekdays without trades are quiet, days still to come are dashed.
 */
export function DayHeat({ days, format, label = 'Session P&L' }) {
  const [ref, size] = useSize()
  const [hovered, setHovered] = useState(null)
  const W = size.width, H = size.height
  const gap = 4, rows = 5
  const cell = Math.max(8, Math.floor((H - gap * (rows - 1)) / rows))
  const columns = W ? Math.max(1, Math.floor((W + gap) / (cell + gap))) : 0
  const grid = useMemo(() => {
    if (!columns || !days.length) return []
    const byDate = new Map(days.map((day) => [day.date, day.pnl]))
    const last = days[days.length - 1].date
    const monday = (iso) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d }
    const start = monday(last); start.setUTCDate(start.getUTCDate() - (columns - 1) * 7)
    const peak = Math.max(1, ...days.map((day) => Math.abs(day.pnl)))
    return Array.from({ length: columns }, (_, col) => Array.from({ length: rows }, (_, row) => {
      const d = new Date(start); d.setUTCDate(d.getUTCDate() + col * 7 + row)
      const iso = d.toISOString().slice(0, 10)
      const pnl = byDate.get(iso)
      // strength in four steps, so neighbouring squares read as distinct shades rather than a smear
      const level = pnl == null ? 0 : Math.min(4, 1 + Math.floor((Math.abs(pnl) / peak) * 4))
      return { iso, pnl, level, state: iso > last ? 'future' : pnl == null ? 'empty' : pnl >= 0 ? 'pos' : 'neg' }
    }))
  }, [days, columns])
  const used = columns * (cell + gap) - gap
  const offset = Math.max(0, (W - used) / 2)
  const point = hovered ? { x: offset + hovered.col * (cell + gap) + cell / 2, y: hovered.row * (cell + gap) } : null
  const active = hovered ? grid[hovered.col][hovered.row] : null
  return <div className="tc dh" ref={ref} onMouseLeave={() => setHovered(null)}>
    {W > 0 && <div className="dh-grid" style={{ '--cell': `${cell}px`, '--gap': `${gap}px`, gridTemplateColumns: `repeat(${columns}, var(--cell))`, paddingLeft: offset }} role="img" aria-label="Trading days by week, coloured by result">
      {grid.flatMap((column, col) => column.map((square, row) => <span
        key={square.iso} className={`dh-cell is-${square.state} lv-${square.level}`} style={{ gridColumn: col + 1, gridRow: row + 1 }}
        onMouseEnter={() => setHovered(square.state === 'future' ? null : { col, row })}
      />))}
    </div>}
    <Tooltip point={point} width={W} gap={8}>
      {active && <>
        <div className="tip-title">{longDate(active.iso)}</div>
        <TipRows rows={[active.pnl == null ? { label: 'No trades', value: '—' } : { label, value: format(active.pnl), tone: active.pnl >= 0 ? 'pos' : 'neg' }]}/>
      </>}
    </Tooltip>
  </div>
}

/**
 * Recent weeks as clusters of day bars (Mon–Fri) spread across the full width. Each bar's solid part is the day's net
 * P&L; a soft track behind it runs up to the day's gross (profit on a green day, loss on a red one), so the tint above
 * the bar is what the day gave back. Heights use a square-root scale so one big day doesn't flatten the rest.
 */
export function WeekBars({ days, format }) {
  const [ref, size] = useSize()
  const [hovered, setHovered] = useState(null)
  const W = Math.floor(size.width), H = Math.floor(size.height)
  const gap = 3, cluster = 12, top = 4
  const weeks = W ? Math.max(3, Math.min(8, Math.floor(W / 64))) : 0
  // bars widen to fill the row; whole pixels keep every edge crisp
  const bar = W ? Math.max(5, Math.floor((W - (weeks - 1) * cluster - weeks * 4 * gap) / (weeks * 5))) : 0
  const weekWidth = 5 * bar + 4 * gap
  const grid = useMemo(() => {
    if (!weeks || !days.length) return []
    const byDate = new Map(days.map((day) => [day.date, day]))
    const last = days[days.length - 1].date
    const start = new Date(`${last}T12:00:00Z`); start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7) - (weeks - 1) * 7)
    return Array.from({ length: weeks }, (_, w) => Array.from({ length: 5 }, (_, d) => {
      const date = new Date(start); date.setUTCDate(date.getUTCDate() + w * 7 + d)
      const iso = date.toISOString().slice(0, 10)
      return { iso, day: byDate.get(iso) ?? null }
    }))
  }, [days, weeks])
  const peak = Math.max(1, ...grid.flat().map(({ day }) => (day ? Math.max(day.won, day.lost) : 0)))
  const plot = Math.max(10, H - top)
  const used = weeks * weekWidth + (weeks - 1) * cluster
  const offset = Math.round(Math.max(0, (W - used) / 2))
  // whole-pixel geometry, so every bar edge lands on the pixel grid and renders crisp
  const xOf = (w, d) => offset + w * (weekWidth + cluster) + d * (bar + gap)
  const hOf = (value) => Math.round(Math.sqrt(Math.max(0, value) / peak) * plot)
  const active = hovered ? grid[hovered.w][hovered.d] : null
  const point = active?.day ? { x: xOf(hovered.w, hovered.d) + bar / 2, y: H - hOf(Math.max(active.day.won, active.day.lost)) } : null
  return <div className="tc wb" ref={ref} onMouseLeave={() => setHovered(null)}>
    {W > 0 && <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Daily net and gross P&L by week">
      {grid.map((week, w) => week.map(({ iso, day }, d) => {
        const x = xOf(w, d)
        if (!day) return <rect key={iso} x={x} y={H - 2} width={bar} height="2" rx="1" className="wb-none"/>
        const tone = day.pnl >= 0 ? 'pos' : 'neg'
        const net = Math.max(3, hOf(Math.abs(day.pnl)))
        const gross = hOf(tone === 'pos' ? day.won : day.lost)
        const r = Math.min(3, bar / 2)
        // bigger days take the deeper shade, small ones stay light
        const depth = Math.min(1, Math.abs(day.pnl) / peak).toFixed(3)
        return <g key={iso} className={`wb-day is-${tone}${hovered && hovered.w === w && hovered.d === d ? ' is-active' : ''}`} style={{ '--depth': depth }} onMouseEnter={() => setHovered({ w, d })}>
          <rect x={x - gap / 2} y="0" width={bar + gap} height={H} fill="transparent"/>
          {gross > net && <rect x={x} y={H - gross} width={bar} height={gross} rx={r} className="wb-gross"/>}
          <rect x={x} y={H - net} width={bar} height={net} rx={r} className="wb-net"/>
        </g>
      }))}
    </svg>}
    <Tooltip point={point} width={W} gap={8}>
      {active?.day && <>
        <div className="tip-title">{longDate(active.iso)}</div>
        <TipRows rows={[
          { label: 'Net', value: format(active.day.pnl), tone: active.day.pnl >= 0 ? 'pos' : 'neg' },
          { label: 'Gross profit', value: format(active.day.won), tone: 'pos' },
          { label: 'Gross loss', value: format(-active.day.lost), tone: 'neg' },
        ]}/>
      </>}
    </Tooltip>
  </div>
}

/**
 * Profit factor by month as stacked segment columns: the latest month on the left, older months fading to the right.
 * Each column's ten segments fill from the bottom by its profit factor (full at 3.0, 0.3 a segment); green at 1.0 or
 * better, red below.
 */
export function FactorColumns({ months, format }) {
  const [ref, size] = useSize()
  const [hovered, setHovered] = useState(null)
  const W = Math.floor(size.width), H = Math.floor(size.height)
  const segments = 5, cap = 3, colGap = 12, labelH = 0, valueH = 0
  const cols = months.slice(-5).reverse()
  const colW = cols.length ? Math.floor((W - colGap * (cols.length - 1)) / cols.length) : 0
  const plotTop = valueH, plotH = Math.max(20, H - labelH - valueH)
  const pitch = plotH / segments, segH = Math.max(3, Math.round(pitch * .5))
  const segY = (s) => Math.round(plotTop + plotH - (s + 1) * pitch + (pitch - segH) / 2)
  const active = hovered == null ? null : cols[hovered]
  const point = active ? { x: hovered * (colW + colGap) + colW / 2, y: 0 } : null
  return <div className="tc fc" ref={ref} onMouseLeave={() => setHovered(null)}>
    {W > 0 && <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Profit factor by month">
      {cols.map((month, c) => {
        const x = c * (colW + colGap)
        const filled = month.factor == null ? 0 : Math.max(1, Math.min(segments, Math.round((Math.min(month.factor, cap) / cap) * segments)))
        const tone = month.factor != null && month.factor >= 1 ? 'pos' : 'neg'
        return <g key={month.key} className={`fc-col is-${tone} shade-${c}${hovered === c ? ' is-active' : ''}`} onMouseEnter={() => setHovered(c)}>
          <rect x={x} y="0" width={colW} height={H} fill="transparent"/>
          {Array.from({ length: segments }, (_, s) => <rect
            key={s} x={x} y={segY(s)} width={colW} height={segH} rx={Math.min(2, segH / 2)}
            className={s < filled ? 'fc-on' : 'fc-off'} style={s < filled ? { animationDelay: `${c * 70 + s * 28}ms` } : undefined}
          />)}
        </g>
      })}
    </svg>}
    <Tooltip point={point} width={W} gap={8}>
      {active && <>
        <div className="tip-title">{active.label}</div>
        <TipRows rows={[
          { label: 'Profit factor', value: active.factor == null ? '—' : active.factor >= 10 ? '10+' : active.factor.toFixed(2), tone: active.factor != null && active.factor >= 1 ? 'pos' : 'neg' },
          { label: 'Gross profit', value: format(active.won), tone: 'pos' },
          { label: 'Gross loss', value: format(-active.lost), tone: 'neg' },
        ]}/>
      </>}
    </Tooltip>
  </div>
}

/**
 * Win share by month as a mosaic: the latest month on the left, each column as wide as its share of the trades and
 * split top to bottom into wins, losses and breakevens. Figures live in the hover card.
 */
export function WinMosaic({ months }) {
  const [ref, size] = useSize()
  const [hovered, setHovered] = useState(null)
  const id = useId().replace(/:/g, '')
  const W = Math.floor(size.width), H = Math.floor(size.height)
  const gap = 4, cols = months.slice(-4).reverse()
  const total = cols.reduce((sum, m) => sum + m.trades, 0) || 1
  const free = W - gap * (cols.length - 1)
  let x = 0
  const laid = cols.map((m) => {
    const w = Math.max(28, Math.round((m.trades / total) * free))
    const col = { ...m, x, w }; x += w + gap; return col
  })
  // the last column absorbs rounding so the mosaic ends exactly at the right edge
  if (laid.length) laid[laid.length - 1].w = Math.max(28, W - laid[laid.length - 1].x)
  const active = hovered == null ? null : laid[hovered]
  const point = active ? { x: active.x + active.w / 2, y: 0 } : null
  const pct = (n, of) => Math.round((n / Math.max(1, of)) * 100)
  return <div className="tc wm" ref={ref} onMouseLeave={() => setHovered(null)}>
    {W > 0 && <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Wins, losses and breakevens by month">
      <defs>
        <pattern id={`${id}-hatch`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" className="wm-hatch-bg"/><line x1="0" y1="0" x2="0" y2="6" className="wm-hatch-line"/>
        </pattern>
      </defs>
      {laid.map((m, c) => {
        const parts = [['win', m.wins], ['loss', m.losses], ['even', m.even]].filter(([, n]) => n > 0)
        const usable = H - gap * (parts.length - 1)
        let y = 0
        return <g key={m.key} className={`wm-col${hovered === c ? ' is-active' : ''}${hovered != null && hovered !== c ? ' is-dim' : ''}`} onMouseEnter={() => setHovered(c)}>
          {parts.map(([kind, n], i) => {
            const h = i === parts.length - 1 ? H - y : Math.max(6, Math.round((n / m.trades) * usable))
            const top = y; y += h + gap
            return <g key={kind}>
              <rect x={m.x} y={top} width={m.w} height={h} rx="4" className={`wm-${kind}`} fill={kind === 'even' ? `url(#${id}-hatch)` : undefined}/>
            </g>
          })}
        </g>
      })}
    </svg>}
    <Tooltip point={point} width={W} gap={8}>
      {active && <>
        <div className="tip-title">{active.label}</div>
        <TipRows rows={[
          { label: 'Wins', value: `${active.wins} · ${pct(active.wins, active.trades)}%`, tone: 'pos' },
          { label: 'Losses', value: `${active.losses} · ${pct(active.losses, active.trades)}%`, tone: 'neg' },
          ...(active.even ? [{ label: 'Breakeven', value: `${active.even}` }] : []),
        ]}/>
      </>}
    </Tooltip>
  </div>
}
