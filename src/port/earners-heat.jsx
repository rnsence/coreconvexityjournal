/**
 * Top earners as a month-by-symbol heatmap: one column per symbol, one row per recent traded month, each cell the
 * symbol's net for that month shaded green or red by size. A last column sums every symbol per month. Symbol heads
 * open that symbol's trades; cells explain themselves on hover.
 */
import React, { useMemo, useRef, useState } from 'react'
import { SymbolToken, Tooltip, TipRows, money } from '../viz'
import './earners-heat.css'

const MONTHS = 6
const ROWS = 6
const monthShort = (key) => new Date(`${key}-15T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
const monthLong = (key) => new Date(`${key}-15T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })

export function EarnersHeat({ trades, privacy, openTrades }) {
  const gridRef = useRef(null)
  const [tip, setTip] = useState(null)
  const { months, rows, total, peak } = useMemo(() => {
    const months = [...new Set(trades.map((trade) => trade.date.slice(0, 7)))].sort().slice(-MONTHS)
    const bySymbol = new Map()
    trades.forEach((trade) => {
      const row = bySymbol.get(trade.symbol) ?? { symbol: trade.symbol, net: 0, trades: 0, cells: {} }
      row.net += trade.pnl; row.trades += 1
      const key = trade.date.slice(0, 7)
      const cell = row.cells[key] ?? { net: 0, trades: 0 }; cell.net += trade.pnl; cell.trades += 1; row.cells[key] = cell
      bySymbol.set(trade.symbol, row)
    })
    const rows = [...bySymbol.values()].sort((a, b) => b.net - a.net).slice(0, ROWS)
    const total = Object.fromEntries(months.map((key) => {
      const list = trades.filter((trade) => trade.date.startsWith(key))
      return [key, { net: list.reduce((sum, trade) => sum + trade.pnl, 0), trades: list.length }]
    }))
    const peak = Math.max(1, ...rows.flatMap((row) => months.map((key) => Math.abs(row.cells[key]?.net ?? 0))))
    return { months, rows, total, peak }
  }, [trades])

  // Shade strength on a square-root scale, so small months still show a tint and big ones don't swamp the grid.
  const strength = (net, top = peak) => Math.sqrt(Math.min(1, Math.abs(net) / top)).toFixed(3)
  const totalPeak = Math.max(1, ...months.map((key) => Math.abs(total[key].net)))
  const show = (event, symbol, key, cell) => {
    const box = gridRef.current.getBoundingClientRect(), r = event.currentTarget.getBoundingClientRect()
    setTip({ x: r.left - box.left + r.width / 2, y: r.top - box.top, symbol, key, cell })
  }
  const cellFor = (cell, symbol, key, top) => {
    if (!cell) return <span key={`${symbol}-${key}`} className="eh-cell is-empty" aria-hidden="true"/>
    const tone = cell.net >= 0 ? 'pos' : 'neg'
    return <span
      key={`${symbol}-${key}`} className={`eh-cell is-${tone}${tip?.symbol === symbol && tip?.key === key ? ' is-active' : ''}`} style={{ '--a': strength(cell.net, top) }}
      role="img" aria-label={`${symbol}, ${monthLong(key)}: ${money(cell.net, { privacy, decimals: 0 })}, ${cell.trades} trades`}
      onMouseEnter={(event) => show(event, symbol, key, cell)} onMouseLeave={() => setTip(null)}
    />
  }

  if (!rows.length) return <p className="te-empty">No trades in this range yet.</p>
  return <div className="eh">
    <div className="eh-key">
      <span>Net by month</span>
      <span className="eh-scale" title="Bigger losses to bigger gains" aria-label="Shade scale, from bigger losses to bigger gains">{[1, .5, .2].map((a) => <i key={`n${a}`} className="is-neg" style={{ '--a': a }}/>)}{[.2, .5, 1].map((a) => <i key={`p${a}`} className="is-pos" style={{ '--a': a }}/>)}</span>
    </div>
    {/* symbols across the top, one row per month, all symbols as the last column; figures live in the hover card */}
    <div className="eh-grid is-flipped" ref={gridRef} style={{ '--cols': rows.length + 1, '--months': months.length }} onMouseLeave={() => setTip(null)}>
      <span className="eh-corner" aria-hidden="true"/>
      {rows.map((row) => <button key={row.symbol} type="button" className="eh-head" onClick={() => openTrades?.(row.symbol)} aria-label={`${row.symbol}: ${money(row.net, { privacy })} over ${row.trades} trades. Open trades`} title={row.symbol}>
        <span className="eh-logo"><SymbolToken symbol={row.symbol}/></span>
      </button>)}
      <span className="eh-head is-total" title="All symbols"><span className="eh-all">All</span></span>
      {months.map((key) => <React.Fragment key={key}>
        <span className="eh-month">{monthShort(key)}</span>
        {rows.map((row) => cellFor(row.cells[key], row.symbol, key, peak))}
        {cellFor(total[key].trades ? total[key] : null, 'All symbols', key, totalPeak)}
      </React.Fragment>)}
      <Tooltip point={tip ? { x: tip.x, y: tip.y } : null} width={gridRef.current?.offsetWidth} gap={6}>
        {tip && <>
          <div className="tip-title">{tip.symbol} · {monthLong(tip.key)}</div>
          <TipRows rows={[
            { label: 'Net', value: money(tip.cell.net, { privacy, decimals: 0 }), tone: tip.cell.net >= 0 ? 'pos' : 'neg' },
            { label: 'Trades', value: `${tip.cell.trades}` },
          ]}/>
        </>}
      </Tooltip>
    </div>
  </div>
}
