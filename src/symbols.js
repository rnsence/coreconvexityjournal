/**
 * Local instrument directory for the symbol picker: [symbol, name, class].
 * Covers the most-traded US stocks and ETFs, CME futures (full and micro), index options,
 * crypto and major FX pairs. User-created symbols are stored separately in localStorage.
 */
const STOCKS = [
  ['AAPL', 'Apple'], ['MSFT', 'Microsoft'], ['NVDA', 'NVIDIA'], ['AMZN', 'Amazon'], ['GOOGL', 'Alphabet Class A'], ['GOOG', 'Alphabet Class C'],
  ['META', 'Meta Platforms'], ['TSLA', 'Tesla'], ['BRK.B', 'Berkshire Hathaway B'], ['AVGO', 'Broadcom'], ['LLY', 'Eli Lilly'], ['JPM', 'JPMorgan Chase'],
  ['V', 'Visa'], ['UNH', 'UnitedHealth'], ['XOM', 'Exxon Mobil'], ['MA', 'Mastercard'], ['JNJ', 'Johnson & Johnson'], ['PG', 'Procter & Gamble'],
  ['HD', 'Home Depot'], ['COST', 'Costco'], ['ABBV', 'AbbVie'], ['MRK', 'Merck'], ['CVX', 'Chevron'], ['CRM', 'Salesforce'], ['NFLX', 'Netflix'],
  ['AMD', 'Advanced Micro Devices'], ['PEP', 'PepsiCo'], ['KO', 'Coca-Cola'], ['ADBE', 'Adobe'], ['WMT', 'Walmart'], ['BAC', 'Bank of America'],
  ['TMO', 'Thermo Fisher'], ['ACN', 'Accenture'], ['MCD', "McDonald's"], ['CSCO', 'Cisco'], ['ABT', 'Abbott'], ['ORCL', 'Oracle'], ['LIN', 'Linde'],
  ['INTC', 'Intel'], ['QCOM', 'Qualcomm'], ['TXN', 'Texas Instruments'], ['DIS', 'Disney'], ['WFC', 'Wells Fargo'], ['INTU', 'Intuit'], ['IBM', 'IBM'],
  ['CAT', 'Caterpillar'], ['GE', 'GE Aerospace'], ['AMAT', 'Applied Materials'], ['NOW', 'ServiceNow'], ['UBER', 'Uber'], ['PFE', 'Pfizer'],
  ['GS', 'Goldman Sachs'], ['MS', 'Morgan Stanley'], ['BA', 'Boeing'], ['AMGN', 'Amgen'], ['ISRG', 'Intuitive Surgical'], ['SPGI', 'S&P Global'],
  ['BKNG', 'Booking Holdings'], ['LOW', "Lowe's"], ['HON', 'Honeywell'], ['NKE', 'Nike'], ['SBUX', 'Starbucks'], ['PLTR', 'Palantir'],
  ['MU', 'Micron'], ['LRCX', 'Lam Research'], ['KLAC', 'KLA'], ['PANW', 'Palo Alto Networks'], ['SNOW', 'Snowflake'], ['CRWD', 'CrowdStrike'],
  ['SHOP', 'Shopify'], ['PYPL', 'PayPal'], ['SQ', 'Block'], ['COIN', 'Coinbase'], ['MSTR', 'MicroStrategy'], ['HOOD', 'Robinhood'], ['SOFI', 'SoFi'],
  ['RIVN', 'Rivian'], ['LCID', 'Lucid Group'], ['NIO', 'NIO'], ['F', 'Ford'], ['GM', 'General Motors'], ['T', 'AT&T'], ['VZ', 'Verizon'],
  ['CMCSA', 'Comcast'], ['C', 'Citigroup'], ['SCHW', 'Charles Schwab'], ['BLK', 'BlackRock'], ['AXP', 'American Express'], ['DE', 'Deere'],
  ['LMT', 'Lockheed Martin'], ['RTX', 'RTX'], ['UPS', 'UPS'], ['FDX', 'FedEx'], ['MMM', '3M'], ['CVS', 'CVS Health'], ['GILD', 'Gilead'],
  ['MRNA', 'Moderna'], ['REGN', 'Regeneron'], ['VRTX', 'Vertex'], ['ZM', 'Zoom'], ['DDOG', 'Datadog'], ['NET', 'Cloudflare'], ['MDB', 'MongoDB'],
  ['ARM', 'Arm Holdings'], ['SMCI', 'Super Micro Computer'], ['DELL', 'Dell'], ['HPQ', 'HP'], ['ANET', 'Arista Networks'], ['MRVL', 'Marvell'],
  ['ON', 'ON Semiconductor'], ['ASML', 'ASML'], ['TSM', 'Taiwan Semiconductor'], ['BABA', 'Alibaba'], ['PDD', 'PDD Holdings'], ['JD', 'JD.com'],
  ['ABNB', 'Airbnb'], ['DASH', 'DoorDash'], ['LYFT', 'Lyft'], ['SNAP', 'Snap'], ['PINS', 'Pinterest'], ['RBLX', 'Roblox'], ['U', 'Unity'],
  ['ROKU', 'Roku'], ['SPOT', 'Spotify'], ['TTD', 'The Trade Desk'], ['ENPH', 'Enphase'], ['FSLR', 'First Solar'], ['OXY', 'Occidental'],
  ['SLB', 'Schlumberger'], ['COP', 'ConocoPhillips'], ['MPC', 'Marathon Petroleum'], ['DAL', 'Delta Air Lines'], ['UAL', 'United Airlines'],
  ['AAL', 'American Airlines'], ['CCL', 'Carnival'], ['GME', 'GameStop'], ['AMC', 'AMC Entertainment'], ['MARA', 'MARA Holdings'], ['RIOT', 'Riot Platforms'],
].map(([symbol, name]) => [symbol, name, 'Stock'])

const ETFS = [
  ['SPY', 'SPDR S&P 500'], ['QQQ', 'Invesco QQQ (Nasdaq-100)'], ['IWM', 'iShares Russell 2000'], ['DIA', 'SPDR Dow Jones'], ['VOO', 'Vanguard S&P 500'],
  ['VTI', 'Vanguard Total Market'], ['TQQQ', 'ProShares UltraPro QQQ'], ['SQQQ', 'ProShares UltraPro Short QQQ'], ['SPXL', 'Direxion S&P 500 Bull 3x'],
  ['SPXS', 'Direxion S&P 500 Bear 3x'], ['SOXL', 'Direxion Semiconductor Bull 3x'], ['SOXS', 'Direxion Semiconductor Bear 3x'], ['UVXY', 'ProShares Ultra VIX'],
  ['VXX', 'iPath VIX Short-Term'], ['SMH', 'VanEck Semiconductor'], ['XLF', 'Financial Select Sector'], ['XLE', 'Energy Select Sector'],
  ['XLK', 'Technology Select Sector'], ['XLV', 'Health Care Select Sector'], ['XLI', 'Industrial Select Sector'], ['XLY', 'Consumer Discretionary Select'],
  ['XLP', 'Consumer Staples Select'], ['XLU', 'Utilities Select Sector'], ['ARKK', 'ARK Innovation'], ['GLD', 'SPDR Gold Shares'], ['SLV', 'iShares Silver'],
  ['USO', 'United States Oil Fund'], ['TLT', 'iShares 20+ Year Treasury'], ['HYG', 'iShares High Yield Corporate'], ['EEM', 'iShares MSCI Emerging Markets'],
  ['EFA', 'iShares MSCI EAFE'], ['KRE', 'SPDR Regional Banking'], ['IBIT', 'iShares Bitcoin Trust'], ['FXI', 'iShares China Large-Cap'],
].map(([symbol, name]) => [symbol, name, 'ETF'])

const FUTURES = [
  ['ES', 'E-mini S&P 500'], ['MES', 'Micro E-mini S&P 500'], ['NQ', 'E-mini Nasdaq-100'], ['MNQ', 'Micro E-mini Nasdaq-100'],
  ['YM', 'E-mini Dow'], ['MYM', 'Micro E-mini Dow'], ['RTY', 'E-mini Russell 2000'], ['M2K', 'Micro E-mini Russell 2000'],
  ['CL', 'Crude Oil (WTI)'], ['MCL', 'Micro WTI Crude Oil'], ['QM', 'E-mini Crude Oil'], ['NG', 'Natural Gas'], ['RB', 'RBOB Gasoline'], ['HO', 'Heating Oil'],
  ['GC', 'Gold'], ['MGC', 'Micro Gold'], ['SI', 'Silver'], ['SIL', 'Micro Silver'], ['HG', 'Copper'], ['PL', 'Platinum'],
  ['ZB', '30-Year T-Bond'], ['ZN', '10-Year T-Note'], ['ZF', '5-Year T-Note'], ['ZT', '2-Year T-Note'], ['UB', 'Ultra T-Bond'],
  ['6E', 'Euro FX'], ['M6E', 'Micro Euro FX'], ['6J', 'Japanese Yen'], ['6B', 'British Pound'], ['6A', 'Australian Dollar'], ['6C', 'Canadian Dollar'], ['6S', 'Swiss Franc'],
  ['ZC', 'Corn'], ['ZS', 'Soybeans'], ['ZW', 'Wheat'], ['LE', 'Live Cattle'], ['HE', 'Lean Hogs'],
  ['BTC', 'Bitcoin futures (CME)'], ['MBT', 'Micro Bitcoin futures'], ['ETH', 'Ether futures (CME)'], ['MET', 'Micro Ether futures'], ['VX', 'VIX futures'],
].map(([symbol, name]) => [symbol, name, 'Future'])

const OPTIONS = [
  ['SPX', 'S&P 500 Index options'], ['XSP', 'Mini-SPX Index options'], ['NDX', 'Nasdaq-100 Index options'], ['XND', 'Micro Nasdaq-100 Index options'],
  ['RUT', 'Russell 2000 Index options'], ['VIX', 'Cboe Volatility Index options'], ['DJX', 'Dow Jones Index options (1/100)'],
].map(([symbol, name]) => [symbol, name, 'Index option'])

const CRYPTO = [
  ['BTCUSD', 'Bitcoin / US Dollar'], ['ETHUSD', 'Ether / US Dollar'], ['SOLUSD', 'Solana / US Dollar'], ['XRPUSD', 'XRP / US Dollar'],
  ['DOGEUSD', 'Dogecoin / US Dollar'], ['ADAUSD', 'Cardano / US Dollar'], ['AVAXUSD', 'Avalanche / US Dollar'], ['LINKUSD', 'Chainlink / US Dollar'],
].map(([symbol, name]) => [symbol, name, 'Crypto'])

const FOREX = [
  ['EURUSD', 'Euro / US Dollar'], ['GBPUSD', 'British Pound / US Dollar'], ['USDJPY', 'US Dollar / Japanese Yen'], ['AUDUSD', 'Australian Dollar / US Dollar'],
  ['USDCAD', 'US Dollar / Canadian Dollar'], ['USDCHF', 'US Dollar / Swiss Franc'], ['NZDUSD', 'New Zealand Dollar / US Dollar'], ['EURJPY', 'Euro / Japanese Yen'],
  ['GBPJPY', 'British Pound / Japanese Yen'], ['XAUUSD', 'Gold spot / US Dollar'],
].map(([symbol, name]) => [symbol, name, 'Forex'])

export const SYMBOL_CLASSES = ['Stock', 'ETF', 'Future', 'Index option', 'Crypto', 'Forex', 'Custom']

const CUSTOM_KEY = 'cc-custom-symbols'
export const customSymbols = () => { try { return JSON.parse(localStorage.getItem(CUSTOM_KEY)) || [] } catch { return [] } }
export function addCustomSymbol(symbol, name = 'Custom symbol') {
  const entry = [symbol.toUpperCase(), name, 'Custom']
  try { localStorage.setItem(CUSTOM_KEY, JSON.stringify([...customSymbols().filter(([item]) => item !== entry[0]), entry])) } catch { /* storage unavailable */ }
  return entry
}

const BUILT_IN = [...FUTURES, ...ETFS, ...STOCKS, ...OPTIONS, ...CRYPTO, ...FOREX]
export const allSymbols = () => [...customSymbols(), ...BUILT_IN]


/**
 * Instrument marks, keyed by ticker. The value is the path segment on the public
 * symbol-logo CDN; tickers without an entry fall back to the lettered token.
 */
const MARKS = {
  '6A': 'country/AU', '6B': 'country/GB', '6C': 'country/CA', '6E': 'country/EU',
  '6J': 'country/JP', '6S': 'country/CH', AAL: 'american-airlines-group', AAPL: 'apple',
  ABBV: 'abbvie', ABNB: 'airbnb', ABT: 'abbott', ACN: 'accenture',
  ADAUSD: 'crypto/XTVCADA', ADBE: 'adobe', AMAT: 'applied-materials', AMC: 'amc-entertainment-holdings',
  AMD: 'advanced-micro-devices', AMGN: 'amgen', AMZN: 'amazon', ANET: 'arista-networks',
  ARM: 'arm', ASML: 'asml', AUDUSD: 'country/AU', AVAXUSD: 'crypto/XTVCAVAX',
  AVGO: 'broadcom', AXP: 'american-express', BA: 'boeing', BABA: 'alibaba',
  BAC: 'bank-of-america', BKNG: 'booking', BLK: 'blackrock', 'BRK.B': 'berkshire-hathaway',
  BTC: 'crypto/XTVCBTC', BTCUSD: 'crypto/XTVCBTC', C: 'citigroup', CAT: 'caterpillar',
  CCL: 'carnival', CL: 'crude-oil', CMCSA: 'comcast', COIN: 'coinbase',
  COP: 'conocophillips', COST: 'costco-wholesale', CRM: 'salesforce', CRWD: 'crowdstrike',
  CSCO: 'cisco', CVS: 'cvs-health', CVX: 'chevron', DAL: 'delta-air-lines',
  DASH: 'doordash', DDOG: 'datadog', DE: 'deere', DELL: 'dell',
  DIA: 'state-street', DIS: 'walt-disney', DJX: 'indices/dow-30', DOGEUSD: 'crypto/XTVCDOGE',
  EEM: 'ishares', EFA: 'ishares', ENPH: 'enphase-energy', ES: 'indices/s-and-p-500',
  ETH: 'crypto/XTVCETH', ETHUSD: 'crypto/XTVCETH', EURJPY: 'country/EU', EURUSD: 'country/EU',
  F: 'ford', FDX: 'fedex', FSLR: 'first-solar', FXI: 'ishares',
  GBPJPY: 'country/GB', GBPUSD: 'country/GB', GC: 'gold', GE: 'ge-aerospace',
  GILD: 'gilead', GLD: 'state-street', GM: 'general-motors', GME: 'gamestop',
  GOOG: 'alphabet', GOOGL: 'alphabet', GS: 'goldman-sachs', HD: 'home-depot',
  HO: 'diesel', HON: 'honeywell', HOOD: 'robinhood', HPQ: 'hp',
  HYG: 'ishares', IBIT: 'ishares', INTC: 'intel', INTU: 'intuit',
  ISRG: 'intuitive-surgical', IWM: 'ishares', JD: 'jd-com', JNJ: 'johnson-and-johnson',
  JPM: 'jpmorgan-chase', KLAC: 'kla-tencor', KO: 'coca-cola', KRE: 'state-street',
  LCID: 'lucid-group', LE: 'live-cattle', LIN: 'linde', LINKUSD: 'crypto/XTVCLINK',
  LLY: 'eli-lilly', LMT: 'lockheed-martin', LOW: 'lowe-s', LRCX: 'lam-research',
  LYFT: 'lyft', 'M2K': 'indices/russell-2000', 'M6E': 'country/EU', MA: 'mastercard',
  MARA: 'marathon-digital-holdings', MBT: 'crypto/XTVCBTC', MCD: 'mcdonalds', MCL: 'crude-oil',
  MDB: 'mongodb', MES: 'indices/s-and-p-500', MET: 'crypto/XTVCETH', META: 'meta-platforms',
  MGC: 'gold', MMM: '3m', MNQ: 'indices/nasdaq-100', MPC: 'marathon-petroleum',
  MRK: 'merck', MRNA: 'moderna', MRVL: 'marvell-tech', MS: 'morgan-stanley',
  MSFT: 'microsoft', MSTR: 'microstrategy', MU: 'micron-technology', MYM: 'indices/dow-30',
  NDX: 'indices/nasdaq-100', NET: 'cloudflare-inc', NFLX: 'netflix', NG: 'natural-gas',
  NIO: 'nio', NKE: 'nike', NOW: 'servicenow', NQ: 'indices/nasdaq-100',
  NVDA: 'nvidia', NZDUSD: 'country/NZ', ON: 'on-semiconductor', ORCL: 'oracle',
  OXY: 'occidental-petroleum', PANW: 'palo-alto-networks', PDD: 'pinduoduo', PEP: 'pepsico',
  PFE: 'pfizer', PG: 'procter-and-gamble', PINS: 'pinterest', PLTR: 'palantir',
  PYPL: 'paypal', QCOM: 'qualcomm', QM: 'crude-oil', QQQ: 'invesco',
  RB: 'gasoline', RBLX: 'roblox', REGN: 'regeneron-pharmaceuticals', RIOT: 'riot-blockchain',
  RIVN: 'rivian', ROKU: 'roku', RTX: 'raytheon', RTY: 'indices/russell-2000',
  RUT: 'indices/russell-2000', SBUX: 'starbucks', SCHW: 'schwab', SHOP: 'shopify',
  SI: 'silver', SIL: 'silver', SLB: 'schlumberger', SLV: 'ishares',
  SMCI: 'super-micro-computer', SMH: 'vaneck', SNAP: 'snap', SNOW: 'snowflake',
  SOFI: 'sofi', SOLUSD: 'crypto/XTVCSOL', SOXL: 'direxion', SOXS: 'direxion',
  SPGI: 's-and-p-global', SPOT: 'spotify-technology', SPX: 'indices/s-and-p-500', SPXL: 'direxion',
  SPXS: 'direxion', SPY: 'state-street', SQ: 'block', SQQQ: 'proshares',
  T: 'at-and-t', TLT: 'ishares', TMO: 'thermo-fisher-scientific', TQQQ: 'proshares',
  TSLA: 'tesla', TSM: 'taiwan-semiconductor', TTD: 'the-trade-desk', TXN: 'texas-instruments',
  U: 'unity', UAL: 'united-airlines', UB: 'country/US', UBER: 'uber',
  UNH: 'unitedhealth', UPS: 'united-parcel', USDCAD: 'country/US', USDCHF: 'country/US',
  USDJPY: 'country/US', UVXY: 'proshares', V: 'visa', VIX: 'indices/volatility-index',
  VOO: 'vanguard', VRTX: 'vertex', VTI: 'vanguard', VX: 'indices/volatility-index',
  VXX: 'barclays', VZ: 'verizon', WFC: 'wells-fargo', WMT: 'walmart',
  XAUUSD: 'gold', XLE: 'state-street', XLF: 'state-street', XLI: 'state-street',
  XLK: 'state-street', XLP: 'state-street', XLU: 'state-street', XLV: 'state-street',
  XLY: 'state-street', XND: 'indices/nasdaq-100', XOM: 'exxon', XRPUSD: 'crypto/XTVCXRP',
  XSP: 'indices/s-and-p-500', YM: 'indices/dow-30', ZB: 'country/US', ZC: 'corn',
  ZF: 'country/US', ZM: 'zoom', ZN: 'country/US', ZS: 'soybean',
  ZT: 'country/US', ZW: 'wheat',
}

export const symbolMark = (symbol) => (MARKS[symbol] ? `https://s3-symbol-logo.tradingview.com/${MARKS[symbol]}--big.svg` : null)

/** Asset class for a ticker, as shown on the symbol picker's class tag. */
export const symbolClass = (symbol) => allSymbols().find(([ticker]) => ticker === symbol)?.[2] ?? 'Custom'
export const symbolClassSlug = (symbol) => symbolClass(symbol).split(' ')[0].toLowerCase()

/** Ranked matches: exact ticker, then ticker prefix, then name words, then name contains. */
export function searchSymbols(query, limit = 8) {
  const text = query.trim().toUpperCase()
  if (!text) return []
  const scored = []
  allSymbols().forEach((entry) => {
    const [symbol, name] = entry
    const upperName = name.toUpperCase()
    let score = null
    if (symbol === text) score = 0
    else if (symbol.startsWith(text)) score = 1 + symbol.length / 100
    else if (upperName.split(/[\s/().-]+/).some((word) => word.startsWith(text))) score = 2
    else if (upperName.includes(text)) score = 3
    if (score != null) scored.push([score, entry])
  })
  return scored.sort((a, b) => a[0] - b[0]).slice(0, limit).map(([, entry]) => entry)
}
