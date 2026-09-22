import { useEffect, useState } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { useAuth } from '../context/AuthContext';
import { BarChart3, CheckCircle, Clock3, Download, FileSpreadsheet, LayoutDashboard, LogOut, Map, Menu, RefreshCw, Search, Users, X, ArrowLeft } from 'lucide-react';
import { API } from '../utils/api';

const selectClass = 'rounded-md border border-[#b5c9c1] bg-white px-3 py-2 text-sm text-[#173b35] focus:border-[#1d6b5d]';

export default function LeaderDashboard() {
  const { user, logout } = useAuth();
  const [voters, setVoters] = useState([]);
  const [regions, setRegions] = useState([]);
  const [constituencies, setConstituencies] = useState([]);
  const [mandals, setMandals] = useState([]);
  const [region, setRegion] = useState('');
  const [constituency, setConstituency] = useState('');
  const [mandal, setMandal] = useState('');
  const [status, setStatus] = useState('');
  const [constituencySearch, setConstituencySearch] = useState('');
  const [mandalSearch, setMandalSearch] = useState('');
  const [activeView, setActiveView] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState({ metrics: {}, regional_breakdown: [], daily_trend: [] });
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total_pages: 1, has_more: false });
  const [regionalStats, setRegionalStats] = useState([]);
  const [regionalMetric, setRegionalMetric] = useState('total');

  const loadVoters = async () => {
    setLoading(true);
    try {
      const params = { region, constituency, mandal, status, page, limit: 50 };
      const [result, summaryResult] = await Promise.all([
        axios.get(`${API}/admin/voters`, { params }),
        axios.get(`${API}/admin/summary`, { params })
      ]);
      setVoters(result.data.voters || []);
      setPagination(result.data.pagination || {});
      setSummary(summaryResult.data || {});
      setError('');
    } catch { setError('Unable to load live enrollment analytics.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { axios.get(`${API}/geo/regions`).then(result => setRegions(result.data || [])).catch(() => setError('Unable to load regions.')); }, []);
  useEffect(() => {
    Promise.all(['Warangal', 'Nalgonda', 'Khammam'].map(name => axios.get(`${API}/admin/summary`, { params: { region: name } }).then(result => ({ name, ...result.data.metrics })) ))
      .then(setRegionalStats)
      .catch(() => setError('Unable to load regional analytics.'));
  }, []);
  useEffect(() => {
    setConstituency(''); setMandal(''); setMandals([]); setConstituencySearch('');
    axios.get(`${API}/geo/assemblies`, { params: region ? { region } : {} }).then(result => setConstituencies(result.data || [])).catch(() => setError('Unable to load constituencies.'));
  }, [region]);
  useEffect(() => {
    const normalizedConstituency = String(constituency || '').trim();
    if (!normalizedConstituency) { setMandals([]); return; }
    setMandal(''); setMandalSearch('');
    axios.get(`${API}/geo/mandals`, { params: { constituency: normalizedConstituency } })
      .then(result => setMandals(Array.isArray(result.data) ? result.data.map(item => typeof item === 'string' ? { mandal: item } : item) : []))
      .catch(() => setError('Unable to load mandals.'));
  }, [constituency]);
  useEffect(() => { setPage(1); }, [region, constituency, mandal, status]);
  useEffect(() => { if (activeView !== 'overview') requestAnimationFrame(() => document.getElementById(activeView)?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }, [activeView]);
  useEffect(() => { loadVoters(); }, [region, constituency, mandal, status, page]);
  useEffect(() => {
    const interval = setInterval(loadVoters, 30000);
    return () => clearInterval(interval);
  }, [region, constituency, mandal, status, page]);

  const approved = Number(summary.metrics?.approved || 0);
  const pending = Number(summary.metrics?.pending || 0);
  const rejected = Number(summary.metrics?.rejected || 0);
  const total = Number(summary.metrics?.total || 0);
  const today = Number(summary.daily_trend?.find(item => String(item.day).slice(0, 10) === toLocalDateKey(new Date()))?.count || 0);
  const approvalRate = total ? Math.round((approved / total) * 100) : 0;
  const trend = summary.daily_trend?.map(item => ({ label: new Date(item.day).toLocaleDateString(undefined, { weekday: 'short' }), value: Number(item.count) })) || [];
  const velocityRegions = ['Warangal', 'Nalgonda', 'Khammam'].map(name => ({ name, value: Number(summary.regional_breakdown?.find(item => item.region === name)?.count || 0) }));
  const constituencyTerm = constituencySearch.trim().toLowerCase();
  const mandalTerm = mandalSearch.trim().toLowerCase();
  const matchingConstituencies = constituencies.filter(item => constituencyTerm.length >= 3 && item.assembly_constituency.toLowerCase().includes(constituencyTerm));
  const matchingMandals = mandals.filter(item => mandalTerm.length >= 3 && item.mandal.toLowerCase().includes(mandalTerm));
  const visibleConstituencies = constituencyTerm.length >= 3 ? matchingConstituencies : constituencies;
  const visibleMandals = mandalTerm.length >= 3 ? matchingMandals : mandals;
  const constituencyRows = visibleConstituencies.map(item => {
    const rows = voters.filter(voter => voter.constituency === item.assembly_constituency);
    return { name: item.assembly_constituency, enrolled: rows.length, covered: new Set(rows.map(voter => voter.mandal).filter(Boolean)).size, momentum: rows.length >= 100 ? 'High Momentum' : rows.length ? 'Needs Push' : 'No activity' };
  });
  const mandalRows = visibleMandals.map(item => {
    const rows = voters.filter(voter => voter.mandal === item.mandal);
    const accepted = rows.filter(voter => voter.enrollment_status === 'approved').length;
    return { name: item.mandal, total: rows.length, accepted, rate: rows.length ? Math.round((accepted / rows.length) * 100) : 0 };
  });

  const exportData = () => {
    const workbook = XLSX.utils.book_new();
    const geography = [region, constituency, mandal].filter(Boolean).join('-') || 'all-regions';
    const filteredRows = voters.map(row => {
      const next = { ...row };
      delete next.degree_certificate_url;
      delete next.degree_certificate_urls;
      delete next.application_type;
      delete next.form18_number;
      delete next.reference_number;
      delete next.created_at;
      delete next.updated_at;
      delete next.whatsapp_number;
      return next;
    });
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(filteredRows), 'Selected Geography');
    XLSX.writeFile(workbook, `kingmayker-${geography.toLowerCase().replace(/\s+/g, '-')}.xlsx`);
  };

  const navigate = (view) => { setActiveView(view); setSidebarOpen(false); };
  const sortedRegionalStats = [...regionalStats].sort((a, b) => Number(b[regionalMetric] || 0) - Number(a[regionalMetric] || 0));

  return <div className="min-h-screen bg-[#f3f7f5] text-[#173b35]">
    <header className="sticky top-0 z-30 border-b border-[#e4ebe7] bg-white/95 px-4 py-3 shadow-[0_10px_30px_rgba(15,36,30,0.06)] backdrop-blur sm:px-8"><div className="flex w-full items-center justify-between gap-3"><button onClick={() => setSidebarOpen(true)} title="Open navigation" aria-label="Open navigation" className="rounded-md p-2 text-[#1d6b5d] lg:hidden"><Menu size={20} /></button><div className="flex flex-col"><div className="app-brand-wrap"><p className="app-brand-text app-brand-desktop">KINGMAYKER EMS</p><p className="app-brand-text app-brand-mobile">EMS</p></div><h1 className="dashboard-page-title">LEADER VIEW</h1></div><div className="flex items-center gap-3"><span className="hidden text-sm font-semibold text-[#3a4f49] sm:inline">{user?.name || 'Party Leader'}</span><button onClick={logout} title="Sign out" aria-label="Sign out" className="rounded-md p-2 text-[#64736f] transition hover:bg-[#eef6f2] hover:text-[#173b35]"><LogOut size={18} /></button></div></div></header>
    <div className="flex w-full">
      <aside className={`${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} fixed inset-y-0 left-0 z-40 mt-[65px] w-72 border-r border-[#dce8e2] bg-[#173b35] p-4 text-white transition-transform lg:sticky lg:top-[65px] lg:mt-0 lg:h-[calc(100vh-65px)] lg:w-64 lg:translate-x-0`}>
        <div className="mb-5 flex items-center justify-between lg:hidden">
          <span className="text-xs font-bold uppercase tracking-wider text-[#d8f36a]">Navigation</span>
          <button onClick={() => setSidebarOpen(false)} title="Close navigation" aria-label="Close navigation"><X size={19} /></button>
        </div>
        <nav className="space-y-1">
          <SideLink icon={<LayoutDashboard size={17} />} label="Analytics overview" active={activeView === 'overview'} onClick={() => navigate('overview')} />
          <SideLink icon={<BarChart3 size={17} />} label="Regional analytics" active={activeView === 'regional'} onClick={() => navigate('regional')} />
          <SideLink icon={<Map size={17} />} label="AC analytics" active={activeView === 'ac-analytics'} onClick={() => navigate('ac-analytics')} />
        </nav>
      </aside>
      {sidebarOpen && <button type="button" aria-label="Close navigation overlay" onClick={() => setSidebarOpen(false)} className="fixed inset-0 z-30 bg-[#173b35]/40 lg:hidden" />}
      <main className="min-w-0 flex-1 space-y-5 p-4 sm:p-8" id="overview"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#7b9b3a]">Leader dashboard</p><h2 className="mt-1 text-2xl font-bold">Regional performance</h2><p className="mt-1 text-sm text-[#64736f]">Live enrollment intelligence from the voter database.</p></div><div className="flex gap-2"><button onClick={loadVoters} title="Refresh data" aria-label="Refresh data" className="rounded-md border border-[#b5c9c1] bg-white p-2 text-[#1d6b5d]"><RefreshCw size={17} /></button><button onClick={exportData} className="flex items-center gap-2 rounded-md bg-[#173b35] px-3 py-2 text-sm font-semibold text-white"><Download size={16} /> Selected geography XLS</button></div></div>
        <section className="rounded-lg border border-[#e4ebe7] bg-white p-4 shadow-sm" id="geography"><div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#52736a]"><Map size={16} /> Executive filters</div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><select value={region} onChange={event => setRegion(event.target.value)} className={selectClass}><option value="">All Regions</option>{regions.map(item => <option key={item.region} value={item.region}>{item.region}</option>)}</select><select value={constituency} onChange={event => setConstituency(event.target.value)} className={selectClass}><option value="">All 34 Constituencies</option>{constituencies.map(item => <option key={`${item.ac_no}-${item.assembly_constituency}`} value={item.assembly_constituency}>{item.assembly_constituency}</option>)}</select><select value={mandal} onChange={event => setMandal(event.target.value)} disabled={!constituency} className={selectClass}><option value="">All Mandals</option>{mandals.map(item => <option key={item.mandal} value={item.mandal}>{item.mandal}</option>)}</select><select value={status} onChange={event => setStatus(event.target.value)} className={selectClass}><option value="">All Statuses</option><option value="approved">Approved</option><option value="pending">Pending</option><option value="rejected">Rejected</option></select></div></section>
        <Pagination page={page} totalPages={pagination.total_pages} onPageChange={setPage} />
        {error && <div className="rounded-md border border-[#f0c8c2] bg-[#fff3f1] p-3 text-sm text-[#a84b43]">{error}</div>}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Metric icon={<Users size={19} />} label="Total enrollments" value={total} /><Metric icon={<BarChart3 size={19} />} label="Today's velocity" value={`+${today}`} /><Metric icon={<CheckCircle size={19} />} label="Verification approved" value={`${approvalRate}%`} /><Metric icon={<Clock3 size={19} />} label="Pending review" value={pending} /></div>
        <section className="grid gap-5 lg:grid-cols-[1.4fr_0.8fr]"><Breakdown title="Constituency breakdown" search={constituencySearch} setSearch={setConstituencySearch} suggestions={matchingConstituencies} onSuggestion={item => { setConstituency(item.assembly_constituency); setConstituencySearch(item.assembly_constituency); }}><table className="w-full text-left text-sm"><thead className="bg-[#f5f8f6] text-xs uppercase tracking-wider text-[#64736f]"><tr><th className="px-4 py-3">Constituency</th><th className="px-4 py-3">Mandals covered</th><th className="px-4 py-3">Enrolled</th><th className="px-4 py-3">Status</th></tr></thead><tbody>{constituencyRows.map(row => <tr key={row.name} className="border-t border-[#e4ebe7]"><td className="px-4 py-3 font-semibold">{row.name}</td><td className="px-4 py-3">{row.covered}</td><td className="px-4 py-3 font-bold">{row.enrolled}</td><td className="px-4 py-3 text-xs font-semibold">{row.momentum}</td></tr>)}</tbody></table>{!constituencyRows.length && <EmptyState loading={loading} />}</Breakdown><Breakdown title="Mandal breakdown" search={mandalSearch} setSearch={setMandalSearch} suggestions={matchingMandals} onSuggestion={item => { setMandal(item.mandal); setMandalSearch(item.mandal); }}>{mandalRows.length ? <div className="space-y-4 p-4">{mandalRows.map(row => <div key={row.name}><div className="flex justify-between text-sm"><span className="font-semibold">{row.name}</span><span className="text-[#64736f]">{row.total} total</span></div><div className="mt-2 h-2 rounded-full bg-[#e4ebe7]"><div className="h-2 rounded-full bg-[#2f8068]" style={{ width: `${row.rate}%` }} /></div><div className="mt-1 flex justify-between text-[11px] text-[#64736f]"><span>{row.accepted} approved</span><span>{row.rate}%</span></div></div>)}</div> : <EmptyState loading={false} />}</Breakdown></section>
        <section className="rounded-lg border border-[#e4ebe7] bg-white p-4 shadow-sm" id="records"><div className="mb-4 flex items-center justify-between"><div><h3 className="font-bold">Daily velocity trend</h3><p className="text-xs text-[#64736f]">Enrollment volume over the last seven days</p></div><span className="text-sm font-bold text-[#1d6b5d]">{today} today</span></div><TrendGraph data={trend} /></section>
        {activeView === 'overview' && <section className="rounded-lg border border-[#e4ebe7] bg-white p-4 shadow-sm"><div className="mb-4"><h3 className="font-bold">Enrollment status mix</h3><p className="text-xs text-[#64736f]">Current filtered application distribution</p></div><StatusPie approved={approved} pending={pending} rejected={rejected} /></section>}
        {activeView === 'regional' && <RegionalAnalytics stats={sortedRegionalStats} metric={regionalMetric} setMetric={setRegionalMetric} onBack={() => navigate('overview')} />}
        {activeView === 'ac-analytics' && <ACAnalytics onBack={() => navigate('overview')} />}
      </main>
    </div>
  </div>;
}

function SideLink({ icon, label, active, onClick }) { return <button type="button" onClick={onClick} className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-semibold transition ${active ? 'bg-white/15 text-[#d8f36a]' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}>{icon}{label}</button>; }
function Breakdown({ title, search, setSearch, suggestions, onSuggestion, children }) { return <div className="overflow-hidden rounded-lg border border-[#e4ebe7] bg-white shadow-sm"><div className="border-b border-[#e4ebe7] p-4"><div><h3 className="font-bold">{title}</h3><p className="text-xs text-[#64736f]">Search with 3 or more letters</p></div><div className="relative mt-3"><Search size={15} className="absolute left-3 top-2.5 text-[#64736f]" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder={`Search ${title.toLowerCase()}`} className={`${selectClass} w-full pl-9`} />{search.trim().length >= 3 && suggestions.length > 0 && <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-40 overflow-y-auto rounded-md border border-[#b5c9c1] bg-white py-1 shadow-lg">{suggestions.slice(0, 8).map(item => <button type="button" key={item.assembly_constituency || item.mandal} onClick={() => onSuggestion(item)} className="block w-full px-3 py-2 text-left text-sm hover:bg-[#eef6f2]">{item.assembly_constituency || item.mandal}</button>)}</div>}</div></div><div className="max-h-72 overflow-auto">{children}</div></div>; }
function Metric({ icon, label, value }) { return <div className="rounded-lg border border-[#e4ebe7] bg-white p-4 shadow-sm"><div className="flex items-center gap-3"><span className="rounded-md bg-[#eef8f0] p-2 text-[#2f7c57]">{icon}</span><span className="text-xs font-semibold text-[#64736f]">{label}</span></div><div className="mt-3 text-3xl font-bold">{value}</div></div>; }
function EmptyState({ loading }) { return <div className="flex items-center justify-center gap-2 p-8 text-sm text-[#64736f]">{loading ? <RefreshCw size={16} className="animate-spin" /> : 'No enrollment data for the selected filters.'}</div>; }
function toLocalDateKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
function getTodayCount(voters) {
  const todayKey = toLocalDateKey(new Date());
  return voters.filter(voter => toLocalDateKey(voter.created_at) === todayKey).length;
}
function getLastSevenDays(voters) { return Array.from({ length: 7 }, (_, index) => { const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - (6 - index)); const key = toLocalDateKey(date); return { label: date.toLocaleDateString(undefined, { weekday: 'short' }), value: voters.filter(voter => toLocalDateKey(voter.created_at) === key).length }; }); }
function MiniTrend({ data }) { const max = Math.max(...data.map(item => item.value), 1); return <div className="flex h-12 items-end gap-1">{data.map(item => <div key={item.label} title={`${item.label}: ${item.value}`} className="flex-1 rounded-t-sm bg-[#d8f36a]" style={{ height: `${Math.max(8, (item.value / max) * 100)}%` }} />)}</div>; }
function TrendGraph({ data }) { const max = Math.max(...data.map(item => item.value), 1); return <div className="flex h-36 items-end gap-3 border-b border-l border-[#dce8e2] px-3 pb-0 pt-4">{data.map(item => <div key={item.label} className="flex h-full flex-1 flex-col items-center justify-end gap-2"><span className="text-xs font-semibold text-[#1d6b5d]">{item.value}</span><div className="w-full max-w-12 rounded-t-md bg-[#2f8068]" style={{ height: `${Math.max(5, (item.value / max) * 100)}%` }} /><span className="text-[11px] text-[#64736f]">{item.label}</span></div>)}</div>; }
function RegionalLineGraph({ data }) { const max = Math.max(...data.map(item => item.value), 1); const points = data.map((item, index) => `${40 + index * 120},${120 - (item.value / max) * 90}`).join(' '); return <div><svg viewBox="0 0 300 150" className="h-40 w-full" role="img" aria-label="Regional enrollment velocity line graph"><line x1="30" y1="120" x2="280" y2="120" stroke="#dce8e2" /><polyline points={points} fill="none" stroke="#1d6b5d" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />{data.map((item, index) => { const x = 40 + index * 120; const y = 120 - (item.value / max) * 90; return <g key={item.name}><circle cx={x} cy={y} r="6" fill={['#1d6b5d', '#d28b32', '#7b9b3a'][index]} /><text x={x} y="142" textAnchor="middle" fontSize="10" fill="#64736f">{item.name}</text><text x={x} y={y - 10} textAnchor="middle" fontSize="10" fill="#173b35">{item.value}</text></g>; })}</svg></div>; }
function RegionalBarGraph({ data, metric }) { const max = Math.max(...data.map(item => Number(item[metric] || 0)), 1); return <div className="flex h-72 items-end gap-6 border-b border-l border-[#dce8e2] px-6 pb-0 pt-6">{data.map((item, index) => { const value = Number(item[metric] || 0); return <div key={item.name} className="flex h-full flex-1 flex-col items-center justify-end gap-2"><span className="text-sm font-bold text-[#173b35]">{value.toLocaleString()}</span><div className="w-full max-w-24 rounded-t-md bg-[#2f8068] transition-all" style={{ height: `${Math.max(4, value / max * 100)}%`, backgroundColor: ['#2f8068', '#d28b32', '#7b9b3a'][index] }} /><span className="text-sm font-semibold text-[#64736f]">{item.name}</span></div>; })}</div>; }
function StatusPie({ approved, pending, rejected }) { const total = approved + pending + rejected; const approvedPct = total ? (approved / total) * 100 : 0; const pendingPct = total ? (pending / total) * 100 : 0; const rejectedPct = total ? (rejected / total) * 100 : 0; return <div className="flex items-center justify-center gap-5"><div className="h-32 w-32 rounded-full" style={{ background: total ? `conic-gradient(#2f7c57 0 ${approvedPct}%, #d28b32 ${approvedPct}% ${approvedPct + pendingPct}%, #c45d52 ${approvedPct + pendingPct}% ${approvedPct + pendingPct + rejectedPct}%)` : 'conic-gradient(#e2e8f0 0 100%)' }} aria-label="Enrollment status pie chart" role="img" /><div className="space-y-2 text-xs"><Legend color="#2f7c57" label="Approved" value={approved} /><Legend color="#d28b32" label="Pending" value={pending} /><Legend color="#c45d52" label="Rejected" value={rejected} /></div></div>; }
function Legend({ color, label, value }) { return <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} /> <span>{label}</span><strong>{value}</strong></div>; }
const acReference = [
  ['Warangal West', 41, 31365], ['Khammam', 54, 29032], ['Nalgonda', 29, 22529], ['Warangal East', 30, 17630], ['Suryapet', 21, 16515], ['Paleru', 15, 15722], ['Sathupally', 20, 15584], ['Parkal', 17, 15000], ['Vardhannapet', 16, 14819], ['Nakrekal', 16, 14751], ['Kothagudem', 21, 14410], ['Munugode', 16, 14277], ['Palakurthy', 13, 14167], ['Jangaon', 16, 14127], ['Narsampet', 15, 13797], ['Kodad', 24, 13657], ['Nagarjuna Sagar', 14, 13446], ['Bhupalpally', 17, 13376], ['Huzurnagar', 18, 13113], ['Bhuvanagiri', 13, 12411], ['Mahabubabad', 12, 12398], ['Thungathurthy', 13, 12289], ['Miryalaguda', 16, 12190], ['Yellandu', 13, 12047], ['Dornakal', 13, 11484], ['Madhira', 14, 11435], ['Wyra', 12, 11051], ['Alair', 11, 10713], ['Ghanpur Stn', 14, 10584], ['Mulugu', 16, 10408], ['Devarakonda', 12, 10131], ['Pinapaka', 11, 8516], ['Bhadrachalam', 10, 5415], ['Aswaraopeta', 7, 5130]
].map(([name, pollingStations, target]) => ({ name, pollingStations, target }));
function RegionalAnalytics({ stats, metric, setMetric, onBack }) {
  return <section id="regional" className="rounded-lg border border-[#e4ebe7] bg-white p-5 shadow-sm"><div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Regional analytics</h2><p className="mt-1 text-sm text-[#64736f]">Enrollment readings for Warangal, Nalgonda, and Khammam.</p></div><div className="flex items-center gap-2"><select value={metric} onChange={event => setMetric(event.target.value)} className={selectClass}><option value="total">Total enrollments</option><option value="approved">Approved enrollments</option></select><button type="button" onClick={onBack} className="inline-flex items-center gap-1 rounded border border-[#b5c9c1] px-3 py-2 text-xs font-semibold"><ArrowLeft size={14} /> Overview</button></div></div><RegionalBarGraph data={stats} metric={metric} /></section>;
}
function ACAnalytics({ onBack }) {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  useEffect(() => { Promise.all(acReference.map(reference => axios.get(`${API}/admin/summary`, { params: { constituency: reference.name } }).then(result => ({ ...reference, ...result.data.metrics })))).then(setRows).catch(() => setRows(acReference)); }, []);
  const suggestions = search.trim().length >= 3 ? rows.filter(row => row.name.toLowerCase().includes(search.trim().toLowerCase())) : [];
  const visibleRows = search.trim().length >= 3 ? suggestions : rows;
  return <section id="ac-analytics" className="rounded-lg border border-[#e4ebe7] bg-white p-5 shadow-sm"><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">AC analytics</h2><p className="mt-1 text-sm text-[#64736f]">Approval progress against constituency targets.</p></div><button type="button" onClick={onBack} className="inline-flex items-center gap-1 rounded border border-[#b5c9c1] px-3 py-1.5 text-xs font-semibold"><ArrowLeft size={14} /> Overview</button></div><div className="relative mb-5 max-w-xl"><Search size={15} className="absolute left-3 top-3 text-[#64736f]" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search constituency (3 letters)" className={`${selectClass} w-full pl-9`} />{suggestions.length > 0 && <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded border border-[#b5c9c1] bg-white py-1 shadow-lg">{suggestions.slice(0, 8).map(row => <button type="button" key={row.name} onClick={() => setSearch(row.name)} className="block w-full px-3 py-2 text-left text-sm hover:bg-[#eef6f2]">{row.name}</button>)}</div>}</div><div className="max-h-[360px] space-y-4 overflow-y-auto pr-2">{visibleRows.map(row => { const approved = Number(row.approved || 0); const progress = Math.min(100, row.target ? approved / row.target * 100 : 0); return <div key={row.name}><div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-sm"><span className="font-semibold">{row.name}</span><span className="text-xs text-[#64736f]">{row.pollingStations} polling stations · {approved.toLocaleString()} approved / {row.target.toLocaleString()} target</span></div><div className="h-3 rounded-full bg-[#e4ebe7]"><div className="h-3 rounded-full bg-[#2f8068] transition-all" style={{ width: `${progress}%` }} /></div></div>; })}</div></section>;
}
function Pagination({ page, totalPages = 1, onPageChange }) {
  return <div className="flex items-center justify-end gap-2 py-3 text-xs font-semibold text-[#64736f]">
    <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="rounded border border-[#b5c9c1] bg-white px-3 py-1.5 disabled:opacity-40">Previous</button>
    <span>Page {page} of {Math.max(totalPages, 1)}</span>
    <button type="button" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} className="rounded border border-[#b5c9c1] bg-white px-3 py-1.5 disabled:opacity-40">Next</button>
  </div>;
}
