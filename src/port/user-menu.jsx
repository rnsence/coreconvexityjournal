import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { APPEARANCE_EVENT, readAppearance, setAppearance } from './settings-data'
import './user-menu.css'

const THEMES = [['light', Sun, 'Light'], ['dark', Moon, 'Dark'], ['system', Monitor, 'System']]
const OPEN_DELAY = 90
const CLOSE_DELAY = 180
const GLIDE = 'cubic-bezier(.32,.72,0,1)'
const SETTLE = 'cubic-bezier(.4,0,.6,1)'
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
// Safari still wants the prefixed property for animated clip paths on HTML elements
const clipKey = () => (typeof CSS !== 'undefined' && CSS.supports?.('clip-path', 'inset(0px round 4px)') ? 'clipPath' : 'webkitClipPath')

/**
 * Account menu on the sidebar's profile row. Open, one grey frame grows up out of the row and wraps a white
 * plate of actions above it, so the row and its menu read as a single card. Hover opens it (with a grace period
 * so the pointer can cross into the plate), click or Enter toggles it for touch and keyboard, and Escape or an
 * outside click closes it.
 */
export function UserMenu({ go, children }) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [theme, setTheme] = useState(readAppearance)
  const anchorRef = useRef(null)
  const frameRef = useRef(null)
  const timer = useRef(null)
  const running = useRef([])

  const later = (fn, ms) => { clearTimeout(timer.current); timer.current = setTimeout(fn, ms) }
  const show = useCallback(() => { clearTimeout(timer.current); setMounted(true); setOpen(true) }, [])
  const hide = useCallback(() => { clearTimeout(timer.current); setOpen(false) }, [])

  /* The glide runs through the Web Animations API with measured pixels, so it doesn't depend on CSS variables
     inside keyframes: the frame is revealed from the row upward while the plate lifts in behind it, and closing
     runs the same path back down before the frame leaves the DOM. Reduced motion gets a short fade instead. */
  useLayoutEffect(() => {
    const frame = frameRef.current
    if (!mounted || !frame?.animate) { if (!open) setMounted(false); return undefined }
    const plate = frame.firstElementChild
    const row = anchorRef.current.querySelector('.profile-button')
    const rest = frame.offsetHeight - (row?.offsetHeight ?? 38) - 10
    const key = clipKey()
    const shut = { [key]: `inset(${Math.max(0, rest)}px 0px 0px 0px round 15px)` }
    const full = { [key]: 'inset(0px 0px 0px 0px round 15px)' }
    running.current.forEach((animation) => animation.cancel())
    frame.classList.add('is-gliding')
    if (reducedMotion()) {
      running.current = [frame.animate([{ opacity: open ? 0 : 1 }, { opacity: open ? 1 : 0 }], { duration: 140, easing: 'ease-out', fill: 'both' })]
    } else if (open) {
      running.current = [
        frame.animate([shut, full], { duration: 600, easing: GLIDE, fill: 'both' }),
        plate.animate([{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: 620, delay: 50, easing: GLIDE, fill: 'both' }),
      ]
    } else {
      running.current = [
        frame.animate([full, shut], { duration: 320, easing: SETTLE, fill: 'both' }),
        plate.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(12px)' }], { duration: 300, easing: SETTLE, fill: 'both' }),
      ]
    }
    running.current[0].finished.then(() => { frame.classList.remove('is-gliding'); if (!open) setMounted(false) }, () => {})
    return undefined
  }, [open, mounted])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => { if (event.key === 'Escape') { hide(); anchorRef.current?.querySelector('.profile-button')?.focus() } }
    const onDown = (event) => { if (!anchorRef.current?.contains(event.target)) hide() }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown) }
  }, [open, hide])

  // ⌘, opens settings from anywhere, as the menu advertises
  useEffect(() => {
    const onKey = (event) => { if ((event.metaKey || event.ctrlKey) && event.key === ',') { event.preventDefault(); go('Settings')() } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [go])

  useEffect(() => {
    const sync = () => setTheme(readAppearance())
    window.addEventListener(APPEARANCE_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => { window.removeEventListener(APPEARANCE_EVENT, sync); window.removeEventListener('storage', sync) }
  }, [])

  const [legalOpen, setLegalOpen] = useState(false)
  useEffect(() => { if (!open) setLegalOpen(false) }, [open])
  const pick = (page) => () => { hide(); go(page)() }
  // the frame glides up off a still pointer, which reports a leave; only a move out of the whole card counts
  const leave = (event) => { if (!(event.relatedTarget instanceof Node && anchorRef.current?.contains(event.relatedTarget))) later(hide, CLOSE_DELAY) }

  return <div className={`um-anchor${open ? ' is-open' : ''}${mounted ? ' has-frame' : ''}`} ref={anchorRef} onMouseEnter={() => later(show, OPEN_DELAY)} onMouseLeave={leave}>
    {mounted && <div ref={frameRef} className={`um-frame${open ? ' is-open' : ' is-leaving'}`} aria-hidden={!open}>
      <div id="user-menu" role="menu" aria-label="Account" className="um-plate">
        <div className="um-group">
          <button type="button" role="menuitem" className="um-item" onClick={pick('Profile')}>Profile</button>
          <button type="button" role="menuitem" className="um-item" onClick={pick('Settings')}>Settings<kbd>⌘ ,</kbd></button>
          <div className="um-item um-theme" role="none">
            Theme
            <span className="um-seg" role="radiogroup" aria-label="Theme">
              {THEMES.map(([value, Icon, label]) => <button
                key={value} type="button" role="radio" aria-checked={theme === value} aria-label={label} title={label}
                className={theme === value ? 'active' : ''} onClick={() => { setAppearance(value); setTheme(value) }}
              ><Icon size={13} strokeWidth={1.9}/></button>)}
            </span>
          </div>
        </div>
        <div className="um-group">
          {/* Legal unfolds its three pages in place on click (the menu clips anything beside it) */}
          <div className={`um-legal${legalOpen ? ' is-open' : ''}`} role="none">
            <button type="button" role="menuitem" aria-expanded={legalOpen} className="um-item um-legal-head" onClick={() => setLegalOpen((value) => !value)}>Legal</button>
            <div className="um-legal-body" inert={!legalOpen}><div>
              {['Privacy', 'Terms', 'Disclaimer'].map((page) => <button key={page} type="button" role="menuitem" className="um-item um-sub" onClick={pick(page)}>{page}</button>)}
            </div></div>
          </div>
          <button type="button" role="menuitem" className="um-item" onClick={pick('Support')}>Support</button>
        </div>
        <div className="um-group">
          <button type="button" role="menuitem" className="um-item" onClick={hide}>Sign out</button>
        </div>
      </div>
    </div>}
    {children({ open, toggle: () => (open ? hide() : show()), menuId: 'user-menu' })}
  </div>
}
