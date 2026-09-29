/**
 * §4 TradeCard pieces the existing trade panel lacked: P&L source, Add fills /
 * Fills & details / Review actions, archive, and the review chips.
 */
import React from 'react'
import { pnlSourceLabel } from './trades-detail'
import { realizedR } from './trading-data'
import './trades.css'

export function TradeCardActions({ trade, review, onAddFills, onDetail, onReview, onArchive }) {
  const manual = trade.logged && !trade.fills?.length
  const r = manual ? null : realizedR(trade, review)
  return <div className="tc-block">
    <div className="tc-chips" aria-label="Trade review">
      <span className="tx-badge outline">{pnlSourceLabel(trade)}</span>
      {r != null && <span className={`tx-badge ${r >= 0 ? 'pos' : 'neg'}`}>{r.toFixed(2)}R</span>}
      <span className="tc-spacer"/>
      <span className="tc-qty">{manual ? `${trade.qty} contracts` : 'See fills for quantities'}</span>
    </div>
    <div className="tc-actions">
      {manual && <button type="button" className="tc-btn" onClick={onAddFills}>Add fills</button>}
      <button type="button" className="tc-btn" onClick={onDetail}>Fills & details</button>
    </div>
  </div>
}
