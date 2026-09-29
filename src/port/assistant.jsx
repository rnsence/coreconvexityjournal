import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUp, CircleAlert, MessageSquarePlus, Sparkles, Square, Trash2, Wrench } from 'lucide-react'
import { PageHead, Card } from '../workspace'
import { Feedback, Markdown } from './notebook-command'
import { SUGGESTIONS, TEMPLATES, confirm, loadState, recordUsage, reply, saveState, toolLabel } from './assistant-engine'
import { uuid } from './notebook-data'
import './notebook.css'
import './assistant.css'

const todayLocal = () => new Date().toLocaleDateString('en-CA')
const sleep = (ms, signal) => new Promise((resolve, reject) => {
  const timer = setTimeout(resolve, ms)
  signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('stopped', 'AbortError')) }, { once: true })
})

/** Splits a reply into small chunks so it "streams" the way model tokens arrive. */
/** Consecutive tool calls render as one row of badges. */
const groupTools = (messages) => messages.reduce((rows, message) => {
  const last = rows[rows.length - 1]
  if (message.role === 'tool') {
    if (last?.role === 'tools') last.tools.push(message.tool)
    else rows.push({ role: 'tools', tools: [message.tool] })
  } else rows.push(message)
  return rows
}, [])

const tokens = (text) => text.match(/\s*\S{1,6}|\s+/g) ?? []

// Designs by RNSENCE Studio
export function AssistantPage({ privacy }) {
  const [store, setStore] = useState(loadState)
  const [conversationID, setConversationID] = useState(null)
  const [draft, setDraft] = useState('')
  const [template, setTemplate] = useState(null)
  const [args, setArgs] = useState({})
  const [live, setLive] = useState(null)
  const [error, setError] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [optimistic, setOptimistic] = useState(null)
  const abortRef = useRef(null)
  const scrollRef = useRef(null)

  const commit = (updater) => setStore((current) => { const next = updater(current); saveState(next); return next })
  const conversations = useMemo(() => [...store.conversations].sort((a, b) => b.updated_at.localeCompare(a.updated_at)), [store])
  const conversation = store.conversations.find((item) => item.conversation_id === conversationID) ?? null
  const messages = conversation?.messages ?? []
  const pending = conversation?.pending ?? null
  const turnPending = !!live
  const usage = store.usage

  // Follow the reply as it is written.
  useEffect(() => {
    const node = scrollRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [messages.length, live?.text, live?.tools.length, optimistic, pending])

  useEffect(() => () => abortRef.current?.abort(), [])

  async function runTurn(body, { userText, onSuccess }) {
    const controller = new AbortController()
    abortRef.current = controller
    setError(null)
    setLive({ text: '', tools: [] })
    setOptimistic(userText ?? null)
    const answer = body.confirm !== undefined ? confirm(pending, body.confirm, { privacy }) : reply(body, { privacy })
    let written = ''
    let stopped = false
    try {
      await sleep(520, controller.signal)
      if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('The assistant could not finish this reply.')
      for (const tool of answer.tools) {
        setLive((current) => current && { ...current, tools: [...current.tools, tool] })
        await sleep(420, controller.signal)
      }
      for (const token of tokens(answer.text)) {
        written += token
        setLive((current) => current && { ...current, text: written })
        await sleep(14 + Math.random() * 22, controller.signal)
      }
    } catch (failure) {
      if (failure.name !== 'AbortError') {
        setLive(null); setOptimistic(null)
        setError(failure.message || 'The reply was cut off. Please try again.')
        return
      }
      stopped = true
    }
    if (!stopped) answer.effect?.()
    const finalText = stopped ? written.trimEnd() : answer.text
    const id = conversationID ?? `c-${uuid().slice(0, 8)}`
    commit((current) => {
      const existing = current.conversations.find((item) => item.conversation_id === id)
      const added = [
        ...(userText ? [{ role: 'user', content: userText }] : []),
        ...(stopped ? [] : answer.tools.map((tool) => ({ role: 'tool', tool }))),
        ...(finalText ? [{ role: 'assistant', content: finalText, stopped }] : []),
      ]
      const next = {
        conversation_id: id,
        title: existing?.title ?? (userText ?? 'New chat').replace(/^\//, '').slice(0, 56),
        updated_at: new Date().toISOString(),
        messages: [...(existing?.messages ?? []), ...added],
        pending: stopped ? null : answer.pending ?? null,
      }
      return {
        ...current,
        usage: recordUsage(current, userText ?? JSON.stringify(body), finalText),
        conversations: existing ? current.conversations.map((item) => (item.conversation_id === id ? next : item)) : [next, ...current.conversations],
      }
    })
    // A "New chat" while streaming keeps the partial reply but leaves the new chat selected.
    if (controller.signal.reason !== 'detach') setConversationID(id)
    setLive(null); setOptimistic(null)
    abortRef.current = null
    onSuccess?.()
  }

  function submit(event) {
    event?.preventDefault()
    if (turnPending || pending) return
    if (template) {
      const text = `/${template.name} ${template.arguments.map((name) => `${name}=${args[name] ?? ''}`).join(' ')}`
      runTurn({ template: { name: template.name, arguments: args } }, { userText: text, onSuccess: () => { setTemplate(null); setArgs({}) } })
    } else if (draft.trim()) {
      runTurn({ message: draft.trim() }, { userText: draft.trim(), onSuccess: () => setDraft('') })
    }
  }
  const ask = (text) => { if (!turnPending && !pending) runTurn({ message: text }, { userText: text }) }
  const decide = (allow) => runTurn({ confirm: allow }, { userText: null })
  const newChat = () => { if (turnPending) abortRef.current?.abort('detach'); setConversationID(null); setError(null) }
  const remove = () => {
    setDeleting(true)
    setTimeout(() => {
      commit((current) => ({ ...current, conversations: current.conversations.filter((item) => item.conversation_id !== conversationID) }))
      setConversationID(null); setDeleting(false); setError(null)
    }, 260)
  }
  const pickTemplate = (item) => { setTemplate(item); setArgs(Object.fromEntries(item.arguments.filter((name) => name === 'date').map((name) => [name, todayLocal()]))) }
  const usedTokens = usage.input_tokens + usage.output_tokens
  const empty = !conversation && !turnPending && !optimistic

  return <div className="page home ws-page as-page">
    <PageHead
      title="Assistant"
      meta="Answers from your trade log and journal · changes are recorded as made by the assistant"
    />

    <div className="as-layout" aria-label="Assistant">
      <Card title="Chats" className="as-aside">
        <button type="button" className="nb-btn as-new" onClick={newChat}><MessageSquarePlus size={14}/> New chat</button>
        <ul className="as-list">
          {conversations.map((item) => <li key={item.conversation_id}>
            <button type="button" className={item.conversation_id === conversationID ? 'on' : ''} onClick={() => { if (!turnPending) { setConversationID(item.conversation_id); setError(null) } }}>
              <span>{item.title}</span>
              <small>{new Date(item.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</small>
            </button>
          </li>)}
          {!conversations.length && <li className="as-list-empty">No chats yet.</li>}
        </ul>
        <div className="as-usage">
          <p>Today: {usedTokens.toLocaleString()} of {usage.daily_tokens.toLocaleString()} tokens</p>
          <span className="as-usage-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, (usedTokens / usage.daily_tokens) * 100)}%` }}/></span>
        </div>
      </Card>

      <Card className="as-chat">
        <div className="as-chat-head">
          <span className="card-title"><Sparkles size={13}/>{conversation ? conversation.title : 'New chat'}</span>
          {conversationID && <button type="button" className="nb-btn ghost" disabled={deleting || turnPending} onClick={remove}><Trash2 size={13}/> Delete chat</button>}
        </div>

        <div className="as-scroll" ref={scrollRef}>
          {!conversationID && <p className="as-intro">Ask about your trading, or have the assistant update your journal: review trades, write your day, set rules and goals. Changes are recorded as made by the assistant.</p>}

          {empty && <div className="as-suggest" role="list" aria-label="Suggested prompts">
            {SUGGESTIONS.map((item) => <button key={item.title} type="button" role="listitem" onClick={() => ask(item.title)}>
              <b>{item.title}</b><small>{item.detail}</small>
            </button>)}
          </div>}

          <ol className="as-messages">
            {groupTools(messages).map((item, index) => item.role === 'tools'
              ? <li key={index} className="as-tool">{item.tools.map((tool, i) => <span key={i} className="as-badge"><Wrench size={11}/>used {toolLabel(tool ?? '')}</span>)}</li>
              : <li key={index} className={`as-msg ${item.role}`}>
                {item.role === 'assistant' ? <Markdown text={item.content}/> : item.content}
                {item.stopped && <small className="as-stopped">Stopped</small>}
              </li>)}
            {optimistic && <li className="as-msg user">{optimistic}</li>}
          </ol>

          {turnPending && <div className="as-live" aria-live="polite">
            {live.tools.length > 0 && <div className="as-live-tools">{live.tools.map((tool, index) => <span key={index} className="as-badge live"><Wrench size={11}/>using {toolLabel(tool)}</span>)}</div>}
            {live.text
              ? <div className="as-msg assistant is-streaming"><Markdown text={live.text}/><i className="as-caret" aria-hidden="true"/></div>
              : <p className="as-working"><span className="as-dots" aria-hidden="true"><i/><i/><i/></span>Working…</p>}
          </div>}

          {pending && !turnPending && <div className="as-pending" role="alert">
            <p><CircleAlert size={14}/><span>The assistant wants to run <strong>{toolLabel(pending.tool)}</strong>:</span></p>
            <pre>{JSON.stringify(pending.arguments, null, 2)}</pre>
            <div className="as-pending-actions">
              <button type="button" className="nb-btn nb-primary" disabled={turnPending} onClick={() => decide(true)}>Allow</button>
              <button type="button" className="nb-btn" disabled={turnPending} onClick={() => decide(false)}>Don’t</button>
            </div>
          </div>}

          {error && <Feedback tone="error" icon={CircleAlert}>{error}</Feedback>}
        </div>

        <form className="as-composer" onSubmit={submit}>
          {template
            ? <div className="as-template">
              <div className="as-template-head"><strong>{template.name}</strong><button type="button" className="nb-btn ghost" onClick={() => setTemplate(null)}>Cancel</button></div>
              <p>{template.description}</p>
              {template.arguments.map((name) => <label key={name} className="dlg-field">
                <span>{name}</span>
                <input required type={name === 'date' ? 'date' : 'text'} placeholder={name === 'setup' ? 'Opening drive' : undefined} value={args[name] ?? ''} onChange={(event) => setArgs({ ...args, [name]: event.target.value })}/>
              </label>)}
            </div>
            : <textarea aria-label="Message" maxLength={4000} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="What was my biggest leak this month?"/>}
          <div className="as-composer-row">
            {turnPending
              ? <button type="button" className="nb-btn as-stop" onClick={() => abortRef.current?.abort()}><Square size={11} fill="currentColor"/> Stop</button>
              : <button type="submit" className="nb-btn nb-primary" disabled={turnPending || !!pending || (!template && !draft.trim())}><ArrowUp size={14}/> Send</button>}
            {!template && TEMPLATES.map((item) => <button key={item.name} type="button" className="nb-btn" disabled={turnPending} onClick={() => pickTemplate(item)}>{item.name}</button>)}
            {!template && <span className="as-count">{draft.length ? `${draft.length.toLocaleString()} / 4,000` : ''}</span>}
          </div>
        </form>
      </Card>
    </div>
  </div>
}
