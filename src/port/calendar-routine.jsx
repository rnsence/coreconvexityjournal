/**
 * Routine card (habits kept per day, last three months) and the calendar's month summary.
 */
import React, { useMemo, useState } from 'react'
import { Archive, ArchiveRestore, ChevronDown, Plus } from 'lucide-react'
import { Card, MetricStrip } from '../workspace'
import { money, toneOf } from '../viz'
import { metricRows, pickRows } from './calendar-metrics'
import { Centered, Dashes, Fill, Meter, NEG, POS, Spark, Split } from './tile-viz'
import { adherence, readRoutine, saveRoutine, shiftMonth } from './calendar-store'
import './calendar.css'

const newId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `h-${Date.now().toString(36)}`)

const SHORT = { 'Best trading day': 'Best day', 'Worst trading day': 'Worst day' }

/** Month statistics: seven headline rows from the shared metric definitions, folded away until opened. */
export function MonthSummary({ trades, privacy }) {
  const [open, setOpen] = useState(() => { try { return localStorage.getItem('cc-cal-stats-open') === '1' } catch { return false } })
  const toggle = () => { const next = !open; setOpen(next); try { localStorage.setItem('cc-cal-stats-open', next ? '1' : '0') } catch { /* storage blocked */ } }
  if (!trades.length) return <p className="cal-muted cal-summary-empty">No trades this month.</p>
  const rows = pickRows(metricRows(trades, { privacy }), ['Net P&L', 'Win rate', 'Profit factor', 'Average R', 'Best trading day', 'Worst trading day', 'Winning days'])
  const toneFor = (row) => (['Net P&L', 'Best trading day', 'Worst trading day', 'Average R'].includes(row.label) && row.raw != null ? toneOf(row.raw) : undefined)
  const ordered = [...trades].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
  const days = Object.entries(ordered.reduce((acc, trade) => ({ ...acc, [trade.date]: (acc[trade.date] ?? 0) + trade.pnl }), {})).sort(([a], [b]) => a.localeCompare(b)).map(([, value]) => value)
  const won = ordered.filter((trade) => trade.pnl > 0).reduce((sum, trade) => sum + trade.pnl, 0)
  const lost = Math.abs(ordered.filter((trade) => trade.pnl < 0).reduce((sum, trade) => sum + trade.pnl, 0))
  const winShare = ordered.filter((trade) => trade.pnl > 0).length / (ordered.filter((trade) => trade.pnl !== 0).length || 1)
  const best = Math.max(0, ...days), worst = Math.abs(Math.min(0, ...days))
  const avgR = Number(String(rows.find((row) => row.label === 'Average R')?.value ?? 0).replace('−', '-').replace(/[^0-9.-]/g, '')) || 0
  const visuals = {
    'Net P&L': <Spark values={days}/>,
    'Win rate': <Meter share={winShare}/>,
    'Profit factor': <Split won={won} lost={lost}/>,
    'Average R': <Centered share={avgR / 2}/>,
    'Best trading day': <Fill share={best / ((best + worst) || 1)} color={POS}/>,
    'Worst trading day': <Fill share={worst / ((best + worst) || 1)} color={NEG}/>,
    'Winning days': <Dashes values={days}/>,
  }
  const basis = (row) => row.basis.replace(/^per (trade|trading day) · /, '').replace(/n=(\d+)/, '$1')
  return <section className={`cal-summary cal-stats duo${open ? ' is-open' : ''}`} aria-label="Month statistics">
    <button type="button" className="cal-stats-toggle shell-head" aria-expanded={open} aria-controls="cal-stats-body" onClick={toggle}>
      <span className="card-title">Statistics</span>
      <span className="cc-caret-box"><ChevronDown size={14} strokeWidth={2.2}/></span>
    </button>
    <div className={`card-fold${open ? ' open' : ''}`} id="cal-stats-body"><div className="card-fold-inner">
      <div className="shell-body">
        <MetricStrip items={rows.map((row) => ({ label: SHORT[row.label] ?? row.label, value: row.value, tone: toneFor(row), sub: basis(row), viz: visuals[row.label] }))}/>
      </div>
    </div></div>
  </section>
}

// Designs by RNSENCE Studio
export function RoutineCard({ month, privacy, version = 0, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [tick, setTick] = useState(0)
  const routine = useMemo(() => readRoutine(), [tick, version])
  const from = `${shiftMonth(month, -2)}-01`
  const to = new Date(Date.parse(`${shiftMonth(month, 1)}-01T00:00:00Z`) - 86400000).toISOString().slice(0, 10)
  const rows = useMemo(() => adherence(routine, from, to).filter((item) => !item.archived || item.days_checked > 0), [routine, from, to, version])
  const nets = (items) => (items.length ? items.map((item) => money(item.net_pnl, { privacy, decimals: 0 })).join(' · ') : '—')
  const exists = routine.habits.length > 0

  return <Card
    className="cal-routine" title="Routine"
    aside={<button type="button" className="ws-outline cal-sm" onClick={() => setEditing(!editing)}>{editing ? 'Done' : exists ? 'Edit habits' : 'Set up routine'}</button>}
  >
    <p className="cal-routine-sub">Habits and daily rules, checked off in each day's journal. Last three months.</p>
    {editing && <RoutineEditor routine={routine} onDone={() => { setEditing(false); setTick((value) => value + 1); onSaved?.() }}/>}
    {!editing && !exists && <p className="cal-muted">No habits yet. Set up a routine to check it off in each day's journal.</p>}
    {!editing && rows.length > 0 && <div className="cal-table-wrap"><table className="feed-table ws-table compact ledger cal-adherence" aria-label="Routine adherence">
      <thead><tr><th>Habit</th><th className="num">Kept</th><th className="num">Streak</th><th className="num">Net when kept</th><th className="num">Net when broken</th></tr></thead>
      <tbody>{rows.map((item) => {
        const share = item.days_checked ? item.days_kept / item.days_checked : 0
        return <tr key={item.habit_id} className={item.archived ? 'is-archived' : undefined}>
          <td className="cal-habit">{item.text}{item.archived && <span className="cal-faint"> · archived</span>}</td>
          <td className="num"><span className="cal-kept-cell">{item.days_checked ? <>
            <span className="cal-kept-track"><i style={{ '--share': share }} className={share >= 0.8 ? 'pos' : share >= 0.6 ? 'mid' : 'neg'}/></span>
            <b>{Math.round(share * 100)}%</b><small>{`${item.days_kept}/${item.days_checked}`}</small>
          </> : '—'}</span></td>
          <td className="num cal-streak">{item.current_streak ? `${item.current_streak} day${item.current_streak === 1 ? '' : 's'}` : '—'}</td>
          <td className={`num tone-${toneOf(item.net_when_kept[0]?.net_pnl ?? 0)}`}>{nets(item.net_when_kept)}</td>
          <td className={`num tone-${toneOf(item.net_when_broken[0]?.net_pnl ?? 0)}`}>{nets(item.net_when_broken)}</td>
        </tr>
      })}</tbody>
    </table></div>}
  </Card>
}

function RoutineEditor({ routine, onDone }) {
  const [habits, setHabits] = useState(routine.habits)
  const [text, setText] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(null)
  const save = async () => {
    setPending(true); setError(null)
    try { await saveRoutine({ expected_revision: routine.revision, content: { habits } }); onDone() } catch (failure) {
      setError(failure.conflict ? 'The routine changed elsewhere; reopen it. Habits with history can be archived, not removed.' : failure.message)
      setPending(false)
    }
  }
  return <div className="cal-routine-edit">
    {error && <div className="cal-feedback" role="alert">{error}</div>}
    <ul>{habits.map((habit) => <li key={habit.habit_id} className={habit.archived ? 'is-archived' : undefined}>
      <span>{habit.text}</span>
      <button type="button" className="cal-ghost" onClick={() => setHabits(habits.map((item) => (item.habit_id === habit.habit_id ? { ...item, archived: !item.archived } : item)))}>
        {habit.archived ? <ArchiveRestore size={13}/> : <Archive size={13}/>}{habit.archived ? 'Restore' : 'Archive'}
      </button>
    </li>)}</ul>
    <form className="cal-add-habit" onSubmit={(event) => { event.preventDefault(); if (text.trim()) { setHabits([...habits, { habit_id: newId(), text: text.trim(), archived: false }]); setText('') } }}>
      <input aria-label="New habit" placeholder="No trades in the first 5 minutes" maxLength={200} value={text} onChange={(event) => setText(event.target.value)}/>
      <button type="submit" className="ws-outline cal-sm"><Plus size={13}/> Add</button>
    </form>
    <div className="cal-routine-foot"><button type="button" className="start-day cal-sm" disabled={pending} onClick={save}>{pending ? 'Saving…' : 'Save routine'}</button></div>
  </div>
}
