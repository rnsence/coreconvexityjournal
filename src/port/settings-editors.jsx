/**
 * Settings building blocks — a group (heading, one line, then a plate of rows), a row (label and
 * hint on the left, its control on the right), small switches — and the list editors for goals,
 * trading rules, fees and prompt templates. A list shows one readable row per item; adding or
 * editing one opens the drawer, so half-filled rows never sit in the form.
 */
import React, { useState } from 'react'
import { ChevronRight, CircleAlert, Info, Plus } from 'lucide-react'
import { Drawer } from '../dialogs'
import { money } from '../viz'
import {
  ASSET_CLASSES, FEE_KINDS, GOAL_METRICS, RULE_KINDS, blankFee, blankGoal, blankRule, blankTemplate, browserZone, goalProgress,
} from './settings-data'
import { Select } from '../select'

/** A settings group: heading and one muted line, an optional action on the right, then a plate. */
export function Group({ title, detail, action, plain = false, children }) {
  return <section className="st-group" aria-label={title}>
    <header className="st-group-head">
      <div><h3>{title}</h3>{detail && <p>{detail}</p>}</div>
      {action}
    </header>
    {plain ? children : <div className="st-plate">{children}</div>}
  </section>
}

/** One setting: what it is on the left, the control on the right. */
export function Row({ label, hint, error, children, stack = false }) {
  return <div className={`st-row${stack ? ' is-stack' : ''}`}>
    <div className="st-row-copy"><b>{label}</b>{hint && <small>{hint}</small>}</div>
    <div className="st-row-control">{children}{error && <small className="st-error">{error}</small>}</div>
  </div>
}

/** A small segmented switch (works inside the drawer too, so it carries its own styles). */
export function Seg({ value, options, onChange, label }) {
  return <div className="st-seg" role="radiogroup" aria-label={label}>
    {options.map(([key, text]) => <button key={key} type="button" role="radio" aria-checked={value === key} className={value === key ? 'active' : ''} onClick={() => onChange(key)}>{text}</button>)}
  </div>
}

/** Persistent inline feedback: info or error, with an optional action. */
export function Note({ tone = 'info', action, children, className = '' }) {
  const error = tone === 'error'
  return <div className={`st-note${error ? ' is-error' : ''} ${className}`} role={error ? 'alert' : 'status'}>
    {error ? <CircleAlert size={15}/> : <Info size={15}/>}
    <span>{children}</span>
    {action}
  </div>
}

export function AddButton({ children, onClick }) {
  return <button type="button" className="st-add" onClick={onClick}><Plus size={14} strokeWidth={2.2}/>{children}</button>
}

/** An empty list: one line and the button that fills it. */
export function Empty({ title, line, action }) {
  return <div className="st-empty-state"><b>{title}</b><span>{line}</span>{action}</div>
}

/** A list row that opens its item: title and summary, an optional figure, a chevron. */
function ItemRow({ title, summary, aside, error, onOpen }) {
  return <button type="button" className={`st-item${error ? ' has-error' : ''}`} onClick={onOpen}>
    <span className="st-item-copy"><b>{title}</b><small>{summary}</small></span>
    {aside}
    <ChevronRight size={15} className="st-item-go"/>
  </button>
}

/** The drawer one list item is edited in: fields, then Remove / Cancel / Save. */
function ItemDrawer({ title, subtitle, isNew, error, onSave, onRemove, onClose, children }) {
  return <Drawer label={title} viewKey="item" width={460} onClose={onClose}>
    <form className="trade-panel dw-trade st-dw" onSubmit={(event) => { event.preventDefault(); onSave() }} noValidate>
      <div className="tp-head"><div><div className="tp-title"><b>{title}</b></div>{subtitle && <small>{subtitle}</small>}</div></div>
      <div className="st-dw-fields">{children}</div>
      {error && <p className="st-error" role="alert">{error}</p>}
      <div className="dw-actions st-dw-actions">
        {!isNew && <button type="button" className="st-dw-remove" onClick={onRemove}>Remove</button>}
        <button type="button" className="ws-outline" onClick={onClose}>Cancel</button>
        <button type="submit" className="start-day">{isNew ? 'Add' : 'Done'}</button>
      </div>
    </form>
  </Drawer>
}

function DwField({ label, hint, children }) {
  return <label className="st-dw-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>
}

const AccountSelect = ({ value, accounts, onChange }) => <Select aria-label="Account" value={value ?? ''} onChange={(event) => onChange(event.target.value || null)}>
  <option value="">Every account</option>
  {accounts.map((account) => <option key={account.account_id} value={account.account_id}>{account.name}</option>)}
</Select>

const isNumber = (value) => String(value ?? '').trim() !== '' && Number.isFinite(Number(value))
const accountName = (accounts, id) => accounts.find((account) => account.account_id === id)?.name ?? 'Every account'

/** Keeps one list's drawer state: which item is open and its working copy. */
function useItemEditor(list, onChange, blank) {
  const [open, setOpen] = useState(null) // { index | 'new', item }
  const [error, setError] = useState(null)
  return {
    open, error,
    add: () => { setError(null); setOpen({ index: 'new', item: blank() }) },
    edit: (index) => { setError(null); setOpen({ index, item: { ...list[index] } }) },
    set: (next) => { setError(null); setOpen((current) => ({ ...current, item: { ...current.item, ...next } })) },
    close: () => setOpen(null),
    save: (check) => {
      const problem = check(open.item)
      if (problem) { setError(problem); return }
      onChange(open.index === 'new' ? [...list, open.item] : list.map((item, i) => (i === open.index ? open.item : item)))
      setOpen(null)
    },
    remove: () => { onChange(list.filter((_, i) => i !== open.index)); setOpen(null) },
  }
}

/* ------------------------------------------------------------------ goals */

// plain names for each metric; whether it's a floor or a ceiling is part of the sentence
const METRIC = {
  net_pnl: ['Net P&L', 'at least'], win_rate: ['Win rate', 'at least'], profit_factor: ['Profit factor', 'at least'], average_r: ['Average R', 'at least'],
  max_drawdown: ['Max drawdown', 'at most'], trades: ['Trades', 'at most'], rule_breaks: ['Rule breaks', 'at most'],
}
const targetText = (goal, privacy) => {
  const n = Number(goal.target)
  if (!isNumber(goal.target)) return '—'
  if (goal.metric === 'net_pnl' || goal.metric === 'max_drawdown') return money(n, { privacy, sign: false, decimals: 0 })
  if (goal.metric === 'win_rate') return `${Math.round(n * 100)}%`
  if (goal.metric === 'profit_factor' || goal.metric === 'average_r') return `${n}${goal.metric === 'average_r' ? 'R' : ''}`
  return String(n)
}

export function GoalsEditor({ goals, saved, content, accounts, errors, privacy, onChange }) {
  const ed = useItemEditor(goals, onChange, blankGoal)
  const item = ed.open?.item
  return <>
    {goals.length ? <div className="st-items">{goals.map((goal, index) => {
      const match = saved.find((s) => s.name === goal.name && s.metric === goal.metric && s.target === goal.target)
      const progress = match ? goalProgress(match, content, { privacy }) : null
      const [metric, way] = METRIC[goal.metric] ?? [goal.metric, '']
      return <ItemRow key={index} onOpen={() => ed.edit(index)} error={errors[`goals.${index}.target`]}
        title={goal.name || metric}
        summary={`${metric} ${way} ${targetText(goal, privacy)} · ${goal.period === 'week' ? 'Weekly' : 'Monthly'} · ${accountName(accounts, goal.account_id)}`}
        aside={progress ? <span className="st-goal">
          <span className="st-goal-value">{progress.value ?? 'No trades'}</span>
          <span className={`st-chip ${progress.status === 'met' ? 'is-pos' : progress.status === 'not met' ? 'is-warn' : ''}`}>{progress.status === 'met' ? 'On track' : progress.status === 'not met' ? 'Behind' : 'No trades'}</span>
        </span> : <span className="st-chip">Unsaved</span>}
      />
    })}</div> : <Empty title="No goals yet" line="Set a weekly or monthly target and track it here." action={<AddButton onClick={ed.add}>Add goal</AddButton>}/>}
    {ed.open && <ItemDrawer
      title={ed.open.index === 'new' ? 'New goal' : item.name || 'Goal'} subtitle="Measured on this week's or month's trades."
      isNew={ed.open.index === 'new'} error={ed.error} onClose={ed.close} onRemove={ed.remove}
      onSave={() => ed.save((goal) => {
        if (!isNumber(goal.target)) return 'Enter a target.'
        if (goal.metric === 'win_rate' && (Number(goal.target) < 0 || Number(goal.target) > 1)) return 'A win rate is between 0% and 100%.'
        return null
      })}
    >
      <DwField label="Name"><input value={item.name} placeholder="Monthly target" onChange={(event) => ed.set({ name: event.target.value })}/></DwField>
      <DwField label="Measure"><Select value={item.metric} onChange={(event) => ed.set({ metric: event.target.value, target: '' })}>
        {GOAL_METRICS.map(([value]) => <option key={value} value={value}>{METRIC[value][0]} ({METRIC[value][1]})</option>)}
      </Select></DwField>
      <DwField label="Target" hint={item.metric === 'win_rate' ? 'As a percentage.' : undefined}>
        {item.metric === 'win_rate'
          ? <span className="st-affix after"><input inputMode="decimal" placeholder="55" value={isNumber(item.target) ? String(Math.round(Number(item.target) * 1000) / 10) : item.target} onChange={(event) => ed.set({ target: isNumber(event.target.value) ? String(Number(event.target.value) / 100) : event.target.value })}/><em>%</em></span>
          : <span className={`st-affix${['net_pnl', 'max_drawdown'].includes(item.metric) ? '' : ' none'}`}>{['net_pnl', 'max_drawdown'].includes(item.metric) && <em>$</em>}<input inputMode="decimal" placeholder="Target" value={item.target} onChange={(event) => ed.set({ target: event.target.value })}/></span>}
      </DwField>
      <DwField label="Period"><Seg label="Period" value={item.period} options={[['week', 'Weekly'], ['month', 'Monthly']]} onChange={(period) => ed.set({ period })}/></DwField>
      <DwField label="Account"><AccountSelect value={item.account_id} accounts={accounts} onChange={(account_id) => ed.set({ account_id })}/></DwField>
    </ItemDrawer>}
    {goals.length > 0 && <AddButton onClick={ed.add}>Add goal</AddButton>}
  </>
}

/* ------------------------------------------------------------------ trading rules */

const ruleText = (rule, privacy) => {
  if (rule.kind === 'window') return `Only trade ${rule.start}–${rule.end}`
  if (!isNumber(rule.limit)) return RULE_KINDS.find(([kind]) => kind === rule.kind)?.[1] ?? rule.kind
  const n = Number(rule.limit)
  if (rule.kind === 'max_trades') return `At most ${n} ${n === 1 ? 'trade' : 'trades'} a day`
  if (rule.kind === 'daily_loss') return `Stop after losing ${money(n, { privacy, sign: false, decimals: 0 })} in a day`
  if (rule.kind === 'loss_streak') return `Stop after ${n} ${n === 1 ? 'loss' : 'losses'} in a row`
  if (rule.kind === 'max_size') return `At most ${n} contracts or shares a position`
  return rule.kind
}

export function TradingRulesEditor({ rules, accounts, errors, privacy, onChange }) {
  const ed = useItemEditor(rules, onChange, blankRule)
  const item = ed.open?.item
  const kind = item && RULE_KINDS.find(([value]) => value === item.kind)
  return <>
    {rules.length ? <div className="st-items">{rules.map((rule, index) => <ItemRow key={index} onOpen={() => ed.edit(index)}
      error={errors[`trading_rules.${index}.limit`] || errors[`trading_rules.${index}.end`]}
      title={ruleText(rule, privacy)} summary={accountName(accounts, rule.account_id)}/>)}</div>
      : <Empty title="No rules yet" line="Trades that break a rule are marked and counted in your stats." action={<AddButton onClick={ed.add}>Add rule</AddButton>}/>}
    {ed.open && <ItemDrawer
      title={ed.open.index === 'new' ? 'New rule' : 'Rule'} subtitle="A rule for every account counts the whole day across accounts."
      isNew={ed.open.index === 'new'} error={ed.error} onClose={ed.close} onRemove={ed.remove}
      onSave={() => ed.save((rule) => (rule.kind === 'window' ? (rule.start < rule.end ? null : 'The end time is before the start.') : isNumber(rule.limit) && Number(rule.limit) > 0 ? null : 'Enter a limit above 0.'))}
    >
      <DwField label="Rule"><Select value={item.kind} onChange={(event) => ed.set({ kind: event.target.value })}>
        {RULE_KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </Select></DwField>
      {item.kind === 'window'
        ? <div className="st-dw-pair">
            <DwField label="From"><input type="time" value={item.start} onChange={(event) => ed.set({ start: event.target.value, timezone: item.timezone || browserZone() })}/></DwField>
            <DwField label="Until"><input type="time" value={item.end} onChange={(event) => ed.set({ end: event.target.value, timezone: item.timezone || browserZone() })}/></DwField>
          </div>
        : <DwField label="Limit" hint={kind?.[2] ? `In ${kind[2]}.` : undefined}>
            <span className={`st-affix${item.kind === 'daily_loss' ? '' : ' none'}`}>{item.kind === 'daily_loss' && <em>$</em>}<input inputMode="decimal" value={item.limit} placeholder={item.kind === 'daily_loss' ? '500' : '3'} onChange={(event) => ed.set({ limit: event.target.value })}/></span>
          </DwField>}
      <DwField label="Account"><AccountSelect value={item.account_id} accounts={accounts} onChange={(account_id) => ed.set({ account_id })}/></DwField>
    </ItemDrawer>}
    {rules.length > 0 && <AddButton onClick={ed.add}>Add rule</AddButton>}
  </>
}

/* ------------------------------------------------------------------ fee schedule */

export function FeeRulesEditor({ rules, accounts, errors, privacy, onChange }) {
  const ed = useItemEditor(rules, onChange, blankFee)
  const item = ed.open?.item
  return <>
    {rules.length ? <div className="st-items">{rules.map((rule, index) => {
      const asset = ASSET_CLASSES.find(([value]) => value === (rule.asset_class ?? ''))?.[1] ?? 'Any asset'
      return <ItemRow key={index} onOpen={() => ed.edit(index)} error={errors[`fee_rules.${index}.per_unit`]}
        title={`${isNumber(rule.per_unit) ? money(Number(rule.per_unit), { privacy, sign: false }) : '—'} ${rule.kind} per unit`}
        summary={`${asset}${rule.symbol ? ` · ${rule.symbol}` : ''} · ${accountName(accounts, rule.account_id)}`}/>
    })}</div> : <Empty title="No fee rules" line="Reported fees are used as they are. Add a rule for exports that leave fees out." action={<AddButton onClick={ed.add}>Add fee rule</AddButton>}/>}
    {ed.open && <ItemDrawer
      title={ed.open.index === 'new' ? 'New fee rule' : 'Fee rule'} subtitle="Applied only to fills that came in without a fee."
      isNew={ed.open.index === 'new'} error={ed.error} onClose={ed.close} onRemove={ed.remove}
      onSave={() => ed.save((rule) => (isNumber(rule.per_unit) && Number(rule.per_unit) >= 0 ? null : 'Enter a fee of 0 or more.'))}
    >
      <div className="st-dw-pair">
        <DwField label="Fee per contract or share"><span className="st-affix"><em>$</em><input inputMode="decimal" placeholder="0.59" value={item.per_unit} onChange={(event) => ed.set({ per_unit: event.target.value })}/></span></DwField>
        <DwField label="Kind"><Select value={item.kind} onChange={(event) => ed.set({ kind: event.target.value })}>
          {FEE_KINDS.map((value) => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}
        </Select></DwField>
      </div>
      <div className="st-dw-pair">
        <DwField label="Asset class"><Select value={item.asset_class} onChange={(event) => ed.set({ asset_class: event.target.value })}>
          {ASSET_CLASSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select></DwField>
        <DwField label="Symbol" hint="Optional."><input placeholder="ES" value={item.symbol} onChange={(event) => ed.set({ symbol: event.target.value.toUpperCase() })}/></DwField>
      </div>
      <DwField label="Account"><AccountSelect value={item.account_id} accounts={accounts} onChange={(account_id) => ed.set({ account_id })}/></DwField>
    </ItemDrawer>}
    {rules.length > 0 && <AddButton onClick={ed.add}>Add fee rule</AddButton>}
  </>
}

/* ------------------------------------------------------------------ prompt templates */

const fieldsOf = (body) => [...new Set((body.match(/\{\{\s*([\w-]+)\s*\}\}/g) ?? []).map((token) => token.replace(/[{}\s]/g, '')))]

export function TemplatesEditor({ templates, errors, onChange }) {
  const ed = useItemEditor(templates, onChange, blankTemplate)
  const item = ed.open?.item
  return <>
    {templates.length ? <div className="st-items">{templates.map((template, index) => <ItemRow key={index} onOpen={() => ed.edit(index)}
      error={errors[`ai_templates.${index}.name`] || errors[`ai_templates.${index}.body`]}
      title={`/${template.name || 'untitled'}`} summary={template.description || template.body.slice(0, 80) || 'No prompt yet'}/>)}</div>
      : <Empty title="No templates yet" line="Save a prompt you reuse. Write {{name}} for a value to fill in each time." action={<AddButton onClick={ed.add}>Add template</AddButton>}/>}
    {ed.open && <ItemDrawer
      title={ed.open.index === 'new' ? 'New template' : `/${item.name || 'template'}`} subtitle="A template named like a built-in one replaces it."
      isNew={ed.open.index === 'new'} error={ed.error} onClose={ed.close} onRemove={ed.remove}
      onSave={() => ed.save((template) => (!template.name ? 'Name the template.' : !/^[a-z0-9][a-z0-9-]{0,59}$/.test(template.name) ? 'Use lower-case letters, digits and dashes.' : !template.body.trim() ? 'Write the prompt.' : null))}
    >
      <DwField label="Name"><span className="st-affix"><em>/</em><input placeholder="orb-review" value={item.name} onChange={(event) => ed.set({ name: event.target.value.toLowerCase().replace(/\s+/g, '-') })}/></span></DwField>
      <DwField label="Description" hint="Optional."><input maxLength={200} value={item.description} onChange={(event) => ed.set({ description: event.target.value })}/></DwField>
      <DwField label="Prompt" hint={fieldsOf(item.body).length ? `Asks for: ${fieldsOf(item.body).join(', ')}` : 'Write {{name}} for a value to fill in.'}>
        <textarea rows={5} maxLength={8000} placeholder="Review my {{symbol}} trades this week against my ORB playbook." value={item.body} onChange={(event) => ed.set({ body: event.target.value })}/>
      </DwField>
    </ItemDrawer>}
    {templates.length > 0 && templates.length < 30 && <AddButton onClick={ed.add}>Add template</AddButton>}
  </>
}
