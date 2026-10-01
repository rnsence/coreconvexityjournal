/**
 * The note editor's writing surface: formatted as you type (bold is bold, a list is a list) while the
 * note itself stays Markdown. The same small dialect the note cards render: headings, bold, italic,
 * inline code, bulleted and numbered lists, quotes and blank-line spacing.
 */
import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const inlineHtml = (text) => escapeHtml(text)
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
  .replace(/(^|\W)_([^_\s][^_]*)_/g, '$1<em>$2</em>')

/** Markdown → editor HTML, one block element per line so the round trip is lossless. */
export function markdownToHtml(markdown) {
  const out = []
  let list = null
  const close = () => { if (list) { out.push(`<${list.tag}>${list.items.join('')}</${list.tag}>`); list = null } }
  markdown.split('\n').forEach((line) => {
    const bullet = line.match(/^\s*[-*]\s+(.*)$/)
    const ordered = line.match(/^\s*\d+\.\s+(.*)$/)
    if (bullet || ordered) {
      const tag = bullet ? 'ul' : 'ol'
      if (!list || list.tag !== tag) { close(); list = { tag, items: [] } }
      list.items.push(`<li>${inlineHtml((bullet || ordered)[1]) || '<br>'}</li>`)
      return
    }
    close()
    const heading = line.match(/^#{1,4}\s+(.*)$/)
    const quote = line.match(/^>\s?(.*)$/)
    if (heading) out.push(`<h2>${inlineHtml(heading[1]) || '<br>'}</h2>`)
    else if (quote) out.push(`<blockquote>${inlineHtml(quote[1]) || '<br>'}</blockquote>`)
    else out.push(`<p>${inlineHtml(line) || '<br>'}</p>`)
  })
  close()
  return out.join('')
}

const INLINE = { STRONG: '**', B: '**', EM: '*', I: '*', CODE: '`' }
/** Inline DOM → Markdown; markers hug the text (spaces move outside) so "** bold**" never happens. */
function inlineMd(node) {
  let text = ''
  node.childNodes.forEach((child) => {
    if (child.nodeType === 3) { text += child.textContent.replace(/ /g, ' '); return }
    if (child.nodeType !== 1 || child.tagName === 'BR') return
    const inner = inlineMd(child)
    const bold = child.tagName === 'SPAN' && /bold|[6-9]00/.test(child.style.fontWeight)
    const mark = INLINE[child.tagName] ?? (bold ? '**' : child.tagName === 'SPAN' && child.style.fontStyle === 'italic' ? '*' : '')
    if (!mark || !inner.trim()) { text += inner; return }
    const lead = inner.match(/^\s*/)[0], trail = inner.match(/\s*$/)[0]
    text += `${lead}${mark}${inner.trim()}${mark}${trail}`
  })
  return text
}

const BLOCKS = new Set(['P', 'DIV', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE'])
const hasBlocks = (node) => [...node.children].some((child) => BLOCKS.has(child.tagName))

/** Editor DOM → Markdown. Browsers nest blocks unpredictably while you type (a <div> inside a <p>, a list inside
 *  a paragraph), so a block that holds other blocks is split into its lines instead of being flattened. */
export function htmlToMarkdown(root) {
  const lines = []
  const mixed = (node, emitLine) => {
    let run = document.createElement('span')
    const flushRun = () => { const text = inlineMd(run); if (text.trim() || run.querySelector('br')) emitLine(text.replace(/\s+$/, '')); run = document.createElement('span') }
    ;[...node.childNodes].forEach((child) => {
      if (child.nodeType === 1 && BLOCKS.has(child.tagName)) { flushRun(); block(child) }
      else if (child.nodeType === 1 && child.tagName === 'BR' && run.childNodes.length) flushRun()
      else run.appendChild(child.cloneNode(true))
    })
    flushRun()
  }
  const list = (node) => {
    let n = 0
    ;[...node.children].forEach((li) => {
      if (li.tagName !== 'LI') { block(li); return }
      n += 1
      const marker = node.tagName === 'UL' ? '-' : `${n}.`
      if (hasBlocks(li)) mixed(li, (text) => lines.push(`${marker} ${text.trim()}`))
      else lines.push(`${marker} ${inlineMd(li).trim()}`)
    })
  }
  const block = (node) => {
    if (node.nodeType === 3) { if (node.textContent.trim()) lines.push(node.textContent.replace(/\u00a0/g, ' ')); return }
    if (node.nodeType !== 1) return
    const tag = node.tagName
    if (tag === 'UL' || tag === 'OL') { list(node); return }
    if (tag === 'BR') { lines.push(''); return }
    const prefix = /^H[1-6]$/.test(tag) ? '## ' : tag === 'BLOCKQUOTE' ? '> ' : ''
    if (hasBlocks(node)) { mixed(node, (text) => lines.push(prefix + text.trim())); return }
    const text = inlineMd(node)
    lines.push(prefix ? prefix + text.trim() : text.replace(/\s+$/, ''))
  }
  root.childNodes.forEach(block)
  return lines.join('\n').replace(/\n+$/, '')
}

/** Which formats are on at the caret, for the toolbar's pressed states. */
export function activeFormats(root) {
  const sel = window.getSelection()
  if (!sel?.rangeCount || !root?.contains(sel.anchorNode)) return {}
  let el = sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode
  const on = {}
  while (el && el !== root) {
    const tag = el.tagName
    if (tag === 'STRONG' || tag === 'B') on.bold = true
    if (tag === 'EM' || tag === 'I') on.italic = true
    if (tag === 'CODE') on.code = true
    if (tag === 'UL') on.list = true
    if (tag === 'OL') on.ordered = true
    if (/^H[1-6]$/.test(tag)) on.heading = true
    if (tag === 'BLOCKQUOTE') on.quote = true
    el = el.parentElement
  }
  return on
}

const blockOf = (root) => {
  const sel = window.getSelection()
  let el = sel?.anchorNode
  if (!el) return null
  if (el.nodeType === 3) el = el.parentElement
  while (el && el.parentElement !== root && el !== root) el = el.parentElement
  return el === root ? null : el
}

export const RichBody = forwardRef(function RichBody({ value, onChange, onFormats, disabled, placeholder, ariaLabel }, ref) {
  const el = useRef(null)
  const last = useRef(value)
  useEffect(() => { el.current.innerHTML = markdownToHtml(value); last.current = value }, [])
  // outside changes (a template, a retry draft) replace the content; our own edits don't
  useEffect(() => { if (value !== last.current) { el.current.innerHTML = markdownToHtml(value); last.current = value } }, [value])
  const emit = () => {
    const md = htmlToMarkdown(el.current)
    last.current = md
    onChange(md)
    onFormats?.(activeFormats(el.current))
  }
  useEffect(() => {
    const onSel = () => onFormats?.(activeFormats(el.current))
    document.addEventListener('selectionchange', onSel)
    return () => document.removeEventListener('selectionchange', onSel)
  }, [onFormats])
  const exec = (command, arg) => { el.current.focus(); document.execCommand(command, false, arg); emit() }
  useImperativeHandle(ref, () => ({
    focus: () => el.current?.focus(),
    format: (key) => {
      const on = activeFormats(el.current)
      if (key === 'bold') exec('bold')
      else if (key === 'italic') exec('italic')
      else if (key === 'list') exec('insertUnorderedList')
      else if (key === 'ordered') exec('insertOrderedList')
      else if (key === 'heading') exec('formatBlock', on.heading ? '<p>' : '<h2>')
      else if (key === 'quote') exec('formatBlock', on.quote ? '<p>' : '<blockquote>')
      else if (key === 'code') {
        const sel = window.getSelection()
        if (!sel.rangeCount) return
        el.current.focus()
        if (on.code) { let c = sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode; while (c && c.tagName !== 'CODE') c = c.parentElement; if (c) c.replaceWith(document.createTextNode(c.textContent)) }
        else { const text = sel.toString() || 'code'; exec('insertHTML', `<code>${escapeHtml(text)}</code>&#8203;`) }
        emit()
      }
    },
  }))
  const onKeyDown = (event) => {
    // Enter at the end of a heading or quote starts a plain paragraph (as in Notion/Linear), it doesn't continue it
    if (event.key === 'Enter' && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
      const block = blockOf(el.current)
      if (block && (/^H[1-6]$/.test(block.tagName) || block.tagName === 'BLOCKQUOTE')) {
        const sel = window.getSelection()
        const tail = document.createRange(); tail.selectNodeContents(block); tail.setStart(sel.anchorNode, sel.anchorOffset)
        if (!tail.toString().trim()) {
          event.preventDefault()
          const p = document.createElement('p'); p.innerHTML = '<br>'
          block.after(p)
          const range = document.createRange(); range.setStart(p, 0); range.collapse(true); sel.removeAllRanges(); sel.addRange(range)
          emit()
        }
      }
      return
    }
    // Markdown shortcuts at the start of a line: "- ", "* ", "1. ", "## ", "> "
    if (event.key !== ' ' || event.metaKey || event.ctrlKey) return
    const block = blockOf(el.current)
    if (!block || !['P', 'DIV'].includes(block.tagName)) return
    const sel = window.getSelection()
    const typed = block.textContent.slice(0, sel.anchorOffset).trim()
    const map = { '-': ['insertUnorderedList'], '*': ['insertUnorderedList'], '1.': ['insertOrderedList'], '#': ['formatBlock', '<h2>'], '##': ['formatBlock', '<h2>'], '>': ['formatBlock', '<blockquote>'] }
    if (!map[typed] || block.textContent.trim() !== typed) return
    event.preventDefault()
    block.innerHTML = '<br>'
    const range = document.createRange(); range.setStart(block, 0); range.collapse(true); sel.removeAllRanges(); sel.addRange(range)
    exec(...map[typed])
  }
  const onPaste = (event) => {
    event.preventDefault()
    document.execCommand('insertText', false, event.clipboardData.getData('text/plain'))
    emit()
  }
  return <div
    ref={el} className={`nb-rich${value ? '' : ' is-empty'}`} role="textbox" aria-multiline="true" aria-label={ariaLabel} data-placeholder={placeholder}
    contentEditable={!disabled} suppressContentEditableWarning
    onInput={emit} onKeyDown={onKeyDown} onPaste={onPaste}
    onFocus={() => document.execCommand('defaultParagraphSeparator', false, 'p')}
  />
})
