import React, { useEffect, useMemo, useState } from 'react'
import { EmptyPage, Sidebar, SideDock, Topbar } from './components'
import { Dashboard, CalendarPage, JournalPage } from './pages'
import { TradesPage, PropFirmsPage } from './workspace'
import { LogTradeDialog, QuickJump } from './dialogs'
import { tradingDays } from './data'

const primaryPages = ['Dashboard', 'Calendar', 'Daily journal', 'Trades', 'Prop firms', 'Reports', 'Notebook', 'Playbooks', 'Progress', 'Missed trades', 'Import', 'Accounts', 'Settings', 'Profile', 'Privacy', 'Terms', 'Disclaimer', 'Support']
const latestDay = () => tradingDays().at(-1)

// Designs by RNSENCE Studio
export default function App() {
  const initial = decodeURIComponent(location.hash.slice(1))
  const [page, setPageState] = useState(primaryPages.includes(initial) ? initial : 'Dashboard')
  const [privacy, setPrivacy] = useState(false)
  const [range, setRange] = useState('All')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [journalDate, setJournalDate] = useState(latestDay)
  const [tradeQuery, setTradeQuery] = useState('')
  const [logOpen, setLogOpen] = useState(false)
  const [jumpOpen, setJumpOpen] = useState(false)
  const [dataVersion, setDataVersion] = useState(0)

  const setPage = (next) => { setPageState(next); history.replaceState(null, '', `#${encodeURIComponent(next)}`); window.scrollTo(0, 0) }
  const openJournal = (date) => { setJournalDate(date); setPage('Daily journal') }
  const openTrades = (query = '') => { setTradeQuery(query); setPage('Trades') }
  const openLog = () => setLogOpen(true)

  useEffect(() => {
    const onData = () => setDataVersion((value) => value + 1)
    const onKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setJumpOpen(true) }
    }
    window.addEventListener('journal:data', onData)
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('journal:data', onData); window.removeEventListener('keydown', onKey) }
  }, [])

  const nav = { setPage, openJournal, openTrades, openLog }
  const view = useMemo(() => {
    if (page === 'Dashboard') return <Dashboard privacy={privacy} range={range} {...nav}/>
    if (page === 'Calendar') return <CalendarPage privacy={privacy} {...nav}/>
    if (page === 'Daily journal') return <JournalPage privacy={privacy} date={journalDate} setDate={setJournalDate} {...nav}/>
    if (page === 'Trades') return <TradesPage privacy={privacy} range={range} initialQuery={tradeQuery} {...nav}/>
    if (page === 'Prop firms') return <PropFirmsPage privacy={privacy} {...nav}/>
    return <EmptyPage page={page}/>
  }, [page, privacy, range, journalDate, tradeQuery, dataVersion])

  return <div className="app-shell">
    <Sidebar page={page} setPage={setPage} openLog={openLog} open={sidebarOpen} setOpen={setSidebarOpen}/>
    {sidebarOpen && <div className="scrim" onClick={() => setSidebarOpen(false)}/>}
    <div className="workspace">
      <Topbar page={page} setPage={setPage} range={range} setRange={setRange} setSidebarOpen={setSidebarOpen} privacy={privacy} setPrivacy={setPrivacy} openJump={() => setJumpOpen(true)}/>
      <main key={`${page}-${dataVersion}-${page === 'Daily journal' ? journalDate : ''}`}>{view}</main>
      <SideDock setPage={setPage}/>
    </div>
    {logOpen && <LogTradeDialog defaultDate={page === 'Daily journal' ? journalDate : undefined} onClose={() => setLogOpen(false)} onSaved={(trade) => { setLogOpen(false); openJournal(trade.date) }}/>}
    {jumpOpen && <QuickJump onClose={() => setJumpOpen(false)} {...nav}/>}
  </div>
}
