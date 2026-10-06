/**
 * Economic calendar for the dashboard: the week's events from the Forex Factory feed, filtered by folder colour,
 * one column per trading day, in Eastern time. The feed is fetched through a
 * same-origin path (vite proxy in dev, vercel.json rewrite in production) and cached for 30 minutes, because it
 * sends no CORS headers and asks clients not to poll it hard.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ClockSolidIcon from '@iconify-react/basil/clock-solid'
import { BUNDLED_RANGE, BUNDLED_WEEK } from './calendar-week'
import './news-strip.css'

/** Folder glyph from Ant Design Icons (MIT), via Iconify (ant-design:folder-filled), inlined. */
const FolderIcon = ({ size = 13, ...rest }) => <svg width={size} height={size} viewBox="0 0 1024 1024" aria-hidden="true" {...rest}>
  <path fill="currentColor" d="M880 298.4H521L403.7 186.2a8.15 8.15 0 0 0-5.5-2.2H144c-17.7 0-32 14.3-32 32v592c0 17.7 14.3 32 32 32h736c17.7 0 32-14.3 32-32V330.4c0-17.7-14.3-32-32-32"/>
</svg>

// Forex Factory's folder colours by impact
const FOLDERS = [
  { key: 'red', label: 'Red', impact: 'High' },
  { key: 'orange', label: 'Orange', impact: 'Medium' },
  { key: 'yellow', label: 'Yellow', impact: 'Low' },
  { key: 'all', label: 'All', impact: null },
]
const IMPACT_CLASS = { High: 'red', Medium: 'orange', Low: 'yellow', Holiday: 'grey' }
const FILTER_KEY = 'cc-news-folders'
const readFilter = () => { try { const v = localStorage.getItem(FILTER_KEY); return FOLDERS.some((f) => f.key === v) ? v : 'red' } catch { return 'red' } }

const CACHE_KEY = 'cc-calendar-feed'
const CACHE_MS = 30 * 60 * 1000

const ET = 'America/New_York'

const readSaved = () => { try { return JSON.parse(localStorage.getItem(CACHE_KEY)) } catch { return null } }
const readCache = () => { const hit = readSaved(); return hit && Date.now() - hit.at < CACHE_MS ? hit.events : null }
const writeCache = (events) => { try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), events })) } catch { /* storage unavailable */ } }

// the feed's "this week" file rolls over to the new week on Sunday, so it's the only file asked for
async function loadWeek() {
  const response = await fetch('/api/calendar/thisweek')
  if (!response.ok) throw new Error(`calendar ${response.status}`)
  return response.json()
}

// one request in flight at a time, shared by every mount (and React's development double-mount), so a page
// load asks the rate-limited feed once
let inflight = null
function fetchCalendar() {
  inflight ??= loadWeek()
    .then((events) => {
      writeCache(events)
      return events
    })
    .finally(() => { inflight = null })
  return inflight
}

function useCalendar() {
  // anything saved, however old, paints at once; a fresh fetch then replaces it if the cache has expired
  const [state, setState] = useState(() => { const saved = readSaved(); return saved?.events ? { status: 'ready', events: saved.events, stale: Date.now() - saved.at >= CACHE_MS } : { status: 'loading', events: [] } })
  const alive = useRef(true)
  const load = useCallback((force = false) => {
    if (!force) { const cached = readCache(); if (cached) { setState({ status: 'ready', events: cached, stale: false }); return } }
    setState((prev) => ({ ...prev, status: prev.events.length ? 'refreshing' : 'loading' }))
    fetchCalendar()
      .then((events) => { if (alive.current) setState({ status: 'ready', events, stale: false }) })
      // on a failure (the feed rate-limits), whatever was saved stays on screen, marked as not current
      .catch(() => { if (alive.current) setState((prev) => (prev.events.length ? { ...prev, status: 'ready', stale: true } : { status: 'error', events: [] })) })
  }, [])
  useEffect(() => { alive.current = true; load(); return () => { alive.current = false } }, [load])
  return [state, load]
}

const dayName = new Intl.DateTimeFormat('en-US', { timeZone: ET, weekday: 'short' })
const dayNum = new Intl.DateTimeFormat('en-US', { timeZone: ET, month: 'short', day: 'numeric' })
const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: ET, hour: 'numeric', minute: '2-digit' })
const etDay = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: ET }).format(date)
const shiftIso = (iso, days) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10) }

/**
 * The feed's trading week, Monday to Friday, one column per day. Only red-folder (high-impact) events are listed,
 * across every currency, as on the Forex Factory calendar; a day without one stays blank.
 */
export function NewsStrip() {
  const [{ status, events }, reload] = useCalendar()
  const [folder, setFolder] = useState(readFilter)
  const pickFolder = (key) => { setFolder(key); try { localStorage.setItem(FILTER_KEY, key) } catch { /* storage unavailable */ } }
  const impact = FOLDERS.find((f) => f.key === folder).impact
  const now = Date.now()
  const today = etDay(new Date())
  // the feed's week while its trading days are still running; once its Friday has passed (the weekend before the
  // Sunday roll-over) the bundled upcoming week, as long as that week isn't over too
  const week = useMemo(() => {
    const feedFirst = events.length ? etDay(new Date(Math.min(...events.map((event) => new Date(event.date).getTime())))) : ''
    const feedFriday = feedFirst ? shiftIso(feedFirst, ((8 - new Date(`${feedFirst}T12:00:00Z`).getUTCDay()) % 7) + 4) : ''
    const useBundled = BUNDLED_RANGE.to >= today && BUNDLED_RANGE.from > (feedFirst || '') && (!feedFriday || feedFriday < today)
    return useBundled ? { events: BUNDLED_WEEK, start: BUNDLED_RANGE.from, bundled: true } : { events, start: null, bundled: false }
  }, [events, today])
  const days = useMemo(() => {
    const { events, start } = week
    if (!events.length && !start) return []
    // the week runs Sunday to Saturday; its Monday anchors the five trading days
    const first = start ?? etDay(new Date(Math.min(...events.map((event) => new Date(event.date).getTime()))))
    const monday = shiftIso(first, (8 - new Date(`${first}T12:00:00Z`).getUTCDay()) % 7)
    const red = events.filter((event) => (impact ? event.impact === impact : true)).map((event) => ({ ...event, at: new Date(event.date) })).sort((a, b) => a.at - b.at)
    return Array.from({ length: 5 }, (_, index) => {
      const iso = shiftIso(monday, index), at = new Date(`${iso}T12:00:00Z`)
      return { iso, name: dayName.format(at), label: dayNum.format(at), items: red.filter((event) => etDay(event.at) === iso) }
    })
  }, [week, impact])
  // the bundled upcoming week carries red folders only; other colours arrive with the live calendar on Sunday
  const partial = week.bundled && folder !== 'red'
  // a day shows one release at a time; the window is exactly as tall as its first one (titles can wrap)
  const fitFirst = useCallback((list) => { if (list && list.children.length > 1) list.style.maxHeight = `${list.firstElementChild.offsetHeight}px` }, [])
  const nextKey = days.flatMap((day) => day.items).find((event) => event.at.getTime() >= now)?.date
  const range = days.length ? `${days[0].label} – ${days[4].label}` : ''

  return <section className="ns-card duo" aria-label="High-impact economic news">
    <div className="shell-head ns-head">
      <span className="card-title">High-impact news</span>
      {status !== 'ready' && <span className="ns-meta">{status === 'loading' ? 'Loading…' : 'Calendar unavailable'}</span>}
      <div className="ws-seg compact ns-folders" role="tablist" aria-label="Folder colour">
        {FOLDERS.map((f) => <button key={f.key} type="button" role="tab" aria-selected={folder === f.key} className={folder === f.key ? 'active' : ''} onClick={() => pickFolder(f.key)}>
          {f.impact && <FolderIcon className={`ns-folder ${f.key}`}/>}{f.label}
        </button>)}
      </div>
    </div>
    <div className="shell-body ns-body">
      {status === 'loading' && <div className="ns-days" aria-hidden="true">{Array.from({ length: 5 }, (_, i) => <div key={i} className="ns-day is-skeleton"><i/><i/></div>)}</div>}
      {status === 'error' && <div className="ns-empty">Couldn't reach the economic calendar. <button type="button" onClick={() => reload(true)}>Try again</button></div>}
      {status !== 'loading' && status !== 'error' && partial && <div className="ns-empty">Only red folders are listed for {range} until the live calendar updates on Sunday.</div>}
      {status !== 'loading' && status !== 'error' && !partial && <ol className="ns-days">
        {days.map((day) => <li key={day.iso} className={`ns-day${day.iso === today ? ' is-today' : ''}${day.iso < today ? ' is-past' : ''}${day.items.length ? '' : ' is-blank'}`}>
          <div className="ns-day-head"><b>{day.name}{day.items.length > 1 && <em className="ns-more">{day.items.length}</em>}</b><span>{day.label}</span></div>
          {day.items.length > 0 && <ul
            className={`ns-events${day.items.length > 1 ? ' is-long' : ''}`} ref={fitFirst}
            onScroll={(event) => { const el = event.currentTarget; el.classList.toggle('at-end', el.scrollTop + el.clientHeight >= el.scrollHeight - 2) }}
          >
            {day.items.map((event) => <li key={`${event.date}-${event.country}-${event.title}`} className={`ns-event${event.at.getTime() < now ? ' is-past' : ''}${event.date === nextKey ? ' is-next' : ''}`}>
              <span className="ns-time">{timeFmt.format(event.at)}</span>
              <em className="ns-ccy"><FolderIcon className={`ns-folder ${IMPACT_CLASS[event.impact] ?? 'grey'}`}/>{event.country}</em>
              {event.date === nextKey && <span className="ns-next" title="Next release" aria-label="Next release"><ClockSolidIcon width={14} height={14}/></span>}
              <span className="ns-name" title={[event.title, event.forecast && `Forecast ${event.forecast}`, event.previous && `Previous ${event.previous}`].filter(Boolean).join(' · ')}>{event.title}</span>
            </li>)}
          </ul>}
        </li>)}
      </ol>}
    </div>
  </section>
}
