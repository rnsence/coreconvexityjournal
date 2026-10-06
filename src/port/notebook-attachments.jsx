import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpRight, ChevronLeft, ChevronRight, Circle, CircleAlert, FileText, Image as ImageIcon, Minus, Paperclip, Plus, Square, Type, Undo2, X } from 'lucide-react'
import { Drawer, useDrawer } from '../dialogs'
import { DownloadSimple, PencilSimpleLine, Trash } from '@phosphor-icons/react'
import {
  ACCEPT, MAX_SHAPES, declaredType, download, formatSize, isConflict, isRaster, precheck, readAsDataUrl, uuid,
} from './notebook-data'
import { Feedback, useCommand } from './notebook-command'

export const COLOURS = { red: '#ef4444', green: '#22c55e', blue: '#3b82f6', yellow: '#eab308', white: '#ffffff', black: '#000000' }
const KINDS = ['arrow', 'line', 'rect', 'ellipse', 'text']
const pct = (value) => `${value * 100}%`
const clamp = (value) => Math.round(Math.min(1, Math.max(0, value)) * 10_000) / 10_000

/** Shapes as SVG in percentages of the image box, so they scale with it. */
export function ShapesLayer({ shapes, idBase }) {
  return <>
    <defs>{Object.entries(COLOURS).map(([name, hex]) => <marker key={name} id={`${idBase}-arrow-${name}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill={hex}/></marker>)}</defs>
    {shapes.map((shape, index) => {
      const stroke = COLOURS[shape.colour] ?? COLOURS.red
      const common = { stroke, strokeWidth: 3, fill: 'none', strokeLinecap: 'round' }
      switch (shape.kind) {
        case 'arrow': return <line key={index} {...common} x1={pct(shape.x1)} y1={pct(shape.y1)} x2={pct(shape.x2)} y2={pct(shape.y2)} markerEnd={`url(#${idBase}-arrow-${shape.colour})`}/>
        case 'line': return <line key={index} {...common} x1={pct(shape.x1)} y1={pct(shape.y1)} x2={pct(shape.x2)} y2={pct(shape.y2)}/>
        case 'rect': return <rect key={index} {...common} x={pct(Math.min(shape.x1, shape.x2))} y={pct(Math.min(shape.y1, shape.y2))} width={pct(Math.abs(shape.x2 - shape.x1))} height={pct(Math.abs(shape.y2 - shape.y1))}/>
        case 'ellipse': return <ellipse key={index} {...common} cx={pct((shape.x1 + shape.x2) / 2)} cy={pct((shape.y1 + shape.y2) / 2)} rx={pct(Math.abs(shape.x2 - shape.x1) / 2)} ry={pct(Math.abs(shape.y2 - shape.y1) / 2)}/>
        case 'text': return <text key={index} x={pct(shape.x1)} y={pct(shape.y1)} fill={stroke} fontSize={16} fontWeight={600} paintOrder="stroke" stroke={shape.colour === 'black' ? '#fff' : '#000'} strokeWidth={3}>{shape.text}</text>
        default: return null
      }
    })}
  </>
}

/** A thumbnail "loads" like an authorised blob fetch: brief status, then the image or "Unavailable". */
function Thumbnail({ file }) {
  const [state, setState] = useState('loading')
  useEffect(() => {
    if (!file.src) { setState('error'); return undefined }
    const image = new Image()
    image.onload = () => setState('ready')
    image.onerror = () => setState('error')
    image.src = file.src
    return () => { image.onload = null; image.onerror = null }
  }, [file.src])
  if (state === 'ready') {
    return <span className="nb-thumb">
      <img src={file.src} alt={file.name}/>
      {file.annotation?.shapes?.length > 0 && <svg aria-hidden="true"><ShapesLayer shapes={file.annotation.shapes} idBase={`t-${file.attachment_id}`}/></svg>}
    </span>
  }
  return <span className="nb-thumb is-empty" role={state === 'error' ? undefined : 'status'}>{state === 'error' ? 'Unavailable' : 'Loading'}</span>
}

/** Entry and exit charts and supporting files on a note. Attaching and removing are revisioned commands. */
export function EntryAttachments({ entry }) {
  const archived = entry.status === 'archived'
  const attachments = entry.attachments ?? []
  const input = useRef(null)
  const heldFile = useRef(null)
  const [notice, setNotice] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [editingText, setEditingText] = useState(null)
  const [viewing, setViewing] = useState(null)
  const upload = useCommand(`attachment-upload:/entries/${entry.entry_id}`)
  const remove = useCommand(`attachments:/entries/${entry.entry_id}`)
  const uploadPending = upload.pending && !upload.isPending ? upload.pending : null
  // Bytes are never stored with the intent: after a reload the same file must be chosen again.
  const canRetry = !!uploadPending && heldFile.current?.key === uploadPending.key
  const blocked = upload.isPending || remove.isPending || !!remove.pending || (!!uploadPending && canRetry)
  if (!attachments.length && archived) return null

  const matchesPending = (file) => uploadPending && file.name === uploadPending.attachment.name && file.size === uploadPending.attachment.size_bytes
  const choose = async (file) => {
    if (!file) return
    if (uploadPending && !matchesPending(file)) { setNotice(`Choose ${uploadPending.attachment.name} to retry its upload, or discard the retry first.`); return }
    const refusal = precheck(file)
    setNotice(refusal)
    if (refusal) return
    let src
    try { src = await readAsDataUrl(file) } catch { setNotice(`${file.name} could not be read; try again.`); return }
    if (uploadPending && matchesPending(file)) {
      heldFile.current = { key: uploadPending.key }
      upload.retry()
      return
    }
    upload.reset()
    const attachment = { attachment_id: `att-${uuid().slice(0, 8)}`, name: file.name, type: declaredType(file.name), size_bytes: file.size, src }
    const intent = upload.submit({ kind: 'attach', entry_id: entry.entry_id, expected_revision: entry.revision, attachment })
    heldFile.current = { key: intent.key }
  }
  const drop = (event) => {
    event.preventDefault()
    setDragging(false)
    if (!archived && !blocked) choose(event.dataTransfer.files[0])
  }
  const failed = upload.error ?? remove.error

  return <section
    aria-label="Attachments"
    className={`nb-attachments${dragging ? ' is-dragging' : ''}`}
    onDragOver={archived ? undefined : (event) => { event.preventDefault(); setDragging(true) }}
    onDragLeave={() => setDragging(false)}
    onDrop={archived ? undefined : drop}
  >
    {attachments.length > 0 && <button
      type="button" className={`nb-files-toggle${viewing !== null ? ' is-open' : ''}`} aria-haspopup="dialog" onClick={() => setViewing(0)}
    >
      <Paperclip size={11.5} strokeWidth={2.2}/>{attachments.length} {attachments.length === 1 ? 'attachment' : 'attachments'}
      <span className="nb-files-peek" aria-hidden="true">{attachments.slice(0, 3).map((file) => <i key={file.attachment_id} className={isRaster(file) ? 'img' : 'doc'}/>)}</span>
    </button>}
    {viewing !== null && attachments.length > 0 && <AttachmentViewer
      entry={entry} files={attachments} start={viewing} archived={archived} blocked={blocked || !!upload.pending} onClose={() => setViewing(null)}
      onEditText={(file) => setEditingText(file.attachment_id)}
      onRemove={(file) => { remove.submit({ kind: 'remove-attachment', entry_id: entry.entry_id, expected_revision: entry.revision, attachment_id: file.attachment_id }) }}
    />}
    {editingText && attachments.some((file) => file.attachment_id === editingText) && <TextFileEditor
      entry={entry} file={attachments.find((file) => file.attachment_id === editingText)} onClose={() => setEditingText(null)}
    />}
    {notice && <Feedback tone="error">{notice}</Feedback>}
    {uploadPending && <Feedback tone="error" action={<>
      {canRetry && <button type="button" className="nb-btn" onClick={() => upload.retry()}>Retry upload</button>}
      <button type="button" className="nb-btn ghost" onClick={() => { heldFile.current = null; upload.discardRetry() }}>Discard retry</button>
    </>}>
      {canRetry
        ? `The upload of ${uploadPending.attachment.name} could not be confirmed. Retry sends the same file under the same key.`
        : `The upload of ${uploadPending.attachment.name} could not be confirmed. Choose the same file again to retry it safely.`}
    </Feedback>}
    {failed && !uploadPending && <Feedback tone="error" action={remove.pending && !remove.isPending ? <>
      <button type="button" className="nb-btn" onClick={() => remove.retry()}>Retry removal</button>
      <button type="button" className="nb-btn ghost" onClick={remove.discardRetry}>Discard retry</button>
    </> : undefined}>
      {remove.pending ? 'The removal could not be confirmed. Retry sends the same command.' : failed.message}
    </Feedback>}
    {!archived && <>
      <input ref={input} type="file" accept={ACCEPT} hidden aria-label="Attachment file" onChange={(event) => { choose(event.target.files?.[0]); event.target.value = '' }}/>
      {/* once a note has files, adding another is just a + beside their count */}
      {attachments.length > 0
        ? <button type="button" className="nb-attach is-icon" disabled={blocked} aria-label={upload.isPending ? 'Uploading…' : 'Attach another chart or file'} title="Attach another file" onClick={() => input.current?.click()}><Plus size={14} strokeWidth={1.8}/></button>
        : <button type="button" className="nb-attach" disabled={blocked} onClick={() => input.current?.click()}>
          <Paperclip size={13}/>{upload.isPending ? 'Uploading…' : 'Attach chart or file'}
          {!upload.isPending && <em>or drop it here</em>}
        </button>}
    </>}
  </section>
}

const TOOLS = [['arrow', 'Arrow', ArrowUpRight], ['line', 'Line', Minus], ['rect', 'Box', Square], ['ellipse', 'Ellipse', Circle], ['text', 'Text', Type]]

/** Arrows, lines, boxes, ellipses and text over an image, in 0..1 image coordinates; edited inside the viewer drawer. */
function AnnotatePane({ entry, file, onDone }) {
  const command = useCommand(`annotation:${file.attachment_id}`)
  const saved = file.annotation ?? { revision: 0, shapes: [] }
  const [draft, setDraft] = useState(null)
  const [kind, setKind] = useState('arrow')
  const [colour, setColour] = useState('red')
  const [label, setLabel] = useState('')
  const [start, setStart] = useState(null)
  const [preview, setPreview] = useState(null)
  const [image, setImage] = useState(file.src ? 'loading' : 'error')
  const shapes = draft ?? command.pending?.shapes ?? saved.shapes
  const full = shapes.length >= MAX_SHAPES
  const dirty = draft !== null

  const point = (event) => {
    const box = event.currentTarget.getBoundingClientRect()
    return { x: clamp((event.clientX - box.left) / box.width), y: clamp((event.clientY - box.top) / box.height) }
  }
  const add = (shape) => setDraft([...shapes, shape])
  const undo = () => { if (shapes.length) setDraft(shapes.slice(0, -1)) }
  const down = (event) => {
    if (full) return
    const hit = point(event)
    if (kind === 'text') {
      if (label.trim()) add({ kind, x1: hit.x, y1: hit.y, x2: hit.x, y2: hit.y, colour, text: label.trim() })
      return
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
    setStart(hit)
  }
  const move = (event) => {
    if (!start) return
    const hit = point(event)
    setPreview({ kind, x1: start.x, y1: start.y, x2: hit.x, y2: hit.y, colour })
  }
  const up = (event) => {
    if (!start) return
    const hit = point(event)
    setStart(null); setPreview(null)
    if (hit.x !== start.x || hit.y !== start.y) add({ kind, x1: start.x, y1: start.y, x2: hit.x, y2: hit.y, colour })
  }
  const save = () => {
    const done = () => { setDraft(null); onDone() }
    if (command.pending) command.retry(done)
    else command.submit({ kind: 'annotate', entry_id: entry.entry_id, attachment_id: file.attachment_id, annotation_revision: saved.revision, shapes }, done)
  }
  const cancel = () => { if (command.pending) command.discardRetry(); onDone() }
  useEffect(() => {
    const onKey = (event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'z' && !event.target.closest?.('input')) { event.preventDefault(); undo() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  const hint = full ? `At most ${MAX_SHAPES} marks.` : kind === 'text' ? (label.trim() ? 'Click where the text goes.' : 'Type the text, then click the image.') : 'Drag on the image to draw.'

  return <div className="trade-panel dw-trade nb-viewer nb-annotator">
    <div className="tp-head">
      <div>
        <div className="tp-title">
          <button type="button" className="nb-vw-back" aria-label="Back to preview" onClick={cancel}><ChevronLeft size={16}/></button>
          <b title={file.name}>Annotate {file.name}</b>
        </div>
        <small>{shapes.length} {shapes.length === 1 ? 'mark' : 'marks'} · {hint}</small>
      </div>
    </div>
    <div className="nb-an-bar">
      <div className="nb-an-tools" role="toolbar" aria-label="Tool">
        {TOOLS.map(([id, name, Icon]) => <button key={id} type="button" aria-label={name} title={name} aria-pressed={kind === id} className={kind === id ? 'is-on' : ''} onClick={() => setKind(id)}><Icon size={15} strokeWidth={2}/></button>)}
      </div>
      <div className="nb-an-colours" role="radiogroup" aria-label="Colour">
        {Object.entries(COLOURS).map(([name, hex]) => <button key={name} type="button" role="radio" aria-checked={colour === name} aria-label={name} title={name} className={colour === name ? 'is-on' : ''} style={{ '--sw': hex }} onClick={() => setColour(name)}/>)}
      </div>
      <button type="button" className="nb-an-undo" disabled={!shapes.length} onClick={undo} aria-label="Undo last mark" title="Undo (⌘Z)"><Undo2 size={15}/></button>
    </div>
    {kind === 'text' && <input className="nb-an-text" aria-label="Annotation text" placeholder="Label text, then click the image" maxLength={200} value={label} onChange={(event) => setLabel(event.target.value)} autoFocus/>}
    <div className="nb-vw-stage is-image">
      {image !== 'error' && <div className="nb-canvas" data-no-drag hidden={image !== 'ready'}>
        <img src={file.src} alt={file.name} draggable={false} onLoad={() => setImage('ready')} onError={() => setImage('error')}/>
        <svg role="img" aria-label={`${shapes.length} annotation${shapes.length === 1 ? '' : 's'}`} onPointerDown={down} onPointerMove={move} onPointerUp={up}>
          <ShapesLayer shapes={preview ? [...shapes, preview] : shapes} idBase={`e-${file.attachment_id}`}/>
        </svg>
      </div>}
      {image !== 'ready' && <div className="nb-vw-empty" role="status"><ImageIcon size={22}/><p>{image === 'error' ? 'The image could not be loaded.' : 'Loading image…'}</p></div>}
    </div>
    {shapes.length > 0 && <ol className="nb-shapes">
      {shapes.map((shape, index) => <li key={index}>
        <i style={{ background: COLOURS[shape.colour] }} aria-hidden="true"/>{shape.kind === 'rect' ? 'box' : shape.kind}{shape.text ? ` “${shape.text}”` : ''}
        <button type="button" aria-label={`Remove ${shape.kind} ${index + 1}`} onClick={() => setDraft(shapes.filter((_, other) => other !== index))}><X size={11}/></button>
      </li>)}
    </ol>}
    {command.error && <Feedback tone="error">
      {command.pending ? 'The save could not be confirmed. Retry sends the same shapes.' : isConflict(command.error) ? 'This annotation changed elsewhere. Go back and reopen it to see the latest.' : command.error.message}
    </Feedback>}
    <div className="dw-actions nb-vw-actions">
      {dirty && !command.pending && <button type="button" className="nb-vw-remove nb-vw-discard" onClick={() => setDraft(null)}>Discard changes</button>}
      <button type="button" className="ws-outline" disabled={command.isPending} onClick={cancel}>Cancel</button>
      <button type="button" className="start-day" disabled={command.isPending || (!dirty && !command.pending)} onClick={save}>
        {command.isPending ? 'Saving…' : command.pending ? 'Retry save' : 'Save annotation'}
      </button>
    </div>
  </div>
}

/* ------------------------------------------------------------ attachment viewer */

const fileKind = (file) => (isRaster(file) ? 'image' : isText(file) ? 'text' : 'file')

/** A note's files in the springy drawer: one large preview at a time, a strip to switch, ←/→ to step; annotating happens in place. */
function AttachmentViewer({ entry, files, start, archived, blocked, onClose, onEditText, onRemove }) {
  const [index, setIndex] = useState(start)
  const [mode, setMode] = useState('view')
  // an action that opens another editor runs once this drawer has finished closing
  const after = useRef(null)
  const position = Math.min(index, files.length - 1)
  const file = files[position]
  return <Drawer label={`Attachment ${file.name}`} viewKey={`${file.attachment_id}:${mode}`} width={760} onClose={() => { onClose(); after.current?.(); after.current = null }}>
    {mode === 'annotate'
      ? <AnnotatePane entry={entry} file={file} onDone={() => setMode('view')}/>
      : <ViewerPane files={files} position={position} setIndex={setIndex} archived={archived} blocked={blocked} after={after}
        onAnnotate={() => setMode('annotate')} onEditText={onEditText} onRemove={onRemove}/>}
  </Drawer>
}

function ViewerPane({ files, position, setIndex, archived, blocked, after, onAnnotate, onEditText, onRemove }) {
  const { close } = useDrawer()
  const file = files[position]
  const total = files.length
  const kind = fileKind(file)
  const shapes = file.annotation?.shapes ?? []
  const step = (delta) => setIndex((value) => Math.max(0, Math.min(total - 1, Math.min(value, total - 1) + delta)))
  const then = (action) => { after.current = action; close() }
  useEffect(() => {
    const onKey = (event) => {
      if (event.target.closest?.('input, textarea, select')) return
      if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1) }
      if (event.key === 'ArrowRight') { event.preventDefault(); step(1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [total])
  const ext = (file.name.includes('.') ? file.name.split('.').pop() : file.type?.split('/').pop() || 'file').toUpperCase()
  return <div className="trade-panel dw-trade nb-viewer">
    <div className="tp-head">
      <div>
        <div className="tp-title"><span className="nb-vw-icon">{kind === 'image' ? <ImageIcon size={15}/> : <FileText size={15}/>}</span><b title={file.name}>{file.name}</b></div>
        <small>{ext} · {formatSize(file.size_bytes)}{shapes.length > 0 && ` · ${shapes.length} ${shapes.length === 1 ? 'mark' : 'marks'}`}{total > 1 && ` · ${position + 1} of ${total}`}</small>
      </div>
      {total > 1 && <div className="tp-nav">
        <button type="button" aria-label="Previous attachment" disabled={position <= 0} onClick={() => step(-1)}><ChevronLeft size={15}/></button>
        <button type="button" aria-label="Next attachment" disabled={position >= total - 1} onClick={() => step(1)}><ChevronRight size={15}/></button>
      </div>}
    </div>
    <div className={`nb-vw-stage is-${kind}`}>
      {kind === 'image' && (file.src
        ? <span className="nb-vw-image"><img src={file.src} alt={file.name}/>{shapes.length > 0 && <svg aria-hidden="true"><ShapesLayer shapes={shapes} idBase={`v-${file.attachment_id}`}/></svg>}</span>
        : <div className="nb-vw-empty"><ImageIcon size={22}/><p>This image is unavailable.</p></div>)}
      {kind === 'text' && <TextPreview file={file}/>}
      {kind === 'file' && <div className="nb-vw-empty"><FileText size={22}/><p>No preview for this file type.</p></div>}
    </div>
    {total > 1 && <div className="nb-vw-strip" role="tablist" aria-label="Attachments">
      {files.map((item, n) => <button key={item.attachment_id} type="button" role="tab" aria-selected={n === position} aria-label={item.name} title={item.name}
        className={n === position ? 'is-on' : ''} onClick={() => setIndex(n)}>
        {isRaster(item) && item.src ? <img src={item.src} alt=""/> : <FileText size={15}/>}
      </button>)}
    </div>}
    <div className="dw-actions nb-vw-actions">
      {!archived && <button type="button" className="nb-vw-remove" disabled={blocked} onClick={() => onRemove(file)}><Trash size={15} weight="duotone"/>Remove</button>}
      <button type="button" className="ws-outline" disabled={!file.src} onClick={() => download({ name: file.name, url: file.src })}><DownloadSimple size={15} weight="duotone"/>Download</button>
      {kind === 'image' && file.src && <button type="button" className="start-day" onClick={onAnnotate}><PencilSimpleLine size={15} weight="duotone"/>Annotate</button>}
      {kind === 'text' && !archived && <button type="button" className="start-day" onClick={() => then(() => onEditText(file))}><PencilSimpleLine size={15} weight="duotone"/>Edit file</button>}
    </div>
  </div>
}

function TextPreview({ file }) {
  const text = useMemo(() => decodeText(file.src), [file.src])
  const lines = text.split('\n')
  return <div className="nb-vw-text" data-no-drag tabIndex={0} aria-label={`Contents of ${file.name}`}>
    <ol>{lines.map((line, n) => <li key={n}><span>{line || ' '}</span></li>)}</ol>
  </div>
}

/* ------------------------------------------------------------ text file editor */

const isText = (file) => /\.(txt|md|csv|json|log)$/i.test(file.name) || /^text\//.test(file.type || '')
const decodeText = (src) => {
  if (!src) return ''
  const [meta, data = ''] = src.split(',')
  try { return /;base64/i.test(meta) ? new TextDecoder().decode(Uint8Array.from(atob(data), (c) => c.charCodeAt(0))) : decodeURIComponent(data) } catch { return '' }
}
const encodeText = (text, type = 'text/plain') => {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  bytes.forEach((b) => { binary += String.fromCharCode(b) })
  return { src: `data:${type};base64,${btoa(binary)}`, size: bytes.length }
}

/** Plain-text attachment, edited in the drawer: a monospace page, line count, ⌘↵ to save. */
function TextFileEditor({ entry, file, onClose }) {
  const original = useMemo(() => decodeText(file.src), [file.src])
  const [text, setText] = useState(original)
  const command = useCommand(`attachment-text:/entries/${entry.entry_id}/${file.attachment_id}`)
  return <Drawer label={`Edit ${file.name}`} width={620} onClose={onClose}>
    <TextFilePane file={file} text={text} setText={setText} original={original} command={command}
      save={(close) => {
        const { src, size } = encodeText(text, /\.md$/i.test(file.name) ? 'text/markdown' : /\.csv$/i.test(file.name) ? 'text/csv' : 'text/plain')
        command.submit({ kind: 'rewrite-attachment', entry_id: entry.entry_id, expected_revision: entry.revision, attachment_id: file.attachment_id, src, size_bytes: size }, close)
      }}
    />
  </Drawer>
}

function TextFilePane({ file, text, setText, original, command, save }) {
  const { close } = useDrawer()
  const ref = useRef(null)
  const dirty = text !== original
  const lines = text.split('\n').length
  useEffect(() => { requestAnimationFrame(() => { const el = ref.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length) } }) }, [])
  return <form className="nb-sheet nb-edit-pane nb-textfile" onSubmit={(event) => { event.preventDefault(); if (dirty && !command.isPending) save(close) }}
    onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); if (dirty && !command.isPending) save(close) } }}>
    <div className="nb-ed-top">
      <span className="nb-ed-crumb">Attachment<ChevronRight size={12}/><b>{file.name}</b></span>
    </div>
    <div className="nb-tf-page">
      <div className="nb-tf-gutter" aria-hidden="true">{Array.from({ length: lines }, (_, i) => <span key={i}>{i + 1}</span>)}</div>
      <textarea ref={ref} aria-label={`Contents of ${file.name}`} spellCheck={false} value={text} disabled={command.isPending}
        onChange={(event) => setText(event.target.value)}
        onScroll={(event) => { event.currentTarget.previousSibling.scrollTop = event.currentTarget.scrollTop }}/>
    </div>
    {command.error && <Feedback tone="error" icon={CircleAlert}>{command.error.message}</Feedback>}
    <div className="nb-ed-foot">
      <span className="nb-ed-count">{lines} {lines === 1 ? 'line' : 'lines'} · {formatSize(new TextEncoder().encode(text).length)}</span>
      <span className="nb-ed-hint"><kbd>⌘</kbd><kbd>↵</kbd> to save</span>
      <div className="nb-ed-actions">
        <button type="button" className="nb-ed-cancel" disabled={command.isPending} onClick={close}>Cancel</button>
        <button type="submit" className="nb-ed-save" disabled={!dirty || command.isPending}>{command.isPending ? 'Saving…' : 'Save file'}</button>
      </div>
    </div>
  </form>
}
