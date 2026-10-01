import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Archive, ArchiveRestore, Bold, Circle, CalendarDays, Check, ChevronDown, CircleAlert, Code, Download, ChevronRight, Hash, Heading2, Info, Italic, List, ListOrdered,
  NotebookPen, Pencil, Plus, Quote, Search, WifiOff, X,
} from 'lucide-react'
import { PageHead, Card } from '../workspace'
import { SymbolToken } from '../viz'
import { RichBody } from './notebook-rich'
import { FilterMenu } from './notebook-pickers'
import { searchSymbols } from '../symbols'
import { Drawer, Sheet, useDrawer } from '../dialogs'
import {
  BODY_MAX, NOTEBOOK_EVENT, NO_FILTERS, TEMPLATES, TITLE_MAX, download, entryDate, exportEntries, isConflict, isRefusal,
  loadEntries, parseList, parseSymbols, queryEntries, reloadFromStorage, tagCounts, waitingCommands,
} from './notebook-data'
import { Feedback, Markdown, useCommand } from './notebook-command'
import { EntryAttachments } from './notebook-attachments'
import './notebook.css'

const PAGE_SIZE = 6
const plural = (count, word, many = `${word}s`) => `${count} ${count === 1 ? word : many}`

/** Re-renders whenever the notebook store changes, here or in another tab. */
function useNotebookVersion() {
  const [version, setVersion] = useState(0)
  useEffect(() => {
    const bump = () => setVersion((value) => value + 1)
    const onStorage = (event) => { if (reloadFromStorage(event)) bump() }
    window.addEventListener(NOTEBOOK_EVENT, bump)
    window.addEventListener('storage', onStorage)
    return () => { window.removeEventListener(NOTEBOOK_EVENT, bump); window.removeEventListener('storage', onStorage) }
  }, [])
  return version
}

/** The entries "query": pending on a new filter key, refetches in place when the store changes. */
function useEntries(filters, version) {
  const key = JSON.stringify(filters)
  const [loadedKey, setLoadedKey] = useState(null)
  const [pages, setPages] = useState(1)
  const [fetchingMore, setFetchingMore] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    setPages(1)
    const timer = setTimeout(() => setLoadedKey(key), loadedKey === null ? 520 : 260)
    return () => clearTimeout(timer)
  }, [key])
  const result = useMemo(() => {
    try { return { data: queryEntries(filters), error: null } } catch (error) { return { data: null, error } }
  }, [key, version, attempt])
  const isPending = loadedKey !== key
  const list = result.data ? result.data.slice(0, pages * PAGE_SIZE) : []
  return {
    isPending,
    isError: !isPending && !!result.error,
    isSuccess: !isPending && !result.error,
    error: result.error,
    list,
    hasNextPage: !isPending && !!result.data && result.data.length > list.length,
    isFetchingNextPage: fetchingMore,
    fetchNextPage: () => { setFetchingMore(true); setTimeout(() => { setPages((value) => value + 1); setFetchingMore(false) }, 380) },
    refetch: () => { setLoadedKey(null); setAttempt((value) => value + 1); setTimeout(() => setLoadedKey(key), 300) },
  }
}

// Designs by RNSENCE Studio
export function NotebookPage() {
  const version = useNotebookVersion()
  const [filters, setFilters] = useState(NO_FILTERS)
  const { status, tag } = filters
  const filtering = !!(filters.tag || filters.q || filters.symbol || filters.from || filters.to) || status !== 'active'
  const setFilter = (patch) => setFilters((current) => ({ ...current, ...patch }))
  const [composing, setComposing] = useState(false)
  const [draftKey, setDraftKey] = useState(0)
  const entries = useEntries(filters, version)
  const create = useCommand('create')
  const all = useMemo(() => loadEntries(), [version])
  const tags = useMemo(() => tagCounts(all), [all])
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState(null)
  const pendingDraft = create.pending?.content

  const counts = useMemo(() => ({
    active: all.filter((entry) => entry.status === 'active').length,
    archived: all.filter((entry) => entry.status === 'archived').length,
    files: all.reduce((total, entry) => total + entry.attachments.length, 0),
  }), [all])

  const runExport = (format) => {
    setExporting(true); setExportError(null)
    setTimeout(() => {
      try { download(exportEntries(format, filters)) } catch (error) { setExportError(error) }
      setExporting(false)
    }, 450)
  }
  const save = (content) => create.submit({ kind: 'create', content }, () => setComposing(false))

  return <div className="page home ws-page nb-page">
    <PageHead
      title="Notebook"
      meta={`${plural(counts.active, 'note')} · ${counts.archived} archived · ${plural(counts.files, 'attachment')}`}
      actions={<div className="nb-head-actions">
        <button type="button" className="start-day" disabled={composing} onClick={() => { create.reset(); setComposing(true) }}><Plus size={16} strokeWidth={2.2}/> New entry</button>
        <ExportMenu pending={exporting} onExport={runExport}/>
      </div>}
    />

    <OfflineBanner/>

    <JournalSearch filters={filters} onSearch={setFilter} extra={<FilterMenu filters={filters} tags={tags} onChange={setFilter}/>}/>

    <div className="nb-filters" role="group" aria-label="Filter notes">
      <div className="ws-seg nb-status">
        {[['active', 'Active'], ['archived', 'Archived'], ['all', 'All entries']].map(([value, label]) =>
          <button key={value} type="button" aria-pressed={status === value} className={status === value ? 'active' : ''} onClick={() => setFilter({ status: value })}>{label}</button>)}
      </div>

    </div>

    <div className="nb-stack">
      {exportError && <Feedback tone="error" icon={CircleAlert}>{isRefusal(exportError) ? exportError.message : 'Export failed. Nothing was downloaded; try again.'}</Feedback>}
      {!composing && create.pending && !create.isPending && <Feedback tone="error" icon={CircleAlert} action={<button type="button" className="nb-btn" onClick={() => setComposing(true)}>Review unsaved entry</button>}>
        An entry could not be confirmed as saved. Retry it before writing a new one.
      </Feedback>}
      {!composing && create.isSuccess && <Feedback icon={Info}>Entry saved.</Feedback>}
      {entries.isError && <Feedback tone="error" icon={CircleAlert} action={<button type="button" className="nb-btn" onClick={entries.refetch}>Retry</button>}>
        {isRefusal(entries.error) ? 'These search filters are not valid. Check the dates (from before to) and the symbol.' : 'Could not load your notes.'}
      </Feedback>}
    </div>

    {entries.isPending && <p role="status" className="nb-loading">Loading your journal…</p>}

    {entries.isSuccess && !entries.list.length && filtering && <Card className="nb-empty">
      <h2>No notes match these filters</h2>
      {status === 'active' && <p>Archived notes are only searched under Archived or All entries.</p>}
      <button type="button" className="nb-btn" onClick={() => setFilters(NO_FILTERS)}>Clear filters</button>
    </Card>}

    {entries.isSuccess && !entries.list.length && !filtering && <Card className="nb-empty is-first">
      <span className="nb-empty-icon"><NotebookPen size={22}/></span>
      <h2>No entries yet</h2>
      <p>A place for your decisions, research, and lessons. Capture what matters while it is fresh.</p>
      <button type="button" className="nb-btn" onClick={() => setComposing(true)}>Write your first note</button>
    </Card>}

    {!entries.isPending && entries.list.length > 0 && <div className="nb-grid">
      {entries.list.map((entry) => <JournalNote key={entry.entry_id} entry={entry}/>)}
    </div>}

    {entries.hasNextPage && <div className="nb-more">
      <button type="button" className="nb-loadmore" disabled={entries.isFetchingNextPage} onClick={entries.fetchNextPage}>{entries.isFetchingNextPage ? 'Loading…' : 'Load more…'}</button>
    </div>}

    {composing && <Sheet title="New entry" subtitle="Record your thinking. Every saved version is retained." width={576} className="nb-sheet" onClose={() => setComposing(false)}>
      {create.error && <Feedback tone="error" icon={CircleAlert}>{create.pending ? 'Save not confirmed. Your entry is kept; retry sends the same entry.' : create.error.message}</Feedback>}
      {pendingDraft && !create.isPending && <button type="button" className="nb-btn nb-self-start" onClick={() => { create.discardRetry(); setDraftKey((key) => key + 1) }}>Discard retry (it may already be saved)</button>}
      <EntryEditor
        key={draftKey} initial={pendingDraft} templates
        locked={!!pendingDraft && !create.isPending} busy={create.isPending}
        submitLabel={create.isPending ? 'Saving…' : pendingDraft ? 'Retry save' : 'Save entry'}
        onSubmit={(content) => (pendingDraft ? create.retry(() => setComposing(false)) : save(content))}
        onCancel={() => setComposing(false)}
      />
    </Sheet>}
  </div>
}

/* ------------------------------------------------------------ offline banner */

function OfflineBanner() {
  const [state, setState] = useState(() => ({ online: typeof navigator === 'undefined' ? true : navigator.onLine, waiting: waitingCommands() }))
  useEffect(() => {
    const update = () => setState({ online: navigator.onLine, waiting: waitingCommands() })
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    window.addEventListener('storage', update)
    // Writes in this tab fire no storage event, so poll too.
    const timer = setInterval(update, 2000)
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); window.removeEventListener('storage', update); clearInterval(timer) }
  }, [])
  if (state.online) return null
  return <p role="status" className="nb-offline">
    <WifiOff size={14} aria-hidden="true"/>
    {state.waiting
      ? <span>You're offline. The journal shows what it last loaded; <b>{plural(state.waiting, 'change')}</b> will be sent when you're back online.</span>
      : <span>You're offline. The journal shows what it last loaded; changes you make will be sent when you are back online.</span>}
  </p>
}

/* ------------------------------------------------------------ search */

// Text filters apply on submit; the form is remounted whenever the applied filters change.
function JournalSearch({ filters, onSearch, extra }) {
  const [draft, setDraft] = useState({ q: filters.q })
  const field = (key) => ({ value: draft[key], onChange: (event) => setDraft((current) => ({ ...current, [key]: event.target.value })) })
  const active = !!filters.q
  const submit = (event) => {
    event.preventDefault()
    onSearch({ q: draft.q.trim() })
  }
  // outside resets (e.g. "Clear filters") flow back into the box
  useEffect(() => { setDraft((current) => (current.q.trim() === filters.q ? current : { q: filters.q })) }, [filters.q])
  // search as you type, a beat after the last keystroke
  useEffect(() => {
    const q = draft.q.trim()
    if (q === filters.q) return undefined
    const timer = window.setTimeout(() => onSearch({ q }), 400)
    return () => window.clearTimeout(timer)
  }, [draft.q])
  return <form role="search" aria-label="Search notes" className="nb-search" onSubmit={submit}>
    <label className="nb-field grow">
      <span>Search</span>
      <span className="ws-search nb-input"><Search size={14}/><input aria-label="Search phrase" placeholder="Search title and body" maxLength={200} {...field('q')}/></span>
    </label>
    <div className="nb-search-actions">
      {extra}
    </div>
  </form>
}

/* ------------------------------------------------------------ export */

function ExportMenu({ pending, onExport }) {
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  const rootRef = useRef(null)
  const itemsRef = useRef([])
  const items = [['markdown', 'Markdown (readable)'], ['json', 'JSON (with revisions)']]
  useEffect(() => {
    if (!open) return undefined
    const onPointer = (event) => { if (!rootRef.current?.contains(event.target)) setOpen(false) }
    document.addEventListener('mousedown', onPointer)
    itemsRef.current[0]?.focus()
    return () => document.removeEventListener('mousedown', onPointer)
  }, [open])
  useEffect(() => { if (open) itemsRef.current[cursor]?.focus() }, [cursor, open])
  const pick = (format) => { setOpen(false); onExport(format) }
  const onKey = (event) => {
    if (!open) return
    if (event.key === 'ArrowDown') { event.preventDefault(); setCursor((value) => (value + 1) % items.length) }
    if (event.key === 'ArrowUp') { event.preventDefault(); setCursor((value) => (value - 1 + items.length) % items.length) }
    if (event.key === 'Escape') { event.stopPropagation(); event.nativeEvent.stopImmediatePropagation(); setOpen(false); rootRef.current?.querySelector('button')?.focus() }
  }
  return <div className="nb-export" ref={rootRef} onKeyDown={onKey}>
    <button type="button" className="nb-btn" aria-haspopup="menu" aria-expanded={open} disabled={pending} onClick={() => { setCursor(0); setOpen((value) => !value) }}>
      <Download size={14}/>{pending ? 'Exporting…' : 'Export'}<ChevronDown size={13} className="nb-caret"/>
    </button>
    {open && <div className="nb-menu" role="menu">
      {items.map(([format, label], index) => <button
        key={format} type="button" role="menuitem" ref={(node) => { itemsRef.current[index] = node }}
        className={index === cursor ? 'on' : ''} onMouseEnter={() => setCursor(index)} onClick={() => pick(format)}
      >{label}</button>)}
    </div>}
  </div>
}

/* ------------------------------------------------------------ note card */

const TAG_LIMIT = 4
const TAG_GAP = 6
const TAG_H = 22
const MORE_W = 64

// Tags rest as a small stack of cards fanned to the right; a click spreads them into a normal row,
// wrapping onto more lines when they don't fit. More than four fold behind a "+N more".
function TagStack({ tags }) {
  const [open, setOpen] = useState(false)
  const [all, setAll] = useState(false)
  const [widths, setWidths] = useState([])
  const [room, setRoom] = useState(0)
  const row = useRef(null)
  const mirror = useRef(null)
  const shown = open && all ? tags : tags.slice(0, TAG_LIMIT)
  const extra = tags.length - shown.length
  useLayoutEffect(() => {
    const measure = () => { if (mirror.current) setWidths([...mirror.current.children].map((el) => el.offsetWidth)) }
    measure()
    document.fonts?.ready.then(measure)
  }, [shown.join('|')])
  useLayoutEffect(() => {
    const el = row.current
    if (!el) return undefined
    const observer = new ResizeObserver(() => setRoom(el.clientWidth))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  useEffect(() => { if (!open) setAll(false) }, [open])
  const ready = widths.length === shown.length
  const limit = Math.max(0, room - (extra > 0 ? MORE_W + 8 : 0))
  let x = 0
  let y = 0
  let widest = 0
  const offsets = shown.map((_, i) => {
    const w = widths[i] ?? 0
    if (x > 0 && limit && x + w > limit) { x = 0; y += TAG_H + TAG_GAP }
    const at = [x, y]
    x += w + TAG_GAP
    widest = Math.max(widest, x - TAG_GAP)
    return at
  })
  const single = shown.length === 1
  return <div className="nb-note-tags" ref={row}>
    <span ref={mirror} className="nb-tag-mirror" aria-hidden="true">{shown.map((item) => <span key={item} className="nb-tag">#{item}</span>)}</span>
    <button type="button" className={`nb-tagstack${open ? ' is-open' : ''}${ready ? '' : ' is-measuring'}`} disabled={single}
      aria-expanded={single ? undefined : open} aria-label={`Tags: ${tags.join(', ')}`}
      style={{ '--n': shown.length, '--w0': `${widths[0] ?? 0}px`, '--wopen': `${widest}px`, '--hopen': `${y + TAG_H}px` }}
      onClick={() => setOpen((value) => !value)}>
      {shown.map((item, i) => <span key={item} className="nb-tag" style={{ '--i': i, '--ox': `${offsets[i][0]}px`, '--oy': `${offsets[i][1]}px`, '--tw': `${widths[i] ?? 0}px`, zIndex: shown.length - i }}><span>#{item}</span></span>)}
    </button>
    {extra > 0 && <button type="button" className="nb-tagmore" onClick={() => { setOpen(true); setAll(true) }}>+{extra} more</button>}
  </div>
}

// The note's tickers as oversized marks tucked into the card's bottom-right corner, cropped by its edge.
export function NoteMarks({ symbols = [] }) {
  if (!symbols.length) return null
  // Lead ticker in the corner, the rest fan out leftward, each smaller; drawn back to front.
  const marks = symbols.slice(0, 4).map((symbol, i) => ({ symbol, i })).reverse()
  return <span className="nb-marks" role="img" aria-label={`Symbols: ${symbols.join(', ')}`}>
    {marks.map(({ symbol, i }) => <span key={symbol} className={`nb-mark m${i}`} title={symbol}><SymbolToken symbol={symbol}/></span>)}
  </span>
}

function JournalNote({ entry }) {
  const [editing, setEditing] = useState(false)
  const [baseRevision, setBaseRevision] = useState(entry.revision)
  const [draftKey, setDraftKey] = useState(0)
  const command = useCommand(entry.entry_id)
  const archived = entry.status === 'archived'
  const pendingRevision = command.pending?.kind === 'revise' ? command.pending.content : undefined
  // The note changed after this draft was opened: show the saved version, make overwriting explicit.
  const conflicted = editing && entry.revision !== baseRevision
  const openEditor = () => { setBaseRevision(entry.revision); command.reset(); setEditing(true) }
  const revise = (content, close = () => setEditing(false)) => {
    if (pendingRevision) { command.retry(close); return }
    command.submit({ kind: 'revise', entry_id: entry.entry_id, expected_revision: entry.revision, content }, close)
  }
  const toggleArchive = () => command.submit({ kind: archived ? 'restore' : 'archive', entry_id: entry.entry_id, expected_revision: entry.revision })
  const date = entry.content.occurred_on ?? new Date(entry.created_at).toLocaleDateString()

  return <Card className={`nb-note duo${archived ? ' is-archived' : ''}`}>
    <div className="nb-note-meta shell-head">
      <span className="card-title"><CalendarDays size={13}/>{date}</span>
      {entry.author === 'assistant' && <span className="nb-badge soft">By assistant</span>}
      {archived && <span className="nb-badge">Archived</span>}
      {entry.content.symbols?.length > 0 && <span className="nb-note-tickers" aria-label={`Symbols: ${entry.content.symbols.join(', ')}`}>
        {entry.content.symbols.map((symbol) => <span key={symbol} className="nb-note-sym" title={symbol}><SymbolToken symbol={symbol}/><b>{symbol}</b></span>)}
      </span>}
    </div>
    <div className="shell-body nb-note-card">
    <NoteMarks symbols={entry.content.symbols}/>
    <h2 className="nb-note-title">{entry.content.title}</h2>
    <Markdown text={entry.content.body} className="nb-note-body"/>
    {entry.content.tags.length > 0 && <TagStack tags={entry.content.tags}/>}
    <EntryAttachments entry={entry}/>
    {!editing && command.error && <Feedback tone="error" icon={CircleAlert} action={command.pending && !command.isPending ? <>
      <button type="button" className="nb-btn" onClick={() => (pendingRevision ? setEditing(true) : command.retry())}>Retry</button>
      <button type="button" className="nb-btn ghost" onClick={command.discardRetry}>Discard retry</button>
    </> : undefined}>{command.error.message}</Feedback>}
    </div>
    <footer className="nb-note-foot">
      <span>Revision {entry.revision}{command.isSuccess && ' · saved'}</span>
      <div>
        {!archived && <button type="button" className="nb-btn" disabled={command.isPending || (!!command.pending && !pendingRevision)} onClick={openEditor}><Pencil size={13}/> Edit</button>}
        <button type="button" className="nb-btn ghost" disabled={command.isPending || !!command.pending} onClick={toggleArchive}>
          {archived ? <ArchiveRestore size={13}/> : <Archive size={13}/>}{archived ? 'Restore' : 'Archive'}
        </button>
      </div>
    </footer>

    {editing && <Drawer label="Edit entry" width={600} onClose={() => setEditing(false)}>
      <EditPane>{(close) => <>
        {conflicted && <div role="alert" className="nb-conflict">
          <p>This note changed to revision {entry.revision} while you were editing. Your draft is kept below.</p>
          <details>
            <summary>Show the saved version</summary>
            <p className="nb-conflict-title">{entry.content.title}</p>
            <p className="nb-conflict-body">{entry.content.body}</p>
          </details>
        </div>}
        {command.error && !(conflicted && isConflict(command.error)) && <Feedback tone="error" icon={CircleAlert}>{command.pending ? 'Save not confirmed. Retry sends the same revision.' : command.error.message}</Feedback>}
        {pendingRevision && !command.isPending && <button type="button" className="nb-btn nb-self-start" onClick={() => { command.discardRetry(); setDraftKey((key) => key + 1) }}>Discard retry (it may already be saved)</button>}
        <EntryEditor
          key={draftKey} initial={pendingRevision ?? entry.content}
          locked={!!pendingRevision && !command.isPending} busy={command.isPending}
          submitLabel={command.isPending ? 'Saving…' : pendingRevision ? 'Retry save' : conflicted ? `Save over revision ${entry.revision}` : 'Save revision'}
          onSubmit={(content) => revise(content, close)}
          onCancel={close}
          crumb={<>Notebook<ChevronRight size={12}/><b>Edit note</b></>}
        />
      </>}</EditPane>
    </Drawer>}
  </Card>
}

/** The edit form inside the pop-up drawer: its header, and a close that animates the drawer away. */
function EditPane({ children }) {
  const { close } = useDrawer()
  return <div className="nb-sheet nb-edit-pane">{children(close)}</div>
}

/* ------------------------------------------------------------ editor */

const EMPTY = { title: '', body: '', occurred_on: null, tags: [], symbols: [] }

/** Draft-only editor; the parent decides which command the submitted content becomes. */
const FORMATS = [
  { key: 'heading', label: 'Heading', icon: Heading2 },
  { key: 'bold', label: 'Bold (⌘B)', icon: Bold },
  { key: 'italic', label: 'Italic (⌘I)', icon: Italic },
  { gap: true },
  { key: 'list', label: 'Bulleted list', icon: List },
  { key: 'ordered', label: 'Numbered list', icon: ListOrdered },
  { key: 'quote', label: 'Quote', icon: Quote },
  { gap: true },
  { key: 'code', label: 'Inline code', icon: Code },
]
const suggestSymbols = (text) => searchSymbols(text, 6).map(([symbol, name, kind]) => ({ value: symbol, label: symbol, sub: `${name}${kind ? ` · ${kind}` : ''}`, icon: <SymbolToken symbol={symbol}/> }))
const suggestTags = (text) => {
  const q = text.toLowerCase()
  return tagCounts(loadEntries()).filter((item) => item.tag.toLowerCase().includes(q))
    .sort((a, b) => (b.tag.toLowerCase().startsWith(q) - a.tag.toLowerCase().startsWith(q)) || b.count - a.count)
    .slice(0, 6).map((item) => ({ value: item.tag, label: item.tag, sub: `${item.count} ${item.count === 1 ? 'note' : 'notes'}` }))
}
const prettyDate = (iso) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : 'Add date')

/** Chips with an inline input: Enter, comma or Tab adds; Backspace on an empty input removes the last chip.
 *  With `suggest`, the top matches drop down under the field (or flip above it near the viewport's bottom). */
function TokenField({ label, values, onChange, placeholder, prefix = '', upper = false, tone = '', disabled, icon, suggest }) {
  const [draft, setDraft] = useState('')
  const [focused, setFocused] = useState(false)
  const [cursor, setCursor] = useState(0)
  const [place, setPlace] = useState(null)
  const inputRef = useRef(null)
  const boxRef = useRef(null)
  const norm = (item) => (upper ? item.toUpperCase() : item.toLowerCase())
  const options = useMemo(() => (suggest && draft.trim() ? suggest(draft.trim().replace(/^#/, '')).filter((option) => !values.includes(norm(option.value))).slice(0, 3) : []), [draft, values, suggest])
  const open = focused && options.length > 0
  useEffect(() => setCursor(0), [draft])
  // measure where the list fits: below by default, above when the viewport's bottom is too close
  useLayoutEffect(() => {
    if (!open) { setPlace(null); return undefined }
    const measure = () => {
      const r = boxRef.current?.getBoundingClientRect()
      if (!r) return
      const height = options.length * 44 + 10, gap = 6
      const below = window.innerHeight - r.bottom, above = r.top
      const up = below < height + gap + 12 && above > below
      setPlace({ left: r.left, width: Math.max(240, Math.min(r.width, 320)), top: up ? r.top - gap - height : r.bottom + gap, up })
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => { window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true) }
  }, [open, options.length, values.length])
  const add = (raw) => {
    const next = raw.split(',').map((item) => item.trim().replace(/^#/, '')).filter(Boolean).map(norm)
    if (next.length) onChange([...new Set([...values, ...next])])
    setDraft('')
  }
  const onKey = (event) => {
    if (open && event.key === 'ArrowDown') { event.preventDefault(); setCursor((i) => (i + 1) % options.length); return }
    if (open && event.key === 'ArrowUp') { event.preventDefault(); setCursor((i) => (i - 1 + options.length) % options.length); return }
    if (open && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setFocused(false); return }
    if (open && (event.key === 'Enter' || event.key === 'Tab') && !event.nativeEvent.isComposing) { event.preventDefault(); add(options[cursor].value); return }
    if ((event.key === 'Enter' || event.key === ',' || (event.key === 'Tab' && draft.trim())) && !event.nativeEvent.isComposing) { event.preventDefault(); add(draft) }
    if (event.key === 'Backspace' && !draft && values.length) onChange(values.slice(0, -1))
  }
  return <div ref={boxRef} className={`nb-ed-tokens ${tone}`} role="group" aria-label={label} onMouseDown={(event) => { if (event.target === event.currentTarget) { event.preventDefault(); inputRef.current?.focus() } }}>
    {values.map((item) => <span key={item} className={`nb-ed-token${icon ? ' has-icon' : ''}`}>
      {icon && icon(item)}{prefix}{item}
      {!disabled && <button type="button" aria-label={`Remove ${prefix}${item}`} onClick={() => onChange(values.filter((value) => value !== item))}><X size={11} strokeWidth={2.6}/></button>}
    </span>)}
    {!disabled && <input
      ref={inputRef} aria-label={`Add ${label.toLowerCase()}`} placeholder={values.length ? '' : placeholder} value={draft}
      role="combobox" aria-expanded={open} aria-autocomplete="list" aria-controls={open ? `${label}-options` : undefined}
      aria-activedescendant={open ? `${label}-option-${cursor}` : undefined}
      onChange={(event) => { const v = event.target.value; if (v.includes(',')) add(v); else setDraft(v) }} onKeyDown={onKey}
      onFocus={() => setFocused(true)} onBlur={() => { setFocused(false); if (draft.trim()) add(draft) }}
      size={Math.max(6, draft.length + 1)}
    />}
    {open && place && createPortal(<div
      id={`${label}-options`} role="listbox" aria-label={`${label} suggestions`}
      className={`nb-ed-suggest${place.up ? ' is-up' : ''}`} style={{ left: place.left, top: place.top, width: place.width }}
    >
      {options.map((option, index) => <button
        key={option.value} id={`${label}-option-${index}`} type="button" role="option" aria-selected={index === cursor}
        className={index === cursor ? 'on' : ''} onMouseEnter={() => setCursor(index)}
        onMouseDown={(event) => { event.preventDefault(); add(option.value) }}
      >
        {option.icon ?? <span className="nb-ed-suggest-glyph">{prefix || '#'}</span>}
        <span className="nb-ed-suggest-copy"><b>{prefix}{option.label}</b>{option.sub && <small>{option.sub}</small>}</span>
        {index === cursor && <kbd>↵</kbd>}
      </button>)}
    </div>, document.body)}
  </div>
}

function EntryEditor({ initial = EMPTY, busy, locked = false, templates = false, submitLabel, onSubmit, onCancel, crumb, meta }) {
  const [title, setTitle] = useState(initial.title)
  const [body, setBody] = useState(initial.body)
  const [occurredOn, setOccurredOn] = useState(initial.occurred_on ?? '')
  const [tags, setTags] = useState(initial.tags)
  const [symbols, setSymbols] = useState(initial.symbols || [])
  const [formats, setFormats] = useState({})
  const bodyRef = useRef(null)
  const titleRef = useRef(null)
  const dateRef = useRef(null)
  const valid = title.trim().length > 0 && title.length <= TITLE_MAX && body.length <= BODY_MAX
  const frozen = busy || locked
  const dirty = title !== initial.title || body !== initial.body || (occurredOn || null) !== (initial.occurred_on ?? null)
    || tags.join('|') !== initial.tags.join('|') || symbols.join('|') !== (initial.symbols || []).join('|')
  const canSave = valid && !busy && (dirty || !initial.title)
  const submit = (event) => {
    event?.preventDefault()
    if (!canSave) return
    onSubmit({ title: title.trim(), body, occurred_on: occurredOn || null, tags: parseList(tags.join(',')), symbols: parseSymbols(symbols.join(',')) })
  }
  useLayoutEffect(() => {
    const el = titleRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [title])
  const format = (item) => { if (!frozen) bodyRef.current?.format(item.key) }
  const onKeys = (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); submit() }
  }
  const openDate = () => { const el = dateRef.current; if (!el || frozen) return; try { el.showPicker() } catch { el.focus(); el.click() } }
  const over = body.length > BODY_MAX

  return <form className="nb-editor nb-ed" onSubmit={submit} onKeyDown={onKeys}>
    {(crumb || meta) && <div className="nb-ed-top">
      {crumb && <span className="nb-ed-crumb">{crumb}</span>}
      {meta && <span className="nb-ed-meta">{meta}</span>}
    </div>}
    {templates && !frozen && !body.trim() && <div className="nb-templates" role="group" aria-label="Start from a template">
      <span>Start from</span>
      {TEMPLATES.map((template) => <button key={template.name} type="button" className="nb-btn" onClick={() => setBody(template.body)}>{template.name}</button>)}
    </div>}
    <textarea
      ref={titleRef} rows={1} className="nb-ed-title" aria-label="Title" placeholder="Untitled note" maxLength={TITLE_MAX} value={title} disabled={frozen}
      onChange={(event) => setTitle(event.target.value.replace(/\n/g, ' '))}
      onKeyDown={(event) => { if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey) { event.preventDefault(); bodyRef.current?.focus() } }}
    />

    <div className="nb-ed-toolbar" role="toolbar" aria-label="Formatting">
      {FORMATS.map((item, index) => item.gap
        ? <span key={`gap-${index}`} className="nb-ed-sep" aria-hidden="true"/>
        : <button
            key={item.key} type="button" className={`nb-ed-tool${formats[item.key] ? ' is-on' : ''}`} aria-label={item.label} aria-pressed={!!formats[item.key]} title={item.label}
            disabled={frozen} onMouseDown={(event) => event.preventDefault()} onClick={() => format(item)}
          ><item.icon size={15} strokeWidth={2}/></button>)}
      <span className="nb-ed-tip">Type <kbd>-</kbd> <kbd>1.</kbd> <kbd>#</kbd> <kbd>&gt;</kbd> then space</span>
    </div>

    <div className="nb-ed-body">
      <RichBody ref={bodyRef} value={body} onChange={setBody} onFormats={setFormats} disabled={frozen} ariaLabel="Body" placeholder="What happened, what you did, what you'd do differently…"/>
    </div>

    <div className="nb-ed-props" aria-label="Details">
      <div className="nb-ed-prop">
        <span className="nb-ed-prop-label"><CalendarDays size={14}/>Date</span>
        <button type="button" className={`nb-ed-pill${occurredOn ? '' : ' is-empty'}`} disabled={frozen} onClick={openDate}>{prettyDate(occurredOn)}</button>
        <input ref={dateRef} className="nb-ed-date" type="date" aria-label="Occurred on" tabIndex={-1} value={occurredOn} disabled={frozen} onChange={(event) => setOccurredOn(event.target.value)}/>
        {occurredOn && !frozen && <button type="button" className="nb-ed-clear" aria-label="Clear date" onClick={() => setOccurredOn('')}><X size={11} strokeWidth={2.6}/></button>}
      </div>
      <div className="nb-ed-prop">
        <span className="nb-ed-prop-label"><Hash size={14}/>Tags</span>
        <TokenField label="Tags" values={tags} onChange={setTags} placeholder="Add a tag" prefix="#" disabled={frozen} suggest={suggestTags}/>
      </div>
      <div className="nb-ed-prop">
        <span className="nb-ed-prop-label"><Circle size={14} fill="currentColor" strokeWidth={0}/>Symbols</span>
        <TokenField label="Symbols" values={symbols} onChange={setSymbols} placeholder="Add a symbol" upper tone="is-symbol" disabled={frozen} icon={(symbol) => <SymbolToken symbol={symbol}/>} suggest={suggestSymbols}/>
      </div>
    </div>

    <div className="nb-ed-foot">
      <span className={`nb-ed-count${over ? ' is-over' : ''}`}>{body.length.toLocaleString()} characters{over ? ` · over the ${BODY_MAX.toLocaleString()} limit` : ''}</span>
      <span className="nb-ed-hint"><kbd>⌘</kbd><kbd>↵</kbd> to save</span>
      <div className="nb-ed-actions">
        {onCancel && <button type="button" className="nb-ed-cancel" disabled={busy} onClick={onCancel}>Cancel</button>}
        <button type="submit" className="nb-ed-save" disabled={!canSave}>{submitLabel}</button>
      </div>
    </div>
  </form>
}
