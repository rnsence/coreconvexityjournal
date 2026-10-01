/**
 * Fill-leg entry for a new trade ("Log trade" / "Add fills") and for converting a
 * typed-P&L trade into the fills it came from.
 */
import React, { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Field } from '../dialogs'
import { money } from '../viz'
import { KEYS, groupFills, loadAccounts, pointValueFor, readJSON, recordBatch, uid, writeJSON } from './trading-data'
import { Select } from '../select'
import './trades.css'

const pad2 = (value) => String(value).padStart(2, '0')
const todayUtc = () => new Date().toISOString().slice(0, 10)

/** Legs guessed from a typed trade: entry then exit, five minutes apart. */
export function legsFromTypedTrade(trade) {
  const date = trade.date ?? todayUtc()
  const [hour = 9, minute = 30] = (trade.time ?? '09:30').split(':').map(Number)
  const rising = trade.exit == null || trade.entry == null ? true : trade.exit >= trade.entry
  const long = trade.pnl >= 0 ? rising : !rising
  const exitMinutes = hour * 60 + minute + 5
  const at = (h, m) => `${date}T${pad2(h)}:${pad2(m)}:00`
  const fee = trade.fees ? String(Math.round((trade.fees / 2) * 100) / 100) : '0'
  return [
    { side: long ? 'buy' : 'sell', quantity: String(trade.qty ?? 1), price: String(trade.entry ?? ''), fee, at: at(hour, minute) },
    { side: long ? 'sell' : 'buy', quantity: String(trade.qty ?? 1), price: String(trade.exit ?? ''), fee, at: at(Math.floor(exitMinutes / 60), exitMinutes % 60) },
  ]
}

const defaultLegs = () => {
  const date = todayUtc()
  return [
    { side: 'buy', quantity: '1', price: '', fee: '0', at: `${date}T09:30:00` },
    { side: 'sell', quantity: '1', price: '', fee: '0', at: `${date}T09:35:00` },
  ]
}

/** §10 ManualFillsForm. `trade` switches to conversion mode. */
export function ManualFillsForm({ trade = null, privacy, onCancel, onSaved }) {
  const accounts = loadAccounts().filter((account) => !account.archived)
  const conversion = !!trade
  const [form, setForm] = useState(() => ({
    account: trade?.account ?? accounts[0]?.id ?? '', symbol: trade?.symbol ?? '', currency: 'USD',
    multiplier: String(trade?.multiplier ?? (trade ? pointValueFor(trade.symbol) : '1')),
    assetClass: '', underlying: '', expiry: '', strike: '', right: '', notes: '', tags: '',
  }))
  const [legs, setLegs] = useState(() => (trade ? legsFromTypedTrade(trade) : defaultLegs()))
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))
  const setLeg = (index, key) => (event) => setLegs((current) => current.map((leg, position) => (position === index ? { ...leg, [key]: event.target.value } : leg)))

  const submit = (event) => {
    event.preventDefault()
    const symbol = form.symbol.trim().toUpperCase()
    const currency = form.currency.trim().toUpperCase()
    const multiplier = Number(form.multiplier.trim() || '1')
    const fills = legs.map((leg) => ({
      id: uid('fill'), symbol, currency, multiplier, side: leg.side, quantity: Number(leg.quantity), price: Number(leg.price),
      fee: Number(leg.fee.trim() || '0'), executed_at: leg.at.length === 16 ? `${leg.at}:00` : leg.at, source: 'manual',
      asset_class: form.assetClass || null, underlying: form.underlying.trim() || null,
      ...(form.assetClass === 'option' ? { expiry: form.expiry || null, strike: form.strike || null, option_right: form.right || null } : {}),
    }))
    if (fills.some((fill) => !(fill.quantity > 0) || !(fill.price > 0) || !fill.executed_at)) { setError('Every fill needs a quantity, a price and a time.'); return }
    if (conversion && !groupFills(fills).groups.length) { setError('These fills leave a position open, so they cannot replace the typed P&L yet. Add the fill that brings it back to flat.'); return }
    setError(null)
    setSaving(true)
    window.setTimeout(() => {
      const batch = recordBatch({
        fileName: conversion ? `Fills for ${trade.symbol}` : 'Manual entry', fills, account: form.account || null,
        replaces: conversion ? trade : null, meta: { setup: conversion ? trade.setup : 'Manual fills', code: 'MAN' },
      })
      if (!conversion && (form.notes.trim() || form.tags.trim())) {
        const reviews = readJSON(KEYS.reviews, {})
        batch.trade_ids.forEach((id) => {
          reviews[id] = { ...(reviews[id] || {}), notes: form.notes.trim(), tags: form.tags.split(',').map((tag) => tag.trim().toLowerCase()).filter(Boolean) }
        })
        writeJSON(KEYS.reviews, reviews)
      }
      onSaved?.(batch)
    }, 220)
  }

  return <form className="tr-form" onSubmit={submit}>
    {conversion && <p className="tx-callout">These legs start from the typed entry, exit and contracts. Check the side, times, fees and multiplier: the P&L will be recomputed from these fills and replace the typed {money(trade.pnl, { privacy })}. Undoing this entry from the import history brings the typed P&L back.</p>}
    <div className="dlg-grid">
      <Field label="Account">
        <Select required value={form.account} onChange={set('account')}>
          <option value="" disabled>Select account</option>
          {accounts.map((account) => <option key={account.id} value={account.id}>{account.content.name}</option>)}
        </Select>
      </Field>
      <Field label="Symbol"><input required maxLength={40} placeholder="ESZ6" value={form.symbol} onChange={set('symbol')}/></Field>
      <Field label="Currency"><input required pattern="[A-Za-z]{3}" maxLength={3} value={form.currency} onChange={set('currency')}/></Field>
      <Field label="Multiplier (point value)"><input required inputMode="decimal" placeholder="50" value={form.multiplier} onChange={set('multiplier')}/></Field>
      <Field label="Asset class">
        <Select value={form.assetClass} onChange={set('assetClass')}>
          <option value="">From the symbol</option>
          <option value="stock">Stock or ETF</option><option value="future">Future</option><option value="option">Option</option>
          <option value="crypto">Crypto</option><option value="forex">Forex</option>
        </Select>
      </Field>
      <Field label="Underlying"><input maxLength={20} placeholder="Optional" value={form.underlying} onChange={set('underlying')}/></Field>
      {form.assetClass === 'option' && <>
        <Field label="Expiry"><input type="date" value={form.expiry} onChange={set('expiry')}/></Field>
        <div className="tr-pair">
          <Field label="Strike"><input inputMode="decimal" value={form.strike} onChange={set('strike')}/></Field>
          <Field label="Put or call">
            <Select value={form.right} onChange={set('right')}><option value="">—</option><option value="call">Call</option><option value="put">Put</option></Select>
          </Field>
        </div>
      </>}
    </div>

    <fieldset className="tr-fieldset plain">
      <legend>Fills</legend>
      {legs.map((leg, index) => <div className="tr-leg" key={index}>
        <label><span>Side</span><Select value={leg.side} onChange={setLeg(index, 'side')}><option value="buy">Buy</option><option value="sell">Sell</option></Select></label>
        <label><span>Quantity</span><input required inputMode="decimal" value={leg.quantity} onChange={setLeg(index, 'quantity')}/></label>
        <label><span>Price</span><input required inputMode="decimal" value={leg.price} onChange={setLeg(index, 'price')}/></label>
        <label><span>Fee</span><input inputMode="decimal" value={leg.fee} onChange={setLeg(index, 'fee')}/></label>
        <button type="button" className="tx-icon" aria-label={`Remove fill ${index + 1}`} disabled={legs.length === 1} onClick={() => setLegs(legs.filter((_, position) => position !== index))}><X size={14}/></button>
        <label className="tr-leg-time"><span>Time</span><input required type="datetime-local" step="1" value={leg.at} onChange={setLeg(index, 'at')}/></label>
      </div>)}
      <button type="button" className="tx-btn" disabled={legs.length >= 100} onClick={() => setLegs([...legs, { ...legs[legs.length - 1] }])}><Plus size={13}/> Add fill</button>
    </fieldset>

    {!conversion && <div className="dlg-grid">
      <Field label="Notes" wide><textarea rows={3} maxLength={5000} value={form.notes} onChange={set('notes')}/></Field>
      <Field label="Tags, comma separated" wide><input value={form.tags} onChange={set('tags')}/></Field>
    </div>}
    <p className="tr-hint">Fills that bring the position back to flat become one trade. An open position stays as ungrouped fills until it is closed.</p>
    {error && <p className="tr-error" role="alert">{error}</p>}
    <div className="dlg-foot tr-foot">
      <span/>
      <div className="dlg-actions">
        <button type="button" className="ws-outline" onClick={onCancel}>Cancel</button>
        <button type="submit" className="start-day" disabled={saving}>{saving ? 'Saving…' : conversion ? 'Replace with fills' : 'Save fills'}</button>
      </div>
    </div>
  </form>
}

/** Status line after a manual entry is recorded. */
export const recordedMessage = (batch) => (batch.trade_ids.length
  ? `Recorded ${batch.counts.new} fills; ${batch.trade_ids.length} trade${batch.trade_ids.length === 1 ? '' : 's'} grouped. Undo it from the import history.`
  : `Recorded ${batch.counts.new} fills; the position is still open, so no trade yet. Undo it from the import history.`)
