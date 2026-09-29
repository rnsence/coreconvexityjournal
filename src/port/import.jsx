/**
 * Import: add fills by hand, import a broker statement (CSV) with a preview before
 * anything is saved, sync from Tradovate, undo imports and group leftover fills.
 * Everything runs locally; committed fills become trades in the journal.
 */
import React, { useMemo, useRef, useState } from 'react'
import { CircleAlert, FileSpreadsheet, Info, Plus, RefreshCw, Trash2, Undo2, Upload } from 'lucide-react'
import { PageHead, MetricStrip, Card } from '../workspace'
import { Sheet } from '../dialogs'
import { money } from '../viz'
import { ManualFillsForm, recordedMessage } from './trades-fillsform'
import {
  KEYS, addTrades, clearFlash, fifo, groupFills, knownFills, loadAccounts, loadBatches, loadUngrouped, notifyData, parsePoints,
  peekFlash, pointValueFor, readJSON, recordBatch, round, saveBatches, saveUngrouped, setFlash, stamp, symbolRoot, tradeFromFills,
  undoBatch, uid, writeJSON,
} from './trading-data'
import './import.css'

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`
const MAX_BYTES = 1 << 20

/* ------------------------------------------------------------ CSV + formats */

export function parseCSV(text) {
  const rows = []; let row = []; let cell = ''; let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { cell += '"'; index += 1 } else if (char === '"') quoted = false
      else cell += char
    } else if (char === '"') quoted = true
    else if (char === ',') { row.push(cell); cell = '' } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += char
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows.filter((item) => item.some((value) => value.trim() !== ''))
}

export const IMPORT_FORMATS = [
  { id: 'tradovate-orders/v1', label: 'Tradovate orders export', needs: ['B/S', 'Contract', 'avgPrice', 'filledQty', 'Fill Time'],
    map: { datetime: 'Fill Time', symbol: 'Contract', side: 'B/S', quantity: 'filledQty', price: 'avgPrice', order: 'orderId', status: 'Status', account: 'Account' },
    note: 'The orders export has no fee column; enter the statement fees above to reconcile them.' },
  { id: 'ninjatrader-executions/v1', label: 'NinjaTrader executions export', needs: ['Instrument', 'Action', 'Quantity', 'Price', 'Time'],
    map: { datetime: 'Time', symbol: 'Instrument', side: 'Action', quantity: 'Quantity', price: 'Price', execution: 'ID', account: 'Account', fees: ['Commission'] } },
  { id: 'topstepx-fills/v1', label: 'TopstepX fills export', needs: ['ContractName', 'EnteredAt', 'Size', 'Side', 'Price'],
    map: { datetime: 'EnteredAt', symbol: 'ContractName', side: 'Side', quantity: 'Size', price: 'Price', execution: 'Id', fees: ['Fees'] } },
  { id: 'rithmic-orders/v1', label: 'Rithmic R|Trader Pro order history', needs: ['Buy/Sell', 'Qty Filled', 'Avg Fill Price', 'Symbol', 'Update Time'],
    map: { datetime: 'Update Time', symbol: 'Symbol', side: 'Buy/Sell', quantity: 'Qty Filled', price: 'Avg Fill Price', order: 'Order Number', status: 'Status', account: 'Account' } },
  { id: 'tradingview-paper/v1', label: 'TradingView paper trading history', needs: ['Symbol', 'Side', 'Qty', 'Fill Price', 'Closing Time'],
    map: { datetime: 'Closing Time', symbol: 'Symbol', side: 'Side', quantity: 'Qty', price: 'Fill Price', order: 'Order ID', status: 'Status', fees: ['Commission'] } },
  { id: 'executions-csv/v1', label: 'Other CSV (map the columns)' },
]

const MAP_FIELDS = [
  ['datetime', 'Date and time', '(or map Date and Time)'], ['date', 'Date'], ['time', 'Time'], ['symbol', 'Symbol'],
  ['side', 'Side', '(blank: signed quantity)'], ['quantity', 'Quantity'], ['price', 'Fill price'], ['currency', 'Currency'],
  ['multiplier', 'Multiplier'], ['execution', 'Execution ID'], ['order', 'Order ID'], ['asset_class', 'Asset class', '(optional)'],
  ['underlying', 'Underlying', '(optional)'], ['expiry', 'Option expiry', '(optional)'], ['strike', 'Strike', '(optional)'], ['right', 'Put or call', '(optional)'],
]
const GUESS = {
  datetime: /date.?time|timestamp|exec(uted)?.?(at|time)|fill.?time/i, date: /^(trade.?)?date$/i, time: /^time$/i,
  symbol: /symbol|ticker|contract|instrument/i, side: /^side$|b\/s|action|buy.?sell/i, quantity: /^qty$|quantity|^size$|filled/i,
  price: /price/i, currency: /currency|ccy/i, multiplier: /multiplier|point.?value/i, execution: /exec.*id|fill.*id|^id$/i, order: /order/i,
}
const suggestMapping = (headers) => {
  const mapping = {}
  Object.entries(GUESS).forEach(([field, pattern]) => {
    const found = headers.find((header) => pattern.test(header) && !Object.values(mapping).includes(header))
    if (found) mapping[field] = found
  })
  if (mapping.datetime && (mapping.date || mapping.time)) { delete mapping.date; delete mapping.time }
  return { mapping, fees: headers.filter((header) => /fee|commission/i.test(header)) }
}

const pad2 = (value) => String(value).padStart(2, '0')
/** "09/25/2026 09:31:04", "2026-09-25 09:31:04", ISO → naive "YYYY-MM-DDTHH:MM:SS" in the statement zone. */
function readStamp(text) {
  const value = String(text || '').trim().replace('Z', '')
  let match = value.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?/)
  if (match) return `${match[1]}-${match[2]}-${match[3]}T${pad2(match[4])}:${match[5]}:${match[6] ?? '00'}`
  match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i)
  if (match) {
    let hour = Number(match[4])
    if (match[7]) hour = (hour % 12) + (/pm/i.test(match[7]) ? 12 : 0)
    return `${match[3]}-${pad2(match[1])}-${pad2(match[2])}T${pad2(hour)}:${match[5]}:${match[6] ?? '00'}`
  }
  return null
}
const readSide = (text) => {
  const value = String(text || '').trim().toLowerCase()
  if (['buy', 'b', 'bot', 'bought', 'buytocover', 'buy to cover', 'bid'].includes(value)) return 'buy'
  if (['sell', 's', 'sld', 'sold', 'sellshort', 'sell short', 'ask'].includes(value)) return 'sell'
  return null
}
const readNumber = (text) => {
  const value = String(text ?? '').replace(/[$,\s]/g, '')
  if (value === '') return null
  const parsed = Number(value.startsWith('(') ? `-${value.slice(1, -1)}` : value)
  return Number.isFinite(parsed) ? parsed : NaN
}

/** Everything the preview needs; writes nothing. */
export function previewImport(file, options) {
  const rows = parseCSV(file.text)
  const headers = (rows[0] ?? []).map((header) => header.trim())
  const body = rows.slice(1)
  const fileErrors = []
  if (!headers.length) fileErrors.push('The file is empty.')
  const summaryLike = headers.some((header) => /entry.?price/i.test(header)) && headers.some((header) => /exit.?price/i.test(header))
  if (summaryLike) fileErrors.push('This looks like a trade summary (an entry and an exit per row). Import the executions or orders export instead; fills are never inferred from summaries.')
  const detected = options.format
    ? IMPORT_FORMATS.find((format) => format.id === options.format)
    : IMPORT_FORMATS.find((format) => format.needs?.every((need) => headers.includes(need))) ?? IMPORT_FORMATS.at(-1)
  const generic = detected.id === 'executions-csv/v1'
  const suggested = suggestMapping(headers)
  const mapping = generic ? (Object.keys(options.mapping).length ? options.mapping : suggested.mapping) : detected.map
  const feeColumns = generic ? (options.fees ?? suggested.fees) : detected.map.fees ?? []
  const column = (name) => (name ? headers.indexOf(name) : -1)
  const cell = (row, name) => { const index = column(name); return index >= 0 ? (row[index] ?? '').trim() : '' }
  const accountColumn = mapping.account
  const sourceAccounts = accountColumn ? [...new Set(body.map((row) => cell(row, accountColumn)).filter(Boolean))] : []
  if (generic && !summaryLike && (!(mapping.datetime || mapping.date) || !mapping.symbol || !mapping.quantity || !mapping.price)) {
    fileErrors.push('Map at least the date and time, symbol, quantity and fill price columns.')
  }
  const points = parsePoints(options.points)
  const known = knownFills()
  const seen = new Set()
  const out = body.map((row, index) => {
    const number = index + 2
    const status = cell(row, mapping.status)
    if (mapping.status && status && !/fill/i.test(status)) return { row: number, outcome: 'skipped', note: `Status ${status}; only filled orders are fills.` }
    if (options.sourceAccount && accountColumn && cell(row, accountColumn) !== options.sourceAccount) return { row: number, outcome: 'skipped', note: `Account ${cell(row, accountColumn)}, not the one chosen.` }
    const errors = []
    const when = readStamp(mapping.datetime ? cell(row, mapping.datetime) : `${cell(row, mapping.date)} ${cell(row, mapping.time)}`)
    if (!when) errors.push({ column: mapping.datetime ?? mapping.date ?? 'Date', message: 'Could not read this date and time.' })
    const rawSymbol = cell(row, mapping.symbol).replace(/^.*:/, '')
    if (!rawSymbol) errors.push({ column: mapping.symbol ?? 'Symbol', message: 'Needs a symbol.' })
    let quantity = readNumber(cell(row, mapping.quantity))
    let side = mapping.side ? readSide(cell(row, mapping.side)) : quantity > 0 ? 'buy' : quantity < 0 ? 'sell' : null
    if (!mapping.side && quantity != null) quantity = Math.abs(quantity)
    if (mapping.side && !side) errors.push({ column: mapping.side, message: `"${cell(row, mapping.side)}" is not buy or sell.` })
    if (!(quantity > 0)) errors.push({ column: mapping.quantity ?? 'Quantity', message: 'Needs a quantity above zero.' })
    const price = readNumber(cell(row, mapping.price))
    if (!(price > 0)) errors.push({ column: mapping.price ?? 'Price', message: 'Needs a fill price.' })
    const fee = feeColumns.reduce((total, name) => total + Math.abs(readNumber(cell(row, name)) || 0), 0)
    if (errors.length) return { row: number, outcome: 'invalid', errors }
    const currency = (cell(row, mapping.currency) || options.currency || 'USD').toUpperCase()
    const multiplier = Number(cell(row, mapping.multiplier)) || (symbolRoot(rawSymbol) in points || pointValueFor(rawSymbol) !== 1 ? pointValueFor(rawSymbol, points) : Number(options.multiplier) || 1)
    const execution = cell(row, mapping.execution) || cell(row, mapping.order) || null
    const fill = {
      id: uid('fill'), executed_at: when, side, quantity, symbol: rawSymbol.toUpperCase(), price, fee: round(fee, 6), currency, multiplier,
      source: 'import', file_name: file.name, row_number: number, source_execution_id: execution,
    }
    const shape = `${fill.executed_at}|${fill.symbol}|${fill.side}|${fill.quantity}|${fill.price}`
    const duplicate = (execution && known.ids.has(String(execution))) || known.shapes.has(shape) || seen.has(execution ?? shape)
    seen.add(execution ?? shape)
    return { row: number, outcome: duplicate ? 'duplicate' : 'new', fill }
  })
  const counts = { rows: out.length, new: 0, duplicate: 0, invalid: 0, skipped: 0 }
  out.forEach((row) => { counts[row.outcome] += 1 })
  const valid = out.filter((row) => row.fill).map((row) => row.fill)
  const reconciliation = [...new Set(valid.map((fill) => fill.currency))].map((currency) => {
    const list = valid.filter((fill) => fill.currency === currency)
    const { groups, ungrouped } = groupFills(list)
    const results = groups.map((group) => fifo(group, Number(group[0].multiplier) || 1))
    const gross = round(results.reduce((total, item) => total + item.gross, 0))
    const fees = round(list.reduce((total, fill) => total + fill.fee, 0))
    const net = round(gross - fees)
    const statementNet = readNumber(options.statementNet)
    const statementFees = readNumber(options.statementFees)
    const netDiff = statementNet == null || Number.isNaN(statementNet) ? null : round(statementNet - net)
    const feeDiff = statementFees == null || Number.isNaN(statementFees) ? null : round(statementFees - fees)
    const explanations = []
    if (ungrouped.length) explanations.push(`${plural(ungrouped.length, 'fill')} ${ungrouped.length === 1 ? 'leaves' : 'leave'} a position open at the end of the file; they are not realized yet.`)
    if (feeDiff) explanations.push('Fees differ: this file may not itemize every fee (exchange and clearing fees often arrive on the daily statement).')
    const entered = netDiff != null || feeDiff != null
    return { currency, gross, fees, net, statementNet, statementFees, netDiff, feeDiff, explanations, state: !entered ? 'none' : (netDiff || 0) === 0 && (feeDiff || 0) === 0 ? 'match' : 'differs' }
  })
  const needsSource = sourceAccounts.length > 1 && !options.sourceAccount
  return {
    format: detected.id, formatLabel: detected.label, formatNote: detected.note, headers, generic, mapping, fees: feeColumns,
    sourceAccounts, fileErrors, rows: out, counts, reconciliation,
    committable: counts.new > 0 && counts.invalid === 0 && !fileErrors.length && !needsSource,
    newFills: out.filter((row) => row.outcome === 'new').map((row) => row.fill),
  }
}

/* ------------------------------------------------------------ samples */

const SAMPLE_TRADOVATE = [
  'orderId,Account,B/S,Contract,Product,avgPrice,filledQty,Fill Time,Status,Type',
  '8841201,TVDEMO1482,Buy,MNQZ6,MNQ,21450.25,2,09/25/2026 09:31:04,Filled,Market',
  '8841215,TVDEMO1482,Sell,MNQZ6,MNQ,21462.75,2,09/25/2026 09:44:18,Filled,Limit',
  '8841290,TVDEMO1482,Sell,MESZ6,MES,5812.50,1,09/25/2026 10:02:11,Filled,Market',
  '8841302,TVDEMO1482,Buy,MESZ6,MES,5808.25,1,09/25/2026 10:15:40,Filled,Limit',
  '8841377,TVDEMO1482,Buy,MNQZ6,MNQ,21470.00,0,09/25/2026 11:05:02,Canceled,Limit',
  '8841420,TVDEMO1482,Buy,MNQZ6,MNQ,21455.50,3,09/25/2026 13:20:33,Filled,Market',
  '8841437,TVDEMO1482,Sell,MNQZ6,MNQ,21441.00,3,09/25/2026 13:31:09,Filled,Stop',
  '8841502,TVDEMO1482,Buy,MESZ6,MES,5815.00,2,09/25/2026 14:48:51,Filled,Market',
].join('\n')
const SAMPLE_GENERIC = [
  'Exec Time,Ticker,Action,Qty,Fill Price,Commission,Exchange Fee,Exec ID',
  '2026-09-25 09:41:12,NVDA,BOT,150,119.84,0.75,0.12,E-55120',
  '2026-09-25 10:02:45,NVDA,SLD,150,120.61,0.75,0.12,E-55163',
  '2026-09-25 10:30:03,AAPL,SLD,100,229.40,0.50,0.08,E-55201',
  '2026-09-25 10:52:19,AAPL,BOT,100,,0.50,0.08,E-55240',
  '2026-09-25 11:15:37,AMD,BOT,80,161.22,0.40,0.06,E-55288',
  '2026-09-25 11:48:02,AMD,SLD,80,162.05,0.40,0.06,E-55301',
].join('\n')

/* ------------------------------------------------------------ small pieces */

function Feedback({ tone = 'info', children, action }) {
  const Icon = tone === 'error' ? CircleAlert : Info
  return <div className={`im-feedback ${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
    <Icon size={15}/>
    <span>{children}</span>
    {action && <span className="im-feedback-action">{action}</span>}
  </div>
}

function UndoImport({ batch }) {
  const [busy, setBusy] = useState(false)
  if (batch.status !== 'committed') return null
  return <button type="button" className="im-btn" disabled={busy} onClick={() => {
    setBusy(true)
    window.setTimeout(() => {
      setFlash('import', { kind: 'undone', file: batch.file_name })
      undoBatch(batch.id)
    }, 280)
  }}><Undo2 size={13}/> {busy ? 'Undoing…' : 'Undo import'}</button>
}

/* ------------------------------------------------------------ §11 import fills */

function ImportFills({ privacy, flash }) {
  const accounts = loadAccounts().filter((account) => !account.archived)
  const inputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [fileError, setFileError] = useState(null)
  const [options, setOptions] = useState({
    format: '', points: '', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', currency: 'USD', multiplier: '1',
    account: '', statementNet: '', statementFees: '', sourceAccount: '', mapping: {}, fees: null,
  })
  const [preview, setPreview] = useState(null)
  const [checking, setChecking] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [commitError, setCommitError] = useState(null)
  const batches = loadBatches()
  const flashBatch = flash?.kind === 'import' ? batches.find((batch) => batch.id === flash.batch) : null

  const runPreview = (target, nextOptions) => {
    setChecking(true)
    window.setTimeout(() => {
      const result = previewImport(target, nextOptions)
      setPreview(result)
      if (result.generic) setOptions((current) => ({ ...current, mapping: result.mapping, fees: result.fees }))
      setChecking(false)
    }, 180)
  }
  const choose = (picked) => {
    setCommitError(null); setPreview(null); setFileError(null)
    if (picked.size > MAX_BYTES) { setFile(null); setFileError('The file is larger than 1 MiB. Split it by date range.'); return }
    const reset = { ...options, mapping: {}, fees: null, sourceAccount: '' }
    setOptions(reset)
    setFile(picked)
    runPreview(picked, reset)
  }
  const readFile = (blob) => { if (!blob) return; blob.text().then((text) => choose({ name: blob.name, size: blob.size, text })) }
  const set = (key) => (event) => setOptions((current) => ({ ...current, [key]: event.target.value }))
  const remap = (patch) => {
    const next = { ...options, ...patch }
    setOptions(next)
    if (file) runPreview(file, next)
  }
  const commit = () => {
    setCommitting(true); setCommitError(null)
    window.setTimeout(() => {
      const fresh = previewImport(file, options)
      if (fresh.counts.new !== preview.counts.new || fresh.counts.duplicate !== preview.counts.duplicate) {
        setPreview(fresh); setCommitting(false)
        setCommitError('Your fills changed since this preview (for example a duplicate appeared). Update the preview and review it again.')
        return
      }
      const batchId = recordBatchFor(fresh)
      setFlash('import', { kind: 'import', batch: batchId })
    }, 420)
  }
  const recordBatchFor = (result) => {
    const batch = recordBatch({ fileName: file.name, fills: result.newFills, counts: { duplicate: result.counts.duplicate }, account: options.account || null })
    return batch.id
  }

  return <div className="im-import">
    <p className="im-intro">Import a broker export: Tradovate, NinjaTrader, TopstepX, Rithmic and TradingView are recognised from their headers; any other CSV of executions can be mapped column by column. Trade summaries and position averages are refused; fills are never inferred from them.</p>

    <div
      className={`im-drop${dragging ? ' is-drag' : ''}${file ? ' has-file' : ''}`}
      onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => { event.preventDefault(); setDragging(false); readFile(event.dataTransfer.files?.[0]) }}
    >
      <span className="im-drop-icon"><FileSpreadsheet size={18}/></span>
      <div className="im-drop-copy">
        <b>{file ? file.name : 'Statement file (CSV, up to 1 MiB)'}</b>
        <span>{file ? `${(file.size / 1024).toFixed(1)} KB · ${preview ? plural(preview.counts.rows, 'row') : 'reading…'}` : 'Drop a file here, or choose one'}</span>
      </div>
      <label className="im-btn">
        <Upload size={13}/> {file ? 'Choose another' : 'Choose file'}
        <input ref={inputRef} type="file" accept=".csv,.txt,text/csv" aria-label="Statement file" onChange={(event) => { readFile(event.target.files?.[0]); event.target.value = '' }}/>
      </label>
    </div>
    <p className="im-samples">No export handy? Try a sample:
      <button type="button" onClick={() => choose({ name: 'tradovate-orders-2026-09-25.csv', size: SAMPLE_TRADOVATE.length, text: SAMPLE_TRADOVATE })}>Tradovate orders export</button>
      <button type="button" onClick={() => choose({ name: 'my-broker-fills.csv', size: SAMPLE_GENERIC.length, text: SAMPLE_GENERIC })}>Other CSV</button>
    </p>
    {fileError && <Feedback tone="error">{fileError}</Feedback>}

    <div className="im-options">
      <label><span>Format</span>
        <select aria-label="Import format" value={options.format} onChange={set('format')}>
          <option value="">Detect from the file</option>
          {IMPORT_FORMATS.map((format) => <option key={format.id} value={format.id}>{format.label}</option>)}
        </select>
      </label>
      <label><span>Point values (futures, optional)</span><input aria-label="Point values" placeholder="ES=50, MNQ=2" value={options.points} onChange={set('points')}/></label>
      <label><span>Statement timezone</span><input aria-label="Statement timezone" value={options.timezone} onChange={set('timezone')}/></label>
      <label><span>Currency (no column)</span><input aria-label="Import currency" maxLength={3} value={options.currency} onChange={set('currency')}/></label>
      <label><span>Contract multiplier</span><input aria-label="Contract multiplier" inputMode="decimal" value={options.multiplier} onChange={set('multiplier')}/></label>
      <label><span>Journal account</span>
        <select aria-label="Import account" value={options.account} onChange={set('account')}>
          <option value="">No account</option>
          {accounts.map((account) => <option key={account.id} value={account.id}>{account.content.name}</option>)}
        </select>
      </label>
      <label><span>Statement net realized P&L</span><input inputMode="decimal" placeholder="optional" value={options.statementNet} onChange={set('statementNet')}/></label>
      <label><span>Statement fees</span><input inputMode="decimal" placeholder="optional" value={options.statementFees} onChange={set('statementFees')}/></label>
      {file && <div className="im-options-action"><button type="button" className="im-btn" disabled={checking} onClick={() => runPreview(file, options)}><RefreshCw size={13}/> {checking ? 'Checking…' : 'Update preview'}</button></div>}
    </div>

    {preview && !preview.generic && <div className="im-detected" aria-label="Detected format">
      <p><b>{preview.formatLabel}</b> · statement timezone {options.timezone || 'UTC'} · point values from the standard contract specs unless set above</p>
      {preview.formatNote && <small>{preview.formatNote}</small>}
    </div>}

    {preview && preview.sourceAccounts.length > 1 && <label className="im-source"><span>Source account in the file</span>
      <select aria-label="Source account" value={options.sourceAccount} onChange={set('sourceAccount')}>
        <option value="">Choose one</option>
        {preview.sourceAccounts.map((name) => <option key={name}>{name}</option>)}
      </select>
    </label>}

    {preview?.generic && <fieldset className="im-mapping">
      <legend>Column mapping</legend>
      <div className="im-map-grid">{MAP_FIELDS.map(([field, label, hint]) => <label key={field}>
        <span>{label} {hint && <em>{hint}</em>}</span>
        <select aria-label={`Map ${label}`} value={options.mapping[field] ?? ''} onChange={(event) => {
          const next = { ...options.mapping }
          if (event.target.value) next[field] = event.target.value; else delete next[field]
          remap({ mapping: next })
        }}>
          <option value="">Not mapped</option>
          {preview.headers.map((header) => <option key={header}>{header}</option>)}
        </select>
      </label>)}</div>
      <div className="im-fees">
        <span>Fee columns (summed):</span>
        {preview.headers.map((header) => <label key={header} className="im-check">
          <input type="checkbox" aria-label={`Fee column ${header}`} checked={(options.fees ?? []).includes(header)} onChange={(event) => remap({ fees: event.target.checked ? [...(options.fees ?? []), header] : (options.fees ?? []).filter((item) => item !== header) })}/>
          {header}
        </label>)}
      </div>
    </fieldset>}

    {preview && <PreviewResult preview={preview} privacy={privacy}/>}

    {commitError && <Feedback tone="error">{commitError}</Feedback>}
    {preview?.committable && <button type="button" className="start-day im-commit" disabled={committing} onClick={commit}>
      <Upload size={15}/> {committing ? 'Importing…' : `Import ${preview.counts.new} new fills`}
    </button>}

    {flash?.kind === 'import' && flashBatch && <Feedback action={<UndoImport batch={flashBatch}/>}>
      {flashBatch.status === 'committed'
        ? `Imported ${flashBatch.counts.new} fills from ${flashBatch.file_name}; ${flashBatch.counts.duplicate} duplicates skipped; ${flashBatch.trade_ids.length} trades grouped.`
        : `Import of ${flashBatch.file_name} undone. Its fills are kept as reversed history.`}
    </Feedback>}
    {flash?.kind === 'undone' && <Feedback>Import of {flash.file} undone. Its fills are kept as reversed history.</Feedback>}
  </div>
}

const OUTCOME = { new: 'New', duplicate: 'Duplicate', invalid: 'Invalid', skipped: 'Skipped' }

function PreviewResult({ preview, privacy }) {
  const { counts } = preview
  return <section className="im-preview" aria-label="Import preview">
    {preview.fileErrors.map((error) => <Feedback key={error} tone="error">{error}</Feedback>)}
    <div className="im-counts">
      <p>{counts.rows} rows: {counts.new} new, {counts.duplicate} duplicate, {counts.invalid} invalid, {counts.skipped} skipped.{counts.invalid > 0 ? ' Fix the invalid rows or the mapping; a file with invalid rows is not imported.' : ''}</p>
      <div className="im-count-bar" aria-hidden="true">
        {['new', 'duplicate', 'invalid', 'skipped'].map((key) => counts[key] > 0 && <i key={key} className={key} style={{ flex: counts[key] }}/>)}
      </div>
    </div>
    <details className="im-details">
      <summary>How duplicates are detected</summary>
      <p>A row is a duplicate when its execution or order ID matches a fill already in the journal (or earlier in this file); rows without an ID match on time, symbol, side, quantity and price.</p>
    </details>
    {preview.reconciliation.map((item) => <div key={item.currency} className={`im-recon ${item.state}`} aria-label={`Reconciliation ${item.currency}`}>
      <b>{item.state === 'match' ? 'Statement matches' : item.state === 'differs' ? 'Statement differs' : 'No statement total entered'} ({item.currency})</b>
      <p>Computed from the file (FIFO, from flat at its first row): gross {money(item.gross, { privacy })}, fees {money(item.fees, { privacy, sign: false })}, net {money(item.net, { privacy })}.
        {item.netDiff != null && ` Statement net ${money(item.statementNet, { privacy })}; difference ${money(item.netDiff, { privacy })}.`}
        {item.feeDiff != null && ` Statement fees ${money(item.statementFees, { privacy, sign: false })}; difference ${money(item.feeDiff, { privacy })}.`}</p>
      {item.explanations.length > 0 && <ul>{item.explanations.map((line) => <li key={line}>{line}</li>)}</ul>}
    </div>)}
    {preview.rows.length > 0 && <div className="im-rows">
      <table className="feed-table ws-table compact ledger im-table" aria-label="Preview rows">
        <thead><tr><th>Row</th><th>Outcome</th><th>Fill or problem</th></tr></thead>
        <tbody>{preview.rows.slice(0, 200).map((row) => <tr key={row.row}>
          <td>{row.row}</td>
          <td><span className={`im-outcome ${row.outcome}`}>{OUTCOME[row.outcome]}</span></td>
          <td className="im-fill-cell">
            {row.fill ? `${row.fill.executed_at.replace('T', ' ')} ${row.fill.side} ${row.fill.quantity} ${row.fill.symbol} @ ${privacy ? '••••' : row.fill.price} fee ${row.fill.fee} ${row.fill.currency}` : row.note}
            {row.errors?.map((error, index) => <span key={index} className="im-row-error">{error.column}: {error.message}</span>)}
          </td>
        </tr>)}</tbody>
      </table>
      {preview.rows.length > 200 && <p className="im-muted">Showing the first 200 of {preview.rows.length} rows; the counts cover all of them.</p>}
    </div>}
  </section>
}

/* ------------------------------------------------------------ ungrouped + history */

function UngroupedFills({ privacy }) {
  const fills = loadUngrouped()
  const [selected, setSelected] = useState([])
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(null)
  if (!fills.length) return null
  const toggle = (id) => setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  const split = (fill) => {
    setBusy(fill.id)
    window.setTimeout(() => {
      const { closing, opening } = fill.reversing
      const total = closing + opening
      const closeFee = round(fill.fee * (closing / total), 6)
      const pool = loadUngrouped().flatMap((item) => (item.id !== fill.id ? [item] : [
        { ...item, id: uid('fill'), quantity: closing, fee: closeFee, reversing: undefined },
        { ...item, id: uid('fill'), quantity: opening, fee: round(fill.fee - closeFee, 6), reversing: undefined },
      ]))
      regroup(pool)
      setFlash('import', { kind: 'message', text: `Split the ${fill.symbol} fill at flat: ${closing} closes, ${opening} opens.` })
      notifyData()
    }, 260)
  }
  const group = () => {
    const chosen = fills.filter((fill) => selected.includes(fill.id))
    if (new Set(chosen.map((fill) => `${fill.symbol}|${fill.currency}`)).size > 1) { setError('Select fills of one symbol and currency to make a trade.'); return }
    setBusy('group')
    window.setTimeout(() => {
      const trade = tradeFromFills(chosen.map(({ reversing, ...fill }) => fill), { batch: chosen[0].batch, account: chosen[0].account_id ?? null })
      addTrades([trade])
      saveUngrouped(loadUngrouped().filter((fill) => !selected.includes(fill.id)))
      saveBatches(loadBatches().map((batch) => (batch.id === chosen[0].batch ? { ...batch, trade_ids: [...batch.trade_ids, trade.id] } : batch)))
      setFlash('import', { kind: 'message', text: `Grouped ${plural(chosen.length, 'fill')} into a ${trade.symbol} trade.` })
      notifyData()
    }, 260)
  }
  return <Card title="Ungrouped fills" className="im-ungrouped" aside={<span className="card-count">{fills.length}</span>}>
    <p className="im-muted">Open positions and fills that reverse a position through flat are not grouped automatically. Split a reversing fill at the flat point (the fee is shared by quantity) and both trades group themselves, or select fills of one symbol and currency to make a trade.</p>
    <ul className="im-fill-list">{fills.map((fill) => <li key={fill.id}>
      <label className="im-check">
        <input type="checkbox" checked={selected.includes(fill.id)} onChange={() => toggle(fill.id)} aria-label={`Select fill ${fill.symbol} ${fill.side} ${fill.quantity}`}/>
        <span>{stamp(fill.executed_at)} · <b>{fill.symbol}</b> {fill.side} {fill.quantity} @ {privacy ? '••••' : fill.price} · fee {fill.fee} {fill.currency}</span>
      </label>
      {fill.reversing && <div className="im-reverse">
        Goes through flat: {fill.reversing.closing} closes, {fill.reversing.opening} opens.
        <button type="button" className="im-btn xs" disabled={busy === fill.id} onClick={() => split(fill)}>{busy === fill.id ? 'Splitting…' : 'Split at flat'}</button>
      </div>}
    </li>)}</ul>
    {error && <Feedback tone="error">{error}</Feedback>}
    <button type="button" className="im-btn" disabled={!selected.length || busy === 'group'} onClick={group}>{busy === 'group' ? 'Grouping…' : 'Group selected into a trade'}</button>
  </Card>
}

/** Re-runs flat-to-flat grouping over the ungrouped pool; groups become trades. */
function regroup(pool) {
  const { groups, ungrouped } = groupFills(pool)
  const trades = groups.map((group) => tradeFromFills(group, { batch: group[0].batch, account: group[0].account_id ?? null }))
  addTrades(trades)
  const batches = loadBatches().map((batch) => ({ ...batch, trade_ids: [...batch.trade_ids, ...trades.filter((trade) => trade.batch === batch.id).map((trade) => trade.id)] }))
  saveBatches(batches)
  saveUngrouped(ungrouped)
}

function ImportHistory() {
  const batches = loadBatches()
  if (!batches.length) return null
  return <Card title="Import history" className="im-history">
    <ul>{batches.map((batch) => <li key={batch.id}>
      <div>
        <b>{batch.file_name}</b>
        <small>{new Date(batch.created_at).toLocaleString()} · {batch.counts.new} new, {batch.counts.duplicate} duplicate{batch.trade_ids.length ? ` · ${plural(batch.trade_ids.length, 'trade')}` : ''}</small>
      </div>
      {batch.status === 'undone' ? <span className="im-badge">Undone</span> : <UndoImport batch={batch}/>}
    </li>)}</ul>
  </Card>
}

/* ------------------------------------------------------------ §12 broker sync */

const loadConnections = () => readJSON(KEYS.connections, [])
const saveConnections = (list) => writeJSON(KEYS.connections, list)
const syncSummary = (result) => [
  `${plural(result.new, 'new fill')}`,
  result.duplicate ? `${result.duplicate} already in the journal` : null,
  result.undone ? `${result.undone} from an undone sync, left out` : null,
  result.skipped ? `${result.skipped} skipped` : null,
].filter(Boolean).join(' · ')

function ConnectionRow({ connection, accounts, onChange }) {
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const accountName = accounts.find((account) => account.id === connection.account_id)?.content.name
  const sync = () => {
    setBusy('sync'); setError(null)
    window.setTimeout(() => {
      if (connection.paused) { setBusy(null); setError('Sync refused: this connection is paused until you connect again.'); return }
      const first = !connection.last_sync
      const result = first ? { new: 2, duplicate: 0, undone: 0, skipped: 0 } : { new: 0, duplicate: 2, undone: 0, skipped: 1, notes: ['Order 90412 was cancelled, so it has no fill.'] }
      const next = { ...connection, last_sync: new Date().toISOString(), last_new_count: result.new, result }
      onChange(next)
      if (first) {
        const date = new Date().toISOString().slice(0, 10)
        const base = { symbol: 'MNQZ6', currency: 'USD', multiplier: 2, source: 'import', file_name: `Tradovate sync · ${connection.source_account}` }
        recordBatch({
          fileName: `Tradovate sync · ${connection.source_account}`, account: connection.account_id, counts: { duplicate: 0 },
          fills: [
            { ...base, side: 'buy', quantity: 1, price: 21448.5, fee: 0.62, executed_at: `${date}T10:12:07`, row_number: 1, source_execution_id: `TV-${Date.now()}` },
            { ...base, side: 'sell', quantity: 1, price: 21459.25, fee: 0.62, executed_at: `${date}T10:26:44`, row_number: 2, source_execution_id: `TV-${Date.now() + 1}` },
          ],
        })
      }
      setBusy(null)
    }, 900)
  }
  return <li className="im-conn">
    <div className="im-conn-head">
      <div>
        <b>{connection.source_account}</b>
        <small>{connection.login} · {connection.environment}{accountName ? ` → ${accountName}` : ''}</small>
      </div>
      {connection.paused && <span className="im-badge neg">Paused</span>}
      <div className="im-conn-actions">
        <button type="button" className="im-btn" disabled={!!busy} onClick={sync}><RefreshCw size={13} className={busy === 'sync' ? 'im-spin' : ''}/> {busy === 'sync' ? 'Syncing…' : 'Sync now'}</button>
        <button type="button" className="im-btn icon" aria-label={`Remove ${connection.source_account}`} disabled={!!busy} onClick={() => onChange(null)}><Trash2 size={13}/></button>
      </div>
    </div>
    <p className="im-muted">Last sync {connection.last_sync ? new Date(connection.last_sync).toLocaleString() : 'never'}{connection.last_new_count != null ? ` · ${connection.last_new_count} new` : ''}</p>
    {connection.last_error && <p className="im-error" role="alert">{connection.paused ? `${connection.last_error.replace(/\.?$/, '.')} Connect again with corrected credentials to resume.` : connection.last_error}</p>}
    {connection.result && !connection.last_error && <div className="im-sync-result" aria-label="Sync result">
      <span>{syncSummary(connection.result)}</span>
      {connection.result.notes?.map((note) => <small key={note}>{note}</small>)}
    </div>}
    {error && <Feedback tone="error">{error}</Feedback>}
  </li>
}

const EMPTY_CREDENTIALS = { environment: 'demo', username: '', password: '', appId: '', cid: '', secret: '' }

function BrokerSync() {
  const accounts = loadAccounts().filter((account) => !account.archived)
  const [connections, setConnections] = useState(loadConnections)
  const [credentials, setCredentials] = useState(EMPTY_CREDENTIALS)
  const [found, setFound] = useState(null)
  const [pick, setPick] = useState({ source: '', account: '' })
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const update = (list) => { setConnections(list); saveConnections(list) }
  const set = (key) => (event) => { setCredentials((current) => ({ ...current, [key]: event.target.value })); setFound(null) }
  const complete = Object.values(credentials).every((value) => String(value).trim())
  const findAccounts = () => {
    setBusy('find'); setError(null)
    window.setTimeout(() => {
      setBusy(null)
      if (credentials.password === 'wrong') { setError('Tradovate refused the sign-in: check the username, password and API key.'); return }
      const stem = (credentials.environment === 'demo' ? 'DEMO' : 'LIVE') + String(Math.abs(credentials.username.split('').reduce((total, char) => total * 31 + char.charCodeAt(0), 7)) % 900000 + 100000)
      const list = [stem, `${stem}-2`]
      setFound(list); setPick({ source: list[0], account: '' })
    }, 700)
  }
  const connect = () => {
    setBusy('connect')
    window.setTimeout(() => {
      const paused = credentials.password === 'expired'
      update([...connections, {
        id: uid('conn'), broker: 'tradovate', source_account: pick.source, login: credentials.username.trim(), environment: credentials.environment,
        account_id: pick.account || null, last_sync: null, last_new_count: null, paused, last_error: paused ? 'Tradovate rejected the saved credentials' : null,
      }])
      setCredentials(EMPTY_CREDENTIALS); setFound(null); setBusy(null)
    }, 600)
  }
  return <Card title="Sync from Tradovate" className="im-broker" aside={<span className="ws-hint">Every 15 minutes</span>}>
    <section aria-label="Broker sync">
      <p className="im-muted">Fills arrive every 15 minutes, deduplicated against imports of the Tradovate orders export. Tradovate only returns recent sessions, so import older history from the export.</p>
      {connections.length > 0 && <ul className="im-conns">{connections.map((connection) => <ConnectionRow
        key={connection.id} connection={connection} accounts={accounts}
        onChange={(next) => update(next ? loadConnections().map((item) => (item.id === connection.id ? next : item)) : connections.filter((item) => item.id !== connection.id))}
      />)}</ul>}
      <details className="im-connect" open={!connections.length}>
        <summary>Connect a Tradovate account</summary>
        <p className="im-muted">Needs a Tradovate API key (Application Settings → API Access). The password and secret are encrypted on the server and never shown again.</p>
        <div className="im-connect-grid">
          <label><span>Environment</span><select value={credentials.environment} onChange={set('environment')} autoComplete="off"><option value="live">Live</option><option value="demo">Demo (simulation)</option></select></label>
          <label><span>Username</span><input value={credentials.username} onChange={set('username')} autoComplete="off"/></label>
          <label><span>Password</span><input type="password" value={credentials.password} onChange={set('password')} autoComplete="off"/></label>
          <label><span>App ID</span><input value={credentials.appId} onChange={set('appId')} autoComplete="off"/></label>
          <label><span>CID</span><input value={credentials.cid} onChange={set('cid')} autoComplete="off"/></label>
          <label><span>Secret</span><input type="password" value={credentials.secret} onChange={set('secret')} autoComplete="off"/></label>
        </div>
        {error && <Feedback tone="error">{error}</Feedback>}
        {!found && <button type="button" className="im-btn" disabled={!complete || busy === 'find'} onClick={findAccounts}>{busy === 'find' ? 'Signing in…' : 'Find accounts'}</button>}
        {found && <div className="im-found">
          <label><span>Tradovate account</span><select value={pick.source} onChange={(event) => setPick({ ...pick, source: event.target.value })}>{found.map((name) => <option key={name}>{name}</option>)}</select></label>
          <label><span>File under</span><select value={pick.account} onChange={(event) => setPick({ ...pick, account: event.target.value })}>
            <option value="">No journal account</option>
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.content.name}</option>)}
          </select></label>
          <button type="button" className="start-day im-connect-btn" disabled={busy === 'connect'} onClick={connect}>{busy === 'connect' ? 'Connecting…' : 'Connect'}</button>
        </div>}
      </details>
    </section>
  </Card>
}

/* ------------------------------------------------------------ page */

// Designs by RNSENCE Studio
export function ImportPage({ privacy, setPage }) {
  const [flash] = useState(() => peekFlash('import'))
  React.useEffect(() => { clearFlash('import') }, [])
  const [sheet, setSheet] = useState(false)
  const batches = loadBatches()
  const committed = batches.filter((batch) => batch.status === 'committed')
  const ungrouped = loadUngrouped()
  const connections = loadConnections()
  const imported = committed.reduce((total, batch) => total + batch.counts.new, 0)
  const trades = committed.reduce((total, batch) => total + batch.trade_ids.length, 0)
  const dupes = batches.reduce((total, batch) => total + batch.counts.duplicate, 0)

  return <div className="page home ws-page im-page">
    <PageHead
      title="Import"
      meta={`${plural(committed.length, 'import')} · ${plural(ungrouped.length, 'ungrouped fill')} · ${plural(connections.length, 'broker connection')}`}
      actions={<>
        {setPage && <button className="ws-outline" onClick={() => setPage('Trades')}>Open trades</button>}
        <button className="start-day" onClick={() => setSheet(true)}><Plus size={16} strokeWidth={2.2}/> Add fills</button>
      </>}
    />

    <MetricStrip items={[
      { label: 'Fills imported', value: String(imported), sub: `${committed.length} ${committed.length === 1 ? 'batch' : 'batches'} in history` },
      { label: 'Trades grouped', value: String(trades), sub: 'Flat to flat, from the fills' },
      { label: 'Ungrouped fills', value: String(ungrouped.length), sub: ungrouped.length ? 'Open or reversing positions' : 'Nothing waiting' },
      { label: 'Duplicates skipped', value: String(dupes), sub: 'Never imported twice' },
    ]}/>

    {flash?.kind === 'manual' && <p className="im-status" role="status">{flash.text}</p>}
    {flash?.kind === 'message' && <p className="im-status" role="status">{flash.text}</p>}

    <div className="ws-grid two-one im-layout">
      <Card title="Import fills" aside={<span className="ws-hint">Preview, map and check a statement before anything is saved</span>}>
        <ImportFills privacy={privacy} flash={flash}/>
      </Card>
      <div className="im-side">
        <BrokerSync/>
        <UngroupedFills privacy={privacy}/>
        <ImportHistory/>
      </div>
    </div>

    {sheet && <Sheet title="Add fills" subtitle="Enter the fills; the P&L, direction and holding time come from them." onClose={() => setSheet(false)} width={580} className="tr-sheet">
      <ManualFillsForm privacy={privacy} onCancel={() => setSheet(false)} onSaved={(batch) => setFlash('import', { kind: 'manual', text: recordedMessage(batch) })}/>
    </Sheet>}
  </div>
}
