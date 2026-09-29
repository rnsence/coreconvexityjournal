/**
 * The settings panels that act on their own (no Save): alerts, labels, exports, sample
 * data, appearance and the profile & security cards.
 */
import React, { useEffect, useRef, useState } from 'react'
import { BellRing, Check, Download, ImageUp, Monitor, Moon, ShieldCheck, Sun, Trash2 } from 'lucide-react'
import { Avatar } from '../components'
import { profile as accountProfile } from '../data'
import { Choice } from '../dialogs'
import { Note, Section } from './settings-editors'
import {
  APPEARANCE_EVENT, exportCSV, fileToAvatar, initialsOf, loadAlerts, loadLabels, loadSample, markAlertsRead, readAppearance,
  renameLabel, resolveProfile, setAppearance, setProfileAvatar, setProfileName, setSample, systemDark,
} from './settings-data'

const stamp = (iso) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

/* ------------------------------------------------------------------ alerts */

export function AlertsPanel() {
  const [feed, setFeed] = useState(loadAlerts)
  const [marking, setMarking] = useState(false)
  const [push, setPush] = useState({ state: 'off', error: null })
  const markRead = () => { setMarking(true); setTimeout(() => { setFeed(markAlertsRead()); setMarking(false) }, 380) }
  const enablePush = async () => {
    setPush({ state: 'pending', error: null })
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('This browser cannot receive push notifications. On iPhone, add the app to the home screen first.')
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') throw new Error('Notifications were not allowed.')
      setPush({ state: 'on', error: null })
    } catch (error) { setPush({ state: 'off', error: error.message }) }
  }
  return <Section title="Alerts" className="st-alerts" aside={feed.unread > 0 && <span className="st-count">{feed.unread} unread</span>}
    detail="Raised once each when trades break one of your rules or a goal is met or missed, after an import, a trade you log or a broker sync. Turn on phone alerts to be notified on this device too.">
    <div className="st-actions">
      {feed.push && <button type="button" className="ws-outline st-sm" disabled={push.state !== 'off'} onClick={enablePush}>
        {push.state === 'on' ? <><Check size={14}/>Phone alerts on</> : <><BellRing size={14}/>Turn on phone alerts</>}
      </button>}
      {feed.unread > 0 && <button type="button" className="st-ghost" disabled={marking} onClick={markRead}>Mark all read</button>}
      {!feed.push && <span className="st-muted">Phone alerts are not configured on this server; alerts show here.</span>}
    </div>
    {push.error && <Note tone="error">{push.error}</Note>}
    {feed.alerts.length === 0 ? <p className="st-empty">No alerts yet. They appear when trades break your rules or reach your goals.</p>
      : <ul className="st-alert-list">{feed.alerts.map((alert) => <li key={alert.key} className={alert.read_at ? 'is-read' : ''}>
        <span className={`st-badge ${alert.kind === 'goal_met' ? 'pos' : alert.read_at ? '' : 'neg'}`}>{alert.title}</span>
        <span className="st-alert-body">{alert.body}</span>
        <time>{stamp(alert.created_at)}</time>
      </li>)}</ul>}
  </Section>
}

/* ------------------------------------------------------------------ labels */

const GROUPS = [['mistakes', 'mistake', 'Mistakes'], ['tags', 'tag', 'Tags'], ['emotions', 'emotion', 'Emotions']]

export function LabelsManager() {
  const [labels, setLabels] = useState(loadLabels)
  const [editing, setEditing] = useState(null)
  const [value, setValue] = useState('')
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState(null)
  const inputRef = useRef(null)
  useEffect(() => { if (editing) inputRef.current?.select() }, [editing])
  const start = (kind, label) => { setEditing({ kind, label }); setValue(label); setResult(null) }
  const run = async (to) => {
    setPending(true)
    const { labels: next, revised } = await renameLabel(editing.kind, editing.label, to)
    setLabels(next); setPending(false)
    setResult(to ? `Renamed “${editing.label}” to “${to}” on ${revised} trade${revised === 1 ? '' : 's'}.` : `Removed “${editing.label}” from ${revised} trade${revised === 1 ? '' : 's'}.`)
    setEditing(null)
  }
  return <Section title="Labels" className="st-labels" detail="Every tag, mistake and emotion on your trades. Rename one to fix it everywhere; renaming onto an existing label merges the two; delete removes it. Each trade changed gets a new revision.">
    {result && <Note>{result}</Note>}
    {GROUPS.map(([group, kind, title]) => <div key={group} className="st-label-group">
      <p className="st-group-title">{title}</p>
      {labels[group].length === 0 ? <p className="st-empty">None yet.</p> : <ul className="st-chips">
        {labels[group].map((item) => {
          const on = editing?.kind === kind && editing.label === item.label
          return <li key={item.label} className={on ? 'is-editing' : ''}>
            {on ? <form className="st-chip-edit" onSubmit={(event) => { event.preventDefault(); if (value.trim() && !pending) run(value.trim()) }}
              onKeyDown={(event) => { if (event.key === 'Escape') setEditing(null) }}>
              <input ref={inputRef} aria-label={`Rename ${item.label}`} value={value} onChange={(event) => setValue(event.target.value)}/>
              <button type="submit" className="st-mini dark" disabled={!value.trim() || pending}>Rename</button>
              <button type="button" className="st-mini danger" disabled={pending} onClick={() => run('')}>Delete</button>
              <button type="button" className="st-mini" onClick={() => setEditing(null)}>Cancel</button>
            </form> : <button type="button" className="st-chip" onClick={() => start(kind, item.label)}>{item.label} <em>· {item.trades}</em></button>}
          </li>
        })}
      </ul>}
    </div>)}
  </Section>
}

/* ------------------------------------------------------------------ exports + sample data */

export function ExportButtons() {
  const [pending, setPending] = useState(null)
  const [error, setError] = useState(null)
  const run = async (kind) => {
    setPending(kind); setError(null)
    try { await exportCSV(kind) } catch (err) { setError(err.message) } finally { setPending(null) }
  }
  return <Section title="Your data" detail="Every trade (as the statistics see it, with its review) or every fill (with the file and row it came from) as CSV.">
    <div className="st-actions">
      <button type="button" className="ws-outline st-sm" disabled={!!pending} onClick={() => run('trades')}><Download size={14}/>{pending === 'trades' ? 'Preparing…' : 'Download trades (CSV)'}</button>
      <button type="button" className="ws-outline st-sm" disabled={!!pending} onClick={() => run('fills')}><Download size={14}/>{pending === 'fills' ? 'Preparing…' : 'Download fills (CSV)'}</button>
    </div>
    {error && <Note tone="error">{error}</Note>}
  </Section>
}

export function SampleData() {
  const [status, setStatus] = useState(loadSample)
  const [pending, setPending] = useState(false)
  const toggle = async () => { setPending(true); setStatus(await setSample(!status.active)); setPending(false) }
  return <Section title="Sample data" aside={status.active && <span className="st-count">Loaded</span>} detail="Explore every view with a realistic journal before importing your own.">
    <p className="st-copy">{status.active
      ? `Sample data is loaded: ${status.trades} trades in two "Sample ·" accounts. Removing it undoes its fills and archives its accounts and playbooks; your own data is untouched.`
      : 'Loads two accounts (a prop evaluation and a personal account), three playbooks and about 60 trading days of reviewed trades built from fills. It takes a few seconds and can be removed in one step.'}</p>
    <div className="st-actions">
      <button type="button" className={`ws-outline st-sm${pending ? ' is-busy' : ''}`} disabled={pending} onClick={toggle}>
        {status.active ? (pending ? 'Removing…' : 'Remove sample data') : (pending ? 'Loading sample data…' : 'Load sample data')}
      </button>
    </div>
  </Section>
}

/* ------------------------------------------------------------------ appearance */

const APPEARANCES = { light: 'Light', dark: 'Dark', system: 'System' }
const APPEARANCE_ICONS = { Light: Sun, Dark: Moon, System: Monitor }

export function AppearanceCard() {
  const [value, setValue] = useState(readAppearance)
  const [prefersDark, setPrefersDark] = useState(systemDark)
  useEffect(() => {
    const sync = () => setValue(readAppearance())
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    const onMedia = () => { setPrefersDark(media.matches); if (readAppearance() === 'system') setAppearance('system') }
    window.addEventListener('storage', sync)
    window.addEventListener(APPEARANCE_EVENT, sync)
    media?.addEventListener?.('change', onMedia)
    return () => { window.removeEventListener('storage', sync); window.removeEventListener(APPEARANCE_EVENT, sync); media?.removeEventListener?.('change', onMedia) }
  }, [])
  const resolved = value === 'system' ? (prefersDark ? 'dark' : 'light') : value
  return <Section title="Appearance" detail="How the app is drawn on this device. System follows your computer's light or dark setting as it changes.">
    <Choice label="Appearance" options={['Light', 'Dark', 'System']} value={APPEARANCES[value]}
      format={(option) => { const Icon = APPEARANCE_ICONS[option]; return <span className="st-choice"><Icon size={14}/>{option}</span> }}
      onChange={(option) => { const next = option.toLowerCase(); setAppearance(next); setValue(next) }}/>
    <p className="st-hint">{value === 'system' ? `Following this device: ${resolved}.` : `Always ${resolved}.`} Saved on this device right away; the journal is drawn in light until its dark theme ships.</p>
  </Section>
}

/* ------------------------------------------------------------------ profile & security */

export function ProfileCards() {
  const [person, setPerson] = useState(resolveProfile)
  const [name, setName] = useState(person.name)
  const [note, setNote] = useState(null)
  const fileRef = useRef(null)
  useEffect(() => {
    const sync = () => setPerson(resolveProfile())
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])
  const refresh = (message) => { const next = resolveProfile(); setPerson(next); setName(next.name); setNote(message) }
  const saveName = (event) => { event.preventDefault(); setProfileName(name); refresh(name.trim() ? { text: 'Name saved on this device.' } : { text: 'Name reset to your account’s.' }) }
  const pick = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try { setProfileAvatar(await fileToAvatar(file)); refresh({ text: 'Picture updated.' }) }
    catch { setNote({ tone: 'error', text: 'That image could not be read. Try a PNG or JPEG.' }) }
  }
  const display = person.name === 'Your name' ? 'Your account' : person.name
  const nameDirty = name.trim() !== person.name
  return <div className="ws-grid one-one st-grid">
    <Section title="Profile" detail="Your name and picture on this journal's cards and menus. They're kept on this device and never change how you sign in.">
      <div className="st-profile">
        <span className="st-avatar">{person.avatar ? <img src={person.avatar} alt=""/> : accountProfile.discordId ? <Avatar user={{ ...accountProfile, name: person.name }} size={56}/> : initialsOf(person.name)}</span>
        <div className="st-profile-id">
          <b>{display}</b>
          <small>Personal workspace · initials {initialsOf(person.name)}</small>
          <div className="st-actions">
            <button type="button" className="ws-outline st-sm" onClick={() => fileRef.current?.click()}><ImageUp size={14}/>Upload picture</button>
            {person.avatar && <button type="button" className="st-ghost" onClick={() => { setProfileAvatar(null); refresh({ text: 'Picture removed.' }) }}><Trash2 size={13}/>Remove</button>}
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={pick}/>
          </div>
        </div>
      </div>
      <form className="st-name" onSubmit={saveName}>
        <label className="dlg-field"><span>Display name</span><input value={name} maxLength={80} placeholder={accountProfile.name} onChange={(event) => { setName(event.target.value); setNote(null) }}/></label>
        <button type="submit" className="start-day" disabled={!nameDirty}>Save name</button>
      </form>
      {note && <Note tone={note.tone}>{note.text}</Note>}
    </Section>
    <Section title="Security" detail="Signing in is handled by your account provider. Local display choices are scoped to this account and never become identity evidence.">
      <dl className="st-kv">
        <div><dt>Signed in with</dt><dd><Avatar user={accountProfile} size={20}/>Discord · {accountProfile.name}</dd></div>
        <div><dt>Workspace</dt><dd>Personal workspace</dd></div>
        <div><dt>Display overrides</dt><dd>{person.source === 'local' ? 'Name or picture set on this device' : 'Using your account’s name and picture'}</dd></div>
      </dl>
      <div className="st-actions">
        <button type="button" className="ws-outline st-sm" disabled={person.source !== 'local'} onClick={() => { setProfileName(''); setProfileAvatar(null); refresh({ text: 'Reset to your account’s name and picture.' }) }}><ShieldCheck size={14}/>Reset to account</button>
      </div>
    </Section>
  </div>
}
