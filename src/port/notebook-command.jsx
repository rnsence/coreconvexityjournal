import React, { useCallback, useEffect, useRef, useState } from 'react'
import { applyCommand, COMMAND_PREFIX, CommandError, isRefusal, uuid } from './notebook-data'

const LATENCY = 420

const readIntent = (key) => { try { return JSON.parse(localStorage.getItem(key)) } catch { return null } }
const writeIntent = (key, intent) => { try { localStorage.setItem(key, JSON.stringify(intent)) } catch { /* storage unavailable */ } }
const clearIntent = (key) => { try { localStorage.removeItem(key) } catch { /* storage unavailable */ } }

/**
 * One idempotent journal command per scope. The intent is kept in localStorage
 * until the "server" answers, so a lost response (offline) survives a reload and
 * a retry resends the same key. Coming back online resends it automatically.
 */
export function useCommand(scope) {
  const storageKey = `${COMMAND_PREFIX}${scope}`
  const [pending, setPending] = useState(() => readIntent(storageKey))
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState(null)
  const [isSuccess, setSuccess] = useState(false)
  const inFlight = useRef(false)
  const pendingRef = useRef(pending)
  pendingRef.current = pending

  const run = useCallback((intent, onDone) => {
    inFlight.current = true
    setIsPending(true); setError(null); setSuccess(false)
    setTimeout(() => {
      inFlight.current = false
      setIsPending(false)
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setError(new CommandError(0, 'The network is unavailable. Nothing is lost; retry when you are back online.'))
        return
      }
      try {
        const result = applyCommand(intent)
        clearIntent(storageKey); setPending(null); setSuccess(true)
        onDone?.(result)
      } catch (failure) {
        if (isRefusal(failure)) { clearIntent(storageKey); setPending(null) }
        setError(failure)
      }
    }, LATENCY)
  }, [storageKey])

  const submit = useCallback((intent, onDone) => {
    const full = { ...intent, key: uuid() }
    writeIntent(storageKey, full)
    setPending(full)
    run(full, onDone)
    return full
  }, [run, storageKey])

  const retry = useCallback((onDone) => { if (pendingRef.current) run(pendingRef.current, onDone) }, [run])
  const discardRetry = useCallback(() => { clearIntent(storageKey); setPending(null); setError(null) }, [storageKey])
  const reset = useCallback(() => { setError(null); setSuccess(false) }, [])

  useEffect(() => {
    const onOnline = () => { if (pendingRef.current && !inFlight.current) run(pendingRef.current) }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [run])

  return { pending, isPending, error, isSuccess, submit, retry, discardRetry, reset }
}

/** Inline alert: error (role=alert) or info (role=status), with an optional action on the right. */
export function Feedback({ tone = 'info', action, children, icon: Icon }) {
  return <div className={`nb-feedback ${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
    {Icon && <Icon size={15} className="nb-feedback-icon" aria-hidden="true"/>}
    <div className="nb-feedback-row">
      <span>{children}</span>
      {action && <div className="nb-feedback-action">{action}</div>}
    </div>
  </div>
}

/** Small markdown: headings, lists, quotes, bold, italic and inline code. */
function inline(text, keyBase) {
  const parts = []
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g
  let last = 0
  let match
  let index = 0
  while ((match = pattern.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index))
    const token = match[0]
    const key = `${keyBase}-${index += 1}`
    if (token.startsWith('**')) parts.push(<strong key={key}>{token.slice(2, -2)}</strong>)
    else if (token.startsWith('`')) parts.push(<code key={key}>{token.slice(1, -1)}</code>)
    else parts.push(<em key={key}>{token.slice(1, -1)}</em>)
    last = match.index + token.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

export function Markdown({ text, className = '' }) {
  const blocks = []
  let list = null
  const flush = () => { if (list) { blocks.push(list); list = null } }
  text.split('\n').forEach((line, index) => {
    const bullet = line.match(/^\s*[-*]\s+(.*)$/)
    const ordered = line.match(/^\s*(\d+)\.\s+(.*)$/)
    if (bullet || ordered) {
      const type = bullet ? 'ul' : 'ol'
      if (!list || list.type !== type) { flush(); list = { type, items: [], key: index } }
      list.items.push(inline(bullet ? bullet[1] : ordered[2], `li${index}`))
      return
    }
    flush()
    if (!line.trim()) { blocks.push({ type: 'gap', key: index }); return }
    const heading = line.match(/^(#{1,4})\s+(.*)$/)
    if (heading) { blocks.push({ type: 'h', key: index, content: inline(heading[2], `h${index}`) }); return }
    const quote = line.match(/^>\s?(.*)$/)
    if (quote) { blocks.push({ type: 'quote', key: index, content: inline(quote[1], `q${index}`) }); return }
    blocks.push({ type: 'p', key: index, content: inline(line, `p${index}`) })
  })
  flush()
  return <div className={`nb-md ${className}`.trim()}>
    {blocks.map((block) => {
      if (block.type === 'gap') return <div key={block.key} className="nb-md-gap"/>
      if (block.type === 'h') return <p key={block.key} className="nb-md-h">{block.content}</p>
      if (block.type === 'quote') return <blockquote key={block.key}>{block.content}</blockquote>
      if (block.type === 'ul') return <ul key={block.key}>{block.items.map((item, i) => <li key={i}>{item}</li>)}</ul>
      if (block.type === 'ol') return <ol key={block.key}>{block.items.map((item, i) => <li key={i}>{item}</li>)}</ol>
      return <p key={block.key}>{block.content}</p>
    })}
  </div>
}
