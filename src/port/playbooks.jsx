/**
 * Playbooks — the monolith's Playbooks tab: playbook list, create / edit / archive in a
 * side sheet (append-only revisions), per-trade process reviews pinned to a playbook
 * revision, and how following the plan lines up with results. All local; reviews never read P&L.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Archive, BookOpenCheck, ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react'
import { Card, MetricStrip, PageHead, Segmented } from '../workspace'
import { ChartState, SymbolToken, TipRows, Tooltip, money, toneOf } from '../viz'
import { Drawer, Field, Sheet } from '../dialogs'
import { tradeLog } from '../data'
import { enrich, readStore, writeStore } from './reports-data'
import {
  RULE_LIMIT, current, gradeOf, loadPlaybooks, loadReviews, newRuleId, plannedRisk,
  revisionOf, storePlaybooks, storeReviews,
} from './playbooks-data'
import { Select } from '../select'
import './playbooks.css'
import './playbook-outcomes.css'

const TABS = ['Playbooks', 'Reviews', 'Outcomes']
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`
const shortDay = (iso) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const outOfDate = (review) => review && review.trade_current_revision > review.content.trade_revision
const EMPTY_CONTENT = { name: '', description: '', planned_risk: '', risk_unit: 'usd', entry_criteria: '', exit_criteria: '', rules: [] }

/* ============================================================ stats */

function statsOf(trades) {
  const wins = trades.filter((trade) => trade.pnl > 0)
  const losses = trades.filter((trade) => trade.pnl < 0)
  const won = wins.reduce((total, trade) => total + trade.pnl, 0)
  const lost = -losses.reduce((total, trade) => total + trade.pnl, 0)
  return {
    n: trades.length, wins: wins.length, losses: losses.length, won, lost, net: won - lost,
    win: wins.length + losses.length ? wins.length / (wins.length + losses.length) : null,
    pf: lost > 0 ? won / lost : null,
    avgR: trades.length ? trades.reduce((total, trade) => total + trade.r, 0) / trades.length : null,
  }
}

function StatRow({ stats, split = true }) {
  if (!stats.n) return <p className="pb-none">No trades logged under this setup yet.</p>
  return <div className="pb-stats">
    <dl>
      <div><dt>Trades</dt><dd>{stats.n}</dd></div>
      <div><dt>Win</dt><dd>{stats.win == null ? '—' : `${Math.round(stats.win * 100)}%`}</dd></div>
      <div><dt>PF</dt><dd className={stats.pf != null && stats.pf < 1 ? 'is-low' : ''}>{stats.pf == null ? '—' : stats.pf.toFixed(2)}</dd></div>
      <div><dt>Avg</dt><dd>{stats.avgR == null ? '—' : `${stats.avgR.toFixed(2)}R`}</dd></div>
    </dl>
    {split && <span className="pb-split" aria-hidden="true"><i className="pos" style={{ flex: stats.wins || 0.0001 }}/><i className="neg" style={{ flex: stats.losses || 0.0001 }}/></span>}
  </div>
}

/** Plain words for a review: how many applicable rules were broken, no letter grade. */
function followSummary(review) {
  if (!review.followed && !review.broken) return 'No rules applied'
  return review.broken ? `${review.broken} ${review.broken === 1 ? 'rule' : 'rules'} broken` : 'All rules followed'
}

/** Followed the plan: no applicable rule broken and risk not over plan. */
const followedPlan = (content) => { const review = gradeOf(content); return review.broken === 0 && content.risk_adherence !== 'exceeded' }

/* ============================================================ playbook card */

function PlaybookCard({ playbook, trades, privacy, onOpen, archived, index }) {
  const head = current(playbook)
  const content = head.content
  const stats = useMemo(() => statsOf(trades), [trades])
  return <section className={`home-card ws-card pb-card duo${archived ? ' is-archived' : ''}`} aria-label={`Playbook ${content.name}`} style={{ '--i': index }}>
    <header className="shell-head pb-card-head">
      <h2 title={content.name}>{content.name}</h2>
      {archived && <span className="pb-status">Archived</span>}
      {stats.n > 0 && <b className={`pb-net tone-${toneOf(stats.net)}`}>{money(stats.net, { privacy, decimals: 0 })}</b>}
    </header>
    <button type="button" className="shell-body pb-card-body" onClick={onOpen} aria-label={`Open ${content.name}`}>
      {/* the card is a summary: what the setup is and how it's done; rules and history live in the drawer */}
      {content.description && <p className="pb-desc" title={content.description}>{content.description}</p>}
      <StatRow stats={stats} split={false}/>
    </button>
    <footer className="pb-card-foot">
      <span>{content.rules.length ? `${content.rules.length} ${content.rules.length === 1 ? 'rule' : 'rules'}` : 'No rules'} · {plannedRisk(content)} · Rev {head.revision}</span>
    </footer>
  </section>
}

/** Everything about one playbook, in the springy drawer: numbers, the plan, rules and revision history. */
function PlaybookDrawer({ playbook, trades, privacy, onClose, onEdit, onArchive, onStep, index, total }) {
  const head = current(playbook)
  const content = head.content
  const stats = statsOf(trades)
  const archived = playbook.lifecycle_status === 'archived'
  return <Drawer label={`Playbook ${content.name}`} viewKey={playbook.playbook_id} width={500} onClose={onClose}>
    <div className="trade-panel dw-trade pb-drawer">
      <div className="tp-head">
        <div>
          <div className="tp-title"><span className="pb-dw-icon"><BookOpenCheck size={15}/></span><b>{content.name}</b>{archived && <span className="pb-status">Archived</span>}</div>
          <small>Revision {head.revision} · planned risk {plannedRisk(content)}</small>
        </div>
        {total > 1 && <div className="tp-nav">
          <button type="button" aria-label="Previous playbook" disabled={index <= 0} onClick={() => onStep(-1)}><ChevronLeft size={15}/></button>
          <button type="button" aria-label="Next playbook" disabled={index >= total - 1} onClick={() => onStep(1)}><ChevronRight size={15}/></button>
        </div>}
      </div>
      <div className="tp-result">
        <strong className={stats.n ? `tone-${toneOf(stats.net)}` : ''}>{stats.n ? money(stats.net, { privacy }) : '—'}</strong>
        <span className="pb-dw-sub">{stats.n ? `${plural(stats.n, 'trade')} on this setup` : 'No trades yet'}</span>
      </div>
      {stats.n > 0 && <StatRow stats={stats}/>}
      {content.description && <p className="pb-dw-desc">{content.description}</p>}
      <div className="pb-dw-plan">
        <section><span>Entry</span><p>{content.entry_criteria || '—'}</p></section>
        <section><span>Exit</span><p>{content.exit_criteria || '—'}</p></section>
      </div>
      <section className="pb-dw-rules">
        <span className="pb-dw-label">Rules <em>{content.rules.length}</em></span>
        {content.rules.length ? <ol>{content.rules.map((item) => <li key={item.rule_id}>{item.text}</li>)}</ol> : <p className="pb-none">No rules yet; reviews can still check planned risk.</p>}
      </section>
      <section className="pb-dw-history">
        <span className="pb-dw-label">History</span>
        <ol>{[...playbook.revisions].reverse().map((item) => <li key={item.revision}>
          <span className={`pb-dot ${item.action}`}/>
          <b>Revision {item.revision}</b>
          <span className={`pb-action ${item.action}`}>{item.action === 'create' ? 'Created' : item.action === 'archive' ? 'Archived' : 'Revised'}</span>
          <small>{shortDay(item.recorded_at)} · {plural(item.content.rules.length, 'rule')}</small>
        </li>)}</ol>
      </section>
      {!archived && <div className="dw-actions">
        <button type="button" className="ws-outline" onClick={onArchive}><Archive size={14}/> Archive</button>
        <button type="button" className="start-day" onClick={onEdit}><Pencil size={14}/> Edit playbook</button>
      </div>}
    </div>
  </Drawer>
}

/* ============================================================ editor */

function PlaybookEditor({ playbook, onClose, onSave }) {
  const initial = playbook ? current(playbook).content : EMPTY_CONTENT
  const [draft, setDraft] = useState(() => ({ ...initial, rules: initial.rules.map((item) => ({ ...item })) }))
  const [pending, setPending] = useState(false)
  const set = (key) => (event) => setDraft({ ...draft, [key]: key === 'planned_risk' ? event.target.value.trim() : event.target.value })
  const setRule = (index, text) => setDraft({ ...draft, rules: draft.rules.map((item, position) => (position === index ? { ...item, text } : item)) })
  const submit = (event) => {
    event.preventDefault()
    setPending(true)
    window.setTimeout(() => { onSave({ ...draft, name: draft.name.trim(), rules: draft.rules.map((item) => ({ ...item, text: item.text.trim() })) }); setPending(false) }, 420)
  }
  const revision = playbook ? current(playbook).revision : 0
  return <Sheet
    title={playbook ? `Edit ${initial.name}` : 'New playbook'}
    subtitle={playbook ? `Saving creates revision ${revision + 1}. Past reviews keep the revision they used.` : 'Saved as revision 1. Later edits add revisions; reviews keep the one they used.'}
    onClose={() => { if (!pending) onClose() }} width={560} className="pb-sheet"
    footer={<div className="dlg-actions pb-foot">
      <button type="button" className="ws-outline" disabled={pending} onClick={onClose}>Cancel</button>
      <button type="submit" form="pb-editor" className="start-day" disabled={pending}>{pending ? 'Saving…' : 'Save playbook'}</button>
    </div>}
  >
    <form id="pb-editor" className="pb-form" onSubmit={submit}>
      <fieldset disabled={pending}>
        <Field label="Name"><input aria-label="Playbook name" required maxLength={120} value={draft.name} onChange={set('name')} placeholder="Opening drive"/></Field>
        <div className="pb-two">
          <Field label="Planned risk per trade"><input aria-label="Planned risk" required inputMode="decimal" pattern="[0-9]+(\.[0-9]+)?" placeholder="250" value={draft.planned_risk} onChange={set('planned_risk')}/></Field>
          <Field label="Risk unit">
            <Select aria-label="Risk unit" value={draft.risk_unit} onChange={set('risk_unit')}>
              <option value="usd">USD per trade</option>
              <option value="percent">% of account per trade</option>
            </Select>
          </Field>
        </div>
        <Field label="Description"><textarea aria-label="Description" rows={2} maxLength={5000} value={draft.description} onChange={set('description')}/></Field>
        <Field label="Entry criteria"><textarea aria-label="Entry criteria" rows={3} maxLength={5000} value={draft.entry_criteria} onChange={set('entry_criteria')}/></Field>
        <Field label="Exit criteria"><textarea aria-label="Exit criteria" rows={3} maxLength={5000} value={draft.exit_criteria} onChange={set('exit_criteria')}/></Field>
        <div className="pb-rule-list">
          <div className="pb-rule-head"><span>Rules</span><small>{draft.rules.length} / {RULE_LIMIT}</small></div>
          {draft.rules.map((item, index) => <div key={item.rule_id} className="pb-rule-row">
            <span className="pb-rule-num">{index + 1}</span>
            <input aria-label={`Rule ${index + 1}`} required maxLength={500} value={item.text} onChange={(event) => setRule(index, event.target.value)} placeholder="State the rule you hold yourself to"/>
            <button type="button" className="pb-icon" aria-label={`Remove rule ${index + 1}`} onClick={() => setDraft({ ...draft, rules: draft.rules.filter((_, position) => position !== index) })}><Trash2 size={13}/></button>
          </div>)}
          <button type="button" className="ws-outline pb-small pb-add" disabled={draft.rules.length >= RULE_LIMIT} onClick={() => setDraft({ ...draft, rules: [...draft.rules, { rule_id: newRuleId(), text: '' }] })}><Plus size={13}/> Add rule</button>
        </div>
      </fieldset>
    </form>
  </Sheet>
}

/* ============================================================ process review */

const MARKS = [['followed', 'Followed'], ['broken', 'Broke'], ['not_applicable', 'N/A']]
const RISKS = [['within', 'Within'], ['exceeded', 'Over'], ['unknown', 'Not checked']]

/** Small three-way switch used for each rule and for risk. */
function MarkSwitch({ value, options, onChange, label }) {
  return <div className="ws-seg compact pb-mark-seg" role="radiogroup" aria-label={label}>
    {options.map(([key, text]) => <button
      key={key} type="button" role="radio" aria-checked={value === key}
      className={`${value === key ? `active is-${key}` : ''}`} onClick={() => onChange(key)}
    >{text}</button>)}
  </div>
}

/** One trade's review inside the drawer: the outcome on top, then a switch per rule, risk and a note. */
function ReviewPanel({ trade, review, playbooks, privacy, index, total, onStep, onClose, onSave }) {
  const active = playbooks.filter((playbook) => playbook.lifecycle_status === 'active')
  const pinnedPlaybook = review ? playbooks.find((playbook) => playbook.playbook_id === review.content.playbook_id) : null
  const defaultPlaybook = pinnedPlaybook ?? active.find((playbook) => current(playbook).content.name === trade.setup) ?? active[0]
  const [pin, setPin] = useState(() => (review
    ? { id: review.content.playbook_id, revision: review.content.playbook_revision }
    : defaultPlaybook ? { id: defaultPlaybook.playbook_id, revision: current(defaultPlaybook).revision } : null))
  const [marks, setMarks] = useState(() => Object.fromEntries((review?.content.rules ?? []).map((item) => [item.rule_id, { mark: item.mark, note: item.note ?? '' }])))
  const [risk, setRisk] = useState(review?.content.risk_adherence ?? 'unknown')
  const [notes, setNotes] = useState(review?.content.notes ?? '')
  const [pending, setPending] = useState(false)
  const playbook = pin ? playbooks.find((item) => item.playbook_id === pin.id) : null
  const pinned = revisionOf(playbook, pin?.revision)
  const head = playbook ? current(playbook) : null
  const rules = pinned?.content.rules ?? []
  const complete = rules.every((item) => marks[item.rule_id]?.mark)
  const marked = rules.filter((item) => marks[item.rule_id]?.mark).length
  const choose = (id) => { const next = playbooks.find((item) => item.playbook_id === id); setPin({ id, revision: current(next).revision }); setMarks({}) }
  const save = () => {
    if (!complete || !pinned) return
    setPending(true)
    const content = {
      trade_revision: review?.trade_current_revision ?? 1, playbook_id: pin.id, playbook_revision: pin.revision, risk_adherence: risk, notes,
      rules: rules.map((item) => ({ rule_id: item.rule_id, mark: marks[item.rule_id].mark, note: marks[item.rule_id].note?.trim() || null })),
    }
    window.setTimeout(() => { onSave(content); setPending(false) }, 280)
  }
  const status = !review ? 'Not reviewed' : outOfDate(review) ? 'Out of date' : 'Reviewed'
  return <div className="trade-panel dw-trade pb-review-dw">
    <div className="tp-head">
      <div>
        <div className="tp-title">
          <SymbolToken symbol={trade.symbol}/><b>{trade.symbol}</b>
          <span className={`side-mark ${trade.side.toLowerCase()}`} aria-label={trade.side}>{trade.side[0]}</span>
        </div>
        <small>{shortDay(trade.date)} · {trade.time} · {trade.setup}</small>
      </div>
      <div className="tp-nav">
        <button type="button" aria-label="Previous trade" disabled={index <= 0} onClick={() => onStep(-1)}><ChevronLeft size={15}/></button>
        <button type="button" aria-label="Next trade" disabled={index >= total - 1} onClick={() => onStep(1)}><ChevronRight size={15}/></button>
      </div>
    </div>

    <div className="tp-result">
      <strong className={`tone-${toneOf(trade.pnl)}`}>{money(trade.pnl, { privacy })}</strong>
      <span className={`pb-dw-state ${status === 'Reviewed' ? 'is-done' : status === 'Out of date' ? 'is-stale' : ''}`}>{status}</span>
    </div>

    {!active.length && !pinnedPlaybook ? <p className="pb-muted">Create a playbook in the Playbooks tab first.</p> : <>
      <div className="pb-rv-row">
        <span className="pb-rv-label">Playbook</span>
        <Select aria-label="Playbook" value={pin?.id ?? ''} onChange={(event) => choose(event.target.value)}>
          <option value="" disabled>Select a playbook</option>
          {pinnedPlaybook?.lifecycle_status === 'archived' && <option value={pinnedPlaybook.playbook_id} disabled>{current(pinnedPlaybook).content.name} (archived)</option>}
          {active.map((item) => <option key={item.playbook_id} value={item.playbook_id}>{current(item).content.name}</option>)}
        </Select>
      </div>
      {head && pinned && head.revision !== pin.revision && <p className="pb-rv-note">Reviewed against revision {pin.revision}{playbook.lifecycle_status === 'active' && <> · <button type="button" onClick={() => { setPin({ id: pin.id, revision: head.revision }); setMarks({}) }}>Use revision {head.revision}</button></>}</p>}

      <section className="pb-rv-rules">
        <span className="pb-dw-label">Rules <em>{marked} of {rules.length}</em></span>
        {rules.length ? <ol>{rules.map((item) => {
          const mark = marks[item.rule_id] ?? { mark: '', note: '' }
          return <li key={item.rule_id} className={mark.mark ? `is-${mark.mark}` : ''}>
            <span>{item.text}</span>
            <MarkSwitch label={item.text} value={mark.mark} options={MARKS} onChange={(value) => setMarks({ ...marks, [item.rule_id]: { ...mark, mark: value } })}/>
          </li>
        })}</ol> : <p className="pb-none">No rules on this revision; only risk is checked.</p>}
      </section>

      <div className="pb-rv-row">
        <span className="pb-rv-label">Risk vs plan</span>
        <MarkSwitch label="Risk vs plan" value={risk} options={RISKS} onChange={setRisk}/>
      </div>
      <textarea className="pb-rv-notes" aria-label="Notes" rows={2} maxLength={5000} placeholder="Notes (optional)" value={notes} onChange={(event) => setNotes(event.target.value)}/>
    </>}

    <div className="dw-actions pb-rv-actions">
      <span className="pb-rv-summary">{pinned && complete ? followSummary(gradeOf({ rules: rules.map((item) => ({ mark: marks[item.rule_id]?.mark })), risk_adherence: risk })) : `${rules.length - marked} ${rules.length - marked === 1 ? 'rule' : 'rules'} to mark`}</span>
      <button type="button" className="ws-outline" disabled={pending} onClick={onClose}>Cancel</button>
      <button type="button" className="start-day" disabled={pending || !complete || !pinned} onClick={save}>{pending ? 'Saving…' : 'Save'}</button>
    </div>
  </div>
}

function ReviewDrawer({ trades, index, onClose, ...rest }) {
  const trade = trades[index]
  // arrow keys step through the list unless a field has focus
  useEffect(() => {
    const onKey = (event) => {
      if (event.target.closest?.('input, textarea, select, [role=radiogroup]')) return
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); rest.onStep(-1) }
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); rest.onStep(1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  return <Drawer label={`Review ${trade.symbol}`} viewKey={trade.id} width={460} onClose={onClose}>
    <ReviewPanel key={trade.id} trade={trade} index={index} total={trades.length} onClose={onClose} {...rest}/>
  </Drawer>
}

/** Win rate, net and P&L per trade for a list of trades. */
const outcomeOf = (list) => {
  const wins = list.filter((trade) => trade.pnl > 0).length
  const losses = list.filter((trade) => trade.pnl < 0).length
  const net = list.reduce((total, trade) => total + trade.pnl, 0)
  return { n: list.length, wins, losses, net, avg: list.length ? net / list.length : 0, win: wins + losses ? wins / (wins + losses) : null }
}

/**
 * Does following the plan pay? A headline (how much more a trade makes when the plan was followed),
 * the two sides as matching cards, and each playbook ranked by how much its plan pays.
 */
function Outcomes({ playbooks, reviews, tradeById, privacy }) {
  const listRef = useRef(null)
  const [tip, setTip] = useState(null)
  const data = useMemo(() => {
    const lanes = { followed: [], broke: [] }
    const map = new Map()
    Object.values(reviews).forEach((review) => {
      const trade = tradeById.get(review.trade_id)
      if (!trade) return
      const key = followedPlan(review.content) ? 'followed' : 'broke'
      lanes[key].push(trade)
      const id = review.content.playbook_id
      if (!map.has(id)) map.set(id, { id, followed: [], broke: [] })
      map.get(id)[key].push(trade)
    })
    const rows = [...map.values()].map((row) => ({ id: row.id, followed: outcomeOf(row.followed), broke: outcomeOf(row.broke) }))
      .map((row) => ({ ...row, gap: row.followed.n && row.broke.n ? row.followed.avg - row.broke.avg : null }))
      .sort((a, b) => (b.gap ?? -Infinity) - (a.gap ?? -Infinity))
    return { followed: outcomeOf(lanes.followed), broke: outcomeOf(lanes.broke), rows }
  }, [reviews, tradeById])
  const nameOf = (id) => { const playbook = playbooks.find((item) => item.playbook_id === id); return playbook ? current(playbook).content.name : 'Playbook' }
  const total = data.followed.n + data.broke.n
  if (!total) return <Card shell title="Outcomes"><ChartState state="empty" detail="Review a trade in the Reviews tab to see whether following your plan pays."/></Card>

  const fmt = (value, options = {}) => money(value, { privacy, decimals: 0, ...options })
  const pct = (value) => (value == null ? '—' : `${Math.round(value * 100)}%`)
  const both = data.followed.n > 0 && data.broke.n > 0
  const gap = both ? data.followed.avg - data.broke.avg : null
  const peak = Math.max(1, ...data.rows.map((row) => Math.abs(row.gap ?? 0)))
  const side = (key, label) => {
    const stat = data[key]
    return <div className={`ou-side is-${key}`}>
      <span className="ou-side-top"><span className="ou-side-label">{label}</span>
        <strong className={stat.n ? `tone-${toneOf(stat.avg)}` : undefined}>{stat.n ? fmt(stat.avg) : '—'}<small>a trade</small></strong></span>
      <span className="ou-side-foot"><span>{pct(stat.win)} win · {plural(stat.n, 'trade')}</span><span className={stat.n ? `tone-${toneOf(stat.net)}` : undefined}>{stat.n ? `${fmt(stat.net)} net` : '—'}</span></span>
    </div>
  }
  const show = (event, row) => {
    const box = listRef.current.getBoundingClientRect(), r = event.currentTarget.getBoundingClientRect()
    setTip({ x: r.left - box.left + r.width / 2, y: r.top - box.top, title: nameOf(row.id), rows: [
      { label: `Followed · ${plural(row.followed.n, 'trade')}`, value: row.followed.n ? `${fmt(row.followed.avg)} a trade · ${pct(row.followed.win)} win` : '—', tone: row.followed.n ? toneOf(row.followed.avg) : undefined },
      { label: `Broke · ${plural(row.broke.n, 'trade')}`, value: row.broke.n ? `${fmt(row.broke.avg)} a trade · ${pct(row.broke.win)} win` : '—', tone: row.broke.n ? toneOf(row.broke.avg) : undefined },
    ] })
  }

  return <div className="ou">
    <section className="home-card ws-card duo ou-card" aria-label="Plan">
      <header className="shell-head ou-head"><span className="card-title">Plan</span>
        <span className="ou-answer">{both ? <>Following it pays <b>{fmt(Math.abs(gap), { sign: false })}</b> {gap >= 0 ? 'more' : 'less'} a trade</> : 'Review trades on both sides to compare'}</span></header>
      <div className="shell-body ou-body">{side('followed', 'Followed')}{side('broke', 'Broke a rule')}</div>
    </section>

    <section className="home-card ws-card duo ou-card" aria-label="Playbook">
      <header className="shell-head ou-head"><span className="card-title">Playbook</span><span className="ws-hint">Average a trade</span></header>
      <div className="shell-body ou-list" ref={listRef} onMouseLeave={() => setTip(null)}>
        <div className="ou-row ou-row-head" aria-hidden="true"><span>Playbook</span><span>Trades</span><span>Followed</span><span>Broke</span><span>Plan pays</span></div>
        {data.rows.map((row) => <div key={row.id} className="ou-row" tabIndex={0} onMouseEnter={(event) => show(event, row)} onFocus={(event) => show(event, row)} onBlur={() => setTip(null)}>
          <span className="ou-name">{nameOf(row.id)}</span>
          <span className="ou-count">{row.followed.n + row.broke.n}</span>
          <span className={row.followed.n ? `tone-${toneOf(row.followed.avg)}` : 'is-none'}>{row.followed.n ? fmt(row.followed.avg) : '—'}</span>
          <span className={row.broke.n ? `tone-${toneOf(row.broke.avg)}` : 'is-none'}>{row.broke.n ? fmt(row.broke.avg) : '—'}</span>
          <span className="ou-pays">
            {row.gap != null && <span className="ou-diverge" aria-hidden="true"><i className={row.gap >= 0 ? 'pos' : 'neg'} style={{ '--w': `${(Math.abs(row.gap) / peak) * 50}%` }}/></span>}
            <b className={row.gap == null ? 'is-none' : `tone-${toneOf(row.gap)}`}>{row.gap == null ? 'Too few' : fmt(row.gap)}</b>
          </span>
        </div>)}
        {tip && <Tooltip point={{ x: tip.x, y: tip.y }} width={listRef.current?.offsetWidth} gap={8}><div className="tip-title">{tip.title}</div><TipRows rows={tip.rows}/></Tooltip>}
      </div>
    </section>
  </div>
}

/* ============================================================ page */

// Designs by RNSENCE Studio
/** Rows the reviews table shows before it scrolls. */
const REVIEW_ROWS = 10

/** Caps a table's scroll box at its header plus the first REVIEW_ROWS rows, measured from the rows themselves. */
function fitTen(wrap) {
  if (!wrap) return
  const rows = wrap.querySelectorAll('tbody tr')
  const last = rows[Math.min(rows.length, REVIEW_ROWS) - 1]
  wrap.style.maxHeight = rows.length > REVIEW_ROWS && last ? `${Math.ceil(last.getBoundingClientRect().bottom - wrap.getBoundingClientRect().top)}px` : ''
}

export function PlaybooksPage({ privacy }) {
  const [playbooks, setPlaybooksState] = useState(loadPlaybooks)
  const [reviews, setReviewsState] = useState(() => loadReviews(loadPlaybooks()))
  const [tab, setTabState] = useState(() => { const saved = readStore('pb-tab', 'Playbooks'); return TABS.includes(saved) ? saved : 'Playbooks' })
  const [status, setStatus] = useState('Active')
  const [reviewFilter, setReviewFilter] = useState('All')
  const [editing, setEditing] = useState(null) // 'new' | playbook_id
  const [reviewing, setReviewing] = useState(null) // trade id
  const [opened, setOpened] = useState(null) // playbook id in the drawer
  const setTab = (next) => { setTabState(next); writeStore('pb-tab', next) }
  const setPlaybooks = (next) => { setPlaybooksState(next); storePlaybooks(next) }
  const setReviews = (next) => { setReviewsState(next); storeReviews(next) }

  const trades = useMemo(() => { const store = readStore('trade-reviews', {}); return tradeLog.map((trade) => enrich(trade, store)) }, [])
  const tradeById = useMemo(() => new Map(trades.map((trade) => [trade.id, trade])), [trades])
  const bySetup = useMemo(() => {
    const map = new Map()
    trades.forEach((trade) => { if (!map.has(trade.setup)) map.set(trade.setup, []); map.get(trade.setup).push(trade) })
    return map
  }, [trades])
  const active = playbooks.filter((playbook) => playbook.lifecycle_status === 'active')
  const archived = playbooks.filter((playbook) => playbook.lifecycle_status === 'archived')
  const names = new Set(playbooks.map((playbook) => current(playbook).content.name))
  const reviewable = useMemo(() => trades.filter((trade) => names.has(trade.setup)).slice(-48).reverse(), [trades, playbooks])

  const reviewList = Object.values(reviews).filter((review) => tradeById.has(review.trade_id))
  const graded = reviewList.map((review) => gradeOf(review.content))
  const adherence = graded.filter((grade) => grade.adherence_percent != null)
  const avgAdherence = adherence.length ? adherence.reduce((total, grade) => total + grade.adherence_percent, 0) / adherence.length : null
  const followedCount = reviewList.filter((review) => followedPlan(review.content)).length
  const topShare = reviewList.length ? followedCount / reviewList.length : 0
  const stale = reviewList.filter(outOfDate).length

  const savePlaybook = (content) => {
    const now = new Date().toISOString()
    if (editing === 'new') {
      setPlaybooks([{ playbook_id: `pb-${Date.now().toString(36)}`, lifecycle_status: 'active', created_at: now, revisions: [{ revision: 1, action: 'create', content, recorded_at: now }] }, ...playbooks])
    } else {
      setPlaybooks(playbooks.map((playbook) => (playbook.playbook_id === editing
        ? { ...playbook, revisions: [...playbook.revisions, { revision: current(playbook).revision + 1, action: 'revise', content, recorded_at: now }] }
        : playbook)))
    }
    setEditing(null)
  }
  const archive = (id) => setPlaybooks(playbooks.map((playbook) => (playbook.playbook_id === id
    ? { ...playbook, lifecycle_status: 'archived', revisions: [...playbook.revisions, { revision: current(playbook).revision + 1, action: 'archive', content: current(playbook).content, recorded_at: new Date().toISOString() }] }
    : playbook)))
  const saveReview = (content) => {
    const existing = reviews[reviewing]
    setReviews({ ...reviews, [reviewing]: { trade_id: reviewing, revision: (existing?.revision ?? 0) + 1, recorded_at: new Date().toISOString(), trade_current_revision: existing?.trade_current_revision ?? 1, content } })
    setReviewing(null)
  }

  const shownTrades = reviewable.filter((trade) => {
    const review = reviews[trade.id]
    return reviewFilter === 'All' || (reviewFilter === 'Reviewed' ? !!review : reviewFilter === 'Not reviewed' ? !review : outOfDate(review))
  })
  const shownPlaybooks = status === 'Active' ? active : archived
  const openedIndex = shownPlaybooks.findIndex((playbook) => playbook.playbook_id === opened)
  const editingPlaybook = editing && editing !== 'new' ? playbooks.find((playbook) => playbook.playbook_id === editing) : null
  const reviewIndex = reviewing ? shownTrades.findIndex((trade) => trade.id === reviewing) : -1

  return <div className="page home ws-page pb-page">
    <PageHead
      title="Playbooks"
      meta={[plural(active.length, 'active playbook'), plural(reviewList.length, 'trade') + ' reviewed', reviewList.length ? `${Math.round(topShare * 100)}% followed the plan` : null].filter(Boolean).join(' · ')}
      actions={<button type="button" className="start-day" onClick={() => setEditing('new')}>New playbook</button>}
    />
    <MetricStrip items={[
      { label: 'Playbooks', value: `${active.length}`, sub: archived.length ? `${archived.length} archived` : 'None archived', line: { type: 'dashes', share: active.length / Math.max(1, playbooks.length), total: Math.max(4, playbooks.length) } },
      { label: 'Reviewed', value: `${reviewList.length}`, sub: `of ${plural(reviewable.length, 'recent trade')}`, line: { type: 'gauge', share: Math.min(1, reviewList.length / Math.max(1, reviewable.length)) } },
      { label: 'Rules followed', value: avgAdherence == null ? '—' : `${Math.round(avgAdherence)}%`, sub: 'On reviewed trades', line: { type: 'gauge', share: (avgAdherence ?? 0) / 100, mark: 0.8 } },
      { label: 'Followed plan', value: `${Math.round(topShare * 100)}%`, sub: `${followedCount} of ${reviewList.length} reviewed trades`, line: { type: 'split', parts: [{ tone: 'pos', value: topShare || 0.0001 }, { tone: 'neg', value: 1 - topShare || 0.0001 }] } },
      { label: 'To re-review', value: `${stale}`, tone: stale ? 'neg' : undefined, sub: stale ? 'Edited since review' : 'All up to date', line: { type: 'gauge', share: stale / Math.max(1, reviewList.length), tone: 'neg' } },
    ]}/>

    <div className="pb-bar">
      <Segmented options={TABS} value={tab} onChange={setTab} label="Playbooks" className="compact rail-switch report-switch"/>
      {tab === 'Playbooks' && <Segmented options={['Active', 'Archived']} value={status} onChange={setStatus} label="Playbook status" className="compact pb-status-seg"/>}
      {tab === 'Reviews' && <Segmented options={['All', 'Reviewed', 'Not reviewed', 'Out of date']} value={reviewFilter} onChange={setReviewFilter} label="Review filter" className="compact pb-status-seg"/>}
    </div>

    <div className="pb-panel" key={tab}>
      {tab === 'Playbooks' && <>
        {(status === 'Active' ? active : archived).length === 0
          ? status === 'Active'
            ? <section className="home-card ws-card pb-empty">
                <span className="pb-empty-icon"><BookOpenCheck size={22}/></span>
                <h2>No playbooks yet</h2>
                <p>Write down the setup you trade: the risk you plan to take, when you enter and exit, and the rules you hold yourself to.</p>
                <button type="button" className="start-day" onClick={() => setEditing('new')}>New playbook</button>
              </section>
            : <Card><ChartState state="empty" detail="Archived playbooks appear here. Past reviews keep their pinned revision."/></Card>
          : <div className="pb-grid">
              {shownPlaybooks.map((playbook, index) => <PlaybookCard
                key={playbook.playbook_id} playbook={playbook} privacy={privacy} archived={status === 'Archived'} index={index}
                trades={bySetup.get(current(playbook).content.name) ?? []}
                onOpen={() => setOpened(playbook.playbook_id)}
              />)}
            </div>}
      </>}

      {tab === 'Reviews' && <Card shell title="Recent playbook trades" className="pb-reviews" aside={<span className="ws-hint">{plural(shownTrades.length, 'trade')}</span>}>
        {shownTrades.length ? <div key={reviewFilter} className="ws-table-wrap pb-review-scroll" ref={fitTen}>
          <table className="feed-table ws-table compact ledger pb-review-table">
            <thead><tr><th>Date</th><th>Symbol</th><th>Side</th><th>Setup</th><th>Outcome</th><th>Process</th><th aria-label="Review"/></tr></thead>
            <tbody>{shownTrades.map((trade) => {
              const review = reviews[trade.id]
              return <tr key={trade.id} className={`pb-rv-tr${reviewing === trade.id ? ' is-selected' : ''}`} onClick={() => setReviewing(trade.id)}>
                <td className="cell-date">{shortDay(trade.date)}<small>{trade.time}</small></td>
                <td><span className="jt-sym"><SymbolToken symbol={trade.symbol}/><b>{trade.symbol}</b></span></td>
                <td><span className={`jt-side ${trade.side.toLowerCase()}`}>{trade.side}</span></td>
                <td><span className="jt-setup">{trade.setup}</span></td>
                <td className={`tone-${toneOf(trade.pnl)}`}>{money(trade.pnl, { privacy })}</td>
                <td>
                  <span className="pb-badges">
                    {review ? <span className={`pb-follow${followedPlan(review.content) ? ' is-ok' : ''}`}>{followSummary(gradeOf(review.content))}</span> : <span className="pb-muted">Not reviewed</span>}
                    {outOfDate(review) && <span className="pb-badge stale">Review out of date</span>}
                  </span>
                </td>
                <td><button type="button" className={`pb-review-btn${review ? '' : ' is-new'}`} onClick={(event) => { event.stopPropagation(); setReviewing(trade.id) }}>{review ? 'Update' : 'Review'}</button></td>
              </tr>
            })}</tbody>
          </table>
        </div> : <ChartState state="empty" detail="No trades match this filter."/>}
      </Card>}

      {tab === 'Outcomes' && <>
        <Outcomes playbooks={playbooks} reviews={reviews} tradeById={tradeById} privacy={privacy}/>
      </>}
    </div>

    {openedIndex >= 0 && <PlaybookDrawer
      playbook={shownPlaybooks[openedIndex]} trades={bySetup.get(current(shownPlaybooks[openedIndex]).content.name) ?? []} privacy={privacy}
      index={openedIndex} total={shownPlaybooks.length} onStep={(delta) => setOpened(shownPlaybooks[openedIndex + delta]?.playbook_id ?? opened)}
      onClose={() => setOpened(null)}
      onEdit={() => { setEditing(opened); setOpened(null) }} onArchive={() => { archive(opened); setOpened(null) }}
    />}
    {editing && <PlaybookEditor playbook={editingPlaybook} onClose={() => setEditing(null)} onSave={savePlaybook}/>}
    {reviewIndex >= 0 && <ReviewDrawer
      trades={shownTrades} index={reviewIndex} review={reviews[reviewing]} playbooks={playbooks} privacy={privacy}
      onStep={(delta) => { const next = shownTrades[reviewIndex + delta]; if (next) setReviewing(next.id) }}
      onClose={() => setReviewing(null)} onSave={saveReview}
    />}
  </div>
}
