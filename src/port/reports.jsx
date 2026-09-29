/**
 * Reports: Insights, Compare, Report builder, What if and Publish. Every figure is
 * computed locally from the trade log; published reports, share links and saved
 * reports live in localStorage. Any group on the page (a leak, a set, a bar, a
 * heatmap cell) opens a drawer with its trades, stepping through its siblings.
 */
import React, { useEffect, useMemo, useState } from 'react'
import { ArrowLeftRight, Check, ChevronLeft, ChevronRight, Copy, ExternalLink, Link2, Printer, RotateCcw, Save, Send, X } from 'lucide-react'
import { Card, MetricStrip, PageHead, Segmented, TradeDrawer } from '../workspace'
import { SymbolToken, TipRows, compactMoney, money, percent, toneOf } from '../viz'
import { Drawer, Field, Sheet } from '../dialogs'
import { scopeByRange } from '../analytics'
import { tradeLog } from '../data'
import { HeatmapChart, ScatterChart } from './reports-charts'
import { Spark } from './tile-viz'
import {
  ACCOUNTS, DIMENSIONS, MONEY_METRICS, POINT_FIELDS, REPORT_METRICS, SAVED_LIMIT, SIGNED,
  applyFilter, breakdown, cleanFilter, computeMetrics, createShare, crossBreakdown, duration, filterCount,
  formatMetric, insights as buildInsights, keysOf, labelOf, loadPublished, loadSavedReports, metricRows, metricValue,
  readStore, scatterPoints, shareActive, shareURL, simulate, snapshot, storePublished, storeSavedReports, toScenario, writeStore,
} from './reports-data'
import './reports.css'

const TABS = ['Insights', 'Compare', 'Report builder', 'What if', 'Publish']
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

function Disclosure({ label, count, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return <div className={`rp-disclosure${open ? ' is-open' : ''}`}>
    <button type="button" className="rp-disclosure-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
      <ChevronRight size={14} strokeWidth={2.2} className="rp-caret"/>
      <span>{label}</span>
      {count > 0 && <em>{count} set</em>}
    </button>
    <div className="card-fold" inert={!open}><div className="card-fold-inner">{children}</div></div>
  </div>
}

/** Account, setup, direction, symbol, tag, mistake and period. */
function FilterForm({ name, value, onChange, setups }) {
  const set = (key) => (event) => onChange({ ...value, [key]: event.target.value === '' ? undefined : event.target.value })
  return <fieldset className="rp-filter" aria-label={`Filter ${name}`}>
    <Field label="Account">
      <select value={value.account ?? ''} onChange={set('account')}>
        <option value="">All</option>
        {ACCOUNTS.map((account) => <option key={account}>{account}</option>)}
      </select>
    </Field>
    <Field label="Setup">
      <select value={value.setup ?? ''} onChange={set('setup')}>
        <option value="">Any</option>
        {setups.map((setup) => <option key={setup}>{setup}</option>)}
      </select>
    </Field>
    <Field label="Direction">
      <select value={value.direction ?? ''} onChange={set('direction')}>
        <option value="">Both</option>
        <option value="long">Long</option>
        <option value="short">Short</option>
      </select>
    </Field>
    <Field label="Symbol"><input value={value.symbol ?? ''} onChange={set('symbol')} placeholder="Any"/></Field>
    <Field label="Tag"><input value={value.tag ?? ''} onChange={set('tag')} placeholder="Any"/></Field>
    <Field label="Mistake"><input value={value.mistake ?? ''} onChange={set('mistake')} placeholder="Any"/></Field>
    <Field label="From"><input type="date" value={value.from ?? ''} onChange={set('from')}/></Field>
    <Field label="To"><input type="date" value={value.to ?? ''} onChange={set('to')}/></Field>
  </fieldset>
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

function GroupRow({ row, privacy, peak, onOpen, current, bare = false }) {
  return <li>
    <button type="button" className={`rp-row${current ? ' is-current' : ''}`} onClick={onOpen} aria-label={`${DIMENSIONS[row.dimension]} ${row.label}: ${money(row.net_pnl, { privacy })} over ${plural(row.trades, 'trade')}, ${winPct(row.win_rate)} won. Open trades`}>
      <span className="rp-row-top">
        {!bare && <span className="rp-dim">{DIMENSIONS[row.dimension]}</span>}
        <b title={row.label}>{row.label}</b>
        <strong className={`tone-${toneOf(row.net_pnl)}`}>{money(row.net_pnl, { privacy, decimals: 0 })}</strong>
      </span>
      <span className="rp-row-sub">
        <span className="rp-track" aria-hidden="true"><i className={toneOf(row.net_pnl)} style={{ width: `${Math.max(3, (Math.abs(row.net_pnl) / peak) * 100)}%` }}/></span>
        <small>{plural(row.trades, 'trade')} · {winPct(row.win_rate)} won</small>
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
      <Card shell title="Biggest leaks" aside={<span className="ws-hint">Losing groups</span>}>
        {view.leaks.length
          ? <ol className="rp-rows">{view.leaks.map((row, index) => <GroupRow key={`${row.dimension}-${row.key}`} row={row} privacy={privacy} peak={peak} current={openId === `${row.dimension}-${row.key}`} onOpen={() => openRow(view.leaks, index)}/>)}</ol>
          : <Empty title="No losing group" detail="Nothing with 5+ trades is net negative."/>}
      </Card>
      <Card shell title="What works" aside={<span className="ws-hint">Best per breakdown</span>}>
        {view.best.length
          ? <ol className="rp-rows">{view.best.map((row, index) => <GroupRow key={`${row.dimension}-${row.key}`} row={row} privacy={privacy} peak={peak} current={openId === `${row.dimension}-${row.key}`} onOpen={() => openRow(view.best, index)}/>)}</ol>
          : <Empty title="Not enough trades" detail="Each group needs 5+ trades."/>}
      </Card>
      <Card shell title="Your rules" aside={<span className="ws-hint">Per trade</span>}>
        {rules ? <div className="rp-rules">
          {[['followed', 'Followed', rules.followed_net_pnl, rules.followed_trades], ['broken', 'Broke a rule', rules.broken_net_pnl, rules.broken_trades]].map(([id, name, net, count], index) => <button
            key={id} type="button" className={`rp-plate${openId === id ? ' is-current' : ''}`} onClick={() => drill.open(ruleGroups(), index)}
            aria-label={`${name}: ${money(count ? net / count : 0, { privacy })} per trade over ${plural(count, 'trade')}. Open trades`}
          >
            <span>{name}</span>
            <strong className={`tone-${toneOf(net)}`}>{money(count ? net / count : 0, { privacy, decimals: 0 })}</strong>
            <small>per trade · {plural(count, 'trade')}</small>
            <ChevronRight size={14} className="rp-plate-go" aria-hidden="true"/>
          </button>)}
          <div className="rp-rules-share">
            <div className="rp-rules-bar" aria-hidden="true">
              <i className="pos" style={{ flex: rules.followed_trades || 0.0001 }}/>
              <i className="neg" style={{ flex: rules.broken_trades || 0.0001 }}/>
            </div>
            <small><b>{Math.round((rules.followed_trades / Math.max(1, rules.followed_trades + rules.broken_trades)) * 100)}%</b> of trades followed every rule</small>
          </div>
          {broken.length > 0 && <div className="rp-rules-list">
            <span className="rp-sublabel">Broken most</span>
            <ol className="rp-rows">{broken.map((row, index) => <GroupRow key={row.key} bare row={row} privacy={privacy} peak={brokenPeak} current={openId === `rule-${row.key}`} onOpen={() => drill.open(broken.map((item) => group(`rule-${item.key}`, item.label, 'Rule broken', inGroup(list, 'rule', item.key))), index)}/>)}</ol>
          </div>}
        </div> : <Empty title="No rules yet" detail="Set trading rules in Settings to see what breaking them costs."/>}
      </Card>
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

function CompareTab({ trades, privacy, setups, drill }) {
  const [a, setA] = useState(() => readStore('rp-compare-a', { direction: 'long' }))
  const [b, setB] = useState(() => readStore('rp-compare-b', { direction: 'short' }))
  useEffect(() => { writeStore('rp-compare-a', a); writeStore('rp-compare-b', b) }, [a, b])
  const listA = useMemo(() => applyFilter(trades, a), [trades, a])
  const listB = useMemo(() => applyFilter(trades, b), [trades, b])
  const ma = useMemo(() => computeMetrics(listA), [listA])
  const mb = useMemo(() => computeMetrics(listB), [listB])
  const rowsA = metricRows(ma, { privacy, only: COMPARE_ROWS })
  const rowsB = metricRows(mb, { privacy, only: COMPARE_ROWS })
  const groups = () => [group('set-a', summary(a), 'Set A', listA), group('set-b', summary(b), 'Set B', listB)]
  const net = difference('Net P&L', rowsA[0], rowsB[0], privacy)
  const openId = drill.drill?.groups[drill.drill.index]?.id
  return <>
    <Lede aside={<button type="button" className="ws-outline rp-small" onClick={() => { setA(b); setB(a) }}><ArrowLeftRight size={13}/> Swap A and B</button>}>
      Put two sets of trades side by side: one setup against another, longs against shorts, or a mistake against the rest.
    </Lede>
    <div className="ws-grid one-one rp-sets">
      {[['A', a, setA, ma], ['B', b, setB, mb]].map(([key, value, setValue, m]) => <Card
        key={key} shell className="rp-set"
        title={<><span className={`rp-set-chip set-${key.toLowerCase()}`}>{key}</span>Set {key}</>}
        aside={<span className="rp-set-aside">
          <span className="ws-hint">{plural(m?.trades ?? 0, 'trade')}</span>
          {filterCount(value) > 0 && <button type="button" className="rp-clear" onClick={() => setValue({})}>Clear</button>}
        </span>}
      >
        <FilterForm name={`set ${key}`} value={value} onChange={(next) => setValue(cleanFilter(next))} setups={setups}/>
      </Card>)}
    </div>

    <div className="rp-vs">
      {[['A', ma, 0], ['B', mb, 1]].map(([key, m, index]) => <button
        key={key} type="button" className={`rp-vs-side${openId === `set-${key.toLowerCase()}` ? ' is-current' : ''}`} disabled={!m}
        onClick={() => drill.open(groups(), index)} aria-label={`Set ${key}: ${m ? money(m.net_pnl, { privacy }) : 'no trades'}. Open trades`}
      >
        <span className={`rp-set-chip set-${key.toLowerCase()}`}>{key}</span>
        <span className="rp-vs-copy">
          <strong className={`tone-${toneOf(m?.net_pnl ?? 0)}`}>{m ? money(m.net_pnl, { privacy }) : '—'}</strong>
          <small>{m ? `${plural(m.trades, 'trade')} · ${winPct(m.win_rate)} won` : 'No trades match'}</small>
        </span>
        {m && <ChevronRight size={15} className="rp-plate-go" aria-hidden="true"/>}
      </button>)}
      <div className="rp-vs-delta">
        <span>B − A</span>
        <strong className={net ? `tone-${net.tone}` : ''}>{net?.text ?? '—'}</strong>
      </div>
    </div>

    <Card shell title="Side by side" aside={<span className="ws-hint">Green means B is ahead</span>} className="rp-compare">
      {!ma && !mb ? <Empty title="Neither set has trades" detail="Loosen a filter on either side."/> : <div className="ws-table-wrap">
        <table className="rp-table rp-compare-table">
          <thead><tr><th>Metric</th><th><span className="rp-set-chip set-a">A</span></th><th><span className="rp-set-chip set-b">B</span></th><th>B − A</th></tr></thead>
          <tbody>{COMPARE_ROWS.map((label, index) => {
            const left = rowsA[index]; const right = rowsB[index]
            const diff = difference(label, left, right, privacy)
            return <tr key={label}>
              <th scope="row">{label}</th>
              <td title={left?.basis}>{left?.value ?? '—'}</td>
              <td title={right?.basis}>{right?.value ?? '—'}</td>
              <td>{diff ? <span className={`rp-delta tone-${diff.tone}`}>{diff.text}</span> : <span className="rp-delta-none">—</span>}</td>
            </tr>
          })}</tbody>
        </table>
      </div>}
    </Card>
  </>
}

/* ============================================================ report builder */

const shortLabel = (dimension, label) => (dimension === 'weekday' || dimension === 'month' ? label.slice(0, 3) : label)

/** Ranked horizontal bars, zero-anchored when the metric has a sign; every row opens its trades. */
function RankBars({ rows, format, signed, onOpen, currentId }) {
  const peak = Math.max(1e-9, ...rows.map((row) => Math.abs(row.value)))
  const hasNeg = signed && rows.some((row) => row.value < 0)
  return <ol className={`rp-bars${hasNeg ? ' has-neg' : ''}`}>
    {rows.map((row, index) => {
      const share = Math.max(1.5, (Math.abs(row.value) / peak) * 100)
      const tone = signed ? toneOf(row.value) : 'ink'
      return <li key={row.id}>
        <button type="button" className={`rp-bar${currentId === row.id ? ' is-current' : ''}`} onClick={() => onOpen(index)} aria-label={`${row.label}: ${format(row.value)} over ${plural(row.trades, 'trade')}. Open trades`}>
          <span className="rp-bar-label"><b>{row.label}</b><small>{plural(row.trades, 'trade')} · {winPct(row.winRate)} won</small></span>
          <span className="rp-bar-track" aria-hidden="true">
            {hasNeg && <i className="rp-bar-zero"/>}
            <i className={`rp-bar-fill ${tone}${row.value < 0 ? ' is-neg' : ''}`} style={{ '--share': `${hasNeg ? share / 2 : share}%` }}/>
          </span>
          <strong className={signed ? `tone-${tone}` : ''}>{format(row.value)}</strong>
        </button>
      </li>
    })}
  </ol>
}

function BuilderTab({ trades, privacy, setups, drill }) {
  const [metric, setMetric] = useState('net_pnl')
  const [rows, setRows] = useState('playbook')
  const [columns, setColumns] = useState('')
  const [scatter, setScatter] = useState(['hold_seconds', 'pnl'])
  const [filter, setFilter] = useState({})
  const [saved, setSaved] = useState(loadSavedReports)
  const [name, setName] = useState('')
  const [active, setActive] = useState(null)
  const [tradeId, setTradeId] = useState(null)

  const list = useMemo(() => applyFilter(trades, filter), [trades, filter])
  const cross = columns && columns !== rows
  const bars = useMemo(() => breakdown(list, rows)
    .map((row) => ({ id: `${rows}-${row.key}`, key: row.key, label: row.label, value: metricValue(row, metric), trades: row.trades, winRate: row.win_rate }))
    .filter((row) => row.value != null), [list, rows, metric])
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
    <Lede>Any metric by any breakdown, two breakdowns as a heatmap, and any two trade fields as a scatter. Click a bar, cell or dot to see its trades.</Lede>
    <Card shell title="Build" aside={<span className="ws-hint">{plural(list.length, 'trade')} in view</span>} className="rp-builder">
      <div className="rp-controls">
        <Field label="Metric">
          <select aria-label="Report metric" value={metric} onChange={(event) => setMetric(event.target.value)}>
            {Object.entries(REPORT_METRICS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </Field>
        <Field label="By">
          <select aria-label="Report rows" value={rows} onChange={(event) => setRows(event.target.value)}>
            {Object.entries(DIMENSIONS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </Field>
        <Field label="And by">
          <select aria-label="Report columns" value={columns} onChange={(event) => setColumns(event.target.value)}>
            <option value="">Nothing (bars)</option>
            {Object.entries(DIMENSIONS).filter(([key]) => key !== rows).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </Field>
        <Field label="Scatter across">
          <select aria-label="Scatter x" value={scatter?.[0] ?? ''} onChange={(event) => changeX(event.target.value)}>
            <option value="">No scatter</option>
            {Object.entries(POINT_FIELDS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </Field>
        <Field label="Scatter up">
          <select aria-label="Scatter y" value={scatter?.[1] ?? ''} disabled={!scatter} onChange={(event) => setScatter([scatter[0], event.target.value])}>
            {!scatter && <option value="">—</option>}
            {scatter && Object.entries(POINT_FIELDS).filter(([key]) => key !== scatter[0]).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </Field>
      </div>

      <Disclosure label="Filter the trades" count={filterCount(filter)}>
        <FilterForm name="report" value={filter} onChange={(next) => setFilter(cleanFilter(next))} setups={setups}/>
      </Disclosure>

      <div className="rp-saved" aria-label="Saved reports">
        <span className="rp-saved-label">Saved</span>
        {saved.map((entry) => <span key={entry.name} className={`rp-saved-chip${active === entry.name ? ' on' : ''}`}>
          <button type="button" onClick={() => loadReport(entry)}>{entry.name}</button>
          <button type="button" aria-label={`Delete report ${entry.name}`} onClick={() => { persist(saved.filter((item) => item !== entry)); if (active === entry.name) setActive(null) }}><X size={11} strokeWidth={2.4}/></button>
        </span>)}
        {!saved.length && <span className="rp-muted">None yet</span>}
        <div className="rp-saved-new">
          <input aria-label="Report name" placeholder="Name this view" maxLength={60} value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') saveReport() }}/>
          <button type="button" className="ws-outline rp-small" disabled={!name.trim() || saved.length >= SAVED_LIMIT} onClick={saveReport}><Save size={13}/> Save</button>
        </div>
      </div>
    </Card>

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
        : <Card shell title={`${metricLabel} by ${DIMENSIONS[rows]}`} aside={<span className="ws-hint">{plural(bars.length, 'group')}</span>}>
            {bars.length
              ? <RankBars rows={bars} format={format} signed={SIGNED.has(metric)} onOpen={openBar} currentId={openId}/>
              : <Empty title="Nothing to rank" detail="No group has a value for this metric."/>}
          </Card>}
      {scatter && <Card shell title={`${POINT_FIELDS[scatter[1]]} against ${POINT_FIELDS[scatter[0]]}`} aside={<div className="ws-legend"><span><i className="rp-key pos"/>Win</span><span><i className="rp-key neg"/>Loss</span></div>}>
        {points.length
          ? <ScatterChart
              points={points} xLabel={POINT_FIELDS[scatter[0]]} yLabel={POINT_FIELDS[scatter[1]]}
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
        <p className="rp-caption">{points.length} of {list.length} trades have both {POINT_FIELDS[scatter[0]].toLowerCase()} and {POINT_FIELDS[scatter[1]].toLowerCase()}. Click a dot to open the trade.</p>
      </Card>}
    </>}
    {tradeId && <TradeDrawer trades={pointTrades} selectedId={tradeId} privacy={privacy} reviews={readStore('trade-reviews', {})} onSelect={setTradeId} onClose={() => setTradeId(null)}/>}
  </>
}

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

/* ============================================================ what if */

const WHATIF_ROWS = ['Net P&L', 'Trades', 'Win rate', 'Profit factor', 'Expectancy', 'Average R', 'Max drawdown', 'Edge score']
const BLANK_FORM = { mistake: '', tag: '', maxPerDay: '', fixedRisk: '', dailyLoss: '', withoutRuleBreaks: false }

function WhatIfTab({ trades, privacy, setups, drill }) {
  const [form, setForm] = useState(BLANK_FORM)
  const [filter, setFilter] = useState({})
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value })
  const scenario = toScenario(form)
  const result = useMemo(() => {
    if (!scenario) return null
    const base = applyFilter(trades, filter)
    const sim = simulate(base, scenario)
    const kept = new Set(sim.trades.map((trade) => trade.id))
    return { base, kept: sim.trades, removed: base.filter((trade) => !kept.has(trade.id)), actual: computeMetrics(base), whatIf: computeMetrics(sim.trades), counts: sim.counts, basis: sim.pnl_basis }
  }, [trades, filter, JSON.stringify(scenario)])
  const change = result ? (result.whatIf?.net_pnl ?? 0) - (result.actual?.net_pnl ?? 0) : 0
  const actualRows = metricRows(result?.actual, { privacy, only: WHATIF_ROWS })
  const whatRows = metricRows(result?.whatIf, { privacy, only: WHATIF_ROWS })
  const groups = () => [
    group('removed', 'Trades the scenario drops', 'What if', result.removed),
    group('kept', 'Trades the scenario keeps', 'What if', result.base.filter((trade) => !result.removed.includes(trade))),
  ]
  const counts = result ? [
    ['excluded', 'excluded'], ['rule_breaks', 'broke a rule'], ['over_daily_max', 'past the daily count'],
    ['after_stop', 'after the daily stop'], ['without_r', 'without R'], ['resized', 'resized'],
  ].filter(([key]) => result.counts[key] > 0) : []
  const openId = drill.drill?.groups[drill.drill.index]?.id
  const presets = useMemo(() => {
    const base = applyFilter(trades, filter)
    const actual = computeMetrics(base)?.net_pnl ?? 0
    const costly = breakdown(base, 'mistake').filter((row) => row.key !== 'none').sort((x, y) => x.net_pnl - y.net_pnl)[0]
    return [
      costly && { id: 'mistake', title: `Skip “${costly.label}”`, detail: `${plural(costly.trades, 'trade')} carry this mistake`, form: { ...BLANK_FORM, mistake: costly.key } },
      { id: 'first', title: 'First 2 trades a day', detail: 'Stop trading after your second trade', form: { ...BLANK_FORM, maxPerDay: '2' } },
      { id: 'stop', title: 'Stop the day at −$300', detail: 'No new trades once the day is down $300', form: { ...BLANK_FORM, dailyLoss: '300' } },
      { id: 'rules', title: 'Only rule-following trades', detail: 'Drop every trade that broke a rule', form: { ...BLANK_FORM, withoutRuleBreaks: true } },
    ].filter(Boolean).map((preset) => {
      const sim = simulate(base, toScenario(preset.form))
      return { ...preset, change: (computeMetrics(sim.trades)?.net_pnl ?? 0) - actual }
    })
  }, [trades, filter])
  return <>
    <Lede>Re-run your statistics with one change: skip a mistake or tag, take only your first trades each day, risk the same on every trade, or stop the day at a loss. Your real statistics never change.</Lede>
    <Card shell title="Scenario" className="rp-scenario" aside={scenario ? <button type="button" className="rp-clear" onClick={() => setForm(BLANK_FORM)}><RotateCcw size={11} strokeWidth={2.4}/> Reset</button> : <span className="ws-hint">Fill in any field</span>}>
      <div className="rp-controls">
        <Field label="Without mistake"><input value={form.mistake} onChange={set('mistake')} placeholder="moved stop"/></Field>
        <Field label="Without tag"><input value={form.tag} onChange={set('tag')} placeholder="chased"/></Field>
        <Field label="First N trades a day"><input type="number" min="1" value={form.maxPerDay} onChange={set('maxPerDay')} placeholder="2"/></Field>
        <Field label="Same risk per trade"><input inputMode="decimal" value={form.fixedRisk} onChange={set('fixedRisk')} placeholder="$ at 1R"/></Field>
        <Field label="Stop the day at a loss of"><input inputMode="decimal" value={form.dailyLoss} onChange={set('dailyLoss')} placeholder="$500"/></Field>
      </div>
      <label className="rp-check">
        <input type="checkbox" checked={form.withoutRuleBreaks} onChange={set('withoutRuleBreaks')}/>
        <span>Only trades that followed my rules</span>
      </label>
      <Disclosure label="Only some trades" count={filterCount(filter)}>
        <FilterForm name="what if" value={filter} onChange={(next) => setFilter(cleanFilter(next))} setups={setups}/>
      </Disclosure>
    </Card>

    {!scenario ? <Card shell title="Try one" aside={<span className="ws-hint">Net P&L change if you had</span>}>
      <div className="rp-presets">
        {presets.map((preset) => <button key={preset.id} type="button" className="rp-plate rp-preset" onClick={() => setForm(preset.form)}>
          <span>{preset.title}</span>
          <strong className={`tone-${toneOf(preset.change)}`}>{signedMoney(preset.change, privacy)}</strong>
          <small>{preset.detail}</small>
          <ChevronRight size={14} className="rp-plate-go" aria-hidden="true"/>
        </button>)}
      </div>
    </Card> : <>
      <div className="rp-sim">
        <button type="button" className={`rp-vs-side rp-sim-card${openId === 'removed' ? ' is-current' : ''}`} disabled={!result.removed.length} onClick={() => drill.open(groups(), 0)}>
          <span className="rp-vs-copy">
            <small>Dropped</small>
            <strong>{plural(result.removed.length, 'trade')}</strong>
            <small>{counts.length ? counts.map(([key, text]) => `${result.counts[key]} ${text}`).join(' · ') : 'Nothing dropped; trades resized only'}</small>
          </span>
          {result.removed.length > 0 && <ChevronRight size={15} className="rp-plate-go" aria-hidden="true"/>}
        </button>
        <div className="rp-vs-delta">
          <span>Net P&L change{result.basis && result.basis !== 'net' ? ` · ${result.basis} P&L` : ''}</span>
          <strong className={`tone-${toneOf(change)}`}>{signedMoney(change, privacy)}</strong>
          <small>{money(result.actual?.net_pnl ?? 0, { privacy, decimals: 0 })} → {money(result.whatIf?.net_pnl ?? 0, { privacy, decimals: 0 })}</small>
        </div>
      </div>
      <MetricStrip items={[
        { label: 'Trades kept', value: `${result.whatIf?.trades ?? 0}`, sub: `of ${result.actual?.trades ?? 0} actual`, line: { type: 'dashes', share: (result.whatIf?.trades ?? 0) / Math.max(1, result.actual?.trades ?? 0), total: 14 } },
        { label: 'Win rate', value: result.whatIf?.win_rate == null ? '—' : percent(result.whatIf.win_rate * 100), sub: `Actual ${result.actual?.win_rate == null ? '—' : percent(result.actual.win_rate * 100)}`, line: gauge(result.whatIf?.win_rate ?? 0, { mark: result.actual?.win_rate ?? 0.5 }) },
        { label: 'Profit factor', value: result.whatIf?.profit_factor == null ? '—' : result.whatIf.profit_factor.toFixed(2), sub: `Actual ${result.actual?.profit_factor == null ? '—' : result.actual.profit_factor.toFixed(2)}`, line: gauge((result.whatIf?.profit_factor ?? 0) / 3, { mark: (result.actual?.profit_factor ?? 1) / 3 }) },
        { label: 'Max drawdown', value: money(result.whatIf?.max_drawdown ?? 0, { privacy }), tone: 'neg', sub: `Actual ${money(result.actual?.max_drawdown ?? 0, { privacy, decimals: 0 })}`, line: gauge(Math.abs(result.whatIf?.max_drawdown ?? 0) / Math.max(1, Math.abs(result.actual?.max_drawdown ?? 0), Math.abs(result.whatIf?.max_drawdown ?? 0)), { tone: 'neg' }) },
      ]}/>
      <Card shell title="Actual against simulated" aside={<span className="ws-hint">Simulated, not real</span>}>
        <div className="ws-table-wrap">
          <table className="rp-table rp-whatif-table">
            <thead><tr><th>Metric</th><th>Actual</th><th>What if</th></tr></thead>
            <tbody>{WHATIF_ROWS.map((label, index) => {
              const diff = difference(label, actualRows[index], whatRows[index], privacy)
              return <tr key={label}>
                <th scope="row">{label}</th>
                <td>{actualRows[index]?.value ?? '—'}</td>
                <td><span className="rp-sim-value">{whatRows[index]?.value ?? '—'}</span>{diff && <span className={`rp-delta tone-${diff.tone}`}>{diff.text}</span>}</td>
              </tr>
            })}</tbody>
          </table>
        </div>
      </Card>
    </>}
  </>
}

/* ============================================================ publish */

const periodOf = (filter = {}) => (filter.from && filter.to ? `${filter.from} to ${filter.to}` : filter.from ? `from ${filter.from}` : filter.to ? `until ${filter.to}` : 'all dates')

function ReportRow({ report, privacy, onOpen, onChange, fresh }) {
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
  const m = report.content?.metrics
  return <li className={`rp-report${fresh ? ' is-fresh' : ''}`}>
    <div className="rp-report-top">
      <button type="button" className="rp-report-id" onClick={onOpen}>
        <strong>{report.title}</strong>
        <span>{dateTime(report.created_at)}</span>
      </button>
      {m && <span className="rp-report-fig"><b className={`tone-${toneOf(m.net_pnl)}`}>{money(m.net_pnl, { privacy })}</b><small>{plural(m.trades, 'trade')}</small></span>}
    </div>
    <div className="rp-report-meta">
      <span className="rp-tag">{periodOf(report.definition?.filter)}</span>
      {report.definition?.filter?.setup && <span className="rp-tag">{report.definition.filter.setup}</span>}
      {report.definition?.include_trades && <span className="rp-tag">Trades</span>}
      {report.definition?.include_notes && <span className="rp-tag">Notes</span>}
      <div className="rp-report-actions">
        <button type="button" className="ws-outline rp-small" onClick={onOpen}><ExternalLink size={13}/> Open</button>
        <select className="rp-days" aria-label={`Share ${report.title} for`} value={days} onChange={(event) => setDays(event.target.value)}>
          <option value="1">1 day</option><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option>
        </select>
        <button type="button" className="ws-outline rp-small" disabled={pending} onClick={share}><Link2 size={13}/> {pending ? 'Creating…' : 'Share link'}</button>
      </div>
    </div>
    {created?.token && <div className="rp-newlink" aria-label="New share link">
      <code>{link}</code>
      <button type="button" className={`rp-copy${copied ? ' on' : ''}`} onClick={() => { navigator.clipboard?.writeText(link).catch?.(() => {}); setCopied(true) }}>
        {copied ? <Check size={13} strokeWidth={2.6}/> : <Copy size={13}/>} {copied ? 'Copied' : 'Copy'}
      </button>
      <small>Shown once. Anyone with it can read this report until {dateOnly(created.expires_at)}.</small>
    </div>}
    {report.shares?.length > 0 && <ul className="rp-shares" aria-label={`Links for ${report.title}`}>
      {report.shares.map((item) => {
        const active = shareActive(item)
        const state = item.revoked_at ? 'revoked' : active ? `expires ${dateOnly(item.expires_at)}` : 'expired'
        return <li key={item.share_id}>
          <i className={item.revoked_at ? 'revoked' : active ? 'active' : 'expired'}/>
          <span>Link from {dateOnly(item.created_at)} · {state}</span>
          {active && <button type="button" className="rp-revoke" onClick={() => revoke(item.share_id)}>Revoke</button>}
        </li>
      })}
    </ul>}
  </li>
}

function PublishTab({ trades, privacy, setups, published, setPublished, openReport }) {
  const [title, setTitle] = useState('')
  const [includeTrades, setIncludeTrades] = useState(true)
  const [notes, setNotes] = useState(false)
  const [filter, setFilter] = useState({})
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
      const definition = { filter: cleanFilter(filter), include_trades: includeTrades, include_notes: notes && hasPeriod }
      const report = { report_id: `rpt-${Date.now().toString(36)}`, title: title.trim(), definition, created_at: new Date().toISOString(), content: snapshot(trades, definition), shares: [] }
      setPublished([report, ...published])
      setTitle('')
      setPending(false)
      setFresh(report.report_id)
    }, 520)
  }
  const matched = useMemo(() => applyFilter(trades, filter).length, [trades, filter])
  return <>
    <Lede>Freeze your statistics, days, trades and notes as they are now. Open a report to print it or save a PDF, or share a read-only link that expires.</Lede>
    <Card shell title="New report" aside={<span className="ws-hint">{plural(matched, 'trade')} match</span>} className="rp-new">
      <div className="rp-publish-row">
        <Field label="Title"><input maxLength={120} placeholder="September review" value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') publish() }}/></Field>
        <div className="rp-includes" role="group" aria-label="Include">
          <label className="rp-check"><input type="checkbox" checked={includeTrades} onChange={(event) => setIncludeTrades(event.target.checked)}/><span>Trades</span></label>
          <label className={`rp-check${hasPeriod ? '' : ' is-disabled'}`} title={hasPeriod ? undefined : 'Set a From and To date to include notes'}>
            <input type="checkbox" disabled={!hasPeriod} checked={notes && hasPeriod} onChange={(event) => setNotes(event.target.checked)}/><span>Notes</span>
          </label>
        </div>
        <button type="button" className="start-day" disabled={!title.trim() || pending} onClick={publish}>
          <Send size={14}/> {pending ? 'Publishing…' : error === 'lost' ? 'Retry' : 'Publish'}
        </button>
      </div>
      {error && <div className="rp-feedback error" role="alert">Publishing could not be confirmed. Retry sends the same report.</div>}
      <Disclosure label="Limit to some trades" count={filterCount(filter)}>
        <FilterForm name="report" value={filter} onChange={(next) => setFilter(cleanFilter(next))} setups={setups}/>
      </Disclosure>
    </Card>
    <Card shell title="Published" aside={<span className="ws-hint">{plural(published.length, 'report')} · private to you</span>}>
      {published.length
        ? <ul className="rp-reports">
            {published.map((report) => <ReportRow
              key={report.report_id} report={report} privacy={privacy} fresh={fresh === report.report_id}
              onOpen={() => openReport(report.report_id)}
              onChange={(next) => setPublished(published.map((item) => (item.report_id === next.report_id ? next : item)))}
            />)}
          </ul>
        : <Empty title="Nothing published yet" detail="Give a report a title and publish it above."/>}
    </Card>
  </>
}

/* ============================================================ report view */

function ReportSection({ title, children }) {
  return <section className="rp-rv-section"><h3>{title}</h3>{children}</section>
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

function ReportSheet({ report, privacy, onClose }) {
  const [view, setView] = useState('Owner')
  useEffect(() => { document.body.classList.add('rp-printable'); return () => document.body.classList.remove('rp-printable') }, [])
  return <Sheet
    title={view === 'Owner' ? 'Published report' : 'Shared link preview'}
    subtitle={view === 'Owner' ? 'Private to you · figures frozen when published' : 'Read-only trading journal report shared with you'}
    onClose={onClose} width={760} className="rp-sheet"
    footer={<>
      <Segmented options={['Owner', 'Shared view']} value={view} onChange={setView} label="Report view" className="rp-sheet-seg"/>
      <div className="dlg-actions">
        <button type="button" className="ws-outline" onClick={onClose}>Back to reports</button>
        <button type="button" className={view === 'Owner' ? 'start-day' : 'ws-outline'} disabled={!report} onClick={() => window.print()}><Printer size={14}/> Print or save as PDF</button>
      </div>
    </>}
  >
    {report ? <ReportView report={report} privacy={privacy}/> : <div className="rp-feedback error" role="alert">This report could not be loaded.</div>}
  </Sheet>
}

/* ============================================================ page */

export function ReportsPage({ privacy, range = 'All' }) {
  const trades = useMemo(() => scopeByRange(tradeLog, range), [range])
  const setups = useMemo(() => setupsOf(tradeLog), [])
  const [tab, setTabState] = useState(() => { const saved = readStore('rp-tab', 'Insights'); return TABS.includes(saved) ? saved : 'Insights' })
  const drill = useDrill()
  const setTab = (next) => { drill.close(); setTabState(next); writeStore('rp-tab', next) }
  const [published, setPublishedState] = useState(() => loadPublished(tradeLog))
  const setPublished = (next) => { setPublishedState(next); storePublished(next) }
  const [openId, setOpenId] = useState(null)
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
      {tab === 'Report builder' && <BuilderTab {...props}/>}
      {tab === 'What if' && <WhatIfTab {...props}/>}
      {tab === 'Publish' && <PublishTab {...props} published={published} setPublished={setPublished} openReport={setOpenId}/>}
    </div>
    <DrillLayer drill={drill.drill} step={drill.step} close={drill.close} privacy={privacy}/>
    {openId && <ReportSheet report={published.find((item) => item.report_id === openId)} privacy={privacy} onClose={() => setOpenId(null)}/>}
  </div>
}
