/**
 * Playbooks and process reviews, kept locally. Playbooks are append-only revision
 * lists; a process review pins one exact playbook revision and grades rule
 * adherence plus planned risk only — the P&L never enters the grade.
 */
import { tradeLog } from '../data'
import { enrich, readStore, writeStore } from './reports-data'

const PLAYBOOK_KEY = 'cc-playbooks'
const REVIEW_KEY = 'cc-process-reviews'
export const RULE_LIMIT = 30
export const GRADES = ['A', 'B', 'C', 'D', 'F']

const rule = (rule_id, text) => ({ rule_id, text })
const rev = (revision, action, content, recorded_at) => ({ revision, action, content, recorded_at })

function seedPlaybooks() {
  const orbV1 = {
    name: 'Opening drive', description: 'Ride the first decisive move out of the opening range when volume confirms it.',
    planned_risk: '150', risk_unit: 'usd',
    entry_criteria: 'First 5-minute range is set.\nPrice closes a 1-minute bar outside the range on above-average volume.\nEnter on the first pullback that holds the range edge.',
    exit_criteria: 'Stop under the opposite half of the opening range.\nTake half at 2R, trail the rest under 1-minute higher lows.',
    rules: [rule('orb-1', 'No entry before 9:35'), rule('orb-2', 'Volume on the break is above the 20-bar average'), rule('orb-3', 'Stop placed before the entry is sent')],
  }
  const orbV2 = { ...orbV1, rules: [...orbV1.rules, rule('orb-4', 'Skip the trade if the gap is larger than 1.5 ATR')] }
  const vwap = {
    name: 'VWAP reclaim', description: 'Buy the reclaim of VWAP after a flush, or short the loss of VWAP after a squeeze.',
    planned_risk: '125', risk_unit: 'usd',
    entry_criteria: 'Price trades through VWAP and holds it for two 1-minute closes.\nThe tape shows absorption on the retest.',
    exit_criteria: 'Stop on a close back through VWAP.\nTarget the prior swing or the opening range edge.',
    rules: [rule('vw-1', 'Two closes on the right side of VWAP before entry'), rule('vw-2', 'No more than two attempts per session'), rule('vw-3', 'Stop stays where it was set')],
  }
  const pullback = {
    name: 'Trend pullback', description: 'Join an established intraday trend on a controlled pullback to the 9 or 20 EMA.',
    planned_risk: '0.3', risk_unit: 'percent',
    entry_criteria: 'Higher highs and higher lows on the 5-minute (reverse for shorts).\nPullback on falling volume into the 9 or 20 EMA.\nEntry on the first bar that takes out the prior bar’s high.',
    exit_criteria: 'Stop below the pullback low.\nExit into the prior high or on a 5-minute close through the 20 EMA.',
    rules: [rule('pb-1', 'Trend is visible on the 5-minute chart'), rule('pb-2', 'Pullback volume is lighter than the push'), rule('pb-3', 'Enter only at the planned level'), rule('pb-4', 'Hold to target or stop')],
  }
  const fbo = {
    name: 'Failed breakout', description: 'Fade a breakout that cannot hold above the level it just broke.',
    planned_risk: '150', risk_unit: 'usd',
    entry_criteria: 'A clear level breaks and price closes back inside within three bars.\nEnter on the retest from underneath.',
    exit_criteria: 'Stop above the failed high.\nTarget the opposite side of the range.',
    rules: [rule('fb-1', 'Level was tested at least twice before the break'), rule('fb-2', 'Wait for the close back inside'), rule('fb-3', 'Wait 10 minutes after a loss')],
  }
  const range = {
    name: 'Range break', description: 'Trade the break of a midday balance area once it has built for at least an hour.',
    planned_risk: '100', risk_unit: 'usd',
    entry_criteria: 'Balance of 60 minutes or more with a defined high and low.\nBreak on expanding volume.',
    exit_criteria: 'Stop back inside the range midpoint.\nMeasured move target equal to the range height.',
    rules: [rule('rb-1', 'Range is at least 60 minutes old'), rule('rb-2', 'Risk no more than 1R per trade')],
  }
  const gap = {
    name: 'Gap continuation', description: 'Continuation of a news gap after the first pullback holds.',
    planned_risk: '100', risk_unit: 'usd',
    entry_criteria: 'Gap over 2% with a catalyst.\nFirst pullback holds half the gap.',
    exit_criteria: 'Stop under the pullback low.',
    rules: [rule('gp-1', 'Catalyst is confirmed'), rule('gp-2', 'No entry after 10:30')],
  }
  const at = (date) => `${date}T13:00:00.000Z`
  return [
    { playbook_id: 'pb-orb', lifecycle_status: 'active', created_at: at('2026-04-02'), revisions: [rev(1, 'create', orbV1, at('2026-04-02')), rev(2, 'revise', orbV2, at('2026-08-24'))] },
    { playbook_id: 'pb-vwap', lifecycle_status: 'active', created_at: at('2026-04-02'), revisions: [rev(1, 'create', vwap, at('2026-04-02'))] },
    { playbook_id: 'pb-pullback', lifecycle_status: 'active', created_at: at('2026-04-09'), revisions: [rev(1, 'create', { ...pullback, planned_risk: '0.25' }, at('2026-04-09')), rev(2, 'revise', pullback, at('2026-06-15'))] },
    { playbook_id: 'pb-fbo', lifecycle_status: 'active', created_at: at('2026-05-11'), revisions: [rev(1, 'create', fbo, at('2026-05-11'))] },
    { playbook_id: 'pb-range', lifecycle_status: 'active', created_at: at('2026-05-20'), revisions: [rev(1, 'create', range, at('2026-05-20'))] },
    { playbook_id: 'pb-gap', lifecycle_status: 'archived', created_at: at('2026-04-02'), revisions: [rev(1, 'create', gap, at('2026-04-02')), rev(2, 'archive', gap, at('2026-07-01'))] },
  ]
}

export const current = (playbook) => playbook.revisions[playbook.revisions.length - 1]
export const revisionOf = (playbook, revision) => playbook?.revisions.find((item) => item.revision === revision)

export function plannedRisk(content) {
  return content.risk_unit === 'percent' ? `${content.planned_risk}% of account per trade` : `$${content.planned_risk} per trade`
}

/** Grade from marks and risk only (journal-process-grade/v1, local rendition). */
export function gradeOf(content) {
  const followed = content.rules.filter((item) => item.mark === 'followed').length
  const broken = content.rules.filter((item) => item.mark === 'broken').length
  const notApplicable = content.rules.filter((item) => item.mark === 'not_applicable').length
  const applicable = followed + broken
  const adherence = applicable ? followed / applicable : null
  let index = adherence == null ? (content.risk_adherence === 'within' ? 0 : 1)
    : adherence >= 0.999 ? 0 : adherence >= 0.8 ? 1 : adherence >= 0.6 ? 2 : adherence >= 0.4 ? 3 : 4
  if (content.risk_adherence === 'exceeded') index = Math.min(4, index + 1)
  else if (content.risk_adherence === 'unknown' && index === 0) index = 1 // unchecked risk caps a clean review at B
  return { grade: GRADES[index], method: 'journal-process-grade/v1', followed, broken, not_applicable: notApplicable, adherence_percent: adherence == null ? null : Math.round(adherence * 100) }
}

export function gradeBasis(grade, risk) {
  const rules = grade.followed + grade.broken ? `${grade.followed}/${grade.followed + grade.broken} applicable rules followed` : 'no rule applied'
  const riskText = risk === 'within' ? 'risk within plan' : risk === 'exceeded' ? 'risk exceeded plan' : 'risk not checked'
  return `${rules} · ${riskText}`
}

function seedReviews(playbooks) {
  const byName = new Map(playbooks.map((playbook) => [current(playbook).content.name, playbook]))
  const candidates = tradeLog.filter((trade) => byName.has(trade.setup) && trade.date >= '2026-08-01').slice(-60)
  const reviews = {}
  candidates.forEach((raw, index) => {
    if (index % 3 === 2) return
    const trade = enrich(raw, {})
    const playbook = byName.get(trade.setup)
    const pinned = [...playbook.revisions].reverse().find((item) => item.action !== 'archive' && item.recorded_at.slice(0, 10) <= trade.date) ?? playbook.revisions[0]
    const brokenAt = trade.mistakes.length ? (index % pinned.content.rules.length) : -1
    const content = {
      trade_revision: 1, playbook_id: playbook.playbook_id, playbook_revision: pinned.revision,
      risk_adherence: trade.mistakes.includes('oversized') ? 'exceeded' : index % 5 === 0 ? 'unknown' : 'within',
      rules: pinned.content.rules.map((item, ruleIndex) => ({
        rule_id: item.rule_id,
        mark: ruleIndex === brokenAt ? 'broken' : (index + ruleIndex) % 7 === 0 ? 'not_applicable' : 'followed',
        note: ruleIndex === brokenAt ? trade.mistakes[0] : null,
      })),
      notes: trade.mistakes.length ? `Slipped on ${trade.mistakes[0]}.` : '',
    }
    reviews[trade.id] = { trade_id: trade.id, revision: 1, recorded_at: `${trade.date}T21:00:00.000Z`, trade_current_revision: index % 11 === 0 ? 2 : 1, content }
  })
  return reviews
}

export function loadPlaybooks() {
  const stored = readStore(PLAYBOOK_KEY, null)
  if (Array.isArray(stored)) return stored
  const seeded = seedPlaybooks()
  writeStore(PLAYBOOK_KEY, seeded)
  return seeded
}
export const storePlaybooks = (list) => writeStore(PLAYBOOK_KEY, list)

export function loadReviews(playbooks) {
  const stored = readStore(REVIEW_KEY, null)
  if (stored && typeof stored === 'object') return stored
  const seeded = seedReviews(playbooks)
  writeStore(REVIEW_KEY, seeded)
  return seeded
}
export const storeReviews = (map) => writeStore(REVIEW_KEY, map)

export const newRuleId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`)
