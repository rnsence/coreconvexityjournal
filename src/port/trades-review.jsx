/**
 * Review sheet (setup, stop / target, thesis, plan, mistakes, rating, emotion, notes,
 * tags, chart links) and the plan fieldset with its position sizer.
 */
import React, { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Sheet, Field } from '../dialogs'
import { SETUP_CODES } from '../analytics'
import { money } from '../viz'
import { accountForTrade, atLabel, parseAt, samplePlan, sizePosition } from './trading-data'
import './trades.css'

const MISTAKES = ['chased entry', 'moved stop', 'no stop', 'oversized', 'early exit', 'late exit', 'against plan', 'overtraded']
const EMOTIONS = ['calm', 'confident', 'fomo', 'fearful', 'frustrated', 'revenge', 'bored', 'tired', 'distracted']
const splitList = (text) => [...new Set(String(text || '').split(',').map((item) => item.trim()).filter(Boolean))]
const blankRow = () => ({ price: '', size: '' })

/** Planned R:R from scaled targets / stops; a blank size shares equally. */
export function plannedRR(entry, targets, stops, stop, target) {
  const weighted = (rows, fallback) => {
    const filled = rows.filter((row) => row.price !== '' && Number.isFinite(Number(row.price)))
    if (!filled.length) return fallback === '' || fallback == null ? null : Number(fallback)
    const sized = filled.map((row) => ({ price: Number(row.price), size: row.size === '' ? null : Number(row.size) }))
    const given = sized.filter((row) => row.size != null).reduce((total, row) => total + row.size, 0)
    const blanks = sized.filter((row) => row.size == null).length
    const share = blanks ? Math.max(0, 1 - Math.min(1, given)) / blanks : 0
    const total = sized.reduce((sum, row) => sum + (row.size ?? share), 0) || 1
    return sized.reduce((sum, row) => sum + row.price * (row.size ?? share), 0) / total
  }
  const reward = weighted(targets, target)
  const risk = weighted(stops, stop)
  if (!(entry > 0) || reward == null || risk == null || !Number.isFinite(reward) || !Number.isFinite(risk) || entry === risk) return null
  return Math.abs(reward - entry) / Math.abs(entry - risk)
}

function Levels({ label, rows, onChange, add }) {
  const lower = label.toLowerCase()
  return <div className="tr-levels">
    <p>{label}</p>
    {rows.map((row, index) => <div className="tr-level" key={index}>
      <input inputMode="decimal" placeholder="Price" aria-label={`${label} ${index + 1} price`} value={row.price} onChange={(event) => onChange(rows.map((item, position) => (position === index ? { ...item, price: event.target.value } : item)))}/>
      <input inputMode="decimal" placeholder="Size" aria-label={`${label} ${index + 1} size`} value={row.size} onChange={(event) => onChange(rows.map((item, position) => (position === index ? { ...item, size: event.target.value } : item)))}/>
      <button type="button" className="tx-btn ghost" aria-label={`Remove ${lower} ${index + 1}`} onClick={() => onChange(rows.filter((_, position) => position !== index))}>Remove</button>
    </div>)}
    {rows.length < 5 && <button type="button" className="tx-btn" onClick={() => onChange([...rows, blankRow()])}><Plus size={13}/> {add}</button>}
  </div>
}

/** §8 Plan: scaled targets and stops, planned risk, position sizer. */
export function PlanFields({ trade, plan, setPlan, stop, target, privacy }) {
  const account = accountForTrade(trade)
  const balance = account ? (account.seed?.balance ?? Number(account.content.size)) : null
  const [mode, setMode] = useState('money')
  const [budget, setBudget] = useState('')
  const [result, setResult] = useState(null)
  const [pending, setPending] = useState(false)
  const rr = plannedRR(trade.entry, plan.targets, plan.stops, stop, target)
  const ready = trade.entry && stop !== '' && budget && trade.symbol && (mode === 'money' || account)
  const size = () => {
    setPending(true)
    window.setTimeout(() => {
      setResult(sizePosition({ entry: trade.entry, stop, symbol: trade.symbol, mode, budget, balance }))
      setPending(false)
    }, 260)
  }
  return <fieldset className="tr-fieldset">
    <legend>Plan</legend>
    <div className="tr-two">
      <Levels label="Targets" add="Add target" rows={plan.targets} onChange={(targets) => setPlan({ ...plan, targets })}/>
      <Levels label="Stops" add="Add stop" rows={plan.stops} onChange={(stops) => setPlan({ ...plan, stops })}/>
    </div>
    <p className="tr-hint">Scaled targets or stops replace the single target or stop in the planned R:R. A size left blank shares equally.{rr != null ? ` Planned R:R now ${rr.toFixed(2)}.` : ''}</p>
    <Field label="Planned risk"><input inputMode="decimal" placeholder="Money at risk at the stop" value={plan.plannedRisk} onChange={(event) => setPlan({ ...plan, plannedRisk: event.target.value })}/></Field>
    <div className="tr-sizer" role="group" aria-label="Position sizer">
      <p>Position sizer</p>
      <div className="tr-sizer-row">
        <select aria-label="Risk as" value={mode} onChange={(event) => { setMode(event.target.value); setResult(null) }}>
          <option value="money">Money</option>
          <option value="percent" disabled={!account}>% of account</option>
        </select>
        <input aria-label="Risk budget" inputMode="decimal" placeholder={mode === 'money' ? '500' : '1'} value={budget} onChange={(event) => setBudget(event.target.value)}/>
        <button type="button" className="tx-btn" disabled={!ready || pending} onClick={size}>{pending ? 'Sizing…' : 'Size'}</button>
      </div>
      {!trade.entry && <p className="tr-hint">Needs an entry price on the trade.</p>}
      {stop === '' && <p className="tr-hint">Add a stop above to size the position.</p>}
      {result?.error && <p className="tr-error" role="alert">{result.error}</p>}
      {result && !result.error && <div className="tr-sized" aria-live="polite">
        <span><b>{result.quantity}</b> {result.unit} risk {money(result.risk, { privacy, sign: false })} of {money(result.budget, { privacy, sign: false })}{result.balance != null ? ` (balance ${money(result.balance, { privacy, sign: false, decimals: 0 })} USD)` : ''} · {result.perUnit} a unit at the stop, point value {result.pointValue}{result.futures ? ' from the futures table' : ''}. Rounded down.</span>
        <button type="button" className="tx-btn soft" onClick={() => setPlan({ ...plan, plannedRisk: String(result.risk) })}>Use as planned risk</button>
      </div>}
    </div>
  </fieldset>
}

/** §7 Review sheet. Saves into the same review record the trade panel edits. */
export function TradeReviewSheet({ trade, review, privacy, onSave, onClose }) {
  const sample = samplePlan(trade)
  const [draft, setDraft] = useState(() => ({
    playbook: review?.playbook ?? trade.setup ?? '',
    stop: review?.stop ?? '', target: review?.target ?? '', thesis: review?.thesis ?? '', invalidation: review?.invalidation ?? '',
    mistakes: (review?.mistakes ?? []).join(', '), rating: review?.rating ? String(review.rating) : '', emotion: review?.emotion ?? '',
    notes: review?.notes ?? '', tags: (review?.tags ?? []).join(', '),
    links: (review?.links ?? []).map((link) => ({ url: link.url, label: link.label ?? '', at: link.at == null || link.at === '' ? '' : atLabel(Number(link.at)) })),
  }))
  const [plan, setPlan] = useState(() => ({
    targets: review?.plan?.targets ?? [], stops: review?.plan?.stops ?? [], plannedRisk: review?.plan?.plannedRisk ?? '',
  }))
  const set = (key) => (event) => setDraft((current) => ({ ...current, [key]: event.target.value }))
  const badAt = draft.links.some((link) => Number.isNaN(parseAt(link.at)))
  const manual = trade.logged && !trade.fills?.length
  const save = (event) => {
    event.preventDefault()
    if (badAt) return
    const trim = (value) => (String(value ?? '').trim() || null)
    onSave({
      playbook: draft.playbook || null, stop: trim(draft.stop), target: trim(draft.target), thesis: trim(draft.thesis), invalidation: trim(draft.invalidation),
      emotion: trim(draft.emotion), notes: String(draft.notes ?? '').trim(), mistakes: splitList(draft.mistakes), tags: splitList(draft.tags).map((tag) => tag.toLowerCase()),
      rating: draft.rating ? Number(draft.rating) : 0,
      links: draft.links.filter((link) => link.url.trim()).map((link) => ({ url: link.url.trim(), label: link.label.trim(), at: parseAt(link.at) })),
      plan: { targets: plan.targets.filter((row) => row.price.trim()), stops: plan.stops.filter((row) => row.price.trim()), plannedRisk: plan.plannedRisk.trim() },
      revision: (review?.revision ?? 1) + 1,
    })
  }
  return <Sheet
    title={`Review ${trade.symbol ?? 'trade'}`} subtitle={`Setup, plan, mistakes and how it felt. Saving makes revision ${(review?.revision ?? 1) + 1}.`}
    onClose={onClose} width={580} className="tr-sheet"
  >
    <form className="tr-form" onSubmit={save}>
      <div className="dlg-grid">
        <Field label="Setup" wide>
          <select value={draft.playbook} onChange={set('playbook')}>
            <option value="">No setup</option>
            {[...new Set([...Object.keys(SETUP_CODES), trade.setup].filter(Boolean))].map((setup) => <option key={setup}>{setup}</option>)}
          </select>
        </Field>
        <Field label="Stop" hint={draft.stop ? null : `Sample plan stop ${sample.stop}`}><input inputMode="decimal" placeholder="Needed for R" value={draft.stop} onChange={set('stop')}/></Field>
        <Field label="Target" hint={draft.target ? null : `Sample plan target ${sample.target}`}><input inputMode="decimal" value={draft.target} onChange={set('target')}/></Field>
        <Field label="Thesis" wide><textarea rows={2} maxLength={2000} value={draft.thesis} onChange={set('thesis')}/></Field>
        <Field label="Invalidation" wide><input maxLength={1000} placeholder="What would have proven the idea wrong" value={draft.invalidation} onChange={set('invalidation')}/></Field>
      </div>

      <PlanFields trade={trade} plan={plan} setPlan={setPlan} stop={draft.stop} target={draft.target} privacy={privacy}/>

      <fieldset className="tr-fieldset plain">
        <legend>Mistakes, comma separated</legend>
        <input className="tr-input" aria-label="Mistakes" value={draft.mistakes} onChange={set('mistakes')}/>
        <div className="tr-quick">
          {MISTAKES.map((mistake) => <button
            key={mistake} type="button" className="tx-chip-btn"
            onClick={() => setDraft((current) => ({ ...current, mistakes: splitList(`${current.mistakes},${mistake}`).join(', ') }))}
          >+ {mistake}</button>)}
        </div>
      </fieldset>

      <div className="dlg-grid">
        <Field label="Rating">
          <select value={draft.rating} onChange={set('rating')}>
            <option value="">Not rated</option>
            {[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{'★'.repeat(value)} ({value})</option>)}
          </select>
        </Field>
        <Field label="Emotion">
          <input maxLength={30} list="trade-emotions" value={draft.emotion} onChange={set('emotion')}/>
          <datalist id="trade-emotions">{EMOTIONS.map((emotion) => <option key={emotion} value={emotion}/>)}</datalist>
        </Field>
        <Field label="Notes" wide><textarea rows={3} maxLength={5000} value={draft.notes} onChange={set('notes')}/></Field>
        <Field label="Tags, comma separated" wide><input value={draft.tags} onChange={set('tags')}/></Field>
      </div>

      <fieldset className="tr-fieldset plain">
        <legend>Chart and recording links</legend>
        {draft.links.map((link, index) => {
          const update = (key) => (event) => setDraft((current) => ({ ...current, links: current.links.map((item, position) => (position === index ? { ...item, [key]: event.target.value } : item)) }))
          return <div className="tr-link" key={index}>
            <input type="url" placeholder="https://" maxLength={500} aria-label={`Link ${index + 1} URL`} value={link.url} onChange={update('url')}/>
            <input placeholder="Label" maxLength={100} aria-label={`Link ${index + 1} label`} value={link.label} onChange={update('label')}/>
            <input placeholder="m:ss" aria-label={`Link ${index + 1} starts at`} value={link.at} onChange={update('at')} aria-invalid={Number.isNaN(parseAt(link.at))}/>
            <button type="button" className="tx-btn ghost" aria-label={`Remove link ${index + 1}`} onClick={() => setDraft((current) => ({ ...current, links: current.links.filter((_, position) => position !== index) }))}><X size={13}/></button>
          </div>
        })}
        {badAt && <p className="tr-error" role="alert">Write the start as m:ss, h:mm:ss or seconds.</p>}
        {draft.links.length < 10 && <button type="button" className="tx-btn" onClick={() => setDraft((current) => ({ ...current, links: [...current.links, { url: '', label: '', at: '' }] }))}><Plus size={13}/> Add link</button>}
      </fieldset>

      <p className="tr-hint">{manual ? 'This trade has a typed P&L; add fills to get realized R.' : 'With a stop, the journal works out realized R from the fills.'}</p>
      <div className="dlg-foot tr-foot">
        <span/>
        <div className="dlg-actions">
          <button type="button" className="ws-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="start-day" disabled={badAt}>Save review</button>
        </div>
      </div>
    </form>
  </Sheet>
}
