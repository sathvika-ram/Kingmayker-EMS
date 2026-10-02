import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { useAuth } from '../context/AuthContext';
import { BarChart3, CheckCircle, Clock3, Download, FileSpreadsheet, LayoutDashboard, LogOut, Map, Menu, RefreshCw, Search, Users, X, ArrowLeft } from 'lucide-react';
import { API } from '../utils/api';

const selectClass = 'rounded-md border border-[#b5c9c1] bg-white px-3 py-2 text-sm text-[#173b35] focus:border-[#1d6b5d]';

const normalizeGeographyName = (value) => {
  const text = String(value ?? '').trim();
  if (!text) return text;
  const aliases = { bhupalpalle: 'Bhupalpally', bhupalapalle: 'Bhupalpally', bhupalpally: 'Bhupalpally' };
  return aliases[text.toLowerCase()] || text;
};

export default function LeaderDashboard() {
  const { user, logout } = useAuth();
  const [regions, setRegions] = useState([]);
  const [constituencies, setConstituencies] = useState([]);
  const [mandals, setMandals] = useState([]);
  const [region, setRegion] = useState('');
  const [constituency, setConstituency] = useState('');
  const [mandal, setMandal] = useState('');
  const [status, setStatus] = useState('');
  const [activeView, setActiveView] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState({ metrics: {}, regional_breakdown: [], daily_trend: [] });
  const [regionalStats, setRegionalStats] = useState([]);
  const [regionalMetric, setRegionalMetric] = useState('total');
  const [constituencyCards, setConstituencyCards] = useState([]);
  const [constituencyCardsLoading, setConstituencyCardsLoading] = useState(true);
  const [constituencySearch, setConstituencySearch] = useState('');
  const [constituencySearchFocused, setConstituencySearchFocused] = useState(false);
  const [constituencyCardColumns, setConstituencyCardColumns] = useState(() => window.innerWidth >= 1536 ? 4 : window.innerWidth >= 1280 ? 3 : window.innerWidth >= 640 ? 2 : 1);
  const [showAllConstituencies, setShowAllConstituencies] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const loadRequestRef = useRef(null);

  useEffect(() => {
    const updateCardColumns = () => setConstituencyCardColumns(window.innerWidth >= 1536 ? 4 : window.innerWidth >= 1280 ? 3 : window.innerWidth >= 640 ? 2 : 1);
    window.addEventListener('resize', updateCardColumns);
    return () => window.removeEventListener('resize', updateCardColumns);
  }, []);

  const loadDashboardData = async (silent = false) => {
    loadRequestRef.current?.abort();
    const controller = new AbortController();
    loadRequestRef.current = controller;
    if (!silent) setLoading(true);
    try {
      const params = { region, constituency, mandal, status };
      const summaryResult = await axios.get(`${API}/admin/summary`, { params, signal: controller.signal });
      setSummary(summaryResult.data || {});
      setError('');
    } catch (error) { if (!axios.isCancel(error)) setError('Unable to load live enrollment analytics.'); }
    finally {
      if (loadRequestRef.current === controller) {
        loadRequestRef.current = null;
        if (!silent) setLoading(false);
      }
    }
  };

  useEffect(() => { axios.get(`${API}/geo/regions`).then(result => setRegions(result.data || [])).catch(() => setError('Unable to load regions.')); }, []);
  useEffect(() => {
    Promise.all(['Warangal', 'Nalgonda', 'Khammam'].map(name => axios.get(`${API}/admin/summary`, { params: { region: name } }).then(result => ({ name, ...result.data.metrics })) ))
      .then(setRegionalStats)
      .catch(() => setError('Unable to load regional analytics.'));
  }, [refreshKey]);
  useEffect(() => {
    let active = true;
    const loadConstituencyCards = async () => {
      if (!constituencies.length) {
        setConstituencyCards([]);
        return;
      }
      setConstituencyCardsLoading(true);
      const loadedCards = [];
      try {
        for (let index = 0; index < constituencies.length; index += 4) {
          const batch = await Promise.all(constituencies.slice(index, index + 4).map(async item => {
            const name = item.assembly_constituency;
            const result = await axios.get(`${API}/admin/summary`, { params: { ...(region ? { region } : {}), constituency: name } });
            const summaryData = result.data || {};
            const todayCount = summaryData.daily_trend?.find(item => String(item.day).slice(0, 10) === toLocalDateKey(new Date()))?.count || 0;
            return {
              name,
              key: `${item.region || ''}-${item.ac_no}-${name}`,
              enrolled: Number(summaryData.metrics?.total || 0),
              approved: Number(summaryData.metrics?.approved || 0),
              today: Number(todayCount)
            };
          }));
          loadedCards.push(...batch);
          if (active) setConstituencyCards([...loadedCards]);
        }
      } catch {
        if (active) setError('Unable to load constituency analytics.');
      } finally {
        if (active) setConstituencyCardsLoading(false);
      }
    };
    loadConstituencyCards();
    return () => { active = false; };
  }, [constituencies, region, refreshKey]);
  useEffect(() => {
    setConstituency(''); setMandal(''); setMandals([]);
    setConstituencies([]);
    axios.get(`${API}/geo/assemblies`, { params: region ? { region } : {} })
      .then(result => setConstituencies((result.data || []).map(item => ({
        ...item,
        assembly_constituency: normalizeGeographyName(item.assembly_constituency)
      }))))
      .catch(() => setError('Unable to load constituencies.'));
  }, [region]);
  useEffect(() => {
    const normalizedConstituency = String(constituency || '').trim();
    if (!normalizedConstituency) { setMandals([]); return; }
    setMandal('');
    axios.get(`${API}/geo/mandals`, { params: { constituency: normalizedConstituency } })
      .then(result => setMandals(Array.isArray(result.data) ? result.data.map(item => {
        const normalizedItem = typeof item === 'string' ? { mandal: item } : item;
        return { ...normalizedItem, mandal: normalizeGeographyName(normalizedItem.mandal) };
      }) : []))
      .catch(() => setError('Unable to load mandals.'));
  }, [constituency]);
  useEffect(() => { if (activeView !== 'overview') requestAnimationFrame(() => document.getElementById(activeView)?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }, [activeView]);
  useEffect(() => { loadDashboardData(); }, [region, constituency, mandal, status]);
  useEffect(() => () => loadRequestRef.current?.abort(), []);
  useEffect(() => {
    const refreshVisibleDashboard = () => {
      if (document.visibilityState === 'visible') loadDashboardData(true);
    };
    const interval = setInterval(refreshVisibleDashboard, 30000);
    document.addEventListener('visibilitychange', refreshVisibleDashboard);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshVisibleDashboard);
    };
  }, [region, constituency, mandal, status]);

  const approved = Number(summary.metrics?.approved || 0);
  const pending = Number(summary.metrics?.pending || 0);
  const rejected = Number(summary.metrics?.rejected || 0);
  const total = Number(summary.metrics?.total || 0);
  const today = Number(summary.daily_trend?.find(item => String(item.day).slice(0, 10) === toLocalDateKey(new Date()))?.count || 0);
  const approvalRate = total ? Math.round((approved / total) * 100) : 0;
  const trend = summary.daily_trend?.map(item => ({ label: new Date(item.day).toLocaleDateString(undefined, { weekday: 'short' }), value: Number(item.count) })) || [];
  const matchingConstituencyCards = constituencySearch.trim().length >= 2
    ? constituencyCards.filter(card => card.name.toLowerCase().includes(constituencySearch.trim().toLowerCase()))
    : constituencyCards;
  const constituencySuggestions = constituencySearch.trim().length >= 2
    ? matchingConstituencyCards.slice(0, 8)
    : [];
  const initialConstituencyCardCount = constituencyCardColumns * 3;
  const visibleConstituencyCards = showAllConstituencies
    ? matchingConstituencyCards
    : matchingConstituencyCards.slice(0, initialConstituencyCardCount);
  const downloadConstituencySheet = () => {
    const rows = matchingConstituencyCards.map(card => ({
      Constituency: card.name,
      'Total Enrolled': card.enrolled,
      Approved: card.approved,
      "Today's Velocity": card.today
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = [{ wch: 28 }, { wch: 18 }, { wch: 14 }, { wch: 20 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Constituency Counts');
    XLSX.writeFile(workbook, `constituency-counts-${toLocalDateKey(new Date())}.xlsx`);
  };
  const navigate = (view) => { setActiveView(view); setSidebarOpen(false); };
  const sortedRegionalStats = [...regionalStats].sort((a, b) => Number(b[regionalMetric] || 0) - Number(a[regionalMetric] || 0));

  return <div className="min-h-screen bg-[#f3f7f5] text-[#173b35]">
    <header className="sticky top-0 z-30 border-b border-[#e4ebe7] bg-white/95 px-4 py-2 shadow-[0_10px_30px_rgba(15,36,30,0.06)] backdrop-blur sm:px-8"><div className="flex w-full items-center justify-between gap-3"><div className="flex items-center gap-3"><button onClick={() => setSidebarOpen(true)} title="Open navigation" aria-label="Open navigation" className="rounded-md p-2 text-[#1d6b5d] lg:hidden"><Menu size={20} /></button><img src="/rakeshreddy.png" alt="Kingmayker EMS" className="leader-logo" /><div className="flex flex-col"><div className="app-brand-wrap"><p className="app-brand-text app-brand-desktop">KINGMAYKER EMS</p><p className="app-brand-text app-brand-mobile">EMS</p></div><h1 className="dashboard-page-title">LEADER VIEW</h1></div></div><div className="flex items-center gap-3"><span className="hidden text-sm font-semibold text-[#3a4f49] sm:inline">{user?.name || 'Party Leader'}</span><button onClick={logout} title="Sign out" aria-label="Sign out" className="rounded-md p-2 text-[#64736f] transition hover:bg-[#eef6f2] hover:text-[#173b35]"><LogOut size={18} /></button></div></div></header>
    <div className="flex w-full">
      <aside className={`${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} fixed inset-y-0 left-0 z-40 mt-[65px] w-72 border-r border-[#dce8e2] bg-[#173b35] p-4 text-white transition-transform lg:sticky lg:top-[65px] lg:mt-0 lg:h-[calc(100vh-65px)] lg:w-64 lg:translate-x-0`}>
        <div className="mb-5 flex items-center justify-between lg:hidden">
          <span className="text-xs font-bold uppercase tracking-wider text-[#d8f36a]">Navigation</span>
          <button onClick={() => setSidebarOpen(false)} title="Close navigation" aria-label="Close navigation"><X size={19} /></button>
        </div>
        <nav className="space-y-1">
          <SideLink icon={<LayoutDashboard size={17} />} label="Analytics overview" active={activeView === 'overview'} onClick={() => navigate('overview')} />
          <SideLink icon={<BarChart3 size={17} />} label="Regional analytics" active={activeView === 'regional'} onClick={() => navigate('regional')} />
        </nav>
      </aside>
      {sidebarOpen && <button type="button" aria-label="Close navigation overlay" onClick={() => setSidebarOpen(false)} className="fixed inset-0 z-30 bg-[#173b35]/40 lg:hidden" />}
      <main className="min-w-0 flex-1 space-y-5 p-4 sm:p-8" id="overview"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#7b9b3a]">Leader dashboard</p><h2 className="mt-1 text-2xl font-bold">Regional performance</h2><p className="mt-1 text-sm text-[#64736f]">Live enrollment intelligence from the voter database.</p></div><button type="button" onClick={() => { loadDashboardData(); setRefreshKey(key => key + 1); }} title="Refresh data" aria-label="Refresh data" className="rounded-md border border-[#b5c9c1] bg-white p-2 text-[#1d6b5d] transition hover:bg-[#eef6f2]"><RefreshCw size={17} className={loading || constituencyCardsLoading ? 'animate-spin' : ''} /></button></div>
        <section className="rounded-lg border border-[#e4ebe7] bg-white p-4 shadow-sm" id="geography"><div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#52736a]"><Map size={16} /> Executive filters</div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><select value={region} onChange={event => setRegion(event.target.value)} className={selectClass}><option value="">All Regions</option>{regions.map(item => <option key={item.region} value={item.region}>{item.region}</option>)}</select><select value={constituency} onChange={event => setConstituency(event.target.value)} className={selectClass}><option value="">Select constituency</option>{constituencies.map(item => <option key={`${item.ac_no}-${item.assembly_constituency}`} value={item.assembly_constituency}>{item.assembly_constituency}</option>)}</select><select value={mandal} onChange={event => setMandal(event.target.value)} disabled={!constituency} className={selectClass}><option value="">All Mandals</option>{mandals.map(item => <option key={item.mandal} value={item.mandal}>{item.mandal}</option>)}</select><select value={status} onChange={event => setStatus(event.target.value)} className={selectClass}><option value="">All Statuses</option><option value="approved">Approved</option><option value="pending">Pending</option><option value="rejected">Rejected</option></select></div></section>
        {error && <div className="rounded-md border border-[#f0c8c2] bg-[#fff3f1] p-3 text-sm text-[#a84b43]">{error}</div>}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Metric icon={<Users size={19} />} label="Total enrollments" value={total} /><Metric icon={<BarChart3 size={19} />} label="Today's velocity" value={`+${today}`} /><Metric icon={<CheckCircle size={19} />} label="Verification approved" value={`${approvalRate}%`} /><Metric icon={<Clock3 size={19} />} label="Pending review" value={pending} /></div>
        <section className="rounded-lg border border-[#e4ebe7] bg-white p-4 shadow-sm" aria-labelledby="constituency-performance-title"><div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><h3 id="constituency-performance-title" className="font-bold">Constituency performance</h3><p className="mt-1 text-xs text-[#64736f]">Enrollment totals, approved applications, and today's velocity{region ? ` in ${region}` : ' across all regions'}.</p></div><div className="flex w-full flex-wrap items-center gap-2 sm:w-auto"><div className="relative min-w-0 flex-1 sm:w-64 sm:flex-none"><Search size={15} className="absolute left-3 top-2.5 text-[#64736f]" /><input type="search" value={constituencySearch} onChange={event => { setConstituencySearch(event.target.value); setShowAllConstituencies(false); }} onFocus={() => setConstituencySearchFocused(true)} onBlur={() => setConstituencySearchFocused(false)} placeholder="Search constituency" aria-label="Search constituency" className={`${selectClass} w-full pl-9`} />{constituencySearchFocused && constituencySuggestions.length > 0 && <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-md border border-[#b5c9c1] bg-white py-1 shadow-lg">{constituencySuggestions.map(card => <button key={card.key} type="button" onMouseDown={event => event.preventDefault()} onClick={() => { setConstituencySearch(card.name); setShowAllConstituencies(false); }} className="block w-full px-3 py-2 text-left text-sm hover:bg-[#eef6f2]">{card.name}</button>)}</div>}</div><button type="button" onClick={downloadConstituencySheet} disabled={!matchingConstituencyCards.length} title="Download visible constituency counts" aria-label="Download visible constituency counts" className="inline-flex items-center gap-2 rounded-md border border-[#b5c9c1] bg-white px-3 py-2 text-sm font-semibold text-[#1d6b5d] transition hover:bg-[#eef6f2] disabled:cursor-not-allowed disabled:opacity-50"><FileSpreadsheet size={16} /><span className="hidden sm:inline">Export sheet</span><Download size={14} /></button></div></div>{constituencyCards.length ? matchingConstituencyCards.length ? <><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{visibleConstituencyCards.map(card => <article key={card.key} className="min-w-0 rounded-lg border border-[#e4ebe7] bg-[#fbfdfc] p-4"><h4 className="truncate text-sm font-bold text-[#173b35]" title={card.name}>{card.name}</h4><div className="mt-3 grid grid-cols-3 gap-2 border-t border-[#e4ebe7] pt-3"><div><p className="text-[10px] font-semibold uppercase text-[#64736f]">Enrolled</p><p className="mt-1 text-lg font-bold">{card.enrolled.toLocaleString()}</p></div><div><p className="text-[10px] font-semibold uppercase text-[#64736f]">Approved</p><p className="mt-1 text-lg font-bold text-[#2f7c57]">{card.approved.toLocaleString()}</p></div><div><p className="text-[10px] font-semibold uppercase text-[#64736f]">Today</p><p className="mt-1 text-lg font-bold text-[#1d6b5d]">+{card.today.toLocaleString()}</p></div></div></article>)}</div>{matchingConstituencyCards.length > initialConstituencyCardCount && <div className="mt-4 flex justify-center"><button type="button" onClick={() => setShowAllConstituencies(value => !value)} className="rounded-md border border-[#b5c9c1] px-4 py-2 text-sm font-semibold text-[#1d6b5d] transition hover:bg-[#eef6f2]">{showAllConstituencies ? 'See less' : `See more (${matchingConstituencyCards.length - initialConstituencyCardCount})`}</button></div>}</> : <div className="flex min-h-32 items-center justify-center text-sm text-[#64736f]">No matching constituencies.</div> : <div className="flex min-h-32 items-center justify-center text-sm text-[#64736f]">{constituencyCardsLoading ? 'Loading constituency analytics...' : 'No constituency data available.'}</div>}</section>
        <section className="rounded-lg border border-[#e4ebe7] bg-white p-4 shadow-sm" id="records"><div className="mb-4 flex items-center justify-between"><div><h3 className="font-bold">Daily velocity trend</h3><p className="text-xs text-[#64736f]">Enrollment volume over the last seven days</p></div><span className="text-sm font-bold text-[#1d6b5d]">{today} today</span></div><TrendGraph data={trend} /></section>
        {activeView === 'overview' && <section className="rounded-lg border border-[#e4ebe7] bg-white p-4 shadow-sm"><div className="mb-4"><h3 className="font-bold">Enrollment status mix</h3><p className="text-xs text-[#64736f]">Current filtered application distribution</p></div><StatusPie approved={approved} pending={pending} rejected={rejected} /></section>}
        {activeView === 'regional' && <RegionalAnalytics stats={sortedRegionalStats} metric={regionalMetric} setMetric={setRegionalMetric} onBack={() => navigate('overview')} />}
      </main>
    </div>
  </div>;
}

function SideLink({ icon, label, active, onClick }) { return <button type="button" onClick={onClick} className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-semibold transition ${active ? 'bg-white/15 text-[#d8f36a]' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}>{icon}{label}</button>; }
function Metric({ icon, label, value }) { return <div className="rounded-lg border border-[#e4ebe7] bg-white p-4 shadow-sm"><div className="flex items-center gap-3"><span className="rounded-md bg-[#eef8f0] p-2 text-[#2f7c57]">{icon}</span><span className="text-xs font-semibold text-[#64736f]">{label}</span></div><div className="mt-3 text-3xl font-bold">{value}</div></div>; }
function toLocalDateKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
function TrendGraph({ data }) { const max = Math.max(...data.map(item => item.value), 1); return <div className="flex h-36 items-end gap-3 border-b border-l border-[#dce8e2] px-3 pb-0 pt-4">{data.map(item => <div key={item.label} className="flex h-full flex-1 flex-col items-center justify-end gap-2"><span className="text-xs font-semibold text-[#1d6b5d]">{item.value}</span><div className="w-full max-w-12 rounded-t-md bg-[#2f8068]" style={{ height: `${Math.max(5, (item.value / max) * 100)}%` }} /><span className="text-[11px] text-[#64736f]">{item.label}</span></div>)}</div>; }
function RegionalBarGraph({ data, metric }) { const max = Math.max(...data.map(item => Number(item[metric] || 0)), 1); return <div className="flex h-72 items-end gap-6 border-b border-l border-[#dce8e2] px-6 pb-0 pt-6">{data.map((item, index) => { const value = Number(item[metric] || 0); return <div key={item.name} className="flex h-full flex-1 flex-col items-center justify-end gap-2"><span className="text-sm font-bold text-[#173b35]">{value.toLocaleString()}</span><div className="w-full max-w-24 rounded-t-md bg-[#2f8068] transition-all" style={{ height: `${Math.max(4, value / max * 100)}%`, backgroundColor: ['#2f8068', '#d28b32', '#7b9b3a'][index] }} /><span className="text-sm font-semibold text-[#64736f]">{item.name}</span></div>; })}</div>; }
function StatusPie({ approved, pending, rejected }) { const total = approved + pending + rejected; const approvedPct = total ? (approved / total) * 100 : 0; const pendingPct = total ? (pending / total) * 100 : 0; const rejectedPct = total ? (rejected / total) * 100 : 0; return <div className="flex items-center justify-center gap-5"><div className="h-32 w-32 rounded-full" style={{ background: total ? `conic-gradient(#2f7c57 0 ${approvedPct}%, #d28b32 ${approvedPct}% ${approvedPct + pendingPct}%, #c45d52 ${approvedPct + pendingPct}% ${approvedPct + pendingPct + rejectedPct}%)` : 'conic-gradient(#e2e8f0 0 100%)' }} aria-label="Enrollment status pie chart" role="img" /><div className="space-y-2 text-xs"><Legend color="#2f7c57" label="Approved" value={approved} /><Legend color="#d28b32" label="Pending" value={pending} /><Legend color="#c45d52" label="Rejected" value={rejected} /></div></div>; }
function Legend({ color, label, value }) { return <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} /> <span>{label}</span><strong>{value}</strong></div>; }
function RegionalAnalytics({ stats, metric, setMetric, onBack }) {
  return <section id="regional" className="rounded-lg border border-[#e4ebe7] bg-white p-5 shadow-sm"><div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Regional analytics</h2><p className="mt-1 text-sm text-[#64736f]">Enrollment readings for Warangal, Nalgonda, and Khammam.</p></div><div className="flex items-center gap-2"><select value={metric} onChange={event => setMetric(event.target.value)} className={selectClass}><option value="total">Total enrollments</option><option value="approved">Approved enrollments</option></select><button type="button" onClick={onBack} className="inline-flex items-center gap-1 rounded border border-[#b5c9c1] px-3 py-2 text-xs font-semibold"><ArrowLeft size={14} /> Overview</button></div></div><RegionalBarGraph data={stats} metric={metric} /></section>;
}

