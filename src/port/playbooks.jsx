/**
 * Playbooks — the monolith's Playbooks tab: playbook list, create / edit / archive in a
 * side sheet (append-only revisions), per-trade process reviews pinned to a playbook
 * revision, and the process-vs-outcome matrix. All local; grades never read P&L.
 */
import React, { useMemo, useState } from 'react'
import { Archive, BookOpenCheck, ChevronRight, ClipboardCheck, History, Pencil, Plus, Trash2 } from 'lucide-react'
import { Card, MetricStrip, PageHead, Segmented } from '../workspace'
import { ChartState, money, toneOf } from '../viz'
import { Field, Sheet } from '../dialogs'
import { tradeLog } from '../data'
import { enrich, readStore, writeStore } from './reports-data'
import {
  GRADES, RULE_LIMIT, current, gradeBasis, gradeOf, loadPlaybooks, loadReviews, newRuleId, plannedRisk,
  revisionOf, storePlaybooks, storeReviews,
} from './playbooks-data'
import './playbooks.css'

const TABS = ['Playbooks', 'Process reviews', 'Process vs outcome']
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`
const shortDay = (iso) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const outOfDate = (review) => review && review.trade_current_revision > review.content.trade_revision
const EMPTY_CONTENT = { name: '', description: '', planned_risk: '', risk_unit: 'usd', entry_criteria: '', exit_criteria: '', rules: [] }

/* ============================================================ performance line */

function Performance({ trades, privacy }) {
  if (!trades.length) return <p className="pb-perf muted">No trades logged under this setup yet.</p>
  const wins = trades.filter((trade) => trade.pnl > 0)
  const losses = trades.filter((trade) => trade.pnl < 0)
  const net = trades.reduce((total, trade) => total + trade.pnl, 0)
  const lost = -losses.reduce((total, trade) => total + trade.pnl, 0)
  const won = wins.reduce((total, trade) => total + trade.pnl, 0)
  const avgR = trades.reduce((total, trade) => total + trade.r, 0) / trades.length
  return <dl className="pb-perf" aria-label="Performance">
    <div><dt className="sr-only">Net P&L</dt><dd className={`strong tone-${toneOf(net)}`}>{money(net, { privacy, decimals: 0 })}</dd></div>
    <div><dd>{plural(trades.length, 'trade')}</dd></div>
    {wins.length + losses.length > 0 && <div><dt>win</dt><dd>{Math.round((wins.length / (wins.length + losses.length)) * 100)}%</dd></div>}
    {lost > 0 && <div><dt>PF</dt><dd>{(won / lost).toFixed(2)}</dd></div>}
    <div><dt>avg</dt><dd>{avgR.toFixed(2)}R</dd></div>
  </dl>
}

/* ============================================================ playbook card */

function PlaybookCard({ playbook, trades, privacy, onEdit, onArchive, archived }) {
  const [history, setHistory] = useState(false)
  const head = current(playbook)
  const content = head.content
  return <section className={`home-card ws-card pb-card${archived ? ' is-archived' : ''}`} aria-label={`Playbook ${content.name}`}>
    <header className="pb-card-head">
      <div>
        <h2>{content.name}{archived && <span className="pb-status">Archived</span>}</h2>
        <p className="pb-card-meta">Revision {head.revision} · planned risk {plannedRisk(content)}</p>
        <Performance trades={trades} privacy={privacy}/>
      </div>
      {!archived && <div className="pb-card-actions">
        <button type="button" className="ws-outline pb-small" onClick={onEdit}><Pencil size={13}/> Edit</button>
        <button type="button" className="pb-icon" aria-label={`Archive ${content.name}`} onClick={onArchive}><Archive size={14}/></button>
      </div>}
    </header>
    {content.description && <p className="pb-desc">{content.description}</p>}
    <dl className="pb-criteria">
      <div><dt>Entry criteria</dt><dd>{content.entry_criteria || '—'}</dd></div>
      <div><dt>Exit criteria</dt><dd>{content.exit_criteria || '—'}</dd></div>
    </dl>
    <div className="pb-rules">
      <span className="pb-label">Rules</span>
      {content.rules.length
        ? <ol>{content.rules.map((item) => <li key={item.rule_id}>{item.text}</li>)}</ol>
        : <p className="pb-muted">No rules yet; reviews can still check planned risk.</p>}
    </div>
    <div className={`pb-history${history ? ' is-open' : ''}`}>
      <button type="button" className="pb-history-toggle" aria-expanded={history} onClick={() => setHistory(!history)}>
        <span className="cc-caret-box"><ChevronRight size={13} strokeWidth={2.2}/></span>
        <History size={13}/> {plural(playbook.revisions.length, 'revision')}
      </button>
      <div className="pb-history-body" inert={!history}><div>
        <ol>{[...playbook.revisions].reverse().map((item) => <li key={item.revision}>
          <b>Revision {item.revision}</b>
          <span className={`pb-action ${item.action}`}>{item.action === 'create' ? 'Created' : item.action === 'archive' ? 'Archived' : 'Revised'}</span>
          <small>{shortDay(item.recorded_at)} · {plural(item.content.rules.length, 'rule')} · {plannedRisk(item.content)}</small>
        </li>)}</ol>
      </div></div>
    </div>
  </section>
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
            <select aria-label="Risk unit" value={draft.risk_unit} onChange={set('risk_unit')}>
              <option value="usd">USD per trade</option>
              <option value="percent">% of account per trade</option>
            </select>
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
            <select aria-label="Playbook" required value={pin?.id ?? ''} onChange={(event) => choose(event.target.value)}>
              <option value="" disabled>Select a playbook</option>
              {pinnedPlaybook?.lifecycle_status === 'archived' && <option value={pinnedPlaybook.playbook_id} disabled>{current(pinnedPlaybook).content.name} (archived)</option>}
              {active.map((item) => <option key={item.playbook_id} value={item.playbook_id}>{current(item).content.name}</option>)}
            </select>
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
            <select aria-label="Risk adherence" value={risk} onChange={(event) => setRisk(event.target.value)}>
              <option value="within">Within planned risk</option>
              <option value="exceeded">Exceeded planned risk</option>
              <option value="unknown">Not checked</option>
            </select>
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
  if (!groups.length) return <Card><p className="pb-muted pad">No reviewed trades yet. Use “Review process” on a trade in the Process reviews tab.</p></Card>
  return <div className="ws-grid one-one pb-matrix">
    {groups.map((group) => <Card key={group.id} title={nameOf(group.id)} aside={<span className="ws-hint">n={group.reviewed} reviewed trades{group.stale ? ` · ${group.stale} reviewed an earlier trade revision` : ''}</span>}>
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

    <div className="ws-tabs">
      <Segmented options={TABS} value={tab} onChange={setTab} label="Playbooks" className="compact rail-switch report-switch"/>
    </div>

    <div className="pb-panel" key={tab}>
      {tab === 'Playbooks' && <>
        <div className="pb-toolbar">
          <Segmented options={['Active', 'Archived']} value={status} onChange={setStatus} label="Playbook status" className="cal-match"/>
          <span className="ws-count">{plural(status === 'Active' ? active.length : archived.length, 'playbook')}</span>
        </div>
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
              {(status === 'Active' ? active : archived).map((playbook) => <PlaybookCard
                key={playbook.playbook_id} playbook={playbook} privacy={privacy} archived={status === 'Archived'}
                trades={bySetup.get(current(playbook).content.name) ?? []}
                onEdit={() => setEditing(playbook.playbook_id)} onArchive={() => archive(playbook.playbook_id)}
              />)}
            </div>}
      </>}

      {tab === 'Process reviews' && <Card title="Recent playbook trades" aside={<Segmented options={['All', 'Reviewed', 'Not reviewed', 'Out of date']} value={reviewFilter} onChange={setReviewFilter} label="Review filter" className="cal-match"/>}>
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
                <td><button type="button" className="ws-outline pb-small" onClick={() => setReviewing(trade.id)}><ClipboardCheck size={13}/> {review ? 'Update process review' : 'Review process'}</button></td>
              </tr>
            })}</tbody>
          </table>
        </div> : <ChartState state="empty" detail="No trades match this filter."/>}
        {shownTrades.length > 16 && <button type="button" className="ws-more" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show fewer' : `Show all ${shownTrades.length} trades`}</button>}
      </Card>}

      {tab === 'Process vs outcome' && <>
        <div className="pb-intro">
          <h2>Process vs outcome</h2>
          <p>Reviewed trades by process grade and result. The grade comes only from rule adherence and planned risk; the result is each trade’s current P&L with the Trades page definitions (scratch trades counted apart).</p>
        </div>
        <Matrix playbooks={playbooks} reviews={reviews} tradeById={tradeById} privacy={privacy}/>
      </>}
    </div>

    {editing && <PlaybookEditor playbook={editingPlaybook} onClose={() => setEditing(null)} onSave={savePlaybook}/>}
    {reviewingTrade && <ReviewSheet trade={reviewingTrade} review={reviews[reviewing]} playbooks={playbooks} privacy={privacy} onClose={() => setReviewing(null)} onSave={saveReview}/>}
  </div>
}
