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
  typography: { fontFamily: '"Open Runde", Inter, ui-sans-serif, system-ui, -apple-system, sans-serif' },
  palette: { primary: { main: '#2e7cf6' }, text: { primary: INK, secondary: '#667085' } },
})
const axisDate = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

/** Cumulative net P&L by session, and how far below its last peak it sat (the underwater strip). */
// the Dashboard's cumulative-chart palette: accent blue equity on a soft blue wash, a smooth coral drawdown
const EQ_LINE = '#2e6fe8', DD_LINE = '#f1786f'
// no axes or grid: the curve alone, values on hover
const bare = { margin: { left: 0, right: 0, top: 10, bottom: 0 } }
export function EquityDrawdown({ trades, privacy }) {
  const days = useMemo(() => equitySeries(trades), [trades])
  if (days.length < 2) return <ChartState state="empty" detail="Needs two or more sessions."/>
  const dates = days.map((day) => day.date)
  const tip = (value) => (value == null ? '—' : money(value, { privacy }))
  const axis = (value) => (privacy ? '••' : compactMoney(value))
  return <ThemeProvider theme={theme}>
    <div className="ic-equity">
      <div className="ic-equity-main"><LineChart {...bare}
        xAxis={[{ scaleType: 'point', data: dates, valueFormatter: axisDate, position: 'none' }]}
        yAxis={[{ valueFormatter: axis, position: 'none' }]}
        series={[{ id: 'equity', data: days.map((day) => day.cumulative), area: true, showMark: false, curve: 'monotoneX', color: EQ_LINE, label: 'Net P&L', valueFormatter: tip, baseline: 'min' }]}
        hideLegend
        sx={{ '& .MuiLineChart-area[data-series="equity"]': { fill: "url('#ic-eq-fill')", opacity: 1 }, '& .MuiLineChart-line[data-series="equity"]': { strokeWidth: 1.75 } }}
      >
        <defs><linearGradient id="ic-eq-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={EQ_LINE} stopOpacity=".18"/><stop offset="1" stopColor={EQ_LINE} stopOpacity=".05"/></linearGradient></defs>
      </LineChart></div>
      <LineChart height={96} {...bare} margin={{ left: 0, right: 0, top: 0, bottom: 2 }}
        xAxis={[{ scaleType: 'point', data: dates, valueFormatter: axisDate, position: 'none' }]}
        yAxis={[{ valueFormatter: axis, position: 'none', max: 0, min: Math.min(-1, ...days.map((day) => day.drawdown)) }]}
        series={[{ id: 'dd', data: days.map((day) => day.drawdown), area: true, showMark: false, curve: 'monotoneX', color: DD_LINE, label: 'Drawdown', valueFormatter: tip }]}
        hideLegend
        sx={{ '& .MuiLineChart-area[data-series="dd"]': { opacity: 0.1 }, '& .MuiLineChart-line[data-series="dd"]': { strokeWidth: 1.5 } }}
      />
    </div>
  </ThemeProvider>
}

/** Net P&L for each trading hour, green above zero and red below. */
export function HourBars({ trades, privacy }) {
  const rows = useMemo(() => breakdown(trades, 'hour').sort((a, b) => Number(a.key) - Number(b.key)), [trades])
  if (!rows.length) return <ChartState state="empty" detail="No trades to place by hour."/>
  const hour = (key) => `${String(key).padStart(2, '0')}:00`
  return <ThemeProvider theme={theme}>
    <BarChart height={160} {...bare} borderRadius={4}
      xAxis={[{ scaleType: 'band', data: rows.map((row) => hour(row.key)), categoryGapRatio: 0.38, position: 'none' }]}
      yAxis={[{ valueFormatter: (value) => (privacy ? '••' : compactMoney(value)), position: 'none', min: Math.min(0, ...rows.map((row) => row.net_pnl)) * 1.05, max: Math.max(0, ...rows.map((row) => row.net_pnl)) * 1.05, colorMap: { type: 'piecewise', thresholds: [0], colors: [NEG, POS] } }]}
      series={[{ data: rows.map((row) => row.net_pnl), label: 'Net P&L', valueFormatter: (value, { dataIndex }) => `${money(value, { privacy })} · ${rows[dataIndex].trades} trades` }]}
      hideLegend
    ><ChartsReferenceLine y={0} lineStyle={{ stroke: 'rgba(16,24,40,.16)' }}/></BarChart>
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
  return <ThemeProvider theme={theme}>
    <BarChart height={160} {...bare} borderRadius={3}
      xAxis={[{ scaleType: 'band', data: bins.map((bin) => label(bin.start)), categoryGapRatio: 0.18, position: 'none' }]}
      yAxis={[{ position: 'none' }]}
      series={[
        { id: 'losses', data: bins.map((bin) => bin.losses || null), stack: 'n', color: NEG, label: 'Losses', valueFormatter: (value) => (value ? `${value} trades` : null) },
        { id: 'wins', data: bins.map((bin) => bin.wins || null), stack: 'n', color: POS, label: 'Wins', valueFormatter: (value) => (value ? `${value} trades` : null) },
      ]}
      hideLegend
    />
  </ThemeProvider>
}
