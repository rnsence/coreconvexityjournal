/**
 * The settings panels that act on their own (no Save): appearance, notifications, labels,
 * your data and the profile. Each is a group of rows, like the journal settings beside them.
 */
import React, { useEffect, useRef, useState } from 'react'
import { CircleCheck, Download, Flag, TriangleAlert } from 'lucide-react'
import { Avatar } from '../components'
import { Drawer } from '../dialogs'
import { profile as accountProfile } from '../data'
import { Empty, Group, Note, Row } from './settings-editors'
import {
  APPEARANCE_EVENT, exportCSV, fileToAvatar, initialsOf, loadAlerts, loadLabels, loadSample, markAlertsRead, readAppearance,
  renameLabel, resolveProfile, setAppearance, setProfileAvatar, setProfileName, setSample, systemDark,
} from './settings-data'

const stamp = (iso) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

/* ------------------------------------------------------------------ appearance */

/** A miniature of the app in each theme, so the choice is seen rather than read. */
const ThemePreview = ({ theme, current }) => <span className={`st-theme-art is-${theme}`} aria-hidden="true">
  <i className="side"/><i className="bar"/><i className="card a"/><i className="card b"/><i className="card c"/>
  {/* the theme in use is veiled with a soft blur and labelled; hovering lifts the veil to show it */}
  {current && <span className="st-theme-current"><em>Current</em></span>}
</span>

export function AppearanceGroup() {
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
  const pick = (next) => { setAppearance(next); setValue(next) }
  return <Group title="Appearance" detail="Saved on this device right away. The journal stays light until its dark theme ships." plain>
    <div className="st-themes" role="radiogroup" aria-label="Appearance">
      {[['light', 'Light'], ['dark', 'Dark'], ['system', 'System']].map(([key, label]) => <button key={key} type="button" role="radio" aria-checked={value === key}
        className={`st-theme${value === key ? ' is-on' : ''}`} onClick={() => pick(key)}>
        <ThemePreview theme={key === 'system' ? (prefersDark ? 'split-dark' : 'split') : key} current={value === key}/>
        <span className="st-theme-label">{label}</span>
      </button>)}
    </div>
  </Group>
}

/* ------------------------------------------------------------------ notifications */

const ALERT_KIND = { goal_met: ['is-pos', CircleCheck], goal_missed: ['is-warn', Flag], rule_break: ['is-neg', TriangleAlert] }

export function NotificationsPanel() {
  const [feed, setFeed] = useState(loadAlerts)
  const [marking, setMarking] = useState(false)
  const [push, setPush] = useState({ state: 'off', error: null })
  const markRead = () => { setMarking(true); setTimeout(() => { setFeed(markAlertsRead()); setMarking(false) }, 380) }
  const enablePush = async () => {
    setPush({ state: 'pending', error: null })
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('This browser can’t receive push notifications. On iPhone, add the app to your home screen first.')
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') throw new Error('Notifications weren’t allowed.')
      setPush({ state: 'on', error: null })
    } catch (error) { setPush({ state: 'off', error: error.message }) }
  }
  return <>
    <Group title="Delivery" detail="Alerts always show here. Phone alerts also notify this device.">
      <Row label="Phone alerts" hint={push.state === 'on' ? 'On for this device.' : 'Get a notification when a rule breaks or a goal is reached.'} error={push.error}>
        {feed.push
          ? <button type="button" className={`st-btn${push.state === 'on' ? ' is-done' : ''}`} disabled={push.state !== 'off'} onClick={enablePush}>{push.state === 'on' ? 'Turned on' : push.state === 'pending' ? 'Asking…' : 'Turn on'}</button>
          : <span className="st-muted">Not available</span>}
      </Row>
    </Group>
    <Group title="Recent" detail="Raised once when trades break a rule or a goal is met or missed."
      action={feed.unread > 0 && <button type="button" className="st-link" disabled={marking} onClick={markRead}>{marking ? 'Marking…' : `Mark ${feed.unread} as read`}</button>}>
      {feed.alerts.length === 0 ? <Empty title="No alerts yet" line="They appear when trades break your rules or reach your goals."/>
        : <ul className="st-alerts">{feed.alerts.map((alert) => {
          const [tone, Icon] = ALERT_KIND[alert.kind] ?? (alert.kind?.includes('goal') ? ALERT_KIND.goal_met : ALERT_KIND.rule_break)
          return <li key={alert.key} className={alert.read_at ? 'is-read' : ''}>
            <span className={`st-alert-icon ${tone}`}><Icon size={15}/></span>
            <span className="st-alert-copy"><b>{alert.title}</b><small>{alert.body}</small></span>
            <time>{stamp(alert.created_at)}</time>
            {!alert.read_at && <i className="st-unread" aria-label="Unread"/>}
          </li>
        })}</ul>}
    </Group>
  </>
}

/* ------------------------------------------------------------------ labels */

const GROUPS = [['mistakes', 'mistake', 'Mistakes', 'What went wrong on a trade.'], ['tags', 'tag', 'Tags', 'Setups and context you tag trades with.'], ['emotions', 'emotion', 'Emotions', 'How you felt while trading.']]

export function LabelsPanel() {
  const [labels, setLabels] = useState(loadLabels)
  const [editing, setEditing] = useState(null)
  const [value, setValue] = useState('')
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState(null)
  const start = (kind, item) => { setEditing({ kind, label: item.label, trades: item.trades }); setValue(item.label); setResult(null) }
  const run = async (to) => {
    setPending(true)
    const { labels: next, revised } = await renameLabel(editing.kind, editing.label, to)
    setLabels(next); setPending(false)
    setResult(to ? `Renamed “${editing.label}” to “${to}” on ${revised} trade${revised === 1 ? '' : 's'}.` : `Removed “${editing.label}” from ${revised} trade${revised === 1 ? '' : 's'}.`)
    setEditing(null)
  }
  const peak = (list) => Math.max(1, ...list.map((item) => item.trades))
  return <>
    {result && <Note className="st-pane-note">{result}</Note>}
    {GROUPS.map(([group, kind, title, detail]) => <Group key={group} title={title} detail={detail} plain>
      {labels[group].length === 0 ? <div className="st-plate"><Empty title={`No ${title.toLowerCase()} yet`} line="They appear as you label trades."/></div>
        : <ul className="st-lbls">{labels[group].map((item) => <li key={item.label}>
          <button type="button" className="st-lbl" onClick={() => start(kind, item)}>
            <span>{item.label}</span>
            <em>{item.trades}</em>
            <i style={{ width: `${(item.trades / peak(labels[group])) * 100}%` }} aria-hidden="true"/>
          </button>
        </li>)}</ul>}
    </Group>)}
    {editing && <Drawer label={`Edit ${editing.label}`} viewKey="label" width={420} onClose={() => !pending && setEditing(null)}>
      <form className="trade-panel dw-trade st-dw" onSubmit={(event) => { event.preventDefault(); if (value.trim() && value.trim() !== editing.label && !pending) run(value.trim()) }}>
        <div className="tp-head"><div><div className="tp-title"><b>{editing.label}</b></div><small>On {editing.trades} trade{editing.trades === 1 ? '' : 's'}. Renaming onto an existing label merges them.</small></div></div>
        <div className="st-dw-fields"><label className="st-dw-field"><span>Name</span><input autoFocus value={value} onChange={(event) => setValue(event.target.value)}/></label></div>
        <div className="dw-actions st-dw-actions">
          <button type="button" className="st-dw-remove" disabled={pending} onClick={() => run('')}>Delete</button>
          <button type="button" className="ws-outline" disabled={pending} onClick={() => setEditing(null)}>Cancel</button>
          <button type="submit" className="start-day" disabled={pending || !value.trim() || value.trim() === editing.label}>{pending ? 'Saving…' : 'Rename'}</button>
        </div>
      </form>
    </Drawer>}
  </>
}

/* ------------------------------------------------------------------ your data */

export function DataPanel() {
  const [pending, setPending] = useState(null)
  const [error, setError] = useState(null)
  const [sample, setSampleState] = useState(loadSample)
  const [sampling, setSampling] = useState(false)
  const run = async (kind) => {
    setPending(kind); setError(null)
    try { await exportCSV(kind) } catch (err) { setError(err.message) } finally { setPending(null) }
  }
  const toggle = async () => { setSampling(true); setSampleState(await setSample(!sample.active)); setSampling(false) }
  return <>
    <Group title="Export" detail="Download your journal as CSV, ready for a spreadsheet.">
      <Row label="Trades" hint="Every trade with its review, as your stats see it."><button type="button" className="st-btn" disabled={!!pending} onClick={() => run('trades')}><Download size={14}/>{pending === 'trades' ? 'Preparing…' : 'Download'}</button></Row>
      <Row label="Fills" hint="Every fill, with the file and row it came from."><button type="button" className="st-btn" disabled={!!pending} onClick={() => run('fills')}><Download size={14}/>{pending === 'fills' ? 'Preparing…' : 'Download'}</button></Row>
    </Group>
    {error && <Note tone="error" className="st-pane-note">{error}</Note>}
    <Group title="Sample data" detail="Try every view with a realistic journal before importing your own.">
      <Row label={sample.active ? 'Sample data is loaded' : 'Load sample data'}
        hint={sample.active ? `${sample.trades} trades in two “Sample ·” accounts. Removing it leaves your own data untouched.` : 'Two accounts, three playbooks and about 60 days of trades. Removable in one step.'}>
        <button type="button" className={`st-btn${sample.active ? ' is-danger' : ''}`} disabled={sampling} onClick={toggle}>
          {sample.active ? (sampling ? 'Removing…' : 'Remove') : (sampling ? 'Loading…' : 'Load')}
        </button>
      </Row>
    </Group>
  </>
}

/* ------------------------------------------------------------------ profile */

export function ProfilePanel() {
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
  const saveName = (event) => { event.preventDefault(); setProfileName(name); refresh(name.trim() ? { text: 'Name saved.' } : { text: 'Name reset to your account’s.' }) }
  const pick = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try { setProfileAvatar(await fileToAvatar(file)); refresh({ text: 'Picture updated.' }) }
    catch { setNote({ tone: 'error', text: 'That image couldn’t be read. Try a PNG or JPEG.' }) }
  }
  const nameDirty = name.trim() !== person.name
  return <>
    <div className="st-hero">
      <span className="st-avatar">{person.avatar ? <img src={person.avatar} alt=""/> : accountProfile.discordId ? <Avatar user={{ ...accountProfile, name: person.name }} size={64}/> : initialsOf(person.name)}</span>
      <div className="st-hero-copy">
        <b>{person.name === 'Your name' ? 'Your account' : person.name}</b>
        <small>Personal workspace · signed in with Discord</small>
      </div>
      <div className="st-hero-actions">
        <button type="button" className="st-btn" onClick={() => fileRef.current?.click()}>Change picture</button>
        {person.avatar && <button type="button" className="st-link" onClick={() => { setProfileAvatar(null); refresh({ text: 'Picture removed.' }) }}>Remove</button>}
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={pick}/>
      </div>
    </div>
    {note && <Note tone={note.tone} className="st-pane-note">{note.text}</Note>}
    <Group title="On this device" detail="Shown on this journal’s cards and menus.">
      <form onSubmit={saveName}>
        <Row label="Display name" hint="Leave blank to use your account’s name.">
          <span className="st-inline">
            <input className="st-input" value={name} maxLength={80} placeholder={accountProfile.name} onChange={(event) => { setName(event.target.value); setNote(null) }}/>
            {nameDirty && <button type="submit" className="st-btn is-primary">Save</button>}
          </span>
        </Row>
      </form>
    </Group>
    <Group title="Sign-in" detail="Handled by your account provider; nothing here changes how you sign in.">
      <Row label="Signed in with"><span className="st-value"><Avatar user={accountProfile} size={18}/>Discord · {accountProfile.name}</span></Row>
      <Row label="Workspace"><span className="st-value">Personal</span></Row>
      <Row label="Name and picture" hint={person.source === 'local' ? 'Set on this device.' : 'From your account.'}>
        <button type="button" className="st-btn" disabled={person.source !== 'local'} onClick={() => { setProfileName(''); setProfileAvatar(null); refresh({ text: 'Reset to your account’s name and picture.' }) }}>Reset</button>
      </Row>
    </Group>
  </>
}

