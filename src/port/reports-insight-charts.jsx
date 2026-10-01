/**
 * Insights charts (MUI X): equity with its drawdown underneath, P&L by trading hour, and the spread of trade outcomes.
 * Each one has MUI's hover tooltip, an empty state, and masks every value in privacy mode.
 */
import React, { useMemo } from 'react'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import { LineChart } from '@mui/x-charts/LineChart'
import { BarChart } from '@mui/x-charts/BarChart'
import { ChartsReferenceLine } from '@mui/x-charts/ChartsReferenceLine'
import { ChartState, compactMoney, money } from '../viz'
import { equitySeries } from '../analytics'
import { breakdown } from './reports-data'

const POS = '#22c47d', NEG = '#f5615a', INK = '#2b2f35'
const theme = createTheme({
  typography: { fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, sans-serif' },
  palette: { primary: { main: '#2e7cf6' }, text: { primary: INK, secondary: '#667085' } },
})
const cartesian = { grid: { horizontal: true }, margin: { left: 4, right: 8, top: 10, bottom: 4 } }
const everyNth = (values, count) => { const step = Math.max(1, Math.ceil(values.length / count)); return (_, index) => index % step === 0 }
const axisDate = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

/** Cumulative net P&L by session, and how far below its last peak it sat (the underwater strip). */
export function EquityDrawdown({ trades, privacy }) {
  const days = useMemo(() => equitySeries(trades), [trades])
  if (days.length < 2) return <ChartState state="empty" detail="Needs two or more sessions."/>
  const dates = days.map((day) => day.date)
  const tip = (value) => (value == null ? '—' : money(value, { privacy }))
  const axis = (value) => (privacy ? '••' : compactMoney(value))
  const worst = days.reduce((low, day) => (day.drawdown < low.drawdown ? day : low), days[0])
  return <ThemeProvider theme={theme}>
    <div className="ic-equity">
      <LineChart height={168} {...cartesian}
        xAxis={[{ scaleType: 'point', data: dates, valueFormatter: axisDate, tickInterval: everyNth(dates, 6), tickLabelStyle: { display: 'none' }, height: 4 }]}
        yAxis={[{ valueFormatter: axis, width: 56, tickNumber: 4 }]}
        series={[{ id: 'equity', data: days.map((day) => day.cumulative), area: true, showMark: false, curve: 'monotoneX', color: INK, label: 'Net P&L', valueFormatter: tip, baseline: 'min' }]}
        hideLegend
        sx={{ '& .MuiLineChart-area[data-series="equity"]': { fill: "url('#ic-eq-fill')", opacity: 1 } }}
      >
        <defs><linearGradient id="ic-eq-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={INK} stopOpacity=".12"/><stop offset="1" stopColor={INK} stopOpacity="0"/></linearGradient></defs>
        <ChartsReferenceLine y={0} lineStyle={{ stroke: 'rgba(16,24,40,.16)' }}/>
      </LineChart>
      <LineChart height={86} {...cartesian} margin={{ ...cartesian.margin, top: 2 }}
        xAxis={[{ scaleType: 'point', data: dates, valueFormatter: axisDate, tickInterval: everyNth(dates, 6) }]}
        yAxis={[{ valueFormatter: axis, width: 56, tickNumber: 2 }]}
        series={[{ id: 'dd', data: days.map((day) => day.drawdown), area: true, showMark: false, curve: 'stepAfter', color: NEG, label: 'Drawdown', valueFormatter: tip }]}
        hideLegend
        sx={{ '& .MuiLineChart-area[data-series="dd"]': { opacity: 0.16 }, '& .MuiLineChart-line[data-series="dd"]': { strokeWidth: 1.25 } }}
      />
    </div>
    <p className="ic-note">Deepest drawdown <b className="tone-neg">{money(worst.drawdown, { privacy, decimals: 0 })}</b> on {axisDate(worst.date)} · ended at <b className={days.at(-1).cumulative >= 0 ? 'tone-pos' : 'tone-neg'}>{money(days.at(-1).cumulative, { privacy, decimals: 0 })}</b></p>
  </ThemeProvider>
}

/** Net P&L for each trading hour, green above zero and red below. */
export function HourBars({ trades, privacy }) {
  const rows = useMemo(() => breakdown(trades, 'hour').sort((a, b) => Number(a.key) - Number(b.key)), [trades])
  if (!rows.length) return <ChartState state="empty" detail="No trades to place by hour."/>
  const best = rows.reduce((top, row) => (row.net_pnl > top.net_pnl ? row : top), rows[0])
  const worst = rows.reduce((low, row) => (row.net_pnl < low.net_pnl ? row : low), rows[0])
  const hour = (key) => `${String(key).padStart(2, '0')}:00`
  return <ThemeProvider theme={theme}>
    <BarChart height={254} {...cartesian} borderRadius={4}
      xAxis={[{ scaleType: 'band', data: rows.map((row) => hour(row.key)), categoryGapRatio: 0.38 }]}
      yAxis={[{ valueFormatter: (value) => (privacy ? '••' : compactMoney(value)), width: 56, tickNumber: 4, colorMap: { type: 'piecewise', thresholds: [0], colors: [NEG, POS] } }]}
      series={[{ data: rows.map((row) => row.net_pnl), label: 'Net P&L', valueFormatter: (value, { dataIndex }) => `${money(value, { privacy })} · ${rows[dataIndex].trades} trades` }]}
      hideLegend
    ><ChartsReferenceLine y={0} lineStyle={{ stroke: 'rgba(16,24,40,.16)' }}/></BarChart>
    <p className="ic-note">Best hour <b>{hour(best.key)}</b> <b className="tone-pos">{money(best.net_pnl, { privacy, decimals: 0 })}</b> · worst <b>{hour(worst.key)}</b> <b className={worst.net_pnl < 0 ? 'tone-neg' : 'tone-pos'}>{money(worst.net_pnl, { privacy, decimals: 0 })}</b></p>
  </ThemeProvider>
}

/** How trade results spread out: counts per $100 of P&L, wins and losses in their own colour. */
export function OutcomeHistogram({ trades, privacy }) {
  const bins = useMemo(() => {
    if (!trades.length) return []
    const width = 100
    const sorted = trades.map((trade) => trade.pnl).sort((a, b) => a - b)
    // trim the far tails into the end buckets so a single outlier doesn't stretch the axis
    const lo = Math.floor(sorted[Math.floor(sorted.length * 0.02)] / width) * width
    const hi = Math.ceil(sorted[Math.ceil(sorted.length * 0.98) - 1] / width) * width
    const list = []
    for (let start = lo; start < hi; start += width) list.push({ start, wins: 0, losses: 0 })
    if (!list.length) list.push({ start: lo, wins: 0, losses: 0 })
    trades.forEach((trade) => {
      const index = Math.max(0, Math.min(list.length - 1, Math.floor((trade.pnl - lo) / width)))
      if (trade.pnl > 0) list[index].wins += 1; else list[index].losses += 1
    })
    return list
  }, [trades])
  if (!bins.length) return <ChartState state="empty" detail="No trades to chart."/>
  const label = (start) => (privacy ? '••' : `${start < 0 ? '−' : ''}$${Math.abs(start)}`)
  const median = [...trades].map((trade) => trade.pnl).sort((a, b) => a - b)[Math.floor(trades.length / 2)]
  return <ThemeProvider theme={theme}>
    <BarChart height={254} {...cartesian} borderRadius={3}
      xAxis={[{ scaleType: 'band', data: bins.map((bin) => label(bin.start)), categoryGapRatio: 0.18, tickInterval: everyNth(bins, 6) }]}
      yAxis={[{ width: 30, tickNumber: 4 }]}
      series={[
        { id: 'losses', data: bins.map((bin) => bin.losses || null), stack: 'n', color: NEG, label: 'Losses', valueFormatter: (value) => (value ? `${value} trades` : null) },
        { id: 'wins', data: bins.map((bin) => bin.wins || null), stack: 'n', color: POS, label: 'Wins', valueFormatter: (value) => (value ? `${value} trades` : null) },
      ]}
      hideLegend
    />
    <p className="ic-note">Typical trade <b className={median >= 0 ? 'tone-pos' : 'tone-neg'}>{money(median, { privacy, decimals: 0 })}</b> · buckets of $100, outliers folded into the ends</p>
  </ThemeProvider>
}
