/**
 * Drop-in replacement for <select>: the control on the page is still the native element (so every existing
 * style and form rule keeps working), but the OS menu never opens. Clicks and the usual keys open the app's
 * own floating menu instead, and picking an option calls onChange with the same `event.target.value` shape.
 */
import React, { Children, isValidElement, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check } from 'lucide-react'
import { useFloat } from './port/notebook-pickers'

const textOf = (node) => (node == null || typeof node === 'boolean' ? '' : Array.isArray(node) ? node.map(textOf).join('') : isValidElement(node) ? textOf(node.props.children) : String(node))

/** <option> children → [{ value, label, disabled }], through fragments and arrays. */
function readOptions(children) {
  const out = []
  const walk = (nodes) => Children.forEach(nodes, (node) => {
    if (!isValidElement(node)) return
    if (node.type === 'option') {
      const label = textOf(node.props.children)
      out.push({ value: String(node.props.value ?? label), label, disabled: !!node.props.disabled })
    } else if (node.props?.children) walk(node.props.children)
  })
  walk(children)
  return out
}

export function Select({ value, onChange, children, disabled, onKeyDown, onMouseDown, name, ...rest }) {
  const ref = useRef(null)
  const panelRef = useRef(null)
  const typed = useRef({ text: '', at: 0 })
  const id = useId().replace(/:/g, '')
  const [open, setOpen] = useState(false)
  const options = readOptions(children)
  const current = String(value ?? '')
  const [cursor, setCursor] = useState(0)
  // a select wrapped in a labelled control (e.g. "Group by · Setup") anchors the menu to the whole control
  const anchor = useRef({ get current() { return ref.current?.closest('.rp-ctl') ?? ref.current } }).current
  const width = Math.min(Math.max(anchor.current?.getBoundingClientRect().width ?? 180, 180), 320)
  const place = useFloat(open, anchor, Math.min(options.length, 9) * 32 + 12, width, panelRef)

  const show = () => {
    if (disabled || !options.length) return
    setCursor(Math.max(0, options.findIndex((option) => option.value === current)))
    setOpen(true)
  }
  const pick = (option) => {
    if (!option || option.disabled) return
    setOpen(false)
    ref.current?.focus()
    if (option.value === current) return
    onChange?.({ target: { value: option.value, name, type: 'select-one' }, currentTarget: ref.current, preventDefault() {}, stopPropagation() {} })
  }
  const step = (from, delta) => {
    for (let i = 1; i <= options.length; i += 1) {
      const next = (from + delta * i + options.length * 4) % options.length
      if (!options[next].disabled) return next
    }
    return from
  }

  useEffect(() => {
    if (!open) return undefined
    const away = (event) => { if (!anchor.current?.contains(event.target) && !panelRef.current?.contains(event.target)) setOpen(false) }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])
  useEffect(() => { if (open) panelRef.current?.querySelector(`[data-i="${cursor}"]`)?.scrollIntoView({ block: 'nearest' }) }, [cursor, open, place])
  // When the select sits inside a labelled control, a press anywhere on that control (its label text, caret or
  // padding) toggles the menu too; otherwise those presses only focused the select and needed a second click.
  const toggleRef = useRef(null)
  toggleRef.current = () => { ref.current?.focus(); if (open) setOpen(false); else show() }
  useEffect(() => {
    const wrap = ref.current?.closest('.rp-ctl')
    if (!wrap) return undefined
    const press = (event) => {
      if (event.button !== 0 || event.target === ref.current || disabled) return
      event.preventDefault()
      toggleRef.current()
    }
    wrap.addEventListener('mousedown', press)
    return () => wrap.removeEventListener('mousedown', press)
  }, [disabled])

  const keys = (event) => {
    onKeyDown?.(event)
    if (event.defaultPrevented || disabled) return
    const { key } = event
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(key)) { event.preventDefault(); show() }
      return
    }
    if (key === 'ArrowDown') { event.preventDefault(); setCursor((i) => step(i, 1)) }
    else if (key === 'ArrowUp') { event.preventDefault(); setCursor((i) => step(i, -1)) }
    else if (key === 'Home') { event.preventDefault(); setCursor(step(-1, 1)) }
    else if (key === 'End') { event.preventDefault(); setCursor(step(options.length, -1)) }
    else if (key === 'Enter' || key === ' ') { event.preventDefault(); pick(options[cursor]) }
    else if (key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false) }
    else if (key === 'Tab') setOpen(false)
    else if (key.length === 1 && /\S/.test(key)) {
      // type-ahead: letters typed in quick succession jump to the first matching option
      const now = performance.now()
      typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : '') + key.toLowerCase(), at: now }
      const hit = options.findIndex((option) => !option.disabled && option.label.toLowerCase().startsWith(typed.current.text))
      if (hit >= 0) setCursor(hit)
    }
  }

  return <>
    <select
      ref={ref} value={value} name={name} disabled={disabled} onChange={onChange} {...rest}
      aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? `cs-${id}` : undefined}
      aria-activedescendant={open ? `cs-${id}-${cursor}` : undefined}
      onMouseDown={(event) => {
        onMouseDown?.(event)
        if (event.button !== 0 || disabled) return
        event.preventDefault() // keeps the OS menu closed
        ref.current?.focus()
        if (open) setOpen(false); else show()
      }}
      onKeyDown={keys}
    >{children}</select>
    {open && place && createPortal(<div ref={panelRef} id={`cs-${id}`} role="listbox" aria-label={rest['aria-label']}
      className={`cs-menu${place.up ? ' is-up' : ''}`} style={{ left: place.left, top: place.top, width: place.width, maxHeight: Math.min(place.maxHeight, 320) }}
      onMouseDown={(event) => event.preventDefault()}>
      {options.map((option, index) => <div
        key={`${option.value}-${index}`} id={`cs-${id}-${index}`} data-i={index} role="option"
        aria-selected={option.value === current} aria-disabled={option.disabled || undefined}
        className={`cs-option${index === cursor ? ' is-cursor' : ''}${option.value === current ? ' is-picked' : ''}${option.disabled ? ' is-disabled' : ''}`}
        onMouseEnter={() => !option.disabled && setCursor(index)} onClick={() => pick(option)}
      >
        <span>{option.label || '—'}</span>
        {option.value === current && <Check size={14} strokeWidth={2.4} aria-hidden="true"/>}
      </div>)}
    </div>, document.body)}
  </>
}
