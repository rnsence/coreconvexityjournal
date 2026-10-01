/**
 * Day sheet: the calendar's per-date journal (plan, recap, scores, routine checks and
 * missed trades) over that day's trade metrics. Saving makes a new revision.
 */
import React, { useId, useMemo, useState } from 'react'
import { ArrowUpRight, NotebookPen, Plus, X } from 'lucide-react'
import { Choice, Sheet } from '../dialogs'
import { SETUP_CODES } from '../analytics'
import { tradeLog } from '../data'
import { money, toneOf } from '../viz'
import { metricRows, pickRows } from './calendar-metrics'
import { EMPTY_DAY, readDay, readRoutine, saveDay } from './calendar-store'
import { Select } from '../select'
import './calendar.css'

const SCORES = ['Not set', '5', '4', '3', '2', '1']
const SETUPS = Object.keys(SETUP_CODES)
const BLANK_MISSED = { symbol: '', direction: 'long', playbook_id: null, entry: null, stop: null, target: null, reason: '', potential_r: null }

export const sheetDate = (date) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

export function DaySheet({ date, privacy, onClose, onSaved, openJournal }) {
  const formId = useId()
  const day = useMemo(() => readDay(date), [date])
  const stored = day && !day.derived ? day : null
  const trades = useMemo(() => tradeLog.filter((trade) => trade.date === date).sort((a, b) => a.timestamp - b.timestamp), [date])
  const tiles = pickRows(metricRows(trades, { privacy }), ['Net P&L', 'Trades', 'Win rate', 'Average R', 'Fees', 'Largest loss'])
  const [draft, setDraft] = useState(() => day?.content ?? EMPTY_DAY)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(null)
  const routine = useMemo(() => readRoutine(), [])
  const habits = routine.habits.filter((habit) => !habit.archived || draft.checks.some((check) => check.habit_id === habit.habit_id))
  const checked = (id) => draft.checks.find((check) => check.habit_id === id)?.done
  const setCheck = (id, done) => setDraft({ ...draft, checks: done === null ? draft.checks.filter((check) => check.habit_id !== id) : [...draft.checks.filter((check) => check.habit_id !== id), { habit_id: id, done }] })
  const setMissed = (index, patch) => setDraft({ ...draft, missed: draft.missed.map((item, position) => (position === index ? { ...item, ...patch } : item)) })
  const text = (value) => value.trim() || null
  const score = (value) => (value === 'Not set' ? null : Number(value))

  const submit = async (event) => {
    event.preventDefault()
    setPending(true); setError(null)
    try {
      await saveDay(date, { expected_revision: stored?.revision ?? 0, content: { ...draft, missed: draft.missed.map((item) => ({ ...item, potential_r: null })) } })
      onSaved?.()
      onClose()
    } catch (failure) {
      setError(failure.conflict ? 'This day changed elsewhere. Close and reopen it before saving.' : failure.message)
      setPending(false)
    }
  }

  const footer = <>
    <span className="cal-sheet-rev">{stored ? `Revision ${stored.revision}` : 'Not saved yet'}</span>
    <div className="dlg-actions">
      <button type="button" className="ws-outline" onClick={onClose}>Close</button>
      <button type="submit" form={formId} className="start-day" disabled={pending}>{pending ? 'Saving…' : stored ? `Save revision ${stored.revision + 1}` : 'Save day'}</button>
    </div>
  </>

  return <Sheet
    title={sheetDate(date)} width={640} className="cal-sheet" onClose={onClose} footer={footer}
    subtitle="Plan before the session, recap after it, and the setups you passed on. Saving makes a new revision."
  >
    <section className="cal-day-trades" aria-label="Day trades">
      <div className="cal-sheet-h">
        <h3>Trades</h3>
        {openJournal && trades.length > 0 && <button type="button" className="cal-link" onClick={() => { onClose(); openJournal(date) }}>Open in Daily journal <ArrowUpRight size={13}/></button>}
      </div>
      {trades.length === 0
        ? <p className="cal-muted">No trades dated this day.</p>
        : <>
          <dl className="cal-tiles">{tiles.map((row) => <div key={row.label}>
            <dt>{row.label}</dt>
            <dd className={row.label === 'Net P&L' || row.label === 'Largest loss' ? `tone-${toneOf(row.raw ?? (row.label === 'Largest loss' ? -1 : 0))}` : undefined}>{row.value}</dd>
          </div>)}</dl>
          <ul className="cal-day-list">{trades.map((trade) => <li key={trade.id}>
            <span className="cal-day-time">{trade.time}</span>
            <b>{trade.symbol}</b>
            <span className={`cal-side ${trade.side === 'Long' ? 'long' : 'short'}`}>{trade.side}</span>
            <span className="cal-day-setup">{trade.setup}</span>
            <strong className={`tone-${toneOf(trade.pnl)}`}>{money(trade.pnl, { privacy })}</strong>
          </li>)}</ul>
        </>}
    </section>

    <form id={formId} className="cal-day-form" aria-label="Day journal" onSubmit={submit}>
      {error && <div className="cal-feedback" role="alert">{error}</div>}
      <label className="cal-field"><span>Pre-market plan</span>
        <textarea rows={4} value={draft.plan} onChange={(event) => setDraft({ ...draft, plan: event.target.value })} placeholder="Levels, bias, what you will and will not trade"/>
      </label>
      <label className="cal-field"><span>Recap</span>
        <textarea rows={4} value={draft.recap} onChange={(event) => setDraft({ ...draft, recap: event.target.value })} placeholder="What happened, what you did well, what to change"/>
      </label>
      <div className="cal-two">
        <div className="cal-field"><span>Mood</span><Choice label="Mood" options={SCORES} value={draft.mood == null ? 'Not set' : String(draft.mood)} onChange={(value) => setDraft({ ...draft, mood: score(value) })}/></div>
        <div className="cal-field"><span>Discipline</span><Choice label="Discipline" options={SCORES} value={draft.discipline == null ? 'Not set' : String(draft.discipline)} onChange={(value) => setDraft({ ...draft, discipline: score(value) })}/></div>
      </div>

      {habits.length > 0 && <fieldset className="cal-fieldset" aria-label="Routine checklist">
        <legend>Routine</legend>
        {habits.map((habit) => {
          const state = checked(habit.habit_id)
          return <div key={habit.habit_id} className="cal-habit-row">
            <span className={habit.archived ? 'is-archived' : undefined}>{habit.text}</span>
            <div className="cal-kept" role="group" aria-label={habit.text}>
              {[['Kept', true], ['Broke', false], ['—', null]].map(([label, value]) => {
                const on = state === value || (value === null && state === undefined)
                return <button key={label} type="button" aria-pressed={on} className={`${on ? 'on' : ''} ${value === true ? 'kept' : value === false ? 'broke' : ''}`} onClick={() => setCheck(habit.habit_id, value)}>{label}</button>
              })}
            </div>
          </div>
        })}
      </fieldset>}

      <fieldset className="cal-fieldset">
        <legend>Missed trades</legend>
        {draft.missed.map((item, index) => <div key={index} className="cal-missed" aria-label={`Missed trade ${index + 1}`}>
          <label className="cal-mini"><span>Symbol</span><input required value={item.symbol} onChange={(event) => setMissed(index, { symbol: event.target.value.toUpperCase() })}/></label>
          <div className="cal-mini"><span>Direction</span><Choice label="Direction" options={['long', 'short']} value={item.direction} tones={{ long: 'long', short: 'short' }} format={(option) => (option === 'long' ? 'Long' : 'Short')} onChange={(value) => setMissed(index, { direction: value })}/></div>
          <label className="cal-mini span-2"><span>Setup</span>
            <Select value={item.playbook_id ?? ''} onChange={(event) => setMissed(index, { playbook_id: event.target.value || null })}>
              <option value="">No setup</option>
              {SETUPS.map((setup) => <option key={setup} value={setup}>{setup}</option>)}
            </Select>
          </label>
          {['entry', 'stop', 'target'].map((field) => <label key={field} className="cal-mini"><span>{field[0].toUpperCase() + field.slice(1)}</span>
            <input inputMode="decimal" value={item[field] ?? ''} placeholder="0.00" onChange={(event) => setMissed(index, { [field]: text(event.target.value) })}/>
          </label>)}
          <div className="cal-missed-status">
            <span className={item.potential_r != null ? 'has-r' : undefined}>{item.potential_r != null ? `Potential ${Number(item.potential_r).toFixed(2)}R` : 'R after saving'}</span>
            <button type="button" className="acct-toggle cal-x" aria-label={`Remove missed trade ${index + 1}`} onClick={() => setDraft({ ...draft, missed: draft.missed.filter((_, position) => position !== index) })}><X size={13}/></button>
          </div>
          <label className="cal-mini span-4"><span>Why you passed</span><input maxLength={500} value={item.reason} onChange={(event) => setMissed(index, { reason: event.target.value })}/></label>
        </div>)}
        <button type="button" className="ws-outline cal-add" disabled={draft.missed.length >= 20} onClick={() => setDraft({ ...draft, missed: [...draft.missed, { ...BLANK_MISSED }] })}><Plus size={14}/> Add missed trade</button>
      </fieldset>
    </form>
  </Sheet>
}

export function TodayJournalButton({ onClick }) {
  return <button type="button" className="ws-outline cal-today-journal" onClick={onClick}><NotebookPen size={14} strokeWidth={2}/> Today's journal</button>
}
