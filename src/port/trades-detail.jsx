/**
 * Trade "Fills & details" sheet: P&L from the fills, a candle chart with bar-by-bar
 * replay, the fills table, plan vs execution, links, grouping history and regroup.
 */
import React, { useMemo, useState } from 'react'
import { Sheet } from '../dialogs'
import { TipRows, Tooltip, money, niceTicks, useSize } from '../viz'
import {
  KEYS, atLabel, barIndex, barsFor, duration, fifo, fillsFor, loadUngrouped, readJSON, round, samplePlan, stamp,
  stopFor, writeJSON, clockOf,
} from './trading-data'
import './trades.css'

const cap = (text) => text.charAt(0).toUpperCase() + text.slice(1)
const px = (value, digits = 2) => (value == null ? '—' : Number(value).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: 4 }))
export const pnlSourceLabel = (trade) => (trade.logged && !trade.fills?.length ? 'Manual P&L' : 'From executions (USD)')

/** Exact-amount span: rounded to cents, the unrounded decimal on hover. */
function Exact({ value, privacy, strong = false }) {
  const Tag = strong ? 'b' : 'span'
  return <Tag className={`tone-${value > 0 ? 'pos' : value < 0 ? 'neg' : 'flat'}`}>{money(value, { privacy })}</Tag>
}

/* ------------------------------------------------------------ chart */

function CandleChart({ bars, cursor, fills, avgEntry, stop, symbol, privacy }) {
  const [ref, size] = useSize()
  const [hover, setHover] = useState(null)
  const width = size.width || 640
  const height = 176
  const pad = { top: 8, right: 8, bottom: 22, left: 44 }
  const plotW = Math.max(60, width - pad.left - pad.right)
  const plotH = height - pad.top - pad.bottom
  const lows = bars.map((bar) => bar.low).concat(stop ?? [])
  const highs = bars.map((bar) => bar.high).concat(stop ?? [])
  const lo = Math.min(...lows); const hi = Math.max(...highs)
  const span = hi - lo || 1
  const yAt = (value) => pad.top + (1 - (value - lo) / span) * plotH
  const band = plotW / bars.length
  const xAt = (index) => pad.left + index * band + band / 2
  const ticks = niceTicks(lo, hi, 3).filter((tick) => tick >= lo && tick <= hi)
  const visible = bars.slice(0, cursor)
  const shown = fills.filter((fill) => barIndex(bars, fill) < cursor)
  const labelEvery = Math.max(1, Math.ceil(bars.length / Math.max(2, Math.floor(plotW / 64))))
  const active = hover != null && hover < cursor ? bars[hover] : null
  const refs = [
    avgEntry != null && { key: 'entry', y: yAt(avgEntry), label: `Avg ${privacy ? '••' : px(avgEntry)}` },
    stop != null && { key: 'stop', y: yAt(stop), label: `Stop ${privacy ? '••' : px(stop)}` },
  ].filter(Boolean)
  return <div className="tx-candles" ref={ref} role="img" aria-label={`Candles for ${symbol} with ${shown.length} of ${fills.length} fills shown`}>
    <svg
      width={width} height={height}
      onPointerMove={(event) => {
        const box = event.currentTarget.getBoundingClientRect()
        const index = Math.floor((event.clientX - box.left - pad.left) / band)
        setHover(index >= 0 && index < bars.length ? index : null)
      }}
      onPointerLeave={() => setHover(null)}
    >
      {ticks.map((tick) => <g key={tick}>
        <line className="tx-grid" x1={pad.left} x2={pad.left + plotW} y1={yAt(tick)} y2={yAt(tick)}/>
        <text className="tx-axis" x={pad.left - 8} y={yAt(tick) + 3.5} textAnchor="end">{privacy ? '••' : tick.toLocaleString()}</text>
      </g>)}
      {bars.map((bar, index) => (index % labelEvery === 0
        ? <text key={bar.key} className="tx-axis" x={xAt(index)} y={height - 5} textAnchor="middle">{clockOf(bar.key)}</text> : null))}
      {active && <line className="tx-cross" x1={xAt(hover)} x2={xAt(hover)} y1={pad.top} y2={pad.top + plotH}/>}
      {refs.map((item) => <g key={item.key} className={`tx-ref ${item.key}`}>
        <line x1={pad.left} x2={pad.left + plotW} y1={item.y} y2={item.y}/>
        <text x={pad.left + plotW - 2} y={item.y - 4} textAnchor="end">{item.label}</text>
      </g>)}
      {visible.map((bar, index) => {
        const up = bar.close >= bar.open
        const bodyTop = yAt(Math.max(bar.open, bar.close))
        const bodyH = Math.max(1.5, yAt(Math.min(bar.open, bar.close)) - bodyTop)
        const bodyW = Math.max(1.5, Math.min(7, band * 0.64))
        return <g key={bar.key} className={`tx-candle ${up ? 'up' : 'down'}`}>
          <line x1={xAt(index)} x2={xAt(index)} y1={yAt(bar.high)} y2={yAt(bar.low)}/>
          <rect x={xAt(index) - bodyW / 2} y={bodyTop} width={bodyW} height={bodyH} rx={Math.min(1.5, bodyW / 3)}/>
        </g>
      })}
      {shown.map((fill) => <circle key={fill.id} className={`tx-fill ${fill.side}`} cx={xAt(barIndex(bars, fill))} cy={yAt(Number(fill.price))} r="4.5"/>)}
    </svg>
    <Tooltip point={active ? { x: xAt(hover), y: yAt(active.high) } : null} width={width}>
      {active && <>
        <div className="tip-title">{stamp(active.key)}</div>
        <TipRows rows={[{ label: 'Open', value: px(active.open) }, { label: 'High', value: px(active.high) }, { label: 'Low', value: px(active.low) }, { label: 'Close', value: px(active.close) }]}/>
      </>}
    </Tooltip>
  </div>
}

/** Price chart and excursions. */
export function TradeChart({ trade, fills, pnl, stop, target, plannedRisk, privacy }) {
  const bars = useMemo(() => barsFor(trade, fills), [trade, fills])
  const total = bars.length
  const cursor = total
  const mult = trade.multiplier ?? 1

  const excursions = useMemo(() => {
    const dir = pnl.direction === 'long' ? 1 : -1
    const indices = fills.map((fill) => barIndex(bars, fill))
    const span = bars.slice(Math.min(...indices), Math.max(...indices) + 1)
    let worst = { points: 0, price: pnl.averageEntry, at: span[0]?.key }; let best = { points: 0, price: pnl.averageEntry, at: span[0]?.key }
    span.forEach((bar) => {
      const against = dir === 1 ? bar.low - pnl.averageEntry : pnl.averageEntry - bar.high
      const favour = dir === 1 ? bar.high - pnl.averageEntry : pnl.averageEntry - bar.low
      if (against < worst.points) worst = { points: against, price: dir === 1 ? bar.low : bar.high, at: bar.key }
      if (favour > best.points) best = { points: favour, price: dir === 1 ? bar.high : bar.low, at: bar.key }
    })
    const toMoney = (points) => round(points * pnl.entryQty * mult)
    const realizedPts = pnl.averageExit == null ? null : (pnl.averageExit - pnl.averageEntry) * dir
    return {
      bars: span.length, worst: { ...worst, money: toMoney(worst.points) }, best: { ...best, money: toMoney(best.points) },
      exit: realizedPts == null ? null : {
        efficiency: best.points > 0 ? realizedPts / best.points : null, realizedPts, realized: toMoney(realizedPts),
        leftBest: toMoney(best.points - realizedPts),
        leftTarget: target != null ? toMoney((target - pnl.averageExit) * dir) : null,
      },
    }
  }, [bars, fills, pnl, mult, target])

  const efficiency = excursions.exit?.efficiency
  return <>
    <section className="tx-section tx-chart" aria-label="Price">
      <span className="tx-label">Price</span>
      <CandleChart bars={bars} cursor={cursor} fills={fills} avgEntry={pnl.averageEntry} stop={stop} symbol={trade.symbol} privacy={privacy}/>
    </section>

    <dl className="tx-section tx-figs four" aria-label="Excursions">
      <div><dt>MAE</dt><dd><span className="tone-neg">{money(excursions.worst.money, { privacy })}</span></dd></div>
      <div><dt>MFE</dt><dd><span className="tone-pos">{money(excursions.best.money, { privacy })}</span></dd></div>
      {excursions.exit && <>
        <div><dt>Efficiency</dt><dd>{efficiency == null ? '—' : `${Math.round(efficiency * 100)}%`}</dd></div>
        <div><dt>Left</dt><dd>{money(excursions.exit.leftBest, { privacy, sign: false })}</dd></div>
      </>}
    </dl>
  </>
}

/* ------------------------------------------------------------ detail */

/** §5 Fills & details body. */
export function TradeDetail({ trade, review, privacy }) {
  const baseFills = useMemo(() => fillsFor(trade), [trade])
  const [groupings, setGroupings] = useState(() => readJSON(KEYS.groupings, {})[trade.id] ?? null)
  const fills = useMemo(() => {
    if (!groupings?.ids) return baseFills
    const pool = [...baseFills, ...loadUngrouped()]
    return pool.filter((fill) => groupings.ids.includes(fill.id))
  }, [baseFills, groupings])
  const mult = trade.multiplier ?? 1
  const pnl = useMemo(() => (fills.length ? fifo(fills, mult) : null), [fills, mult])
  const manual = trade.logged && !trade.fills?.length
  const stop = manual ? (review?.stop ? Number(review.stop) : null) : stopFor(trade, review)
  const sample = samplePlan(trade)
  const target = review?.target ? Number(review.target) : manual ? null : sample.target
  const plannedRisk = review?.plan?.plannedRisk ? Number(review.plan.plannedRisk) : null
  const [regroup, setRegroup] = useState(false)

  if (manual) {
    return <div className="tx-detail">
      <p className="tx-lede"><span className="tx-badge">Manual P&L</span> The P&L was typed in and this trade holds no fills. Use Add fills on the trade to replace it with the fills it came from.</p>
      <PlanSection trade={trade} review={review} fills={[]} pnl={null} stop={stop} privacy={privacy}/>
      <MediaLinks review={review}/>
    </div>
  }
  if (!pnl) return <div className="tx-detail"><p className="tx-alert info" role="status">Its fills were released when their import was undone. The grouping history is kept below.</p></div>

  const history = [
    ...(groupings?.history ?? []),
    { revision: 1, action: 'grouped', method: trade.fills?.length ? (trade.fills[0].source === 'manual' ? 'manual' : 'automatic') : 'automatic', count: baseFills.length, tradeRevision: 1, when: `${trade.date} ${trade.time}` },
  ]
  const methodLabel = { manual: 'manually', automatic: 'automatically', 'import-undo': 'after an import was undone', 'manual-conversion': 'from a typed trade' }
  const latest = history[0]
  const clock = (iso) => (iso ? iso.split('T')[1]?.slice(0, 8) ?? iso : '')

  return <div className="tx-detail">
    <dl className="tx-section tx-figs" aria-label="Trade P&L">
      <div><dt>Held</dt><dd>{pnl.holdingSeconds == null ? 'Open' : duration(pnl.holdingSeconds)}</dd></div>
      <div><dt>Entry</dt><dd>{pnl.entryQty} @ {privacy ? '••••' : px(round(pnl.averageEntry, 4))}</dd></div>
      <div><dt>Exit</dt><dd>{!pnl.exitQty ? '—' : `${pnl.exitQty} @ ${privacy ? '••••' : px(round(pnl.averageExit, 4))}`}</dd></div>
      <div><dt>Gross</dt><dd><Exact value={pnl.gross} privacy={privacy}/></dd></div>
      <div><dt>Fees</dt><dd>{money(pnl.fees, { privacy, sign: false })}</dd></div>
      <div><dt>Net</dt><dd><Exact value={pnl.net} privacy={privacy}/></dd></div>
    </dl>

    <TradeChart trade={trade} fills={fills} pnl={pnl} stop={stop} target={target} plannedRisk={plannedRisk} privacy={privacy}/>

    <section className="tx-section" aria-label="Fills">
      <span className="tx-label">Fills</span>
      <ul className="tx-fill-list">
        {[...fills].sort((a, b) => a.executed_at.localeCompare(b.executed_at)).map((fill) => <li
          key={fill.id}
         
        >
          <span className="tx-when">{clock(fill.executed_at)}</span>
          <span className={`tx-tag ${fill.side === 'buy' ? 'long' : 'short'}`}>{cap(fill.side)}</span>
          <span className="tx-px">{fill.quantity} @ {privacy ? '••••' : px(fill.price)}</span>
          <span className="tx-role">{pnl.roleOf[fill.id] ?? 'Entry'}</span>
          <span className="tx-fee">{privacy ? '••' : `$${Number(fill.fee).toFixed(2)}`}</span>
        </li>)}
      </ul>
    </section>

    <PlanSection trade={trade} review={review} fills={fills} pnl={pnl} stop={stop} target={target} privacy={privacy}/>
    <MediaLinks review={review}/>

    {regroup
      ? <Regroup
          trade={trade} fills={baseFills} selected={fills.map((fill) => fill.id)}
          onCancel={() => setRegroup(false)}
          onSave={(ids) => {
            const all = readJSON(KEYS.groupings, {})
            const prior = all[trade.id]?.history ?? []
            const revision = (prior[0]?.revision ?? 1) + 1
            const next = { ids, history: [{ revision, action: 'regrouped', method: 'manual', count: ids.length, tradeRevision: revision, when: new Date().toISOString().slice(0, 16).replace('T', ' ') }, ...prior] }
            writeJSON(KEYS.groupings, { ...all, [trade.id]: next })
            setGroupings(next)
            setRegroup(false)
          }}
        />
      : <footer className="tx-group">
          <span>{cap(latest.action)} {methodLabel[latest.method] ?? 'automatically'} · {latest.count} fill{latest.count === 1 ? '' : 's'} · rev {latest.revision}</span>
          <button type="button" className="tx-btn ghost" onClick={() => setRegroup(true)}>Regroup</button>
        </footer>}
  </div>
}

function Regroup({ trade, fills, selected, onSave, onCancel }) {
  const candidates = [...fills, ...loadUngrouped().filter((fill) => fill.symbol === trade.symbol).map((fill) => ({ ...fill, ungrouped: true }))]
    .filter((fill, index, list) => list.findIndex((item) => item.id === fill.id) === index)
    .sort((a, b) => a.executed_at.localeCompare(b.executed_at))
  const [ids, setIds] = useState(selected)
  const toggle = (id) => setIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  const clock = (iso) => iso?.split('T')[1]?.slice(0, 8) ?? iso
  return <section className="tx-section tx-regroup" aria-label="Regroup fills">
    <span className="tx-label">Choose the fills that make up this trade</span>
    <ul className="tx-fill-list tx-pick">
      {candidates.map((fill) => {
        const on = ids.includes(fill.id)
        return <li key={fill.id} className={on ? 'on' : ''}>
          <label>
            <input type="checkbox" checked={on} onChange={() => toggle(fill.id)} aria-label={`${fill.side} ${fill.quantity} @ ${fill.price}`}/>
            <span className="tx-box" aria-hidden="true"/>
            <span className="tx-when">{clock(fill.executed_at)}</span>
            <span className={`tx-tag ${fill.side === 'buy' ? 'long' : 'short'}`}>{cap(fill.side)}</span>
            <span className="tx-px">{fill.quantity} @ {px(fill.price)}</span>
            <span className="tx-role">{fill.ungrouped ? 'Ungrouped' : ''}</span>
            <span className="tx-fee">${Number(fill.fee).toFixed(2)}</span>
          </label>
        </li>
      })}
    </ul>
    <div className="tx-actions">
      <button type="button" className="tx-btn ghost" onClick={onCancel}>Cancel</button>
      <button type="button" className="tx-save" disabled={!ids.length} onClick={() => onSave([...ids].sort())}>Save</button>
    </div>
  </section>
}

function PlanSection({ trade, review, fills, pnl, stop, target, privacy }) {
  const mult = trade.multiplier ?? 1
  const targets = (review?.plan?.targets ?? []).filter((row) => row.price !== '')
  const entry = pnl?.averageEntry ?? trade.entry
  const plannedRR = stop != null && target != null && Math.abs(entry - stop) > 0 ? Math.abs(target - entry) / Math.abs(entry - stop) : null
  const plannedRisk = review?.plan?.plannedRisk ? Number(review.plan.plannedRisk) : null
  const tookRisk = stop != null && pnl ? Math.abs(pnl.averageEntry - stop) * pnl.entryQty * mult : null
  if (plannedRR == null && plannedRisk == null && tookRisk == null && !targets.length) return null
  const dir = trade.side === 'Long' ? 1 : -1
  const exits = pnl ? [...fills].filter((fill) => pnl.roleOf[fill.id] !== 'Entry').sort((a, b) => a.executed_at.localeCompare(b.executed_at)) : []
  return <section className="tx-section" aria-label="Plan review">
    <span className="tx-label">Plan</span>
    <dl className="tx-figs">
      <div><dt>Planned R:R</dt><dd>{plannedRR == null ? '—' : plannedRR.toFixed(2)}</dd></div>
      <div><dt>Planned risk</dt><dd>{plannedRisk == null ? 'Not set' : money(plannedRisk, { privacy, sign: false })}</dd></div>
      <div><dt>Risk taken</dt><dd>{tookRisk == null ? '—' : money(tookRisk, { privacy, sign: false })}</dd></div>
    </dl>
    {targets.length > 0 && exits.length > 0 && <table className="feed-table ws-table compact ledger tx-fills" aria-label="Exits against targets">
      <thead><tr><th>Exit</th><th>Qty</th><th>Target</th><th>Versus target</th></tr></thead>
      <tbody>{exits.map((fill, index) => {
        const level = targets[index] ? Number(targets[index].price) : null
        const versus = level == null ? null : round((Number(fill.price) - level) * dir)
        return <tr key={fill.id}>
          <td>{pnl.roleOf[fill.id]}</td><td>{fill.quantity}</td>
          <td>{level == null ? 'No target' : px(level)}</td>
          <td className={versus == null ? '' : `tone-${versus >= 0 ? 'pos' : 'neg'}`}>{versus == null ? '' : versus >= 0 ? `${versus} pts past` : `${Math.abs(versus)} pts short`}</td>
        </tr>
      })}</tbody>
    </table>}
  </section>
}

function MediaLinks({ review }) {
  const links = (review?.links ?? []).filter((link) => link.url)
  if (!links.length) return null
  const host = (url) => { try { return new URL(url).host } catch { return url } }
  return <section className="tx-block" aria-label="Chart and recording links">
    <header className="tx-head"><h3>Links</h3></header>
    <ul className="tx-links">{links.map((link, index) => <li key={index}>
      <a href={link.url} target="_blank" rel="noopener noreferrer">{link.label || host(link.url)}</a>
      {link.at != null && link.at !== '' && <span> · starts at {atLabel(Number(link.at))}</span>}
    </li>)}</ul>
  </section>
}

export function TradeDetailSheet({ trade, review, privacy, onClose }) {
  return <Sheet title={`${trade.symbol ?? 'Trade'} fills and P&L`} subtitle={`${pnlSourceLabel(trade)} · revision ${review?.revision ?? 1}`} onClose={onClose} width={760} className="tx-sheet">
    <TradeDetail trade={trade} review={review} privacy={privacy}/>
  </Sheet>
}
