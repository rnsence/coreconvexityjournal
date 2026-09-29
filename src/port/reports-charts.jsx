/**
 * Report builder charts in the house SVG style: a two-dimension heatmap and a trade
 * scatter. Both measure their container, share the cume-grid / cume-axis chrome and
 * the frosted Tooltip used across the app.
 */
import React, { useState } from 'react'
import { TipRows, Tooltip, niceTicks, useSize } from '../viz'

/** Rows × columns of one metric; colour intensity follows |value|, hue follows sign. */
// Designs by RNSENCE Studio
export function HeatmapChart({ rowKeys, colKeys, cells, rowLabel, colLabel, corner, format, signed, label, onPick }) {
  const [ref, size] = useSize()
  const [active, setActive] = useState(null)
  const labelWidth = Math.min(150, Math.max(78, ...rowKeys.map((key) => rowLabel(key).length * 6.6 + 14)))
  const headHeight = 30
  const cellHeight = 44
  const gap = 4
  const available = (size.width || 640) - labelWidth
  const cellWidth = Math.max(70, available / Math.max(1, colKeys.length))
  const width = labelWidth + cellWidth * colKeys.length
  const height = headHeight + cellHeight * rowKeys.length
  const values = [...cells.values()].map((cell) => Math.abs(cell.value ?? 0))
  const extreme = Math.max(1e-9, ...values)
  const cellAt = (r, c) => cells.get(`${rowKeys[r]}|${colKeys[c]}`)
  const activeCell = active ? cellAt(active.r, active.c) : null
  return <div className="rp-heat" ref={ref}>
    <div className="rp-heat-scroll">
      <div className="rp-heat-plot" style={{ width, height }}>
        <svg width={width} height={height} role="img" aria-label={label}>
          <text className="cume-axis rp-heat-corner" x={0} y={18}>{corner}</text>
          {colKeys.map((key, c) => <text key={key} className="cume-axis" x={labelWidth + c * cellWidth + cellWidth / 2} y={18} textAnchor="middle">{colLabel(key)}</text>)}
          {rowKeys.map((rowKey, r) => <g key={rowKey}>
            <text className="rp-heat-row" x={0} y={headHeight + r * cellHeight + cellHeight / 2 + 4}>{rowLabel(rowKey)}</text>
            {colKeys.map((colKey, c) => {
              const cell = cellAt(r, c)
              const x = labelWidth + c * cellWidth + gap / 2
              const y = headHeight + r * cellHeight + gap / 2
              if (!cell || cell.value == null) return <rect key={colKey} className="rp-heat-empty" x={x} y={y} width={cellWidth - gap} height={cellHeight - gap} rx="7"/>
              const share = Math.round((Math.abs(cell.value) / extreme) * 40)
              const tone = signed && cell.value < 0 ? 'neg' : 'pos'
              const isActive = active && active.r === r && active.c === c
              const pick = onPick ? () => onPick(rowKey, colKey) : undefined
              return <g
                key={colKey} className={pick ? 'rp-heat-hit' : undefined}
                onPointerEnter={() => setActive({ r, c })} onPointerLeave={() => setActive(null)}
                onFocus={() => setActive({ r, c })} onBlur={() => setActive(null)}
                onClick={pick} tabIndex={pick ? 0 : undefined} role={pick ? 'button' : undefined}
                aria-label={pick ? `${rowLabel(rowKey)}, ${colLabel(colKey)}: ${format(cell.value)} over ${cell.trades} trades` : undefined}
                onKeyDown={pick ? (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); pick() } } : undefined}
              >
                <rect
                  className={`rp-heat-cell${isActive ? ' is-active' : ''}`} x={x} y={y} width={cellWidth - gap} height={cellHeight - gap} rx="7"
                  style={{ fill: `color-mix(in srgb, var(--${tone}) ${6 + share}%, #f6f7f9)` }}
                />
                <text className={`rp-heat-value tone-${signed ? (cell.value > 0 ? 'pos' : cell.value < 0 ? 'neg' : 'flat') : 'ink'}`} x={x + (cellWidth - gap) / 2} y={y + 17} textAnchor="middle">{format(cell.value)}</text>
                <text className="rp-heat-count" x={x + (cellWidth - gap) / 2} y={y + 31} textAnchor="middle">{cell.trades} trade{cell.trades === 1 ? '' : 's'}</text>
              </g>
            })}
          </g>)}
        </svg>
        <Tooltip point={active ? { x: labelWidth + active.c * cellWidth + cellWidth / 2, y: headHeight + active.r * cellHeight + 4 } : null} width={width}>
          {activeCell && <>
            <div className="tip-title">{rowLabel(rowKeys[active.r])} · {colLabel(colKeys[active.c])}</div>
            <TipRows rows={[
              { label: 'Value', value: format(activeCell.value), tone: signed ? (activeCell.value > 0 ? 'pos' : activeCell.value < 0 ? 'neg' : undefined) : undefined },
              { label: 'Trades', value: `${activeCell.trades}` },
            ]}/>
          </>}
        </Tooltip>
      </div>
    </div>
  </div>
}

/** Every trade as a point across two fields, coloured by its result. */
// Designs by RNSENCE Studio
export function ScatterChart({ points, xLabel, yLabel, xFormat, yFormat, tip, height = 300, label, onPick }) {
  const [ref, size] = useSize()
  const [active, setActive] = useState(null)
  const width = size.width || 640
  const pad = { top: 16, right: 14, bottom: 34, left: 56 }
  const plotWidth = Math.max(40, width - pad.left - pad.right)
  const plotHeight = Math.max(60, height - pad.top - pad.bottom)
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const extent = (list) => {
    let lo = Math.min(...list); let hi = Math.max(...list)
    if (lo === hi) { lo -= 1; hi += 1 }
    const ticks = niceTicks(lo, hi, 5)
    const step = ticks.length > 1 ? ticks[1] - ticks[0] : 1
    if (ticks[0] > lo) ticks.unshift(ticks[0] - step)
    if (ticks[ticks.length - 1] < hi) ticks.push(ticks[ticks.length - 1] + step)
    return { lo: ticks[0], hi: ticks[ticks.length - 1], ticks }
  }
  const X = extent(xs)
  const Y = extent(ys)
  const xAt = (value) => pad.left + ((value - X.lo) / ((X.hi - X.lo) || 1)) * plotWidth
  const yAt = (value) => pad.top + (1 - (value - Y.lo) / ((Y.hi - Y.lo) || 1)) * plotHeight
  const point = active == null ? null : points[active]
  return <div className="rp-scatter" ref={ref} style={{ height }}>
    <svg width={width} height={height} role="img" aria-label={label}>
      {Y.ticks.map((tick) => <g key={`y${tick}`}>
        <line className={tick === 0 ? 'ws-zero' : 'cume-grid'} x1={pad.left} y1={yAt(tick)} x2={pad.left + plotWidth} y2={yAt(tick)}/>
        <text className="cume-axis" x={pad.left - 10} y={yAt(tick) + 4} textAnchor="end">{yFormat(tick)}</text>
      </g>)}
      {X.ticks.map((tick) => <g key={`x${tick}`}>
        <line className={tick === 0 ? 'ws-zero' : 'cume-grid rp-grid-v'} x1={xAt(tick)} y1={pad.top} x2={xAt(tick)} y2={pad.top + plotHeight}/>
        <text className="cume-axis" x={xAt(tick)} y={height - 14} textAnchor="middle">{xFormat(tick)}</text>
      </g>)}
      <text className="rp-axis-title" x={pad.left + plotWidth} y={height - 1} textAnchor="end">{xLabel} →</text>
      <text className="rp-axis-title" x={pad.left + 6} y={pad.top + 11}>↑ {yLabel}</text>
      {points.map((item, index) => <circle
        key={item.id}
        className={`rp-dot ${item.trade.pnl > 0 ? 'pos' : item.trade.pnl < 0 ? 'neg' : 'flat'}${active === index ? ' is-active' : ''}`}
        cx={xAt(item.x)} cy={yAt(item.y)} r={active === index ? 6 : 4}
      />)}
      {points.map((item, index) => <circle
        key={`hit-${item.id}`} className={`rp-dot-hit${onPick ? ' is-pickable' : ''}`}
        cx={xAt(item.x)} cy={yAt(item.y)} r={9}
        onPointerEnter={() => setActive(index)} onPointerLeave={() => setActive(null)}
        onClick={onPick ? () => onPick(item, index) : undefined}
      />)}
      {point && <>
        <line className="cume-cross" x1={xAt(point.x)} y1={pad.top} x2={xAt(point.x)} y2={pad.top + plotHeight}/>
        <line className="cume-cross" x1={pad.left} y1={yAt(point.y)} x2={pad.left + plotWidth} y2={yAt(point.y)}/>
      </>}
    </svg>
    <Tooltip point={point ? { x: xAt(point.x), y: yAt(point.y) } : null} width={width}>
      {point && tip(point)}
    </Tooltip>
  </div>
}
