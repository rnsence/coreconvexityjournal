/**
 * Reports: Insights, Compare, Report builder and Publish. Every figure is
 * computed locally from the trade log; published reports, share links and saved
 * reports live in localStorage. Any group on the page (a leak, a set, a bar, a
 * heatmap cell) opens a drawer with its trades, stepping through its siblings.
 */
import React, { useEffect, useMemo, useState } from 'react'
import { ArrowLeftRight, Check, ChevronLeft, ChevronRight, Copy, ExternalLink, FileText, Link2, Printer, RotateCcw, Save, Send, X } from 'lucide-react'
import { ArrowDownRight, ArrowUpRight, CalendarBlank, CaretDown, Clock, Crosshair, Hourglass, ShieldWarning, SignOut, SquaresFour, Star, Tag, Wallet, Warning } from '@phosphor-icons/react'
import { Card, MetricStrip, PageHead, Segmented, TradeDrawer } from '../workspace'
import { SymbolToken, TipRows, compactMoney, money, percent, toneOf, titleCase } from '../viz'
import { Drawer, Field } from '../dialogs'
import { scopeByRange } from '../analytics'
import { tradeLog } from '../data'
import { HeatmapChart, ScatterChart } from './reports-charts'
import { AreaLine, Spark } from './tile-viz'
import {
  ACCOUNTS, DIMENSIONS, MONEY_METRICS, POINT_FIELDS, REPORT_METRICS, SAVED_LIMIT, SIGNED,
  applyFilter, breakdown, cleanFilter, computeMetrics, createShare, crossBreakdown, duration, filterCount,
  formatMetric, insights as buildInsights, keysOf, labelOf, loadPublished, loadSavedReports, metricRows, metricValue,
  readStore, scatterPoints, shareActive, shareURL, snapshot, storePublished, storeSavedReports, writeStore,
} from './reports-data'
import { TradeFilter } from './reports-filter'
import { DuelChart, EdgeMap, ProfitMix, ReportCover, rangeStart } from './reports-visuals'
import { EquityDrawdown, HourBars, OutcomeHistogram } from './reports-insight-charts'
import { Select } from '../select'
import { TagStack } from './notebook'
import './reports.css'

const TABS = ['Insights', 'Compare', 'Build', 'Publish']
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`
const MINUS = '−'
const dateTime = (iso) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
const dateOnly = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const shortDate = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const setupsOf = (trades) => [...new Set(trades.map((trade) => trade.setup))].sort()
const byTime = (a, b) => (a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date))
const signedMoney = (value, privacy) => (privacy ? '••••' : `${value > 0 ? '+' : value < 0 ? MINUS : '±'}$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
const winPct = (rate) => (rate == null ? '—' : `${Math.round(rate * 100)}%`)

/** A group the drawer can open: a title, what kind of group it is, and its trades. */
const group = (id, title, kind, trades) => ({ id, title, kind, trades: [...trades].sort(byTime) })
const inGroup = (list, dimension, key) => list.filter((trade) => keysOf(trade, dimension).includes(key))

/* ============================================================ shared bits */

function Lede({ children, aside }) {
  return <div className="rp-lede">
    <p>{children}</p>
    {aside}
  </div>
}

function Empty({ title, detail }) {
  return <div className="chart-state empty rp-empty">
    <div className="state-mark" aria-hidden="true"/>
    <b>{title}</b>
    <span>{detail}</span>
  </div>
}

const gauge = (share, options = {}) => ({ type: 'gauge', share: Math.max(0, Math.min(1, share || 0)), ...options })
const centre = (value, scale) => ({ type: 'center', share: (value || 0) / (Math.abs(scale) || 1) })
const split = (pos, neg) => ({ type: 'split', parts: [{ tone: 'pos', value: Math.abs(pos) || 0.0001 }, { tone: 'neg', value: Math.abs(neg) || 0.0001 }] })

function headlineStrip(m, privacy) {
  if (!m) return []
  return [
    { label: 'Net P&L', value: money(m.net_pnl, { privacy }), tone: toneOf(m.net_pnl), sub: `${money(m.gross_profit, { privacy, sign: false, decimals: 0 })} won · ${money(-m.gross_loss, { privacy, sign: false, decimals: 0 })} lost`, line: split(m.gross_profit, m.gross_loss) },
    { label: 'Win rate', value: m.win_rate == null ? '—' : percent(m.win_rate * 100), sub: `${m.wins}W · ${m.losses}L`, line: gauge(m.win_rate, { mark: 0.5 }) },
    { label: 'Profit factor', value: m.profit_factor == null ? '—' : m.profit_factor.toFixed(2), sub: 'Break-even at 1.00', line: gauge((m.profit_factor ?? 0) / 3, { mark: 1 / 3 }) },
    { label: 'Expectancy', value: money(m.expectancy, { privacy }), tone: toneOf(m.expectancy), sub: `${m.average_r?.toFixed(2)}R per trade`, line: centre(m.expectancy, Math.max(Math.abs(m.average_win ?? 0), Math.abs(m.average_loss ?? 0))) },
    { label: 'Edge score', value: m.edge_score == null ? '—' : `${m.edge_score}`, sub: 'Out of 100', line: gauge((m.edge_score ?? 0) / 100, { mark: 0.5 }) },
  ]
}

/* ============================================================ group drawer */

/** The trades behind one group, with the same anatomy as the trade drawer. */
function GroupDrawer({ groups, index, dir, onStep, onClose, privacy }) {
  const current = groups[index]
  const m = useMemo(() => computeMetrics(current.trades), [current])
  const [all, setAll] = useState(false)
  useEffect(() => setAll(false), [current.id])
  useEffect(() => {
    const onKey = (event) => {
      if (event.target.closest?.('input, select, textarea')) return
      if (event.key === 'ArrowLeft' && index > 0) onStep(-1)
      if (event.key === 'ArrowRight' && index < groups.length - 1) onStep(1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [index, groups.length, onStep])
  const list = current.trades
  const shown = all ? [...list].reverse() : [...list].reverse().slice(0, 5)
  const swap = `lg-swap ${dir}`
  const fmt = (value, options = {}) => money(value, { privacy, ...options })
  const won = m?.gross_profit ?? 0
  const lost = Math.abs(m?.gross_loss ?? 0)
  return <Drawer label={`${current.title} trades`} viewKey="rp-group" width={440} onClose={onClose}>
    <div className="trade-panel dw-trade dw-ledger dw-group">
      <div className="tp-head">
        <div key={`head-${current.id}`} className={swap}>
          <div className="tp-title">{current.kind && <span className="rp-dim">{current.kind}</span>}<b>{current.title}</b></div>
          <small>{list.length ? `${plural(list.length, 'trade')} · ${shortDate(list[0].date)} – ${shortDate(list[list.length - 1].date)}` : 'No trades'}</small>
        </div>
        {groups.length > 1 && <div className="tp-nav">
          <button type="button" aria-label="Previous group" disabled={index <= 0} onClick={() => onStep(-1)}><ChevronLeft size={15}/></button>
          <button type="button" aria-label="Next group" disabled={index >= groups.length - 1} onClick={() => onStep(1)}><ChevronRight size={15}/></button>
        </div>}
      </div>

      <div key={`body-${current.id}`} className={`lg-body dg-body ${swap}`}>
        {!m ? <p className="dg-none">No trades in this group.</p> : <>
          <div className="tp-result">
            <strong className={`tone-${toneOf(m.net_pnl)}`}>{fmt(m.net_pnl)}</strong>
            {groups.length > 1 && <span className="dg-rank">{index + 1} of {groups.length}</span>}
          </div>

          <section className="lg-firm dg-curve">
            <div className="lg-firm-head"><span>Running P&L, trade by trade</span><b className={`tone-${toneOf(m.net_pnl)}`}>{fmt(m.net_pnl, { decimals: 0 })}</b></div>
            <div className="dg-spark" aria-hidden="true"><Spark values={list.map((trade) => trade.pnl)}/></div>
            <div className="lg-split" aria-hidden="true">
              <i className="won" style={{ flex: won || 0.0001 }}/>
              <i className="lost" style={{ flex: lost || 0.0001 }}/>
            </div>
            <small>{fmt(won, { sign: false, decimals: 0 })} won · {fmt(lost, { sign: false, decimals: 0 })} lost</small>
          </section>

          <dl className="tp-figures">
            <div><dt>Win rate</dt><dd>{winPct(m.win_rate)} <em>{m.wins}W · {m.losses}L</em></dd></div>
            <div><dt>Profit factor</dt><dd>{m.profit_factor == null ? '—' : m.profit_factor.toFixed(2)}</dd></div>
            <div><dt>Expectancy</dt><dd className={`tone-${toneOf(m.expectancy)}`}>{fmt(m.expectancy)}</dd></div>
            <div><dt>Average win</dt><dd className="tone-pos">{m.average_win == null ? '—' : fmt(m.average_win)}</dd></div>
            <div><dt>Average loss</dt><dd className="tone-neg">{m.average_loss == null ? '—' : fmt(m.average_loss)}</dd></div>
            <div><dt>Average R</dt><dd>{m.average_r == null ? '—' : `${m.average_r.toFixed(2)}R`}</dd></div>
          </dl>

          <section className="lg-history dg-trades">
            <span className="lg-label">{all || list.length <= 5 ? 'Trades, newest first' : 'Latest trades'}</span>
            <ul className={all ? 'is-all' : ''}>
              {shown.map((trade) => <li key={trade.id}>
                <span className="lg-when">{shortDate(trade.date)}</span>
                <span className="dg-sym"><SymbolToken symbol={trade.symbol}/><b>{trade.symbol}</b><span className={`side-mark ${trade.side.toLowerCase()}`} aria-label={trade.side}>{trade.side[0]}</span></span>
                <span className={`lg-amt tone-${toneOf(trade.pnl)}`}>{fmt(trade.pnl)}</span>
              </li>)}
            </ul>
            {list.length > 5 && <button type="button" className="dg-more" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${list.length}`}</button>}
          </section>
        </>}
      </div>
    </div>
  </Drawer>
}

/** One open drawer per page: a group list with an index, or a trade from a scatter. */
function useDrill() {
  const [drill, setDrill] = useState(null)
  const open = (groups, index) => setDrill({ groups, index, dir: 'pick' })
  const step = (delta) => setDrill((current) => (current ? { ...current, index: current.index + delta, dir: delta > 0 ? 'next' : 'prev' } : current))
  return { drill, open, step, close: () => setDrill(null) }
}

function DrillLayer({ drill, step, close, privacy }) {
  if (!drill) return null
  return <GroupDrawer groups={drill.groups} index={drill.index} dir={drill.dir} onStep={step} onClose={close} privacy={privacy}/>
}

/* ============================================================ insights */

const DIM_ICONS = {
  mistake: Warning, playbook: Crosshair, hour: Clock, holding: Hourglass, account: Wallet, tag: Tag, weekday: CalendarBlank,
  month: CalendarBlank, week: CalendarBlank, rating: Star, exits: SignOut, rule: ShieldWarning,
}
const sentence = (text) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text)
/** A group's label as a person would write it: sentence case, hours as a window, holds with units. */
function niceLabel(row) {
  const label = String(row.label ?? row.key)
  if (row.dimension === 'hour') { const h = Number(row.key); return Number.isFinite(h) ? `${String(h).padStart(2, '0')}:00–${String(h + 1).padStart(2, '0')}:00` : label }
  if (row.dimension === 'holding') return ({ 'Under 5m': 'Under 5 min holds', '5–15m': '5–15 min holds', '15–30m': '15–30 min holds', '30m+': '30+ min holds' })[label] ?? label
  if (row.dimension === 'direction') return `${sentence(label)} trades`
  if (row.dimension === 'tag') return `#${label}`
  return sentence(label)
}

/** Ref 05 row: an identity tile, a sentence-case title over a quiet line, the figure over a fixed-width bar. */
function InsightRow({ row, privacy, peak, onOpen, current, tone = 'neutral' }) {
  const Icon = DIM_ICONS[row.dimension] ?? (row.dimension === 'direction' ? (row.key === 'short' ? ArrowDownRight : ArrowUpRight) : SquaresFour)
  const kind = row.dimension === 'rule' ? 'Rule' : DIMENSIONS[row.dimension]
  return <li>
    <button type="button" className={`rp-irow${current ? ' is-current' : ''}`} onClick={onOpen} aria-label={`${kind} ${niceLabel(row)}: ${money(row.net_pnl, { privacy })} over ${plural(row.trades, 'trade')}, ${winPct(row.win_rate)} won. Open trades`}>
      {row.dimension === 'symbol' ? <span className="rp-itile is-logo" title={kind}><SymbolToken symbol={row.key}/></span> : <span className={`rp-itile tone-${tone}`} title={kind}><Icon size={16} weight="duotone"/></span>}
      <span className="rp-icopy">
        <b title={niceLabel(row)}>{niceLabel(row)}</b>
        <small>{plural(row.trades, 'trade')} · {winPct(row.win_rate)} won</small>
      </span>
      <span className="rp-ifig">
        <strong className={`tone-${toneOf(row.net_pnl)}`}>{money(row.net_pnl, { privacy, decimals: 0 })}</strong>
        <span className="rp-itrack" aria-hidden="true"><i className={toneOf(row.net_pnl)} style={{ width: `${Math.max(4, (Math.abs(row.net_pnl) / peak) * 100)}%` }}/></span>
      </span>
    </button>
  </li>
}

function InsightsTab({ trades, privacy, drill }) {
  const list = useMemo(() => applyFilter(trades, {}), [trades])
  const view = useMemo(() => buildInsights(trades, 5), [trades])
  const metrics = useMemo(() => computeMetrics(list), [list])
  const peak = Math.max(1, ...view.best.map((row) => Math.abs(row.net_pnl)), ...view.leaks.map((row) => Math.abs(row.net_pnl)))
  const asGroups = (rows) => rows.map((row) => group(`${row.dimension}-${row.key}`, row.label, DIMENSIONS[row.dimension], inGroup(list, row.dimension, row.key)))
  const openRow = (rows, index) => drill.open(asGroups(rows), index)
  const rules = view.rules
  const ruleGroups = () => [
    group('followed', 'Followed your rules', 'Rules', list.filter((trade) => !trade.mistakes.length)),
    group('broken', 'Broke a rule', 'Rules', list.filter((trade) => trade.mistakes.length)),
  ]
  const broken = useMemo(() => breakdown(list, 'rule').filter((row) => row.key !== 'none').sort((x, y) => y.trades - x.trades).slice(0, 3).map((row) => ({ ...row, dimension: 'rule' })), [list])
  const brokenPeak = Math.max(1, ...broken.map((row) => Math.abs(row.net_pnl)))
  const openId = drill.drill?.groups[drill.drill.index]?.id
  if (!view.trades) return <Card shell title="Insights"><Empty title="No trades yet" detail="Log a trade and your leaks and strengths show up here."/></Card>
  return <>
    <Lede>What your own trades say. Only groups with at least {view.min_sample ?? 5} trades count. Click any row to see its trades.</Lede>
    <MetricStrip items={headlineStrip(metrics, privacy)}/>
    <div className="ws-grid three rp-insights">
      <Card shell title="Biggest leaks" aside={<span className="ws-hint">Costing you most</span>}>
        {view.leaks.length
          ? <><ol className="rp-irows">{view.leaks.map((row, index) => <InsightRow key={`${row.dimension}-${row.key}`} tone="neg" row={row} privacy={privacy} peak={peak} current={openId === `${row.dimension}-${row.key}`} onOpen={() => openRow(view.leaks, index)}/>)}</ol>
            <div className="rp-isum"><span>Together</span><small>{plural(view.leaks.length, 'group')} · {plural(view.leaks.reduce((sum, row) => sum + row.trades, 0), 'trade')}</small><b className={`tone-${toneOf(view.leaks.reduce((sum, row) => sum + row.net_pnl, 0))}`}>{money(view.leaks.reduce((sum, row) => sum + row.net_pnl, 0), { privacy, decimals: 0 })}</b></div></>
          : <Empty title="No losing group" detail="Nothing with 5+ trades is net negative."/>}
      </Card>
      <Card shell title="What works" aside={<span className="ws-hint">Paying you most</span>}>
        {view.best.length
          ? <><ol className="rp-irows">{view.best.map((row, index) => <InsightRow key={`${row.dimension}-${row.key}`} tone="pos" row={row} privacy={privacy} peak={peak} current={openId === `${row.dimension}-${row.key}`} onOpen={() => openRow(view.best, index)}/>)}</ol>
            <div className="rp-isum"><span>Together</span><small>{plural(view.best.length, 'group')} · {plural(view.best.reduce((sum, row) => sum + row.trades, 0), 'trade')}</small><b className={`tone-${toneOf(view.best.reduce((sum, row) => sum + row.net_pnl, 0))}`}>{money(view.best.reduce((sum, row) => sum + row.net_pnl, 0), { privacy, decimals: 0 })}</b></div></>
          : <Empty title="Not enough trades" detail="Each group needs 5+ trades."/>}
      </Card>
      <Card shell title="Your rules" aside={<span className="ws-hint">Per trade</span>}>
        {rules ? <div className="rp-rules2">
          <div className="rp-rsplit">
            {[['followed', 'Followed every rule', rules.followed_net_pnl, rules.followed_trades], ['broken', 'Broke a rule', rules.broken_net_pnl, rules.broken_trades]].map(([id, name, net, count], index) => <button
              key={id} type="button" className={`rp-rstat${openId === id ? ' is-current' : ''}`} onClick={() => drill.open(ruleGroups(), index)}
              aria-label={`${name}: ${money(count ? net / count : 0, { privacy })} per trade over ${plural(count, 'trade')}. Open trades`}
            >
              <small>{name}</small>
              <strong className={`tone-${toneOf(net)}`}>{money(count ? net / count : 0, { privacy, decimals: 0 })}<em>/trade</em></strong>
              <span>{plural(count, 'trade')}</span>
            </button>)}
          </div>
          <div className="rp-rshare">
            <div className="rp-rules-bar" aria-hidden="true">
              <i className="pos" style={{ flex: rules.followed_trades || 0.0001 }}/>
              <i className="neg" style={{ flex: rules.broken_trades || 0.0001 }}/>
            </div>
            <div className="rp-rshare-legend">
              <span><i className="pos"/>{Math.round((rules.followed_trades / Math.max(1, rules.followed_trades + rules.broken_trades)) * 100)}% clean</span>
              <span><i className="neg"/>{Math.round((rules.broken_trades / Math.max(1, rules.followed_trades + rules.broken_trades)) * 100)}% broke one</span>
            </div>
          </div>
          {broken.length > 0 && <div className="rp-rbroken">
            <span className="rp-sublabel">Broken most</span>
            <ol className="rp-irows">{broken.map((row, index) => <InsightRow key={row.key} tone="neg" row={row} privacy={privacy} peak={brokenPeak} current={openId === `rule-${row.key}`} onOpen={() => drill.open(broken.map((item) => group(`rule-${item.key}`, item.label, 'Rule broken', inGroup(list, 'rule', item.key))), index)}/>)}</ol>
          </div>}
        </div> : <Empty title="No rules yet" detail="Set trading rules in Settings to see what breaking them costs."/>}
      </Card>
    </div>
    <div className="ws-grid three rp-insight-charts">
      <Card shell title="Equity & drawdown" aside={<span className="ws-hint">By session</span>}><EquityDrawdown trades={list} privacy={privacy}/></Card>
      <Card shell title="P&L by hour" aside={<span className="ws-hint">Entry hour</span>}><HourBars trades={list} privacy={privacy}/></Card>
      <Card shell title="Trade outcomes" aside={<span className="ws-hint">Trades per $100</span>}><OutcomeHistogram trades={list} privacy={privacy}/></Card>
    </div>
  </>
}

/* ============================================================ compare */

const COMPARE_ROWS = ['Net P&L', 'Trades', 'Win rate', 'Profit factor', 'Expectancy', 'Average win', 'Average loss', 'Payoff ratio', 'Average R', 'Max drawdown', 'Edge score', 'Average hold', 'Fees']

/** B − A for the subtractable rows; U+2212 minus, ± for no change. */
export function difference(label, a, b, privacy = false) {
  if (!['Net P&L', 'Trades', 'Win rate', 'Profit factor', 'Expectancy', 'Average R'].includes(label)) return null
  if (a?.raw == null || b?.raw == null) return null
  const delta = b.raw - a.raw
  const sign = delta > 0 ? '+' : delta < 0 ? MINUS : '±'
  const size = Math.abs(delta)
  let text
  if (label === 'Net P&L' || label === 'Expectancy') text = privacy ? '••••' : `${sign}$${size.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  else if (label === 'Win rate') text = `${sign}${(size * 100).toFixed(1)} pts`
  else if (label === 'Trades') text = `${sign}${size}`
  else text = `${sign}${size.toFixed(2)}`
  return { text, tone: label === 'Trades' ? 'flat' : toneOf(delta) }
}

const summary = (filter) => {
  const parts = [filter.account, filter.setup, filter.direction && (filter.direction === 'long' ? 'Longs' : 'Shorts'), filter.symbol?.toUpperCase(), filter.tag && `#${filter.tag}`, filter.mistake && `mistake: ${filter.mistake}`, filter.from && `from ${filter.from}`, filter.to && `to ${filter.to}`].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'All trades'
}

const COMPARE_FIELDS = {
  'Net P&L': 'net_pnl', Trades: 'trades', 'Win rate': 'win_rate', 'Profit factor': 'profit_factor', Expectancy: 'expectancy',
  'Average win': 'average_win', 'Average loss': 'average_loss', 'Payoff ratio': 'payoff_ratio', 'Average R': 'average_r',
  'Max drawdown': 'max_drawdown', 'Edge score': 'edge_score', 'Average hold': 'average_hold_seconds', Fees: 'fees',
}

/** One side of the comparison as a raised plate: identity + filters, the result, and four supporting figures. */
function SetSide({ id, value, setValue, m, privacy, trades, setups, current, onOpen }) {
  const stats = m ? [
    ['Trades', `${m.trades}`],
    ['Win %', winPct(m.win_rate)],
    ['PF', m.profit_factor == null ? '—' : m.profit_factor.toFixed(2)],
    ['Exp.', money(m.expectancy, { privacy, decimals: 0 }), toneOf(m.expectancy)],
  ] : []
  return <div className={`rp-side2 side-${id.toLowerCase()}${current ? ' is-current' : ''}`}>
    <div className="rp-side2-top">
      <span className={`rp-set-chip set-${id.toLowerCase()}`}>{id}</span>
      <span className="rp-side2-name">Set {id}</span>
      <TradeFilter trades={trades} value={value} onChange={setValue} setups={setups} label="Filters"/>
    </div>
    <div className="rp-side2-row">
      <button type="button" className="rp-side2-main" disabled={!m} onClick={onOpen} aria-label={`Set ${id}: open its trades`} title="Open its trades">
        <strong className={`tone-${toneOf(m?.net_pnl ?? 0)}`}>{m ? money(m.net_pnl, { privacy }) : 'No trades'}</strong>
        {m && <ChevronRight size={14} className="rp-side2-go" aria-hidden="true"/>}
      </button>
      {m && <dl className="rp-side2-stats">{stats.map(([label, val, tone]) => <div key={label}><dt>{label}</dt><dd className={tone ? `tone-${tone}` : ''}>{val}</dd></div>)}</dl>}
    </div>
  </div>
}

/** B against A on the headline numbers, in the neutral middle tile. */
function SpreadTile({ ma, mb, privacy }) {
  if (!ma || !mb) return <div className="rp-spread"><span className="rp-spread-label">Spread</span><b>—</b></div>
  const net = mb.net_pnl - ma.net_pnl
  const per = (mb.expectancy ?? 0) - (ma.expectancy ?? 0)
  const win = ((mb.win_rate ?? 0) - (ma.win_rate ?? 0)) * 100
  const lead = net > 0 ? 'B' : net < 0 ? 'A' : null
  const signed = (v, fmt) => `${v > 0 ? '+' : v < 0 ? MINUS : '±'}${fmt(Math.abs(v))}`
  return <div className="rp-spread">
    <span className="rp-spread-label">Spread <em>B − A</em></span>
    <b className={`tone-${toneOf(net)}`}>{privacy ? '••••' : signed(net, (v) => `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`)}</b>
    <dl>
      <div><dt>Per trade</dt><dd className={`tone-${toneOf(per)}`}>{privacy ? '••••' : signed(per, (v) => `$${v.toFixed(0)}`)}</dd></div>
      <div><dt>Win rate</dt><dd className={`tone-${toneOf(win)}`}>{signed(win, (v) => `${v.toFixed(1)} pts`)}</dd></div>
    </dl>
    {lead && <span className={`rp-spread-lead lead-${lead.toLowerCase()}`} title="Higher net P&L">{lead} leads net</span>}
  </div>
}

const signedText = (delta, kind, privacy) => {
  if (delta == null) return null
  const sign = delta > 0 ? '+' : delta < 0 ? MINUS : '±'
  const size = Math.abs(delta)
  if (kind === 'money') return privacy ? '••••' : `${sign}$${size.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  if (kind === 'pct') return `${sign}${(size * 100).toFixed(1)} pts`
  if (kind === 'int') return `${sign}${Math.round(size)}`
  if (kind === 'secs') return `${sign}${duration(size)}`
  return `${sign}${size.toFixed(2)}`
}
const cellText = (value, kind, privacy) => {
  if (value == null) return '—'
  if (kind === 'money') return money(value, { privacy })
  if (kind === 'pct') return `${(value * 100).toFixed(2)}%`
  if (kind === 'int') return `${Math.round(value)}`
  if (kind === 'secs') return duration(value)
  return value.toFixed(2)
}
// [label, field, kind, better: 'high' | 'low' | null]
const TEARSHEET = [
  ['Performance', [['Net P&L', 'net_pnl', 'money', 'high'], ['Expectancy', 'expectancy', 'money', 'high'], ['Average R', 'average_r', 'num', 'high'], ['Profit factor', 'profit_factor', 'num', 'high'], ['Average trading day', 'average_day', 'money', 'high']]],
  ['Risk', [['Max drawdown', 'max_drawdown', 'money', 'high'], ['Largest loss', 'largest_loss', 'money', 'high'], ['Sharpe ratio', 'sharpe', 'num', 'high'], ['Sortino ratio', 'sortino', 'num', 'high'], ['Recovery factor', 'recovery_factor', 'num', 'high']]],
  ['Win profile', [['Win rate', 'win_rate', 'pct', 'high'], ['Average win', 'average_win', 'money', 'high'], ['Average loss', 'average_loss', 'money', 'high'], ['Payoff ratio', 'payoff_ratio', 'num', 'high']]],
  ['Activity', [['Trades', 'trades', 'int', null], ['Trading days', 'trading_days', 'int', null], ['Average hold', 'average_hold_seconds', 'secs', null], ['Fees', 'fees', 'money', 'low']]],
]

/** The comparison as a tearsheet: grouped statistics, both sets, the difference and which side has the edge. */
function Tearsheet({ ma, mb, privacy }) {
  let edgeA = 0, edgeB = 0
  const groups = TEARSHEET.map(([title, rows]) => [title, rows.map(([label, field, kind, better]) => {
    const raw = (m) => (m?.[field] == null ? null : field === 'fees' ? -m[field] : m[field])
    const a = raw(ma), b = raw(mb)
    const delta = a != null && b != null ? b - a : null
    let edge = null
    if (better && delta) edge = (better === 'high' ? delta > 0 : delta < 0) ? 'b' : 'a'
    if (field === 'fees' && delta) edge = delta > 0 ? 'b' : 'a'
    if (edge === 'a') edgeA += 1; if (edge === 'b') edgeB += 1
    return { label, a, b, kind, delta, edge, toned: !!better }
  })])
  return <div className="rp-sheet-wrap">
    <p className="rp-sheet-lede"><b className="lead-b">Set B</b> has the edge on <b>{edgeB}</b> of {edgeA + edgeB} measures, <b className="lead-a">Set A</b> on <b>{edgeA}</b>.</p>
    <table className="rp-sheet">
      <colgroup><col/><col className="c-a"/><col className="c-b"/><col/><col className="c-edge"/></colgroup>
      <thead><tr><th scope="col">Statistic</th><th scope="col"><span className="rp-set-chip set-a">A</span></th><th scope="col"><span className="rp-set-chip set-b">B</span></th><th scope="col">B − A</th><th scope="col">Edge</th></tr></thead>
      {groups.map(([title, rows]) => <tbody key={title}>
        <tr className="rp-sheet-group"><th colSpan={5} scope="rowgroup">{title}</th></tr>
        {rows.map((row) => <tr key={row.label}>
          <th scope="row">{row.label}</th>
          <td className={row.edge === 'a' ? 'is-edge' : ''}>{cellText(row.a, row.kind, privacy)}</td>
          <td className={row.edge === 'b' ? 'is-edge' : ''}>{cellText(row.b, row.kind, privacy)}</td>
          <td className={row.toned && row.delta ? `tone-${(row.edge === 'b') ? 'pos' : 'neg'}` : 'muted'}>{signedText(row.delta, row.kind, privacy) ?? '—'}</td>
          <td>{row.edge ? <span className={`rp-edge-tag edge-${row.edge}`}>{row.edge.toUpperCase()}</span> : <span className="rp-edge-none">—</span>}</td>
        </tr>)}
      </tbody>)}
    </table>
  </div>
}

function CompareTab({ trades, privacy, setups, drill }) {
  const [a, setA] = useState(() => readStore('rp-compare-a', { direction: 'long' }))
  const [b, setB] = useState(() => readStore('rp-compare-b', { direction: 'short' }))
  useEffect(() => { writeStore('rp-compare-a', a); writeStore('rp-compare-b', b) }, [a, b])
  // one range governs the whole comparison: tiles, spread, chart and statistics
  const [range, setRange] = useState('All')
  const lastDate = useMemo(() => trades.reduce((max, trade) => (trade.date > max ? trade.date : max), ''), [trades])
  const from = rangeStart(range, lastDate)
  const listA = useMemo(() => applyFilter(trades, a).filter((trade) => !from || trade.date >= from), [trades, a, from])
  const listB = useMemo(() => applyFilter(trades, b).filter((trade) => !from || trade.date >= from), [trades, b, from])
  const ma = useMemo(() => computeMetrics(listA), [listA])
  const mb = useMemo(() => computeMetrics(listB), [listB])
  const groups = () => [group('set-a', summary(a), 'Set A', listA), group('set-b', summary(b), 'Set B', listB)]
  const openId = drill.drill?.groups[drill.drill.index]?.id
  const shared = { privacy, trades, setups }
  return <>
    <Lede>Put two sets of trades side by side: one setup against another, longs against shorts, or a mistake against the rest.</Lede>
    <section className="home-card ws-card duo rp-h2h" aria-label="Head to head">
      <header className="shell-head rp-setcard-head">
        <h2>Head to Head</h2>
        <button type="button" className="rp-setcard-open rp-swap" onClick={() => { setA(b); setB(a) }}><ArrowLeftRight size={13}/> Swap</button>
      </header>
      <div className="shell-body rp-h2h-body">
        <div className="rp-sides3">
          <SetSide id="A" value={a} setValue={setA} m={ma} current={openId === 'set-a'} onOpen={() => drill.open(groups(), 0)} {...shared}/>
          <SetSide id="B" value={b} setValue={setB} m={mb} current={openId === 'set-b'} onOpen={() => drill.open(groups(), 1)} {...shared}/>
          <SpreadTile ma={ma} mb={mb} privacy={privacy}/>
        </div>
        <DuelChart listA={listA} listB={listB} privacy={privacy} range={range} setRange={setRange}/>
      </div>
    </section>

    <Card shell title="Statistics" className="rp-compare rp-stats-card" aside={<span className="ws-hint">{range === 'All' ? 'All dates' : range} · same definitions as the Trades page</span>}>
      {!ma && !mb ? <Empty title="Neither set has trades" detail="Loosen a filter on either side."/> : <Tearsheet ma={ma} mb={mb} privacy={privacy}/>}
    </Card>
  </>
}

/* ============================================================ report builder */

const shortLabel = (dimension, label) => (dimension === 'weekday' || dimension === 'month' ? label.slice(0, 3) : label)

/** A toolbar control: a muted label and the chosen value in one button-like select that sizes to its text. */
function Pick({ label, value, onChange, options, none, disabled = false }) {
  return <label className={`rp-ctl${disabled ? ' is-off' : ''}`}>
    <span>{label}</span>
    <Select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
      {none !== undefined && <option value="">{none}</option>}
      {options.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
    </Select>
    <CaretDown size={10} weight="bold" aria-hidden="true"/>
  </label>
}

/** Ranked groups as a table: each group's rank, sample, win rate, average and value. */
function RankTable({ rows, format, signed, onOpen, currentId, symbols = false, dimLabel, metricLabel, privacy, money: isMoney }) {
  const total = rows.reduce((sum, row) => sum + row.value, 0)
  const noun = dimLabel.includes(' ') ? 'group' : dimLabel.toLowerCase()
  const nouns = noun.endsWith('s') ? `${noun}es` : `${noun}s`
  return <div className="rp-rank" role="table" aria-label={`${metricLabel} by ${dimLabel}`}>
    <div className="rp-rank-head" role="row">
      <span role="columnheader" aria-hidden="true">#</span><span role="columnheader">{dimLabel}</span><span role="columnheader" className="rp-c-trades">Trades</span><span role="columnheader" className="rp-c-win">Win rate</span><span role="columnheader" className="rp-c-avg">Avg / trade</span>
      <span role="columnheader">{metricLabel}</span>
    </div>
    <div className="rp-rank-body" tabIndex={0} aria-label={`${rows.length} ${dimLabel.toLowerCase()} groups, scroll for more`}>
    {rows.map((row, index) => <button key={row.id} type="button" role="row" className={`rp-rank-row${currentId === row.id ? ' is-current' : ''}`} onClick={(event) => { if (event.detail) event.currentTarget.blur(); onOpen(index) }}
      aria-label={`${row.label}: ${format(row.value)} over ${plural(row.trades, 'trade')}. Open trades`}>
      <span className="rp-rank-pos" role="cell">{index + 1}</span>
      <span className={`rp-rank-name${symbols ? ' has-token' : ''}`} role="cell">
        <span className="rp-rank-title">{symbols && <SymbolToken symbol={row.key}/>}<b>{row.label}</b></span>
      </span>
      <span className="rp-rank-num rp-c-trades" role="cell">{row.trades}</span>
      <span className="rp-rank-num rp-c-win" role="cell">{winPct(row.winRate)}</span>
      <span className={`rp-rank-num rp-c-avg tone-${toneOf(row.net ?? 0)}`} role="cell">{row.net == null ? '—' : money(row.net / Math.max(1, row.trades), { privacy, decimals: 0 })}</span>
      <strong className={`rp-rank-val${signed ? ` tone-${toneOf(row.value)}` : ''}`} role="cell">{format(row.value)}</strong>
    </button>)}
    </div>
    <div className="rp-rank-foot">
      <span>{rows.length} {nouns}</span>
      <span className="rp-rank-total">{isMoney ? 'Total' : 'Average'}<b className={signed ? `tone-${toneOf(isMoney ? total : total / rows.length)}` : ''}>{format(isMoney ? total : total / rows.length)}</b></span>
    </div>
  </div>
}

function BuilderTab({ trades, privacy, setups, drill, filter, setFilter }) {
  const [metric, setMetric] = useState('net_pnl')
  const [rows, setRows] = useState('playbook')
  const [columns, setColumns] = useState('')
  const [scatter, setScatter] = useState(['hold_seconds', 'pnl'])
  // the scatter card stays folded to its head until switched on
  const [scatterOn, setScatterOn] = useState(false)
  const [saved, setSaved] = useState(loadSavedReports)
  const [name, setName] = useState('')
  const [active, setActive] = useState(null)
  const [tradeId, setTradeId] = useState(null)

  const list = useMemo(() => applyFilter(trades, filter), [trades, filter])
  const cross = columns && columns !== rows
  const bars = useMemo(() => breakdown(list, rows)
    .map((row) => {
      let run = 0
      const curve = [0, ...inGroup(list, rows, row.key).sort(byTime).map((trade) => (run += trade.pnl))]
      return { id: `${rows}-${row.key}`, key: row.key, label: row.label, value: metricValue(row, metric), trades: row.trades, winRate: row.win_rate, net: row.net_pnl, curve }
    })
    .filter((row) => row.value != null)
    .sort((x, y) => y.value - x.value), [list, rows, metric])
  const mixGroups = useMemo(() => breakdown(list, rows).map((row) => ({ id: `${rows}-${row.key}`, label: row.label, net: row.net_pnl, trades: row.trades, winRate: row.win_rate })), [list, rows])
  const groupStats = useMemo(() => {
    if (mixGroups.length < 2) return []
    const noun = DIMENSIONS[rows].toLowerCase()
    const sorted = [...mixGroups].sort((x, y) => y.net - x.net)
    const best = sorted[0], worst = sorted.at(-1)
    const positive = mixGroups.filter((row) => row.net > 0).length
    const totalTrades = mixGroups.reduce((sum, row) => sum + row.trades, 0) || 1
    const busiest = [...mixGroups].sort((x, y) => y.trades - x.trades)[0]
    const sharpest = [...mixGroups].filter((row) => row.winRate != null).sort((x, y) => y.winRate - x.winRate)[0]
    const average = mixGroups.reduce((sum, row) => sum + row.net, 0) / mixGroups.length
    const reach = Math.max(...mixGroups.map((row) => Math.abs(row.net)), 1)
    return [
      { label: `Profitable ${noun}s`, value: `${positive}/${mixGroups.length}`, sub: mixGroups.length - positive > 0 ? <span className="tone-neg">{mixGroups.length - positive} losing</span> : '0 losing', line: { type: 'dashes', share: positive / mixGroups.length, total: Math.min(14, mixGroups.length) } },
      sharpest && { label: 'Best win rate', value: percent(sharpest.winRate * 100), sub: sharpest.label, line: gauge(sharpest.winRate, { mark: 0.5 }) },
      { label: 'Most traded', value: `${busiest.trades}`, sub: `${busiest.label} · ${Math.round((busiest.trades / totalTrades) * 100)}% of trades`, line: gauge(busiest.trades / totalTrades) },
      { label: `Average per ${noun}`, value: money(average, { privacy, decimals: 0 }), tone: toneOf(average), sub: `${mixGroups.length} ${noun}s`, line: centre(average, reach) },
      { label: 'Best to worst', value: money(best.net - worst.net, { privacy, decimals: 0, sign: false }), sub: `${best.label} vs ${worst.label}`, line: split(Math.max(0, best.net), Math.min(0, worst.net)) },
    ].filter(Boolean)
  }, [mixGroups, rows, privacy])
  const heat = useMemo(() => (cross ? crossBreakdown(list, rows, columns) : null), [list, rows, columns, cross])
  const points = useMemo(() => (scatter ? scatterPoints(list, scatter[0], scatter[1]) : []), [list, scatter])
  const pointTrades = useMemo(() => [...points.map((point) => point.trade)].sort(byTime), [points])

  const changeX = (x) => {
    if (!x) { setScatter(null); return }
    setScatter((current) => {
      const y = current && current[1] !== x ? current[1] : x === 'r' ? 'pnl' : 'r'
      return [x, y === x ? (x === 'pnl' ? 'r' : 'pnl') : y]
    })
  }
  const persist = (next) => { setSaved(next); storeSavedReports(next) }
  const saveReport = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    const entry = { name: trimmed, metric, rows, columns: columns || null, filter: cleanFilter(filter), scatter_x: scatter?.[0] ?? null, scatter_y: scatter?.[1] ?? null }
    persist([...saved.filter((item) => item.name.toLowerCase() !== trimmed.toLowerCase()), entry])
    setName('')
    setActive(trimmed)
  }
  const loadReport = (entry) => {
    setMetric(entry.metric); setRows(entry.rows); setColumns(entry.columns ?? '')
    setFilter(entry.filter ?? {}); setScatter(entry.scatter_x ? [entry.scatter_x, entry.scatter_y] : null); setActive(entry.name)
  }
  const format = (value) => formatMetric(value, metric, privacy)
  const metricLabel = REPORT_METRICS[metric]
  const openBar = (index) => drill.open(bars.map((bar) => group(bar.id, bar.label, DIMENSIONS[rows], inGroup(list, rows, bar.key))), index)
  const openCell = (rowKey, colKey) => {
    const cells = heat.rowKeys.flatMap((r) => heat.colKeys.filter((c) => heat.cells.has(`${r}|${c}`)).map((c) => [r, c]))
    const groups = cells.map(([r, c]) => group(`${r}|${c}`, `${labelOf(rows, r)} · ${labelOf(columns, c)}`, `${DIMENSIONS[rows]} × ${DIMENSIONS[columns]}`, inGroup(inGroup(list, rows, r), columns, c)))
    drill.open(groups, cells.findIndex(([r, c]) => r === rowKey && c === colKey))
  }
  const openId = drill.drill?.groups[drill.drill.index]?.id

  return <>
    <section className="home-card ws-card duo rp-compose rp-builder" aria-label="Build a report">
      <header className="shell-head rp-setcard-head">
        <h2>Build</h2>
        <span className="ws-hint rp-compose-count">{plural(list.length, 'trade')} in view</span>
      </header>
      <div className="shell-body rp-compose-body">
        <div className="rp-ctlbar">
          <div className="rp-ctlgroup" role="group" aria-label="Ranking">
            <Pick label="Metric" value={metric} onChange={setMetric} options={Object.entries(REPORT_METRICS)}/>
            <Pick label="Group by" value={rows} onChange={setRows} options={Object.entries(DIMENSIONS)}/>
            <Pick label="Split by" value={columns} onChange={setColumns} none="None" options={Object.entries(DIMENSIONS).filter(([key]) => key !== rows)}/>
          </div>
          <span className="rp-ctlsep" aria-hidden="true"/>
          <div className="rp-ctlgroup" role="group" aria-label="Scatter">
            <Pick label="Plot" value={scatter?.[1] ?? ''} disabled={!scatter} onChange={(y) => setScatter([scatter[0], y])} none={scatter ? undefined : '—'}
              options={scatter ? Object.entries(POINT_FIELDS).filter(([key]) => key !== scatter[0]) : []}/>
            <Pick label="Against" value={scatter?.[0] ?? ''} onChange={changeX} none="No scatter" options={Object.entries(POINT_FIELDS)}/>
          </div>
          <span className="rp-ctlsep" aria-hidden="true"/>
          <TradeFilter trades={trades} value={filter} onChange={setFilter} setups={setups} label="Filters"/>
        </div>
      </div>
      <footer className="rp-setcard-foot rp-saved" aria-label="Saved views">
        <span className="rp-saved-label">Saved</span>
        {saved.map((entry) => <span key={entry.name} className={`rf-chip rp-saved-chip${active === entry.name ? ' on' : ''}`}>
          <button type="button" className="rp-saved-load" onClick={() => loadReport(entry)}>{entry.name}</button>
          <button type="button" aria-label={`Delete view ${entry.name}`} onClick={() => { persist(saved.filter((item) => item !== entry)); if (active === entry.name) setActive(null) }}><X size={10} strokeWidth={2.6}/></button>
        </span>)}
        {!saved.length && <span className="rp-muted">None yet</span>}
        <span className="rp-saved-new">
          <input aria-label="View name" placeholder="Name this view" maxLength={60} value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') saveReport() }}/>
          <button type="button" className="rp-setcard-open" disabled={!name.trim() || saved.length >= SAVED_LIMIT} onClick={saveReport}><Save size={13}/> Save</button>
        </span>
      </footer>
    </section>

    {!list.length ? <Card shell title="Results"><Empty title="No trades match" detail="Loosen the filter to build a report."/></Card> : <>
      {cross
        ? <Card shell title={`${metricLabel} by ${DIMENSIONS[rows]} × ${DIMENSIONS[columns]}`} aside={<span className="ws-hint">Deeper colour, bigger value</span>}>
            {heat.rowKeys.length
              ? <HeatmapChart
                  rowKeys={heat.rowKeys} colKeys={heat.colKeys}
                  cells={new Map([...heat.cells.entries()].map(([key, cell]) => [key, { value: metricValue(cell, metric), trades: cell.trades }]))}
                  rowLabel={(key) => labelOf(rows, key)} colLabel={(key) => shortLabel(columns, labelOf(columns, key))}
                  corner={`${DIMENSIONS[rows]} × ${DIMENSIONS[columns]}`} format={format} signed={SIGNED.has(metric)} label="Report heatmap"
                  onPick={openCell}
                />
              : <Empty title="No trades match" detail="Try another pair of breakdowns."/>}
          </Card>
        : <div className="rp-rank-grid">
            {groupStats.length > 0 && <MetricStrip items={groupStats}/>}
            <Card shell title={`${metricLabel} by ${DIMENSIONS[rows]}`} aside={<span className="ws-hint">Ranked best to worst · click a row for its trades</span>}>
            {bars.length
              ? <RankTable rows={bars} format={format} signed={SIGNED.has(metric)} onOpen={openBar} currentId={openId} symbols={rows === 'symbol' || rows === 'underlying'} dimLabel={DIMENSIONS[rows]} metricLabel={metricLabel} privacy={privacy} money={metric === 'net_pnl'}/>
              : <Empty title="Nothing to rank" detail="No group has a value for this metric."/>}
          </Card>
            <Card shell title="Win rate vs avg P&L" className="rp-edge-card" aside={<span className="ws-hint">Dot size = trades</span>}>
              <EdgeMap groups={mixGroups} privacy={privacy} onOpen={(id) => { const index = bars.findIndex((bar) => bar.id === id); if (index >= 0) openBar(index) }}/>
            </Card>
            <Card shell title={`Profit by ${DIMENSIONS[rows].toLowerCase()}`} className="rp-mix-card" aside={<span className="ws-hint">Share of gross</span>}>
              <ProfitMix groups={mixGroups} privacy={privacy} onOpen={(id) => { const index = bars.findIndex((bar) => bar.id === id); if (index >= 0) openBar(index) }}/>
            </Card>
          </div>}
      {/* the whole folded card opens it; once open, its head folds it again (the dots stay clickable) */}
      {scatter && <div className={`rp-scatter-wrap${scatterOn ? ' is-on' : ''}`} role="button" tabIndex={0} aria-expanded={scatterOn}
        aria-label={`${scatterOn ? 'Hide' : 'Show'} ${POINT_FIELDS[scatter[1]]} against ${POINT_FIELDS[scatter[0]]}`}
        onClick={(event) => { if (!scatterOn || event.target.closest('.shell-head')) setScatterOn((value) => !value) }}
        onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); setScatterOn((value) => !value) } }}>
      <Card shell className={`rp-scatter-card${scatterOn ? ' is-on' : ''}`} title={`${POINT_FIELDS[scatter[1]]} against ${POINT_FIELDS[scatter[0]]}`}
        aside={scatterOn && <div className="ws-legend"><span><i className="rp-key pos"/>Win</span><span><i className="rp-key neg"/>Loss</span></div>}>
        {!scatterOn ? null : points.length
          ? <ScatterChart
              points={points} xLabel={POINT_FIELDS[scatter[0]]} yLabel={POINT_FIELDS[scatter[1]]} height={190}
              label={`Scatter of ${POINT_FIELDS[scatter[1]]} against ${POINT_FIELDS[scatter[0]]}: ${points.length} trades`}
              xFormat={pointFormat(scatter[0], privacy)} yFormat={pointFormat(scatter[1], privacy)}
              onPick={(point) => setTradeId(point.trade.id)}
              tip={(point) => <><div className="tip-title">{point.trade.symbol} · {shortDate(point.trade.date)} {point.trade.time}</div><TipRows rows={[
                { label: POINT_FIELDS[scatter[0]], value: pointValue(scatter[0], point.x, privacy) },
                { label: POINT_FIELDS[scatter[1]], value: pointValue(scatter[1], point.y, privacy) },
                { label: 'Setup', value: point.trade.setup },
              ]}/></>}
            />
          : <Empty title="No trade has both fields" detail="Pick two fields your trades record."/>}
      </Card>
      </div>}
    </>}
    {tradeId && <TradeDrawer trades={pointTrades} selectedId={tradeId} privacy={privacy} reviews={readStore('trade-reviews', {})} onSelect={setTradeId} onClose={() => setTradeId(null)}/>}
  </>
}

// Field names mid-sentence: lower the first letter, but leave acronyms like P&L and the R in Realized R alone.
const inSentence = (label) => label.split(' ').map((word) => (/[A-Z&]/.test(word.slice(1)) || word.length === 1 ? word : word.toLowerCase())).join(' ')

const pointFormat = (field, privacy) => (value) => {
  if (field === 'pnl') return compactMoney(value, { privacy })
  if (field === 'hold_seconds') return `${Math.round(value / 60)}m`
  if (field === 'hour') return `${Math.floor(value)}:00`
  if (field === 'r') return `${value.toFixed(1)}R`
  return `${value}`
}
const pointValue = (field, value, privacy) => {
  if (field === 'pnl') return money(value, { privacy })
  if (field === 'hold_seconds') return duration(value)
  if (field === 'hour') return `${Math.floor(value)}:${String(Math.round((value % 1) * 60)).padStart(2, '0')}`
  if (field === 'r') return `${value.toFixed(2)}R`
  if (field === 'rating') return '★'.repeat(value)
  return `${value}`
}

/* ============================================================ publish */

const periodOf = (filter = {}) => (filter.from && filter.to ? `${filter.from} to ${filter.to}` : filter.from ? `from ${filter.from}` : filter.to ? `until ${filter.to}` : 'all dates')

/** A date range as few words as it needs: "Aug 2026" for a whole month, "Aug 3 – 17", "Aug 1 – Sep 15", else with years. */
const shortPeriod = (filter = {}) => {
  const { from, to } = filter
  const at = (iso) => new Date(`${iso}T12:00:00Z`)
  const fmt = (iso, options) => at(iso).toLocaleDateString('en-US', { timeZone: 'UTC', ...options })
  if (!from && !to) return 'All dates'
  if (!from) return `Until ${fmt(to, { month: 'short', day: 'numeric', year: 'numeric' })}`
  if (!to) return `Since ${fmt(from, { month: 'short', day: 'numeric', year: 'numeric' })}`
  const sameYear = from.slice(0, 4) === to.slice(0, 4), sameMonth = from.slice(0, 7) === to.slice(0, 7)
  const monthEnd = new Date(Date.UTC(+to.slice(0, 4), +to.slice(5, 7), 0)).getUTCDate()
  if (sameMonth && from.slice(8) === '01' && +to.slice(8) === monthEnd) return fmt(from, { month: 'short', year: 'numeric' })
  if (sameMonth) return `${fmt(from, { month: 'short', day: 'numeric' })} – ${+to.slice(8)}`
  if (sameYear) return `${fmt(from, { month: 'short', day: 'numeric' })} – ${fmt(to, { month: 'short', day: 'numeric' })}`
  return `${fmt(from, { month: 'short', day: 'numeric', year: 'numeric' })} – ${fmt(to, { month: 'short', day: 'numeric', year: 'numeric' })}`
}

const DURATIONS = [['1', '1 day'], ['7', '7 days'], ['30', '30 days'], ['90', '90 days']]
const topOf = (report, n = 2) => [...(report.content?.breakdowns?.symbol ?? [])].sort((x, y) => y.trades - x.trades).slice(0, n).map((row) => row.key)

/** A published report as a notebook-style card: date + tickers strip, title and frozen result, its scope as chips. */
function ReportCard({ report, privacy, onOpen, onShare, fresh, index }) {
  const m = report.content?.metrics
  const symbols = topOf(report)
  const f = report.definition?.filter ?? {}
  const chips = [shortPeriod(f), f.setup, f.direction && (f.direction === 'long' ? 'Long' : 'Short'), f.symbol, report.definition?.include_trades && 'Trades', report.definition?.include_notes && 'Notes'].filter(Boolean)
  return <article className={`home-card ws-card duo rp-rcard${fresh ? ' is-fresh' : ''}`} style={{ '--i': index }}>
    <header className="shell-head rp-rcard-head">
      <span className="card-title"><CalendarBlank size={13} weight="duotone"/>{dateOnly(report.created_at)}</span>
      {symbols.length > 0 && <span className="rp-setcard-syms" aria-label={`Most traded: ${symbols.join(', ')}`}>
        {symbols.map((symbol) => <span key={symbol} className="nb-note-sym"><SymbolToken symbol={symbol}/><b>{symbol}</b></span>)}
      </span>}
    </header>
    <div className="shell-body rp-rcard-body">
      <ReportCover report={report} privacy={privacy}/>
      <div className="rp-rcard-title">
        <h2><button type="button" className="rp-rcard-link" onClick={onOpen}>{report.title}</button></h2>
        <strong className={m ? `tone-${toneOf(m.net_pnl)}` : ''}>{m ? money(m.net_pnl, { privacy }) : '—'}</strong>
      </div>
      {/* scope tags on the left, the two actions on the same row at the right */}
      <div className="rp-rcard-row">
        <div className="rp-rcard-chips">{chips.length > 2 ? <TagStack tags={chips} prefix=""/> : chips.map((chip) => <span key={chip} className="rp-tag">{chip}</span>)}</div>
        <span className="rp-rcard-acts">
          <button type="button" className="rp-setcard-open" onClick={onShare}><Link2 size={13}/> Share</button>
          <button type="button" className="rp-setcard-open" onClick={onOpen}>Open</button>
        </span>
      </div>
    </div>
  </article>
}

/** Share links for one report: pick how long, create (the token is shown once), revoke live ones. */
function SharePane({ report, onChange }) {
  const [days, setDays] = useState('7')
  const [created, setCreated] = useState(null)
  const [copied, setCopied] = useState(false)
  const [pending, setPending] = useState(false)
  const share = () => {
    setCopied(false)
    setPending(true)
    window.setTimeout(() => {
      const next = createShare(Number(days))
      setCreated(next)
      const { token: _token, ...stored } = next
      onChange({ ...report, shares: [stored, ...(report.shares ?? [])] })
      setPending(false)
    }, 380)
  }
  const revoke = (shareId) => onChange({ ...report, shares: report.shares.map((item) => (item.share_id === shareId ? { ...item, revoked_at: new Date().toISOString() } : item)) })
  const link = created ? shareURL(created.token) : ''
  return <div className="rp-share">
    <p className="rp-share-lede">Anyone with a link can read this report, frozen as published, until the link expires or you revoke it.</p>
    <div className="rp-share-make">
      <div className="rp-share-days" role="radiogroup" aria-label="Link lasts">
        {DURATIONS.map(([value, name]) => <button key={value} type="button" role="radio" aria-checked={days === value} className={days === value ? 'on' : ''} onClick={() => setDays(value)}>{name}</button>)}
      </div>
      <button type="button" className="start-day rp-share-go" disabled={pending} onClick={share}><Link2 size={14}/> {pending ? 'Creating…' : 'Create link'}</button>
    </div>
    {created?.token && <div className="rp-newlink" aria-label="New share link">
      <code>{link}</code>
      <button type="button" className={`rp-copy${copied ? ' on' : ''}`} onClick={() => { navigator.clipboard?.writeText(link).catch?.(() => {}); setCopied(true) }}>
        {copied ? <Check size={13} strokeWidth={2.6}/> : <Copy size={13}/>} {copied ? 'Copied' : 'Copy'}
      </button>
      <small>Shown once. Anyone with it can read this report until {dateOnly(created.expires_at)}.</small>
    </div>}
    <div className="rp-share-list">
      <span className="rp-sublabel">Links</span>
      {report.shares?.length > 0 ? <ul className="rp-shares" aria-label={`Links for ${report.title}`}>
        {report.shares.map((item) => {
          const active = shareActive(item)
          const state = item.revoked_at ? 'revoked' : active ? `expires ${dateOnly(item.expires_at)}` : 'expired'
          return <li key={item.share_id}>
            <i className={item.revoked_at ? 'revoked' : active ? 'active' : 'expired'}/>
            <span>Link from {dateOnly(item.created_at)} · {state}</span>
            {active && <button type="button" className="rp-revoke" onClick={() => revoke(item.share_id)}>Revoke</button>}
          </li>
        })}
      </ul> : <p className="rp-muted">No links yet.</p>}
    </div>
  </div>
}

function PublishTab({ trades, privacy, setups, published, setPublished, openReport, filter: shared }) {
  const [own, setOwn] = useState({})
  const filter = shared ?? own
  const [title, setTitle] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(null)
  const [fresh, setFresh] = useState(null)
  const hasPeriod = !!(filter.from && filter.to)
  const publish = () => {
    if (!title.trim() || pending) return
    setPending(true)
    setError(null)
    window.setTimeout(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setPending(false); setError('lost'); return
      }
      const definition = { filter: cleanFilter(filter), include_trades: true, include_notes: hasPeriod }
      const report = { report_id: `rpt-${Date.now().toString(36)}`, title: title.trim(), definition, created_at: new Date().toISOString(), content: snapshot(trades, definition), shares: [] }
      setPublished([report, ...published])
      setTitle('')
      setPending(false)
      setFresh(report.report_id)
    }, 520)
  }
  const matched = useMemo(() => applyFilter(trades, filter).length, [trades, filter])
  return <>
    {/* one line: name it, optionally narrow the trades, publish. Notes come along whenever a date range is set */}
    <section className="home-card ws-card duo rp-compose rp-compose-lite" aria-label="New report">
      <div className="shell-body rp-compose-body">
        <input className="rp-compose-title" aria-label="Report title" maxLength={120} placeholder="Name a new report, e.g. September review" value={title}
          onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') publish() }}/>
        {shared
          ? <span className="rp-compose-scope">{plural(matched, 'trade')}</span>
          : <TradeFilter trades={trades} value={own} onChange={setOwn} setups={setups} label={plural(matched, 'trade')}/>}
        <button type="button" className="start-day rp-compose-go" disabled={!title.trim() || pending} onClick={publish}>
          {pending ? 'Publishing…' : error === 'lost' ? 'Retry' : 'Publish'}
        </button>
      </div>
      {error && <div className="rp-feedback error" role="alert">Publishing could not be confirmed. Retry sends the same report.</div>}
    </section>
    <div className="rp-section-head"><h3>Published</h3><span>{plural(published.length, 'report')} · private to you</span></div>
    {published.length
      ? <div className="rp-rcards">
          {published.map((report, index) => <ReportCard
            key={report.report_id} report={report} privacy={privacy} fresh={fresh === report.report_id} index={index}
            onOpen={() => openReport(report.report_id, 'report')} onShare={() => openReport(report.report_id, 'share')}
          />)}
        </div>
      : <Empty title="Nothing published yet" detail="Give a report a name and publish it above."/>}
  </>
}

/* ============================================================ report view */

function ReportSection({ title, children }) {
  return <section className="rp-rv-section"><h3>{titleCase(title)}</h3>{children}</section>
}

export function ReportView({ report, privacy }) {
  const content = report?.content
  if (!content) return null
  const m = content.metrics
  return <article className="rp-rv" aria-label={`Report ${report.title}`}>
    <header className="rp-rv-head">
      <h1>{report.title}</h1>
      <p>Trading journal report, {periodOf(report.definition?.filter)}. Published {dateTime(report.created_at)}; figures frozen at that time on {content.pnl_basis} P&L.</p>
    </header>
    {!m ? <p className="rp-muted">No trades in this report.</p> : <>
      <div className="rp-rv-kpis">
        {[['Net P&L', money(m.net_pnl, { privacy }), toneOf(m.net_pnl)], ['Trades', `${m.trades}`], ['Win rate', m.win_rate == null ? '—' : `${(m.win_rate * 100).toFixed(1)}%`], ['Profit factor', m.profit_factor == null ? '—' : m.profit_factor.toFixed(2)]].map(([label, value, tone]) => <div key={label}>
          <span>{label}</span><strong className={tone ? `tone-${tone}` : ''}>{value}</strong>
        </div>)}
      </div>
      <ReportSection title="Statistics (USD)">
        <table className="rp-rv-table"><tbody>{metricRows(m, { privacy }).map((row) => <tr key={row.label}>
          <th scope="row">{row.label}</th><td>{row.value}</td><td className="rp-rv-basis">{row.basis}</td>
        </tr>)}</tbody></table>
      </ReportSection>
      {content.days?.length > 0 && <ReportSection title="By day">
        <table className="rp-rv-table" aria-label="Days USD">
          <thead><tr><th>Date</th><th>Trades</th><th>Net</th></tr></thead>
          <tbody>{content.days.map((day) => <tr key={day.date}><th scope="row">{day.date}</th><td>{day.trades}</td><td className={`tone-${toneOf(day.net)}`}>{money(day.net, { privacy })}</td></tr>)}</tbody>
        </table>
      </ReportSection>}
      {['playbook', 'symbol', 'weekday', 'direction'].map((dimension) => content.breakdowns?.[dimension]?.length ? <ReportSection key={dimension} title={`By ${DIMENSIONS[dimension].toLowerCase()}`}>
        <table className="rp-rv-table"><tbody>{content.breakdowns[dimension].map((row) => <tr key={row.key}>
          <th scope="row">{row.label}</th>
          <td>{plural(row.trades, 'trade')}</td>
          <td>{row.win_rate == null ? '—' : `${Math.round(row.win_rate * 100)}% wins`}</td>
          <td className={`tone-${toneOf(row.net_pnl)}`}>{money(row.net_pnl, { privacy })}</td>
        </tr>)}</tbody></table>
      </ReportSection> : null)}
    </>}
    {content.trades?.length > 0 && <ReportSection title="Trades">
      {content.trades.map((trade) => <article key={trade.trade_id} className="rp-rv-trade">
        <div>
          <strong>{trade.symbol ?? 'Trade'}</strong> {trade.direction ?? ''} · {trade.date ?? 'undated'} · <span className={`tone-${toneOf(trade.pnl)}`}>{money(trade.pnl, { privacy })}</span>
          {trade.realized_r != null && ` · ${trade.realized_r.toFixed(2)}R`}{trade.setup && ` · ${trade.setup}`}{trade.rating ? ` · ${'★'.repeat(trade.rating)}` : ''}
        </div>
        {(trade.tags?.length > 0 || trade.mistakes?.length > 0) && <small>{[...trade.tags, ...trade.mistakes.map((item) => `mistake: ${item}`)].join(' · ')}</small>}
        {trade.notes && <p>{trade.notes}</p>}
      </article>)}
      {content.trades_truncated && <p className="rp-muted">The first 200 trades are shown; the statistics cover all of them.</p>}
    </ReportSection>}
    {report.definition?.include_notes && <ReportSection title="Journal notes">
      {content.notes?.length
        ? content.notes.map((note) => <article key={note.entry_id} className="rp-rv-trade"><div><strong>{note.title}</strong> · {note.occurred_on}</div><p>{note.body}</p></article>)
        : <p className="rp-muted">No journal notes in this period.</p>}
      {content.notes_truncated && <p className="rp-muted">The first 100 notes are shown.</p>}
    </ReportSection>}
  </article>
}

/** A published report in the springy drawer: read it (and print it), or manage its share links. */
function ReportDrawer({ report, privacy, view, setView, onClose, onChange }) {
  useEffect(() => { document.body.classList.add('rp-printable'); return () => document.body.classList.remove('rp-printable') }, [])
  if (!report) return null
  const m = report.content?.metrics
  return <Drawer label={`Report ${report.title}`} viewKey={view} width={780} onClose={onClose}>
    <div className="trade-panel dw-trade rp-drawer">
      <div className="tp-head">
        <div>
          <div className="tp-title"><span className="rp-dw-icon"><FileText size={15}/></span><b title={report.title}>{report.title}</b></div>
          <small>Published {dateTime(report.created_at)} · {m ? `${plural(m.trades, 'trade')} · ` : ''}figures frozen</small>
        </div>
        <Segmented options={['Report', 'Share']} value={view === 'share' ? 'Share' : 'Report'} onChange={(next) => setView(next === 'Share' ? 'share' : 'report')} label="Report drawer" className="compact rp-dw-seg"/>
      </div>
      {view === 'share'
        ? <SharePane report={report} onChange={onChange}/>
        : <>
          <div className="rp-dw-doc" data-no-drag><ReportView report={report} privacy={privacy}/></div>
          <div className="dw-actions rp-dw-actions">
            <button type="button" className="ws-outline" onClick={() => setView('share')}><Link2 size={14}/> Share</button>
            <button type="button" className="start-day" onClick={() => window.print()}><Printer size={14}/> Print or save as PDF</button>
          </div>
        </>}
    </div>
  </Drawer>
}

/* ============================================================ page */

export function ReportsPage({ privacy, range = 'All' }) {
  const trades = useMemo(() => scopeByRange(tradeLog, range), [range])
  const setups = useMemo(() => setupsOf(tradeLog), [])
  const [tab, setTabState] = useState(() => { const saved = readStore('rp-tab', 'Insights'); return saved === 'Report builder' ? 'Publish' : TABS.includes(saved) ? saved : 'Insights' })
  const drill = useDrill()
  const setTab = (next) => { drill.close(); setTabState(next); writeStore('rp-tab', next) }
  const [published, setPublishedState] = useState(() => loadPublished(tradeLog))
  const setPublished = (next) => { setPublishedState(next); storePublished(next) }
  const [openId, setOpenId] = useState(null)
  const [buildFilter, setBuildFilter] = useState({})
  const [openView, setOpenView] = useState('report')
  const openReport = (id, view = 'report') => { setOpenView(view); setOpenId(id) }
  const sessions = useMemo(() => new Set(trades.map((trade) => trade.date)).size, [trades])
  const props = { trades, privacy, setups, drill }

  return <div className="page home ws-page rp-page">
    <PageHead
      title="Reports"
      meta={`${plural(trades.length, 'closed trade')} · ${plural(sessions, 'session')} · ${range === 'All' ? 'all dates' : range}`}
      actions={tab !== 'Publish' ? <button type="button" className="ws-outline" onClick={() => setTab('Publish')}><Send size={14}/> Publish a report</button> : null}
    />
    <div className="rp-tabs-row">
      <Segmented options={TABS} value={tab} onChange={setTab} label="Reports" className="rp-tabs"/>
    </div>
    <div className="rp-panel" key={tab}>
      {tab === 'Insights' && <InsightsTab {...props}/>}
      {tab === 'Compare' && <CompareTab {...props}/>}
      {tab === 'Build' && <>
        <Lede>Any metric by any breakdown, two breakdowns as a heatmap, and any two trade fields as a scatter. Click a row, cell or dot to see its trades.</Lede>
        <BuilderTab {...props} filter={buildFilter} setFilter={setBuildFilter}/>
      </>}
      {tab === 'Publish' && <PublishTab {...props} published={published} setPublished={setPublished} openReport={openReport}/>}
    </div>
    <DrillLayer drill={drill.drill} step={drill.step} close={drill.close} privacy={privacy}/>
    {openId && <ReportDrawer report={published.find((item) => item.report_id === openId)} privacy={privacy} view={openView} setView={setOpenView} onClose={() => setOpenId(null)}
      onChange={(next) => setPublished(published.map((item) => (item.report_id === next.report_id ? next : item)))}/>}
  </div>
}
