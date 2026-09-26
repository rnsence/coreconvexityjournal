import React from 'react'
import { profile, propAccounts, tradeLog } from './data'
import { equitySeries } from './analytics'
import { money, useEasternToday, useMarketSession } from './viz'
import { BufferGaugeIcon, PasswordIcon, ShieldRiskIcon, TargetProgressIcon } from './icons'
import {
  DashboardNavIcon, CalendarNavIcon, JournalNavIcon, TradesNavIcon, ReportsNavIcon, PropFirmsNavIcon,
  NotebookNavIcon, PlaybooksNavIcon, ProgressNavIcon, MissedTradesNavIcon, ImportNavIcon, AccountsNavIcon,
  SettingsNavIcon, MoreNavIcon,
} from './nav-icons'
import AddSolidIcon from '@iconify-react/basil/add-solid'
import SettingsSolidIcon from '@iconify-react/basil/settings-solid'
import {
  SlidersHorizontal,
  ChevronDown, Sparkles, Search, Bell, Download, Image as ImageIcon, Mic, Star,
  ArrowUpRight, Menu, X, CircleHelp, GripVertical, ChevronLeft, ChevronRight, LogOut,
  TrendingUp, TrendingDown, Target, CalendarDays,
} from 'lucide-react'

export const navGroups = [
  {
    id: 'workspace',
    items: [
      ['Dashboard', DashboardNavIcon], ['Calendar', CalendarNavIcon], ['Daily journal', JournalNavIcon],
      ['Trades', TradesNavIcon],
      ['Prop firms', PropFirmsNavIcon], ['Reports', ReportsNavIcon],
    ],
  },
  {
    id: 'journal',
    heading: 'Journal',
    items: [
      ['Notebook', NotebookNavIcon], ['Playbooks', PlaybooksNavIcon], ['Progress', ProgressNavIcon], ['Missed trades', MissedTradesNavIcon],
    ],
    overflow: [
      ['Import', ImportNavIcon], ['Accounts', AccountsNavIcon], ['Settings', SettingsNavIcon],
    ],
  },
]

export const navItems = navGroups.flatMap(group => [...group.items, ...(group.overflow || [])])

/** Home glyph from Akar Icons (MIT © Arturo Wibawa), inlined as the breadcrumb root. */
export function HomeIcon({ size = 16, strokeWidth = 2, ...rest }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...rest}>
    <path
      stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      d="M21 19v-6.733a4 4 0 0 0-1.245-2.9L13.378 3.31a2 2 0 0 0-2.755 0L4.245 9.367A4 4 0 0 0 3 12.267V19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2"
    />
  </svg>
}

export function Logo() {
  return <div className="brand-mark" role="img" aria-label="Core Convexity"><i /></div>
}

export function discordAvatarUrl({ discordId, discordAvatar }, size = 128) {
  if (!discordId) return null
  if (!discordAvatar) return `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(discordId) >> 22n) % 6n)}.png`
  const requested = 2 ** Math.ceil(Math.log2(Math.min(Math.max(size, 16), 4096)))
  const extension = discordAvatar.startsWith('a_') ? 'gif' : 'webp'
  return `https://cdn.discordapp.com/avatars/${discordId}/${discordAvatar}.${extension}?size=${requested}`
}

export function Avatar({ user = profile, size = 27, className = '' }) {
  const [failed, setFailed] = React.useState(false)
  const source = failed ? null : discordAvatarUrl(user, size * 4)
  return <span className={`avatar-chip ${className}`} style={{ '--avatar-size': `${size}px` }}>
    {source
      ? <img src={source} alt="" width={size} height={size} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      : user.name.slice(0, 1)}
  </span>
}

function NavButton({ label, Icon, page, onSelect, badge, muted = false }) {
  const active = page === label
  return <button
    type="button"
    title={label}
    aria-current={active ? 'page' : undefined}
    className={`nav-link${active ? ' active' : ''}${muted ? ' subtle' : ''}`}
    onClick={onSelect}
  >
    <span className="nav-icon"><Icon size={14} /></span>
    <span className="sidebar-label">{label}</span>
    {badge && <em>{badge}</em>}
  </button>
}

function SidebarContents({ page, setPage, openLog, closeMobile, mobile = false }) {
  const [expandedGroups, setExpandedGroups] = React.useState({})
  const go = (label) => () => { setPage(label); closeMobile?.() }

  return <>
    <div className="sidebar-brand">
      <Logo />
      <strong className="sidebar-label">Core Convexity</strong>
      {mobile && <div className="brand-tools">
        <button className="brand-tool" aria-label="Close navigation" onClick={closeMobile}><X size={17} /></button>
      </div>}
    </div>


    <div className="sidebar-quick top">
      <button className="quick-primary" onClick={() => { closeMobile?.(); openLog() }}>
        <AddSolidIcon className="quick-add-icon" width="20" height="20" aria-hidden="true" />
        <span className="sidebar-label">Log a trade</span>
      </button>
    </div>

    <nav aria-label="Primary navigation">
      {navGroups.map(group => {
        const showOverflow = !!expandedGroups[group.id]
        return <div className="nav-group" key={group.id}>
          {group.heading && <div className="nav-section-label sidebar-label">{group.heading}</div>}
          {group.items.map(([label, Icon]) =>
            <NavButton key={label} label={label} Icon={Icon} page={page} onSelect={go(label)} badge={label === 'Missed trades' ? '3' : null} />)}
          {group.overflow && <>
            {showOverflow && group.overflow.map(([label, Icon]) =>
              <NavButton key={label} label={label} Icon={Icon} page={page} onSelect={go(label)} />)}
            <button type="button" className="nav-link subtle nav-more" aria-expanded={showOverflow} onClick={() => setExpandedGroups(prev => ({ ...prev, [group.id]: !prev[group.id] }))}>
              <MoreNavIcon size={18} />
              <span className="sidebar-label">{showOverflow ? 'Less' : 'More'}</span>
            </button>
          </>}
        </div>
      })}
    </nav>

    <div className="sidebar-bottom">
      <div className="account-row">
        <button className="profile-button" title="Open profile" onClick={go('Profile')}>
          <Avatar className="profile-avatar" />
          <span className="profile-copy sidebar-label"><b>{profile.name}</b><small>{profile.caption}</small></span>
        </button>
        <button className="profile-signout sidebar-label" type="button" title="Sign out" aria-label="Sign out"><LogOut size={15} strokeWidth={2} /></button>
      </div>
      <div className="sidebar-legal sidebar-label">
        {['Privacy', 'Terms', 'Disclaimer', 'Support'].map(item =>
          <button key={item} type="button" onClick={go(item)}>{item}</button>)}
      </div>
    </div>
  </>
}

// Designs by RNSENCE Studio
export function Sidebar({ page, setPage, openLog, open, setOpen }) {
  const shared = { page, setPage, openLog }
  return <>
    <aside className="sidebar desktop-sidebar expanded">
      <SidebarContents {...shared} />
    </aside>
    <aside className={`sidebar mobile-sidebar ${open ? 'open' : ''}`} aria-hidden={!open}>
      <SidebarContents {...shared} mobile closeMobile={() => setOpen(false)} />
    </aside>
  </>
}

const RANGE_OPTIONS = ['7D', '30D', '90D', 'YTD', 'All']

function Switch({ checked, onChange, label }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className={`menu-switch${checked ? ' on' : ''}`} onClick={() => onChange(!checked)}>
    <i />
  </button>
}

/** Topbar settings: date range, privacy and the filter bar in one dropdown. */
function SettingsMenu({ range, setRange, privacy, setPrivacy }) {
  const [open, setOpen] = React.useState(false)
  const rootRef = React.useRef(null)
  React.useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener('open-settings', onOpen)
    return () => window.removeEventListener('open-settings', onOpen)
  }, [])
  React.useEffect(() => {
    if (!open) return undefined
    const onPointer = (event) => { if (!rootRef.current?.contains(event.target)) setOpen(false) }
    const onKey = (event) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onPointer); document.removeEventListener('keydown', onKey) }
  }, [open])
  return <div className="settings-menu" ref={rootRef}>
    <button type="button" className={`settings-trigger${open ? ' is-open' : ''}`} aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(!open)}>
      <span>Settings</span>
      <em>{range}</em>
      <ChevronDown size={14} className="trigger-caret" />
    </button>
    {open && <div className="settings-panel" role="menu">
      <div className="menu-section">
        <span className="menu-label">Date range</span>
        <div className="menu-segments">
          {RANGE_OPTIONS.map((option) => <button key={option} type="button" className={range === option ? 'active' : ''} onClick={() => setRange(option)}>{option}</button>)}
        </div>
      </div>
      <div className="menu-section">
        <div className="menu-row">
          <span className="menu-icon"><PasswordIcon size={16} /></span>
          <span className="menu-text"><b>Privacy mode</b><small>Hide dollar amounts</small></span>
          <Switch label="Privacy mode" checked={privacy} onChange={setPrivacy} />
        </div>
      </div>
    </div>}
  </div>
}

const SHORT_STATE = { open: 'Market open', pre: 'Pre-market', post: 'After hours', closed: 'Market closed' }

/** Compact market clock for the navbar: status light, phase, and time remaining. */
function MarketPill() {
  const market = useMarketSession()
  const countdown = market.detail?.replace(/^(Closes in|Opens in|Ends in)\s*/, '')
  return <span className={`market-pill ${market.state}`} title={`${market.label} · ${market.detail}`}>
    <i aria-hidden="true" />
    <b>{SHORT_STATE[market.state] ?? market.label}</b>
    {countdown && countdown !== market.detail && <em>{countdown}</em>}
  </span>
}

// Designs by RNSENCE Studio
export function Topbar({ page, setPage, range, setRange, setSidebarOpen, privacy, setPrivacy, openJump }) {
  return (
    <header className="topbar">
      <div className="page-title">
        <button className="mobile-menu" onClick={() => setSidebarOpen(true)}><Menu size={19} /></button>
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <button type="button" className="crumb" onClick={() => setPage?.('Dashboard')}>
            <HomeIcon size={14} strokeWidth={1.9} /> Home
          </button>
          <ChevronRight className="crumb-sep" size={14} strokeWidth={2} />
          <span className="crumb current" aria-current="page">{page}</span>
        </nav>
      </div>
      <div className="top-actions">
        <MarketPill />
        <button type="button" className="jump-trigger" onClick={openJump} aria-label="Quick jump">
          <Search size={14} /><span>Jump to…</span><kbd>⌘K</kbd>
        </button>
        <SettingsMenu range={range} setRange={setRange} privacy={privacy} setPrivacy={setPrivacy} />
      </div>
    </header>
  )
}


/** Right-edge dock: three persistent gauges that follow every page. */
export function SideDock({ setPage }) {
  const accounts = propAccounts.filter((account) => account.status !== 'Breached')
  const sessions = React.useMemo(() => equitySeries(tradeLog), [])
  const today = sessions[sessions.length - 1]

  // Risk: how much of the combined daily loss budget is still available.
  const riskBudget = accounts.reduce((total, account) => total + (account.dailyLossLimit ?? 0), 0)
  const riskUsed = Math.max(0, -(today?.pnl ?? 0))
  const riskLeft = riskBudget ? Math.max(0, 1 - riskUsed / riskBudget) * 100 : 100

  // Cushion: room left before the nearest breach, across live accounts.
  const cushionRoom = accounts.reduce((total, account) => total + Math.max(0, account.balance - account.floor), 0)
  const cushionCap = accounts.reduce((total, account) => total + account.maxDrawdown, 0)
  const cushion = cushionCap ? Math.min(100, (cushionRoom / cushionCap) * 100) : 0

  // Target: the live account closest to its profit target, or payout readiness when funded.
  const chasing = accounts
    .filter((account) => account.target && account.status === 'Active')
    .map((account) => ({ account, share: (account.balance - account.start) / (account.target - account.start) }))
    .sort((a, b) => b.share - a.share)[0]
  const payoutReady = accounts.filter((account) => account.payoutEligible).length
  const targetShare = chasing ? Math.max(0, Math.min(1, chasing.share)) * 100 : (payoutReady / Math.max(1, accounts.length)) * 100

  const band = (value) => (value > 60 ? 'pos' : value > 30 ? 'warn' : 'neg')
  const gauges = [
    {
      key: 'Risk left today', value: riskLeft, tone: band(riskLeft), Icon: ShieldRiskIcon, page: 'Trades',
      hint: riskUsed
        ? `${money(riskUsed, { sign: false, decimals: 0 })} of the ${money(riskBudget, { sign: false, decimals: 0 })} daily loss budget is gone`
        : `Nothing lost yet — ${money(riskBudget, { sign: false, decimals: 0 })} of daily loss budget is free`,
    },
    {
      key: 'Drawdown cushion', value: cushion, tone: band(cushion), Icon: BufferGaugeIcon, page: 'Prop firms',
      hint: `${money(cushionRoom, { sign: false, decimals: 0 })} of ${money(cushionCap, { sign: false, decimals: 0 })} left before a breach across ${accounts.length} accounts`,
    },
    {
      key: 'Target progress', value: targetShare, tone: band(targetShare), Icon: TargetProgressIcon, page: 'Prop firms',
      hint: chasing
        ? `${chasing.account.firm} ${chasing.account.size / 1000}K is ${money(chasing.account.balance - chasing.account.start, { sign: false, decimals: 0 })} into a ${money(chasing.account.target - chasing.account.start, { sign: false, decimals: 0 })} target`
        : `${payoutReady} of ${accounts.length} accounts are payout ready`,
    },
  ]

  return <aside className="side-dock" aria-label="Live risk and target gauges">
    <svg className="dock-defs" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="dockArc" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5b93ff" />
          <stop offset="1" stopColor="#2f62dd" />
        </linearGradient>
        <linearGradient id="dockPos" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3ddc97" />
          <stop offset="1" stopColor="#0ea169" />
        </linearGradient>
        <linearGradient id="dockWarn" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fdb022" />
          <stop offset="1" stopColor="#dc6803" />
        </linearGradient>
        <linearGradient id="dockNeg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff8079" />
          <stop offset="1" stopColor="#e0453c" />
        </linearGradient>
      </defs>
    </svg>
    {gauges.map(({ key, value, tone, Icon, hint, page }) => {
      const share = Math.max(0, Math.min(100, value))
      return <button
        type="button" className={`dock-gauge ${tone}`} key={key}
        onClick={() => setPage?.(page)} aria-label={`${key}: ${Math.round(share)} percent. ${hint}`}
      >
        <span className="dock-ring">
          <svg className="dg-svg" viewBox="0 0 48 48" aria-hidden="true">
            <circle className="dg-track" cx="24" cy="24" r="21" />
            <circle
              className="dg-arc" cx="24" cy="24" r="21" pathLength="100"
              strokeDasharray={`${share} ${100 - share}`}
              strokeLinecap={share >= 99.5 ? 'butt' : 'round'}
              transform="rotate(-90 24 24)"
            />
          </svg>
          <Icon size={24} aria-hidden="true" />
        </span>
        <b>{Math.round(share)}%</b>
        <span className="dock-tip" role="tooltip">
          <strong>{key} <span>{Math.round(share)}%</span></strong>
          <em>{hint}</em>
        </span>
      </button>
    })}
  </aside>
}

export function Card({ children, className = '', title, action }) {
  return <section className={`card ${className}`}>
    {(title || action) && <div className="card-head">{title && <span className="eyebrow">{title}</span>}{action}</div>}
    {children}
  </section>
}

export function StatTile({ label, caption, icon, value, detail, tone = '', trend, trendTone = 'up', accessory }) {
  return <div className="stat-tile">
    <div className="stat-head">
      {icon && <span className="stat-badge">{icon}</span>}
      <span className="stat-labels"><b>{label}</b>{caption && <small>{caption}</small>}</span>
      {trend && <span className={`stat-pill ${trendTone}`}>
        {trendTone === 'down' ? <TrendingDown size={12} strokeWidth={2.2} /> : <TrendingUp size={12} strokeWidth={2.2} />}
        {trend}
      </span>}
    </div>
    <div className="stat-body">
      <div className="stat-copy">
        <strong className={tone}>{value}</strong>
        {detail && <small>{detail}</small>}
      </div>
      {accessory && <div className="stat-accessory">{accessory}</div>}
    </div>
  </div>
}

export function Metric({ label, value, detail, tone = '', privacy = false, icon, chart }) {
  return <Card className={`metric-card${chart ? ' has-chart' : ''}`}>
    <div className="metric-label"><span>{label}</span>{icon}</div>
    <div className="metric-body">
      <div className="metric-copy">
        <strong className={tone}>{privacy && /[$%]/.test(String(value)) ? '••••••' : value}</strong>
        {detail && <small>{detail}</small>}
      </div>
      {chart && <div className="metric-chart">{chart}</div>}
    </div>
  </Card>
}

export function PageHeading({ eyebrow, title, text, action }) {
  return <div className="page-heading"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1>{text && <p>{text}</p>}</div>{action}</div>
}

export function Pill({ children, tone = '' }) { return <span className={`pill ${tone}`}>{children}</span> }

export function EmptyPage({ page }) {
  const today = useEasternToday()
  return <div className="empty-page"><span className="home-date">{today.label}</span><h1>{page}</h1></div>
}

export const icons = { Sparkles, Download, ImageIcon, Mic, Star, ArrowUpRight, GripVertical, ChevronLeft, ChevronRight }
