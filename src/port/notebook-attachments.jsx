import React, { useEffect, useRef, useState } from 'react'
import { Download, FileText, Paperclip, PenLine, X } from 'lucide-react'
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
    const timer = setTimeout(() => { image.src = file.src }, 160)
    return () => clearTimeout(timer)
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
  const [annotating, setAnnotating] = useState(null)
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
    {attachments.length > 0 && <ul className="nb-files">
      {attachments.map((file) => <li key={file.attachment_id}>
        {isRaster(file) ? <Thumbnail file={file}/> : <span className="nb-file-icon"><FileText size={15} aria-hidden="true"/></span>}
        <span className="nb-file-name">{file.name}</span>
        <span className="nb-file-size">{formatSize(file.size_bytes)}</span>
        <span className="nb-file-actions">
          <button type="button" className="nb-icon-btn" aria-label={`Download ${file.name}`} onClick={() => {
            setNotice(null)
            if (!file.src) { setNotice(`${file.name} could not be downloaded; try again.`); return }
            download({ name: file.name, url: file.src })
          }}><Download size={13}/></button>
          {isRaster(file) && <button type="button" className={`nb-icon-btn${annotating === file.attachment_id ? ' on' : ''}`} aria-label={`Annotate ${file.name}`} onClick={() => setAnnotating(file.attachment_id)}><PenLine size={13}/></button>}
          {!archived && <button type="button" className="nb-icon-btn" aria-label={`Remove attachment ${file.name}`} disabled={blocked || !!upload.pending}
            onClick={() => { if (annotating === file.attachment_id) setAnnotating(null); remove.submit({ kind: 'remove-attachment', entry_id: entry.entry_id, expected_revision: entry.revision, attachment_id: file.attachment_id }) }}><X size={13}/></button>}
        </span>
      </li>)}
    </ul>}
    {annotating && attachments.some((file) => file.attachment_id === annotating) && <AnnotationEditor
      key={annotating} entry={entry} file={attachments.find((item) => item.attachment_id === annotating)} onClose={() => setAnnotating(null)}
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
      <button type="button" className="nb-attach" disabled={blocked} onClick={() => input.current?.click()}>
        <Paperclip size={13}/>{upload.isPending ? 'Uploading…' : 'Attach chart or file'}
        {!upload.isPending && <em>or drop it here</em>}
      </button>
    </>}
  </section>
}

/** Arrows, lines, boxes, ellipses and text over an image, in 0..1 image coordinates. */
function AnnotationEditor({ entry, file, onClose }) {
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

  const point = (event) => {
    const box = event.currentTarget.getBoundingClientRect()
    return { x: clamp((event.clientX - box.left) / box.width), y: clamp((event.clientY - box.top) / box.height) }
  }
  const add = (shape) => setDraft([...shapes, shape])
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
    const done = () => setDraft(null)
    if (command.pending) command.retry(done)
    else command.submit({ kind: 'annotate', entry_id: entry.entry_id, attachment_id: file.attachment_id, annotation_revision: saved.revision, shapes }, done)
  }
  const hint = full ? `At most ${MAX_SHAPES} shapes.` : kind === 'text' ? 'Click where the text goes.' : 'Drag on the image to draw.'

  return <section aria-label={`Annotate ${file.name}`} className="nb-annotate">
    <div className="nb-annotate-bar">
      <label>Tool<select value={kind} onChange={(event) => setKind(event.target.value)}>{KINDS.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      <label>Colour<select value={colour} onChange={(event) => setColour(event.target.value)}>{Object.keys(COLOURS).map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      <span className="nb-swatch" style={{ background: COLOURS[colour] }} aria-hidden="true"/>
      {kind === 'text' && <input aria-label="Annotation text" placeholder="Text, then click the image" maxLength={200} value={label} onChange={(event) => setLabel(event.target.value)}/>}
      <span className="nb-annotate-hint">{hint}</span>
      <button type="button" className="nb-icon-btn nb-annotate-close" aria-label="Close annotation" onClick={() => { if (command.pending) command.discardRetry(); onClose() }}><X size={13}/></button>
    </div>
    {image !== 'error' && <div className="nb-canvas" hidden={image !== 'ready'}>
      <img src={file.src} alt={file.name} draggable={false} onLoad={() => setImage('ready')} onError={() => setImage('error')}/>
      <svg
        role="img" aria-label={`${shapes.length} annotation${shapes.length === 1 ? '' : 's'}`}
        onPointerDown={down} onPointerMove={move} onPointerUp={up}
      ><ShapesLayer shapes={preview ? [...shapes, preview] : shapes} idBase={`e-${file.attachment_id}`}/></svg>
    </div>}
    {image !== 'ready' && <p role="status" className="nb-muted">{image === 'error' ? 'The image could not be loaded.' : 'Loading image…'}</p>}
    {shapes.length > 0 && <ol className="nb-shapes">
      {shapes.map((shape, index) => <li key={index}>
        <i style={{ background: COLOURS[shape.colour] }} aria-hidden="true"/>{shape.kind}{shape.text ? ` "${shape.text}"` : ''}
        <button type="button" aria-label={`Remove ${shape.kind} ${index + 1}`} onClick={() => setDraft(shapes.filter((_, other) => other !== index))}><X size={11}/></button>
      </li>)}
    </ol>}
    {command.error && <Feedback tone="error">
      {command.pending ? 'The save could not be confirmed. Retry sends the same shapes.' : isConflict(command.error) ? 'This annotation changed elsewhere. Close and reopen it to see the latest.' : command.error.message}
    </Feedback>}
    <div className="nb-annotate-actions">
      <button type="button" className="nb-btn nb-primary" disabled={command.isPending || (draft === null && !command.pending)} onClick={save}>
        {command.isPending ? 'Saving…' : command.pending ? 'Retry save' : 'Save annotation'}
      </button>
      {draft !== null && !command.pending && <button type="button" className="nb-btn ghost" onClick={() => setDraft(null)}>Discard changes</button>}
      {command.isSuccess && draft === null && <span className="nb-muted">Annotation saved · revision {saved.revision}</span>}
    </div>
  </section>
}
