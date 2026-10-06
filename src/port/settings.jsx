/**
 * Settings — a pop-up over the current page: a section list on the left, one readable column on
 * the right, your profile at the foot of the list. Journal settings
 * (General, Miscellaneous, AI) save together with an explicit
 * Save that only appears once something changed; the rest act on their own.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { RotateCcw, Search, X } from 'lucide-react'
import { AccountsNavIcon, BellSetIcon, DataSetIcon, ImportNavIcon, LayersSetIcon, OpenAiSetIcon, SettingsNavIcon, UserSetIcon } from '../nav-icons'
import { Avatar } from '../components'
import { profile as accountProfile } from '../data'
import { Group, Note, Row, Seg, TemplatesEditor, TradingRulesEditor } from './settings-editors'
import { AppearanceGroup, DataPanel, LabelsPanel, NotificationsPanel, ProfilePanel } from './settings-panels'
import { AccountsPage } from './accounts'
import { ImportPage } from './import'
import { SETTINGS_KEY, ZONES, initialsOf, journalAccounts, loadSettings, normalise, postSettings, resolveProfile, validate } from './settings-data'
import { Select } from '../select'
import './settings.css'

/** Sections, grouped as in the list, with the form fields each one owns (for unsaved and error dots). */
const NAV = [
  ['Settings', [
    ['General', SettingsNavIcon, 'Appearance and the defaults the journal starts from.', ['default_account_id', 'week_start', 'timezone', 'default_risk_mode', 'default_risk']],
    ['Notifications', BellSetIcon, 'Alerts for broken rules and goals.', []],
    ['Accounts', AccountsNavIcon, 'Your prop and personal trading accounts.', []],
    ['Import', ImportNavIcon, 'Bring in broker statements and add fills by hand.', []],
    ['AI', OpenAiSetIcon, 'What the assistant always knows, and prompts you reuse.', ['ai_instructions', 'ai_templates']],
    ['Data', DataSetIcon, 'Exports and sample data.', []],
    ['Account', UserSetIcon, 'Your name, picture and sign-in.', []],
    ['Miscellaneous', LayersSetIcon, 'Your trading rules and the tags on your trades.', ['trading_rules']],
  ]],
]
const SECTIONS = NAV.flatMap(([, items]) => items)
/** What search finds: each section's own name plus the settings inside it. */
const SEARCH = [
  ['General', 'Appearance', 'Light, dark or system'], ['General', 'Default account'], ['General', 'Week starts on'], ['General', 'Timezone'], ['General', 'Default risk', 'Position sizer'],
  ['Notifications', 'Phone alerts', 'Push notifications'], ['Notifications', 'Recent alerts'],
  ['Miscellaneous', 'Trading rules', 'Max trades, daily loss, losing streak, trading hours'],
  ['Miscellaneous', 'Tags', 'Mistakes, emotions, rename or merge'],
  ['AI', 'Instructions', 'What the assistant always knows'], ['AI', 'Prompt templates'],
  ['Accounts', 'Accounts', 'Prop firm and personal accounts, rules, drawdown'], ['Accounts', 'Add account'], ['Import', 'Import fills', 'Broker statement, CSV, Tradovate, NinjaTrader'], ['Import', 'Add fills', 'Enter fills by hand'],
  ['Data', 'Export trades', 'CSV download'], ['Data', 'Export fills', 'CSV download'], ['Data', 'Sample data'],
  ['Account', 'Display name'], ['Account', 'Profile picture'], ['Account', 'Sign-in', 'Discord'],
]

/** Search settings: matches settings by name, opens the section on pick. ⌘K focuses it while settings are open. */
function SettingsSearch({ onPick }) {
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef(null)
  const q = query.trim().toLowerCase()
  const results = q ? SEARCH.filter(([section, label, hint = '']) => `${label} ${hint} ${section}`.toLowerCase().includes(q)).slice(0, 7) : []
  useEffect(() => {
    // capture phase, so the app's own ⌘K (jump to) doesn't open over settings
    const onKey = (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); event.stopImmediatePropagation(); inputRef.current?.focus(); inputRef.current?.select() } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
  const pick = (item) => { onPick(item[0]); setQuery(''); inputRef.current?.blur() }
  return <div className="st-search" role="search">
    <Search size={15} strokeWidth={2} aria-hidden="true"/>
    <input ref={inputRef} value={query} placeholder="Search settings" aria-label="Search settings" aria-expanded={results.length > 0} aria-controls="st-search-list"
      onChange={(event) => { setQuery(event.target.value); setCursor(0) }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown') { event.preventDefault(); setCursor((value) => Math.min(results.length - 1, value + 1)) }
        if (event.key === 'ArrowUp') { event.preventDefault(); setCursor((value) => Math.max(0, value - 1)) }
        if (event.key === 'Enter' && results[cursor]) { event.preventDefault(); pick(results[cursor]) }
        if (event.key === 'Escape' && query) { event.stopPropagation(); event.nativeEvent.stopImmediatePropagation(); setQuery('') }
      }}/>
    {query ? <button type="button" className="st-search-clear" aria-label="Clear search" onClick={() => { setQuery(''); inputRef.current?.focus() }}><X size={13} strokeWidth={2.2}/></button> : <kbd>⌘K</kbd>}
    {q && <ul id="st-search-list" className="st-search-list" role="listbox">
      {results.length ? results.map((item, index) => <li key={`${item[0]}-${item[1]}`} role="option" aria-selected={index === cursor}>
        <button type="button" className={index === cursor ? 'is-cursor' : ''} onMouseEnter={() => setCursor(index)} onMouseDown={(event) => event.preventDefault()} onClick={() => pick(item)}>
          <b>{item[1]}</b><small>{item[0]}{item[2] ? ` · ${item[2]}` : ''}</small>
        </button>
      </li>) : <li className="st-search-none">No settings match “{query.trim()}”.</li>}
    </ul>}
  </div>
}
const FORM_SECTIONS = new Set(SECTIONS.filter(([, , , keys]) => keys.length).map(([name]) => name))
const TAB_KEY = 'cc-settings-tab'
const readTab = () => { try { const tab = localStorage.getItem(TAB_KEY); return SECTIONS.some(([name]) => name === tab) ? tab : 'General' } catch { return 'General' } }
const sectionOf = (path) => SECTIONS.find(([, , , keys]) => keys.includes(path.split('.')[0]))?.[0]

/** A timezone as a person reads it: "America/New_York" → "New York". */
const zoneName = (zone) => (zone ? zone.split('/').pop().replace(/_/g, ' ') : '')
const draftOf = (content) => ({ ...content, accounts: { ...content.accounts } })
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

function useJournalSettings() {
  // read straight from the local store (no backend yet), so the first paint already has the settings
  const read = () => { try { return { status: 'ready', data: loadSettings() } } catch { return { status: 'error', data: null } } }
  const [state, setState] = useState(read)
  const refetch = () => setState(read())
  return { ...state, refetch, setData: (data) => setState({ status: 'ready', data }) }
}

/** Your name and picture at the foot of the section list. */
function SideProfile({ onOpen }) {
  const person = resolveProfile()
  return <button type="button" className="st-side-profile" onClick={onOpen}>
    <span className="st-side-avatar">{person.avatar ? <img src={person.avatar} alt=""/> : accountProfile.discordId ? <Avatar user={{ ...accountProfile, name: person.name }} size={34}/> : initialsOf(person.name)}</span>
    <span className="st-side-who"><b>{person.name === 'Your name' ? 'Your account' : person.name}</b><small>Personal</small></span>
  </button>
}

// Designs by RNSENCE Studio
/** Settings as a pop-up over the page. Escape or a click outside dismisses it. */
export function SettingsDialog({ privacy, onClose, initialTab = null }) {
  const settings = useJournalSettings()
  const [tab, setTabState] = useState(() => (initialTab && SECTIONS.some(([name]) => name === initialTab) ? initialTab : readTab()))
  const setTab = (next) => { setTabState(next); try { localStorage.setItem(TAB_KEY, next) } catch { /* not kept */ } }
  // kept above the form, which remounts on each saved revision
  const [flash, setFlash] = useState(null)
  const [phase, setPhase] = useState('entering')
  const panelRef = useRef(null)
  useEffect(() => { if (!flash) return undefined; const id = setTimeout(() => setFlash(null), 2400); return () => clearTimeout(id) }, [flash])
  useEffect(() => { const id = requestAnimationFrame(() => setPhase('open')); return () => cancelAnimationFrame(id) }, [])
  const close = () => {
    if (phase === 'leaving') return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    setPhase('leaving'); setTimeout(onClose, reduce ? 120 : 300)
  }
  useEffect(() => {
    // Escape closes the pop-up, unless a drawer or menu inside it is open (that closes first)
    const onKey = (event) => { if (event.key === 'Escape' && !document.querySelector('.dw-scrim, .cs-menu')) close() }
    document.addEventListener('keydown', onKey)
    const lock = document.body.style.overflow; document.body.style.overflow = 'hidden'
    panelRef.current?.focus()
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = lock }
  })
  return createPortal(<div className={`st-scrim is-${phase}`} onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}>
    <div ref={panelRef} tabIndex={-1} className={`st-modal st-page is-${phase}`} role="dialog" aria-modal="true" aria-label="Settings">
      {settings.status === 'loading' && <div className="st-shell is-loading" aria-busy="true"><span className="st-skel nav"/><span className="st-skel body"/></div>}
      {settings.status === 'error' && <div className="st-shell"><Note tone="error" action={<button type="button" className="st-btn" onClick={settings.refetch}>Retry</button>}>Couldn’t load your settings.</Note></div>}
      {settings.status === 'ready' && <SettingsForm key={settings.data.revision} settings={settings.data} privacy={privacy} tab={tab} setTab={setTab}
        onSaved={(next) => settings.setData(next)} onReload={settings.refetch} setFlash={setFlash}/>}
      {flash && <p className="st-flash" role="status">{flash}</p>}
    </div>
  </div>, document.body)
}

function SettingsForm({ settings, privacy, tab, setTab, onSaved, onReload, setFlash }) {
  const accounts = useMemo(journalAccounts, [])
  const c = settings.content
  const initial = useMemo(() => draftOf(c), [c])
  const [draft, setDraft] = useState(initial)
  const [command, setCommand] = useState({ inFlight: false, error: null, pending: null })
  const [touched, setTouched] = useState(false)
  const set = (key, value) => setDraft((current) => ({ ...current, [key]: value }))

  const errors = useMemo(() => validate(draft), [draft])
  const shown = touched ? errors : {}
  const dirtySections = SECTIONS.filter(([, , , keys]) => keys.some((key) => !same(draft[key] ?? null, initial[key] ?? null))).map(([name]) => name)
  const errorSections = new Set(Object.keys(shown).map(sectionOf))
  const dirty = dirtySections.length > 0

  const send = (intent) => {
    setCommand({ inFlight: true, error: null, pending: intent })
    postSettings(intent)
      .then((next) => {
        setCommand({ inFlight: false, error: null, pending: null })
        setFlash(next.rederived_trades ? `Saved · ${next.rederived_trades} trade${next.rederived_trades === 1 ? '' : 's'} recalculated` : 'Saved')
        onSaved(next)
      })
      .catch((error) => setCommand({ inFlight: false, error, pending: error.status === 0 ? intent : null }))
  }
  const submit = (event) => {
    event?.preventDefault()
    if (command.inFlight) return
    if (command.pending) { send(command.pending); return }
    setTouched(true)
    const first = Object.keys(errors)[0]
    if (first) { setTab(sectionOf(first)); return }
    send({ expected_revision: settings.revision, content: normalise(draft) })
  }
  const discard = () => { setDraft(initial); setTouched(false); setCommand({ inFlight: false, error: null, pending: null }) }

  // ⌘S saves from anywhere on the page
  useEffect(() => {
    const onKey = (event) => { if ((event.metaKey || event.ctrlKey) && event.key === 's') { event.preventDefault(); if (dirty) submit() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  // a save from another browser tab refreshes a clean form in place; a dirty one meets the conflict on save
  useEffect(() => {
    const onStorage = (event) => { if (event.key === SETTINGS_KEY && !dirty) onReload() }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [dirty, onReload])

  const errorCopy = command.error && (command.pending ? 'The save couldn’t be confirmed.'
    : command.error.status === 409 ? 'Settings changed somewhere else.' : command.error.message)
  const invalid = touched && Object.keys(errors).length > 0
  const barOn = dirty || command.error || command.inFlight
  const [, , blurb] = SECTIONS.find(([name]) => name === tab) ?? SECTIONS[0]

  return <div className="st-shell">
    <header className="st-top">
      <h2>Settings</h2>
      <SettingsSearch onPick={setTab}/>
    </header>
    <aside className="st-side">
    <nav className="st-nav" aria-label="Settings sections">
      {NAV.map(([group, items], index) => <div key={group} className={`st-nav-group${index === NAV.length - 1 ? ' is-foot' : ''}`} role="group" aria-label={group}>
        {items.map(([name]) => <button key={name} type="button" aria-current={tab === name ? 'page' : undefined} className={`st-nav-item${tab === name ? ' is-on' : ''}`} onClick={() => setTab(name)}>
          <span>{name}</span>
          {errorSections.has(name) ? <i className="st-ndot is-err" aria-label="has errors"/> : dirtySections.includes(name) && <i className="st-ndot" aria-label="unsaved changes"/>}
        </button>)}
      </div>)}
    </nav>
    <SideProfile onOpen={() => setTab('Account')}/>
    </aside>

    {/* room for the save bar under the last row only while it's showing */}
    <div className={`st-main${barOn ? ' has-bar' : ''}`}>
    <div className="st-pane" key={tab}>
      <header className="st-pane-head"><h2>{tab}</h2><p>{blurb}</p></header>

      {tab === 'General' && <>
        <AppearanceGroup/>
        <Group title="Defaults" detail="Where the journal starts each time you log or size a trade.">
          <Row label="Default account" hint="Preselected when you log a trade.">
            <Select value={draft.default_account_id ?? ''} onChange={(event) => set('default_account_id', event.target.value || null)}>
              <option value="">{accounts[0] ? `Auto · ${accounts[0].name}` : 'No accounts yet'}</option>
              {accounts.map((account) => <option key={account.account_id} value={account.account_id}>{account.name}</option>)}
            </Select>
          </Row>
          <Row label="Week starts on" hint="For the calendar and weekly goals.">
            <Seg label="Week starts on" value={draft.week_start} options={[['monday', 'Monday'], ['sunday', 'Sunday']]} onChange={(value) => set('week_start', value)}/>
          </Row>
          <Row label="Timezone" hint="Decides when a trading day starts and ends." error={shown.timezone}>
            {/* Auto follows this browser; a saved zone outside the list still shows as itself */}
            <Select aria-label="Timezone" value={draft.timezone ?? ''} onChange={(event) => set('timezone', event.target.value)}>
              <option value="">Auto · {zoneName(Intl.DateTimeFormat().resolvedOptions().timeZone)}</option>
              {[...new Set([...ZONES, ...(draft.timezone ? [draft.timezone] : [])])].map((zone) => <option key={zone} value={zone}>{zoneName(zone)}</option>)}
            </Select>
          </Row>
          <Row label="Default risk" hint="Pre-fills the position sizer." error={shown.default_risk}>
            <span className="st-inline">
              <Seg label="Default risk as" value={draft.default_risk_mode ?? ''} options={[['', 'None'], ['money', '$'], ['percent', '%']]} onChange={(value) => set('default_risk_mode', value || null)}/>
              {draft.default_risk_mode && <span className={`st-affix${draft.default_risk_mode === 'percent' ? ' after' : ''}`}>
                {draft.default_risk_mode === 'money' && <em>$</em>}
                <input inputMode="decimal" aria-label="Default risk" aria-invalid={!!shown.default_risk} placeholder={draft.default_risk_mode === 'money' ? '200' : '1'} value={draft.default_risk ?? ''} onChange={(event) => set('default_risk', event.target.value)}/>
                {draft.default_risk_mode === 'percent' && <em>%</em>}
              </span>}
            </span>
          </Row>
        </Group>
      </>}



      {tab === 'Miscellaneous' && <>
        <Group title="Trading rules" detail="Your own limits. Every trade that breaks one is marked." plain>
          <TradingRulesEditor rules={draft.trading_rules ?? []} accounts={accounts} errors={shown} privacy={privacy} onChange={(rules) => set('trading_rules', rules)}/>
        </Group>
        <LabelsPanel/>
      </>}

      
      {tab === 'AI' && <>
        <Group title="Instructions" detail="Always followed, here and in any AI app you connect." plain>
          <label className="st-area">
            <textarea rows={5} maxLength={4000} value={draft.ai_instructions ?? ''} aria-label="Instructions for the assistant" onChange={(event) => set('ai_instructions', event.target.value)} placeholder="I trade ES and NQ futures in the New York morning. Be blunt; always compare with my playbook rules."/>
            <em>{(draft.ai_instructions ?? '').length} / 4000</em>
          </label>
        </Group>
        <Group title="Prompt templates" detail="Prompts you reuse, run with /name." plain>
          <TemplatesEditor templates={draft.ai_templates ?? []} errors={shown} onChange={(value) => set('ai_templates', value)}/>
        </Group>
      </>}

      {tab === 'Notifications' && <NotificationsPanel/>}
      {tab === 'Accounts' && <AccountsPage privacy={privacy} embedded/>}
      {tab === 'Import' && <ImportPage privacy={privacy} embedded/>}
      {tab === 'Data' && <DataPanel/>}
      {tab === 'Account' && <ProfilePanel/>}
    </div>

    {/* the save bar rises only when there's something to save, and says where */}
    <div className={`st-savebar${barOn ? ' is-on' : ''}`} role="region" aria-label="Unsaved changes" aria-hidden={!barOn}>
      <span className="st-save-copy">
        {command.error ? <><b className="is-err">{errorCopy}</b>{command.error.status === 409 && <button type="button" className="st-link" onClick={onReload}><RotateCcw size={13}/>Reload</button>}</>
          : invalid ? <b className="is-err">Fix the highlighted fields first.</b>
          : command.inFlight ? <b>Saving…</b>
          : <><b>Unsaved changes</b><small>{dirtySections.join(', ')}</small></>}
      </span>
      <button type="button" className="st-btn is-ghost" disabled={command.inFlight} tabIndex={barOn ? 0 : -1} onClick={discard}>Discard</button>
      <button type="button" className="st-btn is-primary" disabled={command.inFlight} tabIndex={barOn ? 0 : -1} onClick={submit}>{command.inFlight ? 'Saving…' : command.pending ? 'Retry' : 'Save'}<kbd>⌘S</kbd></button>
    </div>
    </div>
  </div>
}
