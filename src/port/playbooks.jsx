/**
 * Playbooks — the monolith's Playbooks tab: playbook list, create / edit / archive in a
 * side sheet (append-only revisions), per-trade process reviews pinned to a playbook
 * revision, and the process-vs-outcome matrix. All local; grades never read P&L.
 */
import React, { useMemo, useState } from 'react'
import { Archive, BookOpenCheck, ChevronLeft, ChevronRight, ClipboardCheck, Pencil, Plus, Trash2 } from 'lucide-react'
import { Archive as ArchiveBox, CaretRight, PencilSimpleLine } from '@phosphor-icons/react'
import { Card, MetricStrip, PageHead, Segmented } from '../workspace'
import { ChartState, money, toneOf } from '../viz'
import { Drawer, Field, Sheet } from '../dialogs'
import { tradeLog } from '../data'
import { enrich, readStore, writeStore } from './reports-data'
import {
  GRADES, RULE_LIMIT, current, gradeBasis, gradeOf, loadPlaybooks, loadReviews, newRuleId, plannedRisk,
  revisionOf, storePlaybooks, storeReviews,
} from './playbooks-data'
import { Select } from '../select'
import './playbooks.css'

const TABS = ['Playbooks', 'Process reviews', 'Process vs outcome']
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

function StatRow({ stats }) {
  if (!stats.n) return <p className="pb-none">No trades logged under this setup yet.</p>
  return <div className="pb-stats">
    <dl>
      <div><dt>Trades</dt><dd>{stats.n}</dd></div>
      <div><dt>Win</dt><dd>{stats.win == null ? '—' : `${Math.round(stats.win * 100)}%`}</dd></div>
      <div><dt>PF</dt><dd className={stats.pf != null && stats.pf < 1 ? 'is-low' : ''}>{stats.pf == null ? '—' : stats.pf.toFixed(2)}</dd></div>
      <div><dt>Avg</dt><dd>{stats.avgR == null ? '—' : `${stats.avgR.toFixed(2)}R`}</dd></div>
    </dl>
    <span className="pb-split" aria-hidden="true"><i className="pos" style={{ flex: stats.wins || 0.0001 }}/><i className="neg" style={{ flex: stats.losses || 0.0001 }}/></span>
  </div>
}

/* ============================================================ playbook card */

const RULES_SHOWN = 3

function PlaybookCard({ playbook, trades, privacy, onOpen, onEdit, onArchive, archived, index }) {
  const head = current(playbook)
  const content = head.content
  const stats = useMemo(() => statsOf(trades), [trades])
  const extra = content.rules.length - RULES_SHOWN
  return <section className={`home-card ws-card pb-card duo${archived ? ' is-archived' : ''}`} aria-label={`Playbook ${content.name}`} style={{ '--i': index }}>
    <header className="shell-head pb-card-head">
      <h2 title={content.name}>{content.name}</h2>
      {archived && <span className="pb-status">Archived</span>}
      {stats.n > 0 && <b className={`pb-net tone-${toneOf(stats.net)}`}>{money(stats.net, { privacy, decimals: 0 })}</b>}
      {!archived && <span className="pb-card-acts">
        <button type="button" className="pb-act" aria-label={`Edit ${content.name}`} title="Edit" onClick={onEdit}><PencilSimpleLine size={15} weight="duotone"/></button>
        <button type="button" className="pb-act" aria-label={`Archive ${content.name}`} title="Archive" onClick={onArchive}><ArchiveBox size={15} weight="duotone"/></button>
      </span>}
    </header>
    <button type="button" className="shell-body pb-card-body" onClick={onOpen} aria-label={`Open ${content.name}`}>
      {content.description && <p className="pb-desc">{content.description}</p>}
      <StatRow stats={stats}/>
      {content.rules.length > 0
        ? <ol className="pb-mini-rules">
            {content.rules.slice(0, RULES_SHOWN).map((item) => <li key={item.rule_id}>{item.text}</li>)}
            {extra > 0 && <li className="pb-more">+{extra} more {extra === 1 ? 'rule' : 'rules'}</li>}
          </ol>
        : <p className="pb-none">No rules yet.</p>}
    </button>
    <footer className="pb-card-foot">
      <span>Rev {head.revision}</span>
      <span>Risk {plannedRisk(content)}</span>
      <span className="pb-open">Details<CaretRight size={11} weight="bold"/></span>
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
    subtitle={playbook ? `Saving creates revision ${revision + 1}. Past reviews keep the revision they graded.` : 'Saved as revision 1. Later edits add revisions; reviews keep the one they used.'}
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

function ReviewSheet({ trade, review, playbooks, onClose, onSave, privacy }) {
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
  const choose = (id) => { const next = playbooks.find((item) => item.playbook_id === id); setPin({ id, revision: current(next).revision }); setMarks({}) }
  const existingGrade = review ? gradeOf(review.content) : null
  const submit = (event) => {
    event.preventDefault()
    if (!complete || !pinned) return
    setPending(true)
    const content = {
      trade_revision: review?.trade_current_revision ?? 1, playbook_id: pin.id, playbook_revision: pin.revision, risk_adherence: risk, notes,
      rules: rules.map((item) => ({ rule_id: item.rule_id, mark: marks[item.rule_id].mark, note: marks[item.rule_id].note?.trim() || null })),
    }
    window.setTimeout(() => { onSave(content); setPending(false) }, 380)
  }
  return <Sheet
    title={`Review process · ${trade.symbol ?? 'trade'}`}
    subtitle="Grade how the plan was followed. The grade is computed from these marks only; the P&L never changes it."
    onClose={() => { if (!pending) onClose() }} width={560} className="pb-sheet"
    footer={<div className="dlg-actions pb-foot">
      <button type="button" className="ws-outline" disabled={pending} onClick={onClose}>Cancel</button>
      <button type="submit" form="pb-review" className="start-day" disabled={pending || !complete || !pinned}>{pending ? 'Saving…' : review ? 'Save review revision' : 'Save process review'}</button>
    </div>}
  >
    <div className="pb-review-top">
      <p aria-label="Trade outcome">Outcome (not graded): <b className={`tone-${toneOf(trade.pnl)}`}>{money(trade.pnl, { privacy })}</b> · {trade.date} {trade.time} · {trade.setup} · trade revision {review?.trade_current_revision ?? 1}</p>
      {review && existingGrade && <p aria-label="Current grade">Current grade <span className={`pb-grade g-${existingGrade.grade}`}>{existingGrade.grade}</span> {gradeBasis(existingGrade, review.content.risk_adherence)} · review revision {review.revision}</p>}
    </div>
    {outOfDate(review) && <div className="pb-feedback" role="alert">This trade changed after the review (reviewed revision {review.content.trade_revision}, now {review.trade_current_revision}). The grade is kept; saving re-reviews revision {review.trade_current_revision}.</div>}
    <form id="pb-review" className="pb-form" onSubmit={submit}>
      <fieldset disabled={pending}>
        {!active.length && !pinnedPlaybook ? <p className="pb-muted">Create a playbook in the Playbooks tab first.</p> : <>
          <Field label="Playbook">
            <Select aria-label="Playbook" required value={pin?.id ?? ''} onChange={(event) => choose(event.target.value)}>
              <option value="" disabled>Select a playbook</option>
              {pinnedPlaybook?.lifecycle_status === 'archived' && <option value={pinnedPlaybook.playbook_id} disabled>{current(pinnedPlaybook).content.name} (archived)</option>}
              {active.map((item) => <option key={item.playbook_id} value={item.playbook_id}>{current(item).content.name}</option>)}
            </Select>
          </Field>
          {pinned && <p className="pb-pinned" aria-label="Pinned revision">
            Grading against revision {pin.revision}{head && head.revision !== pin.revision && ` (current is ${head.revision})`} · planned risk {plannedRisk(pinned.content)}
            {head && head.revision !== pin.revision && playbook.lifecycle_status === 'active' && <> · <button type="button" onClick={() => { setPin({ id: pin.id, revision: head.revision }); setMarks({}) }}>Use revision {head.revision}</button></>}
          </p>}
          {rules.map((item, index) => {
            const mark = marks[item.rule_id] ?? { mark: '', note: '' }
            const setMark = (patch) => setMarks({ ...marks, [item.rule_id]: { ...mark, ...patch } })
            return <div key={item.rule_id} className={`pb-mark ${mark.mark || 'unset'}`}>
              <span className="pb-mark-text"><b>{index + 1}.</b> {item.text}</span>
              <div className="pb-mark-choice" role="radiogroup" aria-label={`Rule ${index + 1} mark`}>
                {[['followed', 'Followed'], ['broken', 'Broken'], ['not_applicable', 'Not applicable']].map(([value, label]) => <button
                  key={value} type="button" role="radio" aria-checked={mark.mark === value} className={mark.mark === value ? `on ${value}` : ''}
                  onClick={() => setMark({ mark: value })}
                >{label}</button>)}
              </div>
              <input aria-label={`Rule ${index + 1} note`} placeholder="Note (optional)" maxLength={500} value={mark.note ?? ''} onChange={(event) => setMark({ note: event.target.value })}/>
            </div>
          })}
          {pinned && !rules.length && <p className="pb-muted">This revision has no rules; the grade comes from planned risk alone.</p>}
          <Field label="Actual risk vs plan">
            <Select aria-label="Risk adherence" value={risk} onChange={(event) => setRisk(event.target.value)}>
              <option value="within">Within planned risk</option>
              <option value="exceeded">Exceeded planned risk</option>
              <option value="unknown">Not checked</option>
            </Select>
          </Field>
          <Field label="Notes"><textarea aria-label="Process notes" rows={3} maxLength={5000} value={notes} onChange={(event) => setNotes(event.target.value)}/></Field>
          {pinned && <p className="pb-preview">Grade if saved <span className={`pb-grade g-${complete ? gradeOf({ rules: rules.map((item) => ({ mark: marks[item.rule_id]?.mark })), risk_adherence: risk }).grade : 'none'}`}>{complete ? gradeOf({ rules: rules.map((item) => ({ mark: marks[item.rule_id]?.mark })), risk_adherence: risk }).grade : '–'}</span>{!complete && <small>Mark every rule to grade</small>}</p>}
        </>}
      </fieldset>
    </form>
  </Sheet>
}

/* ============================================================ matrix */

function Matrix({ playbooks, reviews, tradeById, privacy }) {
  const groups = useMemo(() => {
    const map = new Map()
    Object.values(reviews).forEach((review) => {
      const trade = tradeById.get(review.trade_id)
      if (!trade) return
      const id = review.content.playbook_id
      if (!map.has(id)) map.set(id, { id, reviewed: 0, stale: 0, grades: Object.fromEntries(GRADES.map((grade) => [grade, []])) })
      const group = map.get(id)
      group.reviewed += 1
      if (outOfDate(review)) group.stale += 1
      group.grades[gradeOf(review.content).grade].push(trade)
    })
    return [...map.values()].sort((a, b) => b.reviewed - a.reviewed)
  }, [reviews, tradeById])
  const nameOf = (id) => { const playbook = playbooks.find((item) => item.playbook_id === id); return playbook ? current(playbook).content.name : 'Playbook' }
  if (!groups.length) return <Card shell title="Process vs outcome"><p className="pb-muted pad">No reviewed trades yet. Use “Review process” on a trade in the Process reviews tab.</p></Card>
  return <div className="ws-grid one-one pb-matrix">
    {groups.map((group) => <Card shell key={group.id} title={nameOf(group.id)} className="pb-matrix-card" aside={<span className="ws-hint">{plural(group.reviewed, 'reviewed trade')}{group.stale ? ` · ${group.stale} out of date` : ''}</span>}>
      <div className="ws-table-wrap">
        <table className="feed-table ws-table compact ledger pb-matrix-table" aria-label={`Process vs outcome: ${nameOf(group.id)}`}>
          <thead><tr><th>Grade</th><th>Result mix</th><th>Wins</th><th>Losses</th><th>Breakeven</th><th>n</th><th>Net P&L</th></tr></thead>
          <tbody>{GRADES.map((grade) => {
            const list = group.grades[grade]
            const wins = list.filter((trade) => trade.pnl > 0).length
            const losses = list.filter((trade) => trade.pnl < 0).length
            const flat = list.length - wins - losses
            const net = list.reduce((total, trade) => total + trade.pnl, 0)
            return <tr key={grade} data-grade={grade} className={list.length ? '' : 'is-empty'}>
              <td><span className={`pb-grade g-${grade}`}>{grade}</span></td>
              <td><span className="pb-mix" aria-hidden="true">
                {list.length ? <><i className="pos" style={{ flex: wins || 0.0001 }}/><i className="neg" style={{ flex: losses || 0.0001 }}/>{flat > 0 && <i className="flat" style={{ flex: flat }}/>}</> : <i className="none"/>}
              </span></td>
              <td>{wins}</td><td>{losses}</td><td>{flat}</td><td>{list.length}</td>
              <td className={list.length ? `tone-${toneOf(net)}` : ''}>{list.length ? money(net, { privacy }) : '—'}</td>
            </tr>
          })}</tbody>
        </table>
      </div>
    </Card>)}
  </div>
}

/* ============================================================ page */

// Designs by RNSENCE Studio
export function PlaybooksPage({ privacy }) {
  const [playbooks, setPlaybooksState] = useState(loadPlaybooks)
  const [reviews, setReviewsState] = useState(() => loadReviews(loadPlaybooks()))
  const [tab, setTabState] = useState(() => { const saved = readStore('pb-tab', 'Playbooks'); return TABS.includes(saved) ? saved : 'Playbooks' })
  const [status, setStatus] = useState('Active')
  const [reviewFilter, setReviewFilter] = useState('All')
  const [showAll, setShowAll] = useState(false)
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
  const topShare = graded.length ? graded.filter((grade) => grade.grade === 'A' || grade.grade === 'B').length / graded.length : 0
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
  const reviewingTrade = reviewing ? tradeById.get(reviewing) : null

  return <div className="page home ws-page pb-page">
    <PageHead
      title="Playbooks"
      meta="A playbook states the plan. Reviewing a trade against it grades the process, never the P&L."
      actions={<button type="button" className="start-day" onClick={() => setEditing('new')}><Plus size={16} strokeWidth={2.2}/> New playbook</button>}
    />
    <MetricStrip items={[
      { label: 'Active playbooks', value: `${active.length}`, sub: `${archived.length} archived · ${playbooks.reduce((total, playbook) => total + playbook.revisions.length, 0)} revisions`, line: { type: 'dashes', share: active.length / Math.max(1, playbooks.length), total: Math.max(4, playbooks.length) } },
      { label: 'Reviewed trades', value: `${reviewList.length}`, sub: `of ${reviewable.length} recent playbook trades`, line: { type: 'gauge', share: Math.min(1, reviewList.length / Math.max(1, reviewable.length)) } },
      { label: 'Rule adherence', value: avgAdherence == null ? '—' : `${Math.round(avgAdherence)}%`, sub: 'Applicable rules followed', line: { type: 'gauge', share: (avgAdherence ?? 0) / 100, mark: 0.8 } },
      { label: 'Graded A or B', value: `${Math.round(topShare * 100)}%`, sub: `${graded.filter((grade) => grade.grade === 'A').length} A · ${graded.filter((grade) => grade.grade === 'B').length} B · ${graded.filter((grade) => 'CDF'.includes(grade.grade)).length} lower`, line: { type: 'split', parts: [{ tone: 'pos', value: topShare || 0.0001 }, { tone: 'neg', value: 1 - topShare || 0.0001 }] } },
      { label: 'Out of date', value: `${stale}`, tone: stale ? 'neg' : undefined, sub: stale ? 'Trade changed after review' : 'Every review is current', line: { type: 'gauge', share: stale / Math.max(1, reviewList.length), tone: 'neg' } },
    ]}/>

    <div className="pb-bar">
      <Segmented options={TABS} value={tab} onChange={setTab} label="Playbooks" className="compact rail-switch report-switch"/>
      {tab === 'Playbooks' && <Segmented options={['Active', 'Archived']} value={status} onChange={setStatus} label="Playbook status" className="compact pb-status-seg"/>}
      {tab === 'Process reviews' && <Segmented options={['All', 'Reviewed', 'Not reviewed', 'Out of date']} value={reviewFilter} onChange={setReviewFilter} label="Review filter" className="compact pb-status-seg"/>}
    </div>

    <div className="pb-panel" key={tab}>
      {tab === 'Playbooks' && <>
        {(status === 'Active' ? active : archived).length === 0
          ? status === 'Active'
            ? <section className="home-card ws-card pb-empty">
                <span className="pb-empty-icon"><BookOpenCheck size={22}/></span>
                <h2>No playbooks yet</h2>
                <p>Write down the setup you trade: the risk you plan to take, when you enter and exit, and the rules you hold yourself to.</p>
                <button type="button" className="start-day" onClick={() => setEditing('new')}><Plus size={15}/> New playbook</button>
              </section>
            : <Card><ChartState state="empty" detail="Archived playbooks appear here. Past reviews keep their pinned revision."/></Card>
          : <div className="pb-grid">
              {shownPlaybooks.map((playbook, index) => <PlaybookCard
                key={playbook.playbook_id} playbook={playbook} privacy={privacy} archived={status === 'Archived'} index={index}
                trades={bySetup.get(current(playbook).content.name) ?? []}
                onOpen={() => setOpened(playbook.playbook_id)}
                onEdit={() => setEditing(playbook.playbook_id)} onArchive={() => archive(playbook.playbook_id)}
              />)}
            </div>}
      </>}

      {tab === 'Process reviews' && <Card shell title="Recent playbook trades" className="pb-reviews" aside={<span className="ws-hint">{plural(shownTrades.length, 'trade')}</span>}>
        {shownTrades.length ? <div className="ws-table-wrap">
          <table className="feed-table ws-table compact ledger pb-review-table">
            <thead><tr><th>Date</th><th>Symbol</th><th>Side</th><th>Setup</th><th>Outcome</th><th>Process</th><th>Review</th></tr></thead>
            <tbody>{(showAll ? shownTrades : shownTrades.slice(0, 16)).map((trade) => {
              const review = reviews[trade.id]
              const grade = review ? gradeOf(review.content) : null
              return <tr key={trade.id}>
                <td className="cell-date">{shortDay(trade.date)}<small>{trade.time}</small></td>
                <td><b>{trade.symbol}</b></td>
                <td><span className={`jt-side ${trade.side.toLowerCase()}`}>{trade.side}</span></td>
                <td><span className="jt-setup">{trade.setup}</span></td>
                <td className={`tone-${toneOf(trade.pnl)}`}>{money(trade.pnl, { privacy })}</td>
                <td>
                  <span className="pb-badges">
                    {grade ? <span className="pb-badge"><span className={`pb-grade g-${grade.grade}`}>{grade.grade}</span> Process {grade.grade}</span> : <span className="pb-muted">Not reviewed</span>}
                    {outOfDate(review) && <span className="pb-badge stale">Review out of date</span>}
                  </span>
                </td>
                <td><button type="button" className={`pb-review-btn${review ? '' : ' is-new'}`} onClick={() => setReviewing(trade.id)}><ClipboardCheck size={13}/> {review ? 'Update' : 'Review'}</button></td>
              </tr>
            })}</tbody>
          </table>
        </div> : <ChartState state="empty" detail="No trades match this filter."/>}
        {shownTrades.length > 16 && <button type="button" className="ws-more" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show fewer' : `Show all ${shownTrades.length} trades`}</button>}
      </Card>}

      {tab === 'Process vs outcome' && <>
        <div className="pb-intro">
          <p>Reviewed trades by process grade and result. The grade comes only from rule adherence and planned risk; the result is each trade’s current P&L with the Trades page definitions (scratch trades counted apart).</p>
        </div>
        <Matrix playbooks={playbooks} reviews={reviews} tradeById={tradeById} privacy={privacy}/>
      </>}
    </div>

    {openedIndex >= 0 && <PlaybookDrawer
      playbook={shownPlaybooks[openedIndex]} trades={bySetup.get(current(shownPlaybooks[openedIndex]).content.name) ?? []} privacy={privacy}
      index={openedIndex} total={shownPlaybooks.length} onStep={(delta) => setOpened(shownPlaybooks[openedIndex + delta]?.playbook_id ?? opened)}
      onClose={() => setOpened(null)}
      onEdit={() => { setEditing(opened); setOpened(null) }} onArchive={() => { archive(opened); setOpened(null) }}
    />}
    {editing && <PlaybookEditor playbook={editingPlaybook} onClose={() => setEditing(null)} onSave={savePlaybook}/>}
    {reviewingTrade && <ReviewSheet trade={reviewingTrade} review={reviews[reviewing]} playbooks={playbooks} privacy={privacy} onClose={() => setReviewing(null)} onSave={saveReview}/>}
  </div>
}
