import React from 'react'
import { Circle, CircleCheck, MousePointer2, Rocket } from 'lucide-react'
import { tradeLog } from '../data'
import './getting-started.css'

const STORE = 'cc-getting-started'
const readStore = () => { try { return JSON.parse(localStorage.getItem(STORE)) || {} } catch { return {} } }
const writeStore = (value) => { try { localStorage.setItem(STORE, JSON.stringify(value)) } catch { /* private mode */ } }

const FIRMS = [
  ['Apex', '/assets/marks/apex.png'], ['Topstep', '/assets/marks/topstep.png'],
  ['Tradeify', '/assets/marks/tradeify.png'], ['MyFundedFutures', '/assets/marks/mff.png'],
]

const STEPS = [
  { id: 'connect', label: 'Add connections', page: 'Accounts' },
  { id: 'import', label: 'Import your trades', page: 'Import' },
  { id: 'playbook', label: 'Build a playbook', page: 'Playbooks' },
  { id: 'journal', label: 'Write a journal entry', page: 'Daily journal' },
  { id: 'log', label: 'Log your first trade', page: 'Trades', done: () => tradeLog.length > 0 },
]

/**
 * How much of the card the sidebar has room for: 'full', 'compact' (no logo band) or 'folded' (header only).
 * Room is judged against the nav's full content height, so the choice holds steady while the fold animates.
 */
function useSidebarFit(bandPending) {
  const ref = React.useRef(null)
  const bandHeight = React.useRef(110)
  const [tier, setTier] = React.useState('full')
  React.useLayoutEffect(() => {
    const card = ref.current, nav = card?.closest('.sidebar')?.querySelector('nav')
    if (!nav) return undefined
    const fit = () => {
      const band = card.querySelector('.gs-band')
      if (band) { const css = getComputedStyle(band); bandHeight.current = band.offsetHeight + parseFloat(css.marginTop) + parseFloat(css.marginBottom) }
      const extra = bandPending && !band ? bandHeight.current : 0
      const full = card.querySelector('.gs-list').scrollHeight + extra
      const compact = full - (bandPending ? bandHeight.current : 0)
      const last = nav.lastElementChild
      const content = last.getBoundingClientRect().bottom - nav.getBoundingClientRect().top + nav.scrollTop + parseFloat(getComputedStyle(nav).paddingBottom)
      // the nav and the fold share the column, so their sum stays put while the fold animates
      const shared = nav.clientHeight + card.querySelector('.gs-fold').getBoundingClientRect().height
      setTier(content <= shared - full ? 'full' : content <= shared - compact ? 'compact' : 'folded')
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(card.closest('.sidebar'))
    for (const child of nav.children) observer.observe(child)
    return () => observer.disconnect()
  }, [bandPending])
  return [ref, tier]
}

/** Sidebar onboarding checklist: open steps first, finished ones struck through at the bottom. */
export function GettingStarted({ go }) {
  const [state, setState] = React.useState(readStore)
  const [hover, setHover] = React.useState(1)
  const update = (patch) => setState(prev => { const next = { ...prev, ...patch }; writeStore(next); return next })
  // a stored choice wins, so a step finished automatically can still be unchecked by hand
  const isDone = (step) => state[step.id] ?? !!step.done?.()
  const steps = [...STEPS.filter(step => !isDone(step)), ...STEPS.filter(isDone)]
  const done = STEPS.length - STEPS.filter(step => !isDone(step)).length
  const open = (step) => { update({ [step.id]: true }); go(step.page)() }
  const toggle = (step) => isDone(step) ? update({ [step.id]: false }) : open(step)
  const bandPending = !isDone(STEPS[0])
  const [cardRef, tier] = useSidebarFit(bandPending)
  // until the user folds or opens the card themselves, it gives way so the nav never has to scroll
  const collapsed = state.collapsed ?? tier === 'folded'

  return <section ref={cardRef} className={`gs-card${collapsed ? ' is-collapsed' : ''}`} aria-label="Getting started">
    <button type="button" className="gs-head" aria-expanded={!collapsed} onClick={() => update({ collapsed: !collapsed })}>
      <Rocket className="gs-rocket" size={17} strokeWidth={1.9} aria-hidden="true"/>
      <b>Getting started</b>
      <span className="gs-count">{done} of {STEPS.length}</span>
    </button>
    <div className="gs-fold" inert={collapsed}>
      <ul className="gs-list">
        {steps.map(step => {
          const finished = isDone(step)
          return <li key={step.id}>
            <button type="button" className={`gs-step${finished ? ' is-done' : ''}`} aria-pressed={finished} onClick={() => toggle(step)}>
              {finished
                ? <CircleCheck className="gs-check" size={17} strokeWidth={2.4} aria-hidden="true"/>
                : <Circle className="gs-pending" size={17} strokeWidth={2.2} aria-hidden="true"/>}
              <span>{step.label}</span>
            </button>
            {step.id === 'connect' && !finished && tier === 'full' && <div className="gs-band" onMouseLeave={() => setHover(1)}>
              <span className="gs-mesh" aria-hidden="true"/>
              <div className="gs-tiles">
                {FIRMS.map(([firm, src], index) => <button
                  key={firm} type="button" className={`gs-tile${hover === index ? ' is-hover' : ''}`}
                  aria-label={`Connect ${firm}`} onMouseEnter={() => setHover(index)} onFocus={() => setHover(index)} onClick={() => open(step)}
                >
                  <img src={src} alt="" width="24" height="24"/>
                  {hover === index && <>
                    <span className="gs-tip" role="tooltip">Connect {firm}</span>
                    <MousePointer2 className="gs-cursor" size={21} strokeWidth={1.6} aria-hidden="true"/>
                  </>}
                </button>)}
              </div>
            </div>}
          </li>
        })}
      </ul>
    </div>
  </section>
}
