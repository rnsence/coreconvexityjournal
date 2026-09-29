/**
 * Settings building blocks and the row editors inside the journal settings form
 * (goals, trading rules, fee schedule, AI setup).
 */
import React from 'react'
import { CircleAlert, Info, Plus, X } from 'lucide-react'
import { Card } from '../workspace'
import {
  ASSET_CLASSES, FEE_KINDS, GOAL_METRICS, RULE_KINDS, blankFee, blankGoal, blankRule, blankTemplate, browserZone, goalProgress,
} from './settings-data'

/** A settings group: chip title, one line of detail, then its controls. */
export function Section({ title, detail, aside, className = '', children }) {
  return <Card title={title} aside={aside} className={`st-section ${className}`}>
    {detail && <p className="st-detail">{detail}</p>}
    {children}
  </Card>
}

/** Persistent inline feedback (the monolith has no toasts): info or error, with an optional action. */
export function Note({ tone = 'info', action, children, className = '' }) {
  const error = tone === 'error'
  return <div className={`st-note ${error ? 'is-error' : ''} ${className}`} role={error ? 'alert' : 'status'}>
    {error ? <CircleAlert size={15}/> : <Info size={15}/>}
    <span>{children}</span>
    {action}
  </div>
}

export function AddButton({ children, onClick }) {
  return <button type="button" className="ws-outline st-add" onClick={onClick}><Plus size={14} strokeWidth={2.2}/>{children}</button>
}

export function RemoveButton({ label, onClick }) {
  return <button type="button" className="st-icon" aria-label={label} onClick={onClick}><X size={13} strokeWidth={2.2}/></button>
}

/** One control cell in a row editor: dialog-styled input with its own error line. */
function Cell({ error, children }) {
  return <div className={`dlg-field st-cell${error ? ' has-error' : ''}`}>{children}{error && <small className="is-error">{error}</small>}</div>
}

function Rows({ head, cols, empty, children }) {
  const rows = React.Children.toArray(children)
  return <div className="st-rows" style={{ '--cols': cols }}>
    {rows.length ? <>
      <div className="st-rows-head" aria-hidden="true">{head.map((label, index) => <span key={index}>{label}</span>)}</div>
      {rows}
    </> : <p className="st-empty">{empty}</p>}
  </div>
}

const AccountSelect = ({ value, accounts, onChange, label }) => <select aria-label={label} value={value ?? ''} onChange={(event) => onChange(event.target.value || null)}>
  <option value="">Every account</option>
  {accounts.map((account) => <option key={account.account_id} value={account.account_id}>{account.name}</option>)}
</select>

const patch = (list, index, next) => list.map((item, i) => (i === index ? { ...item, ...next } : item))

/* ------------------------------------------------------------------ goals */

export function GoalsEditor({ goals, saved, content, accounts, errors, privacy, onChange }) {
  const update = (index, next) => onChange(patch(goals, index, next))
  return <>
    <Rows cols="minmax(0,1.2fr) minmax(0,1.4fr) 104px 118px minmax(0,1fr) 26px" head={['Name', 'Metric', 'Target', 'Period', 'Account', '']} empty="No goals yet. Add a weekly or monthly target to track it here.">
      {goals.map((goal, index) => {
        const match = saved.find((item) => item.name === goal.name && item.metric === goal.metric)
        const progress = match && goal.name ? goalProgress(match, content, { privacy }) : null
        return <div className="st-row-wrap" key={index}>
          <div className="st-row" role="group" aria-label={`Goal ${index + 1}`}>
            <Cell><input aria-label="Name" placeholder="Monthly target" value={goal.name} onChange={(event) => update(index, { name: event.target.value })}/></Cell>
            <Cell><select aria-label="Metric" value={goal.metric} onChange={(event) => update(index, { metric: event.target.value })}>
              {GOAL_METRICS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select></Cell>
            <Cell error={errors[`goals.${index}.target`]}><input aria-label="Target" inputMode="decimal" placeholder={goal.metric === 'win_rate' ? '0.55' : 'Target'} value={goal.target} aria-invalid={!!errors[`goals.${index}.target`]} onChange={(event) => update(index, { target: event.target.value })}/></Cell>
            <Cell><select aria-label="Period" value={goal.period} onChange={(event) => update(index, { period: event.target.value })}><option value="week">Weekly</option><option value="month">Monthly</option></select></Cell>
            <Cell><AccountSelect label="Account" value={goal.account_id} accounts={accounts} onChange={(value) => update(index, { account_id: value })}/></Cell>
            <RemoveButton label={`Remove goal ${index + 1}`} onClick={() => onChange(goals.filter((_, i) => i !== index))}/>
          </div>
          {progress && <p className="st-progress" aria-label={`Progress of ${goal.name}`}>
            {progress.from} to {progress.to}: <b>{progress.value ?? 'no trades'}</b> of {progress.target} · {progress.trades} trade{progress.trades === 1 ? '' : 's'}
            <span className={`st-badge ${progress.status === 'met' ? 'pos' : ''}`}>{progress.status}</span>
          </p>}
        </div>
      })}
    </Rows>
    <AddButton onClick={() => onChange([...goals, blankGoal()])}>Add goal</AddButton>
  </>
}

/* ------------------------------------------------------------------ trading rules */

export function TradingRulesEditor({ rules, accounts, errors, onChange }) {
  const update = (index, next) => onChange(patch(rules, index, next))
  const setTime = (index, key, value) => update(index, { [key]: value, timezone: rules[index].timezone || browserZone() || 'America/New_York' })
  return <>
    <Rows cols="minmax(0,1fr) minmax(0,1.4fr) minmax(0,1fr) minmax(0,1fr) 26px" head={['Account', 'Rule', 'Limit', '', '']} empty="No rules yet. Trades that break a rule are marked and counted in the statistics.">
      {rules.map((rule, index) => {
        const kind = RULE_KINDS.find(([value]) => value === rule.kind)
        return <div className="st-row" key={index} role="group" aria-label={`Trading rule ${index + 1}`}>
          <Cell><AccountSelect label="Account" value={rule.account_id} accounts={accounts} onChange={(value) => update(index, { account_id: value })}/></Cell>
          <Cell><select aria-label="Rule" value={rule.kind} onChange={(event) => update(index, { kind: event.target.value })}>
            {RULE_KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></Cell>
          {rule.kind === 'window' ? <>
            <Cell><input type="time" aria-label="From" value={rule.start} onChange={(event) => setTime(index, 'start', event.target.value)}/></Cell>
            <Cell error={errors[`trading_rules.${index}.end`]}><input type="time" aria-label="Until" value={rule.end} aria-invalid={!!errors[`trading_rules.${index}.end`]} onChange={(event) => setTime(index, 'end', event.target.value)}/></Cell>
          </> : <>
            <Cell error={errors[`trading_rules.${index}.limit`]}><input aria-label="Limit" inputMode="decimal" placeholder={kind?.[2]} value={rule.limit} aria-invalid={!!errors[`trading_rules.${index}.limit`]} onChange={(event) => update(index, { limit: event.target.value })}/></Cell>
            <span/>
          </>}
          <RemoveButton label={`Remove rule ${index + 1}`} onClick={() => onChange(rules.filter((_, i) => i !== index))}/>
        </div>
      })}
    </Rows>
    <AddButton onClick={() => onChange([...rules, blankRule()])}>Add rule</AddButton>
  </>
}

/* ------------------------------------------------------------------ fee schedule */

export function FeeRulesEditor({ rules, accounts, errors, onChange }) {
  const update = (index, next) => onChange(patch(rules, index, next))
  return <>
    <Rows cols="minmax(0,1fr) minmax(0,1fr) 96px minmax(0,1fr) 120px 26px" head={['Account', 'Asset class', 'Symbol', 'Fee kind', 'Per unit', '']} empty="No fee rules. Reported fees are used as they are.">
      {rules.map((rule, index) => <div className="st-row" key={index} role="group" aria-label={`Fee rule ${index + 1}`}>
        <Cell><AccountSelect label="Account" value={rule.account_id} accounts={accounts} onChange={(value) => update(index, { account_id: value })}/></Cell>
        <Cell><select aria-label="Asset class" value={rule.asset_class} onChange={(event) => update(index, { asset_class: event.target.value })}>
          {ASSET_CLASSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></Cell>
        <Cell><input aria-label="Symbol or root" placeholder="ES" value={rule.symbol} onChange={(event) => update(index, { symbol: event.target.value.toUpperCase() })}/></Cell>
        <Cell><select aria-label="Fee kind" value={rule.kind} onChange={(event) => update(index, { kind: event.target.value })}>
          {FEE_KINDS.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
        </select></Cell>
        <Cell error={errors[`fee_rules.${index}.per_unit`]}><span className="st-affix"><em>$</em><input aria-label="Per contract or share" inputMode="decimal" placeholder="0.59" value={rule.per_unit} aria-invalid={!!errors[`fee_rules.${index}.per_unit`]} onChange={(event) => update(index, { per_unit: event.target.value })}/></span></Cell>
        <RemoveButton label={`Remove fee rule ${index + 1}`} onClick={() => onChange(rules.filter((_, i) => i !== index))}/>
      </div>)}
    </Rows>
    <AddButton onClick={() => onChange([...rules, blankFee()])}>Add fee rule</AddButton>
  </>
}

/* ------------------------------------------------------------------ AI setup */

export function AISetupEditor({ instructions, templates, errors, onInstructions, onTemplates }) {
  const update = (index, next) => onTemplates(patch(templates, index, next))
  return <div className="st-ai">
    <label className="dlg-field st-area">
      <span>Instructions for the assistant <em>{instructions.length}/4000</em></span>
      <textarea rows={5} maxLength={4000} value={instructions} onChange={(event) => onInstructions(event.target.value)} placeholder="I trade ES and NQ futures in the New York morning. Be blunt; always compare with my playbook rules."/>
    </label>
    <div className="st-templates">
      <div className="st-sub-head"><span>Prompt templates</span><small>{templates.length} of 30</small></div>
      {!templates.length && <p className="st-empty">No templates yet. One named like a built-in template replaces it.</p>}
      {templates.map((template, index) => <fieldset key={index} className="st-template">
        <div className="st-template-grid">
          <Cell error={errors[`ai_templates.${index}.name`]}>
            <span>Name</span>
            <input required pattern="[a-z0-9][a-z0-9-]{0,59}" placeholder="orb-review" value={template.name} aria-invalid={!!errors[`ai_templates.${index}.name`]} onChange={(event) => update(index, { name: event.target.value.toLowerCase() })}/>
          </Cell>
          <Cell><span>Description</span><input maxLength={200} value={template.description} onChange={(event) => update(index, { description: event.target.value })}/></Cell>
          <RemoveButton label={`Remove template ${index + 1}`} onClick={() => onTemplates(templates.filter((_, i) => i !== index))}/>
        </div>
        <Cell error={errors[`ai_templates.${index}.body`]}>
          <span>Prompt</span>
          <textarea rows={3} required maxLength={8000} placeholder="Review my {{symbol}} trades this week against my ORB playbook." value={template.body} aria-invalid={!!errors[`ai_templates.${index}.body`]} onChange={(event) => update(index, { body: event.target.value })}/>
        </Cell>
        {(template.body.match(/\{\{\s*([\w-]+)\s*\}\}/g) ?? []).length > 0 && <p className="st-fields">Fills in: {[...new Set(template.body.match(/\{\{\s*([\w-]+)\s*\}\}/g).map((token) => token.replace(/[{}\s]/g, '')))].map((name) => <code key={name}>{name}</code>)}</p>}
      </fieldset>)}
      {templates.length < 30 && <AddButton onClick={() => onTemplates([...templates, blankTemplate()])}>Add template</AddButton>}
    </div>
  </div>
}
