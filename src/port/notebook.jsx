import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Archive, ArchiveRestore, CalendarDays, ChevronDown, CircleAlert, Download, Info, NotebookPen, Pencil, Plus, Search, WifiOff,
} from 'lucide-react'
import { PageHead, Card, Segmented } from '../workspace'
import { Sheet } from '../dialogs'
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
      actions={<button type="button" className="start-day" disabled={composing} onClick={() => { create.reset(); setComposing(true) }}><Plus size={16} strokeWidth={2.2}/> New entry</button>}
    />

    <OfflineBanner/>

    <JournalSearch key={JSON.stringify([filters.q, filters.symbol, filters.from, filters.to])} filters={filters} onSearch={setFilter}/>

    <div className="nb-filters" role="group" aria-label="Filter notes">
      <div className="ws-seg nb-status">
        {[['active', 'Active'], ['archived', 'Archived'], ['all', 'All entries']].map(([value, label]) =>
          <button key={value} type="button" aria-pressed={status === value} className={status === value ? 'active' : ''} onClick={() => setFilter({ status: value })}>{label}</button>)}
      </div>
      <div className="nb-tags">
        {tags.map((item) => <button key={item.tag} type="button" aria-pressed={tag === item.tag} className={`nb-tag-chip${tag === item.tag ? ' on' : ''}`} onClick={() => setFilter({ tag: tag === item.tag ? '' : item.tag })}>
          #{item.tag} <span>{item.count}</span>
        </button>)}
      </div>
      <ExportMenu pending={exporting} onExport={runExport}/>
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
      <button type="button" className="nb-btn" disabled={entries.isFetchingNextPage} onClick={entries.fetchNextPage}>{entries.isFetchingNextPage ? 'Loading…' : 'Load older entries'}</button>
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
function JournalSearch({ filters, onSearch }) {
  const [draft, setDraft] = useState({ q: filters.q, symbol: filters.symbol, from: filters.from, to: filters.to })
  const field = (key) => ({ value: draft[key], onChange: (event) => setDraft((current) => ({ ...current, [key]: event.target.value })) })
  const active = !!(filters.q || filters.symbol || filters.from || filters.to)
  const submit = (event) => {
    event.preventDefault()
    onSearch({ q: draft.q.trim(), symbol: draft.symbol.trim(), from: draft.from, to: draft.to })
  }
  return <form role="search" aria-label="Search notes" className="nb-search" onSubmit={submit}>
    <label className="nb-field grow">
      <span>Phrase</span>
      <span className="ws-search nb-input"><Search size={14}/><input aria-label="Search phrase" placeholder="Search title and body" maxLength={200} {...field('q')}/></span>
    </label>
    <label className="nb-field symbol">
      <span>Symbol</span>
      <span className="ws-search nb-input"><input aria-label="Symbol" placeholder="SPY" maxLength={20} {...field('symbol')}/></span>
    </label>
    <label className="nb-field">
      <span>From</span>
      <span className="ws-search nb-input"><input type="date" aria-label="From date" max={draft.to || undefined} {...field('from')}/></span>
    </label>
    <label className="nb-field">
      <span>To</span>
      <span className="ws-search nb-input"><input type="date" aria-label="To date" min={draft.from || undefined} {...field('to')}/></span>
    </label>
    <div className="nb-search-actions">
      <button type="submit" className="nb-btn secondary"><Search size={14}/> Search</button>
      {active && <button type="button" className="nb-btn ghost" onClick={() => onSearch({ q: '', symbol: '', from: '', to: '' })}>Clear</button>}
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
  const revise = (content) => {
    if (pendingRevision) { command.retry(() => setEditing(false)); return }
    command.submit({ kind: 'revise', entry_id: entry.entry_id, expected_revision: entry.revision, content }, () => setEditing(false))
  }
  const toggleArchive = () => command.submit({ kind: archived ? 'restore' : 'archive', entry_id: entry.entry_id, expected_revision: entry.revision })
  const date = entry.content.occurred_on ?? new Date(entry.created_at).toLocaleDateString()

  return <Card className={`nb-note${archived ? ' is-archived' : ''}`}>
    <div className="nb-note-meta">
      <span className="card-title"><CalendarDays size={13}/>{date}</span>
      {entry.author === 'assistant' && <span className="nb-badge soft">By assistant</span>}
      {archived && <span className="nb-badge">Archived</span>}
    </div>
    <h2 className="nb-note-title">{entry.content.title}</h2>
    <Markdown text={entry.content.body} className="nb-note-body"/>
    {(entry.content.tags.length > 0 || entry.content.symbols?.length > 0) && <div className="nb-note-tags">
      {(entry.content.symbols || []).map((symbol) => <span key={`s-${symbol}`} className="nb-symbol">{symbol}</span>)}
      {entry.content.tags.map((item) => <span key={item} className="nb-tag">#{item}</span>)}
    </div>}
    <EntryAttachments entry={entry}/>
    {!editing && command.error && <Feedback tone="error" icon={CircleAlert} action={command.pending && !command.isPending ? <>
      <button type="button" className="nb-btn" onClick={() => (pendingRevision ? setEditing(true) : command.retry())}>Retry</button>
      <button type="button" className="nb-btn ghost" onClick={command.discardRetry}>Discard retry</button>
    </> : undefined}>{command.error.message}</Feedback>}
    <footer className="nb-note-foot">
      <span>Revision {entry.revision}{command.isSuccess && ' · saved'}</span>
      <div>
        {!archived && <button type="button" className="nb-btn" disabled={command.isPending || (!!command.pending && !pendingRevision)} onClick={openEditor}><Pencil size={13}/> Edit</button>}
        <button type="button" className="nb-btn ghost" disabled={command.isPending || !!command.pending} onClick={toggleArchive}>
          {archived ? <ArchiveRestore size={13}/> : <Archive size={13}/>}{archived ? 'Restore' : 'Archive'}
        </button>
      </div>
    </footer>

    {editing && <Sheet title="Edit entry" subtitle="Save a new revision of your note." width={576} className="nb-sheet" onClose={() => setEditing(false)}>
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
        onSubmit={revise}
        onCancel={() => setEditing(false)}
      />
    </Sheet>}
  </Card>
}

/* ------------------------------------------------------------ editor */

const EMPTY = { title: '', body: '', occurred_on: null, tags: [], symbols: [] }

/** Draft-only editor; the parent decides which command the submitted content becomes. */
function EntryEditor({ initial = EMPTY, busy, locked = false, templates = false, submitLabel, onSubmit, onCancel }) {
  const [title, setTitle] = useState(initial.title)
  const [body, setBody] = useState(initial.body)
  const [occurredOn, setOccurredOn] = useState(initial.occurred_on ?? '')
  const [tags, setTags] = useState(initial.tags.join(', '))
  const [symbols, setSymbols] = useState((initial.symbols || []).join(', '))
  const [view, setView] = useState('Write')
  const valid = title.trim().length > 0 && title.length <= TITLE_MAX && body.length <= BODY_MAX
  const frozen = busy || locked
  const submit = (event) => {
    event.preventDefault()
    if (!valid || busy) return
    onSubmit({ title: title.trim(), body, occurred_on: occurredOn || null, tags: parseList(tags), symbols: parseSymbols(symbols) })
  }
  return <form className="nb-editor" onSubmit={submit}>
    {templates && !frozen && !body.trim() && <div className="nb-templates" role="group" aria-label="Start from a template">
      <span>Start from</span>
      {TEMPLATES.map((template) => <button key={template.name} type="button" className="nb-btn" onClick={() => { setBody(template.body); setView('Write') }}>{template.name}</button>)}
    </div>}
    <input className="nb-title-input" aria-label="Title" placeholder="Give this note a title" maxLength={TITLE_MAX} value={title} disabled={frozen} onChange={(event) => setTitle(event.target.value)}/>
    <div className="nb-body-wrap">
      <div className="nb-body-head">
        <Segmented options={['Write', 'Preview']} value={view} onChange={setView} label="Body view" className="compact"/>
        <span className={body.length > BODY_MAX ? 'is-over' : ''}>Markdown · {body.length.toLocaleString()} / 65,536</span>
      </div>
      {view === 'Write'
        ? <textarea aria-label="Body" placeholder="Reasoning, setup, what you would do differently…" rows={12} value={body} disabled={frozen} onChange={(event) => setBody(event.target.value)}/>
        : <div className="nb-preview">{body.trim() ? <Markdown text={body}/> : <p className="nb-muted">Nothing to preview yet.</p>}</div>}
    </div>
    <div className="nb-editor-row">
      <label className="dlg-field"><span>Date</span><input type="date" aria-label="Occurred on" value={occurredOn} disabled={frozen} onChange={(event) => setOccurredOn(event.target.value)}/></label>
      <label className="dlg-field grow"><span>Tags</span><input aria-label="Tags" placeholder="options, spy, mistake" value={tags} disabled={frozen} onChange={(event) => setTags(event.target.value)}/></label>
    </div>
    <label className="dlg-field"><span>Symbols</span><input aria-label="Symbols" placeholder="NQ, SPY" value={symbols} disabled={frozen} onChange={(event) => setSymbols(event.target.value)}/><small>Comma separated. The Symbol search also matches tags and whole words in the note.</small></label>
    <div className="nb-editor-actions">
      {onCancel && <button type="button" className="ws-outline" disabled={busy} onClick={onCancel}>Cancel</button>}
      <button type="submit" className="start-day" disabled={busy || !valid}>{submitLabel}</button>
    </div>
  </form>
}
