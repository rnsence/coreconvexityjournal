/**
 * Settings — the journal's settings form (explicit Save, revisioned, conflict-aware) plus the
 * shell's General and Profile & security areas, on page-level tabs like Reports.
 */
import React, { useEffect, useMemo, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { PageHead } from '../workspace'
import { Field } from '../dialogs'
import { AISetupEditor, FeeRulesEditor, GoalsEditor, Note, Section, TradingRulesEditor } from './settings-editors'
import { AlertsPanel, AppearanceCard, ExportButtons, LabelsManager, ProfileCards, SampleData } from './settings-panels'
import { METHODS, SETTINGS_KEY, ZONES, journalAccounts, loadSettings, normalise, postSettings, validate } from './settings-data'
import { Select } from '../select'
import './settings.css'

/** Tabs, and which form fields live on each (for the unsaved / error markers). */
const TABS = [
  ['General', ['default_account_id', 'week_start', 'timezone', 'default_risk_mode', 'default_risk']],
  ['Calculations', ['matching_method', 'scratch_threshold', 'stats_basis', 'accounts']],
  ['Goals & rules', ['goals', 'trading_rules', 'fee_rules']],
  ['AI assistant', ['ai_instructions', 'ai_templates']],
  ['Alerts & labels', []],
  ['Your data', []],
  ['Profile & security', []],
]
const FORM_TABS = new Set(['General', 'Calculations', 'Goals & rules', 'AI assistant'])
const TAB_KEY = 'cc-settings-tab'
const readTab = () => { try { const tab = localStorage.getItem(TAB_KEY); return TABS.some(([name]) => name === tab) ? tab : 'General' } catch { return 'General' } }
const tabOf = (path) => TABS.find(([, keys]) => keys.includes(path.split('.')[0]))?.[0]

const draftOf = (content) => ({ ...content, accounts: { ...content.accounts } })
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const ago = (iso) => {
  if (!iso) return ''
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function useJournalSettings() {
  const [state, setState] = useState({ status: 'loading', data: null })
  const refetch = () => {
    setState((current) => ({ ...current, status: current.data ? 'ready' : 'loading' }))
    setTimeout(() => { try { setState({ status: 'ready', data: loadSettings() }) } catch { setState({ status: 'error', data: null }) } }, 320)
  }
  useEffect(refetch, [])
  return { ...state, refetch, setData: (data) => setState({ status: 'ready', data }) }
}

// Designs by RNSENCE Studio
export function SettingsPage({ privacy }) {
  const settings = useJournalSettings()
  const [tab, setTabState] = useState(readTab)
  const setTab = (next) => { setTabState(next); try { localStorage.setItem(TAB_KEY, next) } catch { /* not kept */ } }
  const [saved, setSaved] = useState(null)

  return <div className="page home ws-page st-page">
    <PageHead title="Settings" meta={settings.data ? (settings.data.revision
      ? `Journal settings revision ${settings.data.revision} · saved ${ago(settings.data.saved_at)}`
      : 'Journal defaults · never saved') : 'Journal, appearance and your profile'}/>
    {settings.status === 'loading' && <p role="status" className="st-loading">Loading settings…</p>}
    {settings.status === 'error' && <Note tone="error" className="st-top" action={<button type="button" className="ws-outline st-sm" onClick={settings.refetch}>Retry</button>}>Could not load the journal settings.</Note>}
    {settings.status === 'ready' && <SettingsForm
      key={settings.data.revision} settings={settings.data} privacy={privacy} tab={tab} setTab={setTab} saved={saved}
      onSaved={(next) => { setSaved(next); settings.setData(next) }} onReload={settings.refetch}
    />}
  </div>
}

function SettingsForm({ settings, privacy, tab, setTab, saved, onSaved, onReload }) {
  const accounts = useMemo(journalAccounts, [])
  const c = settings.content
  const initial = useMemo(() => draftOf(c), [c])
  const [draft, setDraft] = useState(initial)
  const [command, setCommand] = useState({ inFlight: false, error: null, pending: null })
  const [touched, setTouched] = useState(false)
  const set = (key, value) => setDraft((current) => ({ ...current, [key]: value }))
  const setOverride = (id, next) => setDraft((current) => ({
    ...current, accounts: { ...current.accounts, [id]: { ...(current.accounts[id] ?? { matching_method: null, scratch_threshold: null }), ...next } },
  }))

  const errors = useMemo(() => validate(draft), [draft])
  const shown = touched ? errors : {}
  const dirtyTabs = TABS.filter(([, keys]) => keys.some((key) => !same(draft[key] ?? null, initial[key] ?? null))).map(([name]) => name)
  const errorTabs = new Set(Object.keys(shown).map(tabOf))
  const dirty = dirtyTabs.length > 0

  const methodOf = (content, id) => content.accounts?.[id]?.matching_method || null
  const methodChanges = draft.matching_method !== c.matching_method || accounts.some((a) => methodOf(draft, a.account_id) !== methodOf(c, a.account_id))

  const send = (intent) => {
    setCommand({ inFlight: true, error: null, pending: intent })
    postSettings(intent)
      .then((next) => { setCommand({ inFlight: false, error: null, pending: null }); onSaved(next) })
      .catch((error) => setCommand({ inFlight: false, error, pending: error.status === 0 ? intent : null }))
  }
  const submit = (event) => {
    event?.preventDefault()
    if (command.inFlight) return
    if (command.pending) { send(command.pending); return }
    setTouched(true)
    const first = Object.keys(errors)[0]
    if (first) { setTab(tabOf(first)); return }
    send({ expected_revision: settings.revision, content: normalise(draft) })
  }
  const discard = () => { setDraft(initial); setTouched(false); setCommand({ inFlight: false, error: null, pending: null }) }

  const errorCopy = command.error && (command.pending ? 'The save could not be confirmed. Retry sends the same settings.'
    : command.error.status === 409 ? 'The settings changed elsewhere. Reload to see them.' : command.error.message)
  const invalid = touched && Object.keys(errors).length > 0
  const label = command.inFlight ? 'Saving…' : command.pending ? 'Retry save' : 'Save settings'
  const showBar = FORM_TABS.has(tab) || dirty || command.error

  // A save from another tab refreshes a clean form in place; a dirty one meets the conflict on save.
  useEffect(() => {
    const onStorage = (event) => { if (event.key === SETTINGS_KEY && !dirty) onReload() }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [dirty, onReload])

  const input = (key, props = {}) => <input value={draft[key] ?? ''} aria-invalid={!!shown[key]} onChange={(event) => set(key, event.target.value)} {...props}/>

  return <>
    <div className="ws-tabs st-tabs">
      <div className="ws-seg compact rail-switch report-switch" role="tablist" aria-label="Settings">
        {TABS.map(([name]) => <button key={name} type="button" role="tab" aria-selected={tab === name} className={tab === name ? 'active' : ''} onClick={() => setTab(name)}>
          {name}{errorTabs.has(name) ? <i className="st-dot err" aria-label="has errors"/> : dirtyTabs.includes(name) && <i className="st-dot" aria-label="unsaved changes"/>}
        </button>)}
      </div>
    </div>

    {saved && FORM_TABS.has(tab) && <Note className="st-top">Saved revision {saved.revision}{saved.rederived_trades ? `; ${saved.rederived_trades} trade${saved.rederived_trades === 1 ? '' : 's'} re-derived` : ''}.</Note>}

    {FORM_TABS.has(tab) && <form className="st-form" onSubmit={submit} noValidate aria-label="Journal settings" key={tab}>
      {tab === 'General' && <div className="ws-grid st-grid st-general">
        <AppearanceCard/>
        <Section title="Defaults" detail="The account preselected in the journal's forms, the calendar's first weekday, the timezone that decides today (daily loss limits, today's journal), and the sizer's risk budget.">
          <div className="dlg-grid st-fields-grid">
            <Field label="Default account"><Select value={draft.default_account_id ?? ''} onChange={(event) => set('default_account_id', event.target.value || null)}>
              <option value="">First account</option>
              {accounts.map((account) => <option key={account.account_id} value={account.account_id}>{account.name}</option>)}
            </Select></Field>
            <Field label="Week starts on"><Select value={draft.week_start} onChange={(event) => set('week_start', event.target.value)}>
              <option value="monday">Monday</option><option value="sunday">Sunday</option>
            </Select></Field>
            <Field label="Timezone" error={shown.timezone} hint={!shown.timezone && !draft.timezone ? "Blank uses this browser's timezone" : undefined}>
              <input list="journal-zones" placeholder="This browser's" value={draft.timezone} aria-invalid={!!shown.timezone} onChange={(event) => set('timezone', event.target.value.trim())}/>
              <datalist id="journal-zones">{ZONES.map((zone) => <option key={zone} value={zone}/>)}</datalist>
            </Field>
            <Field label="Sizer risk" error={shown.default_risk}>
              <span className="st-pair">
                <Select aria-label="Default risk as" value={draft.default_risk_mode ?? ''} onChange={(event) => set('default_risk_mode', event.target.value || null)}>
                  <option value="">No default</option><option value="money">Money</option><option value="percent">% of account</option>
                </Select>
                {draft.default_risk_mode && <span className="st-affix">{draft.default_risk_mode === 'money' ? <em>$</em> : <em className="after">%</em>}
                  {input('default_risk', { inputMode: 'decimal', 'aria-label': 'Default risk', placeholder: draft.default_risk_mode === 'money' ? '200' : '1' })}</span>}
              </span>
            </Field>
          </div>
        </Section>
      </div>}

      {tab === 'Calculations' && <div className="st-stack">
        <Section title="P&L matching method" detail="How exits are paired with entries. A trade that ends flat has the same total under every method; partial exits and an open trade's realized P&L differ.">
          <div className="st-methods" role="radiogroup" aria-label="Matching method">
            {METHODS.map((item) => <label key={item.value} className={`st-method${draft.matching_method === item.value ? ' on' : ''}`}>
              <input type="radio" name="matching" value={item.value} checked={draft.matching_method === item.value} onChange={() => set('matching_method', item.value)}/>
              <span className="st-radio" aria-hidden="true"/>
              <b>{item.label}</b>
              <small>{item.detail}</small>
            </label>)}
          </div>
          {methodChanges && <Note>Saving re-derives every trade with fills; each one whose P&amp;L changes gets a new revision.</Note>}
        </Section>
        <div className="ws-grid st-grid st-calc">
          <Section title="Statistics" detail="The scratch threshold makes a trade within ± this amount neither a win nor a loss (the same amount in every currency). Gross counts each trade before fees; prop-firm rules always use net.">
            <div className="dlg-grid st-fields-grid">
              <Field label="Scratch threshold" error={shown.scratch_threshold}>
                <span className="st-affix"><em>±$</em>{input('scratch_threshold', { inputMode: 'decimal', 'aria-label': 'Scratch threshold' })}</span>
              </Field>
              <Field label="P&L basis"><Select aria-label="P&L basis" value={draft.stats_basis} onChange={(event) => set('stats_basis', event.target.value)}>
                <option value="net">Net of fees</option><option value="gross">Gross, before fees</option>
              </Select></Field>
            </div>
          </Section>
          {accounts.length > 0 && <Section title="Per account" detail="An account can use its own matching method and scratch threshold; blank uses the journal's.">
            <div className="ws-table-wrap"><table className="feed-table ws-table st-table" aria-label="Account overrides">
              <thead><tr><th>Account</th><th>Matching</th><th>Scratch</th></tr></thead>
              <tbody>{accounts.map((account) => {
                const o = draft.accounts[account.account_id]
                const error = shown[`accounts.${account.account_id}`]
                return <tr key={account.account_id}>
                  <td><b>{account.name}</b><small>{account.account_id}</small></td>
                  <td><div className="dlg-field"><Select aria-label={`${account.name} matching`} value={o?.matching_method ?? ''} onChange={(event) => setOverride(account.account_id, { matching_method: event.target.value || null })}>
                    <option value="">Journal default</option>{METHODS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </Select></div></td>
                  <td><div className="dlg-field"><input inputMode="decimal" aria-label={`${account.name} scratch`} placeholder="Default" value={o?.scratch_threshold ?? ''} aria-invalid={!!error} onChange={(event) => setOverride(account.account_id, { scratch_threshold: event.target.value })}/>{error && <small className="is-error">{error}</small>}</div></td>
                </tr>
              })}</tbody>
            </table></div>
          </Section>}
        </div>
      </div>}

      {tab === 'Goals & rules' && <div className="st-stack">
        <Section title="Goals" detail="Weekly or monthly targets. Progress is this period's statistics, measured the same way as the rest of the journal; a floor (P&L, win rate, profit factor, R) is met at or above it, a ceiling (drawdown, trades, rule breaks) at or below.">
          <GoalsEditor goals={draft.goals ?? []} saved={c.goals ?? []} content={c} accounts={accounts} errors={shown} privacy={privacy} onChange={(goals) => set('goals', goals)}/>
        </Section>
        <Section title="Trading rules" detail="Your own limits. Every trade that broke one is marked, and the statistics break results down by rule broken. A rule for every account counts the whole day across accounts.">
          <TradingRulesEditor rules={draft.trading_rules ?? []} accounts={accounts} errors={shown} onChange={(rules) => set('trading_rules', rules)}/>
        </Section>
        <Section title="Fee schedule" detail="Charged per contract or share on fills whose export or entry reported no fee (thinkorswim trade history, Tradovate's Performance report, some Webull files). Reported fees never change. The most specific matching rule wins per fee kind; saving re-prices those fills and their trades.">
          <FeeRulesEditor rules={draft.fee_rules ?? []} accounts={accounts} errors={shown} onChange={(rules) => set('fee_rules', rules)}/>
        </Section>
      </div>}

      {tab === 'AI assistant' && <Section title="AI assistant" detail="Instructions the assistant always follows, here and in Claude or other connected AI apps, and your own prompt templates. Write {{name}} in a template for a value to fill in when you use it.">
        <AISetupEditor instructions={draft.ai_instructions ?? ''} templates={draft.ai_templates ?? []} errors={shown}
          onInstructions={(value) => set('ai_instructions', value)} onTemplates={(value) => set('ai_templates', value)}/>
      </Section>}
      <button type="submit" hidden aria-hidden="true" tabIndex={-1}/>
    </form>}

      {tab === 'Alerts & labels' && <div className="ws-grid one-one st-grid"><AlertsPanel/><LabelsManager/></div>}
      {tab === 'Your data' && <div className="ws-grid one-one st-grid"><ExportButtons/><SampleData/></div>}
      {tab === 'Profile & security' && <ProfileCards/>}

      {showBar && <div className={`st-savebar${dirty || command.error || command.inFlight ? ' is-live' : ''}`}>
        <div className="st-save-state">
          {command.error ? <Note tone="error" action={command.error.status === 409 && <button type="button" className="ws-outline st-sm" onClick={onReload}><RotateCcw size={13}/>Reload</button>}>{errorCopy}</Note>
            : invalid ? <Note tone="error">Fix the highlighted fields before saving.</Note>
            : <span className="st-status">
              <i className={dirty ? 'dirty' : 'clean'}/>
              {command.inFlight ? 'Saving…' : dirty ? `Unsaved changes in ${dirtyTabs.join(', ')}` : settings.revision ? `All changes saved · revision ${settings.revision}` : 'Using the journal defaults · nothing saved yet'}
            </span>}
        </div>
        <div className="st-save-actions">
          {dirty && <button type="button" className="ws-outline" disabled={command.inFlight} onClick={discard}>Discard</button>}
          <button type="button" className="start-day" onClick={submit} disabled={command.inFlight || (!dirty && !command.pending)}>{label}</button>
        </div>
      </div>}
  </>
}
