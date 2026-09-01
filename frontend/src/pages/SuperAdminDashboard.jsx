import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { useLocation, useNavigate } from 'react-router-dom';
import { Activity, BarChart3, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Download, FilePlus2, LayoutDashboard, LogOut, Map, Menu, RefreshCw, Search, ShieldCheck, Users, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import CoordinatorModal from '../components/CoordinatorModal';
import EnrollmentForm from '../components/EnrollmentForm';
import VotersTable from '../components/VotersTable';
import { API } from '../utils/api';

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10';
const navItems = [
  { id: 'overview', label: 'Analytic Overview', icon: LayoutDashboard },
  { id: 'enrollments', label: 'Enrollments Master Feed', icon: FilePlus2 },
  { id: 'coordinators', label: 'Field Coordinators', icon: Users },
  { id: 'geography', label: 'Geographic Explorer', icon: Map },
  { id: 'audit', label: 'System Audit Logs', icon: ShieldCheck }
];

export default function SuperAdminDashboard() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [overview, setOverview] = useState({ metrics: {}, regional_breakdown: [] });
  const [voters, setVoters] = useState([]);
  const [coordinators, setCoordinators] = useState([]);
  const [geography, setGeography] = useState([]);
  const [logs, setLogs] = useState([]);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const auditLogRef = useRef(null);
  const [regions, setRegions] = useState([]);
  const [constituencies, setConstituencies] = useState([]);
  const [mandals, setMandals] = useState([]);
  const [filters, setFilters] = useState({ region: '', constituency: '', mandal: '', status: '', search: '' });
  const [geoSearch, setGeoSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showEnrollment, setShowEnrollment] = useState(false);
  const [enrollmentCoordinatorId, setEnrollmentCoordinatorId] = useState('');
  const active = location.pathname.split('/')[2] === 'analytics' ? 'overview' : (location.pathname.split('/')[2] || 'analytics');

  const load = async () => {
    setLoading(true);
    try {
      const requestParams = {
        region: filters.region,
        constituency: filters.constituency,
        mandal: filters.mandal,
        status: filters.status,
        search: String(filters.search || '').trim()
      };

      const [summary, feed, coordinatorResult, geographyResult, auditResult, regionResult] = await Promise.all([
        axios.get(`${API}/admin/overview`),
        axios.get(`${API}/admin/enrollments`, { params: requestParams }),
        axios.get(`${API}/admin/coordinators`),
        axios.get(`${API}/admin/geography`, { params: { search: geoSearch } }),
        axios.get(`${API}/admin/audit-logs`),
        axios.get(`${API}/geo/regions`)
      ]);
      setOverview(summary.data); setVoters(feed.data.voters || []); setCoordinators(coordinatorResult.data.coordinators || []); setGeography(geographyResult.data.geography || []); setLogs(auditResult.data.logs || []); setRegions(regionResult.data || []); setError('');
    } catch (err) { setError(err.response?.data?.error || 'Unable to connect to the admin control center.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); const timer = setInterval(load, 15000); return () => clearInterval(timer); }, [filters.region, filters.constituency, filters.mandal, filters.status, filters.search, geoSearch]);

  useEffect(() => {
    setFilters(current => ({ ...current, constituency: '', mandal: '' }));
    setMandals([]);
    axios.get(`${API}/geo/assemblies`, { params: filters.region ? { region: filters.region } : {} }).then(result => setConstituencies(result.data || [])).catch(() => setError('Unable to load constituencies.'));
  }, [filters.region]);

  useEffect(() => {
    const normalizedConstituency = String(filters.constituency || '').trim();
    if (!normalizedConstituency) { setMandals([]); return; }
    setFilters(current => ({ ...current, mandal: '' }));
    axios.get(`${API}/geo/mandals`, { params: { constituency: normalizedConstituency } })
      .then(result => setMandals(Array.isArray(result.data) ? result.data.map(item => typeof item === 'string' ? { mandal: item } : item) : []))
      .catch(() => setError('Unable to load mandals.'));
  }, [filters.constituency]);

  const metrics = overview.metrics || {};
  const updateStatus = async (id, enrollment_status) => {
    if (!window.confirm('This status cannot be changed again. Continue?')) return;
    try { await axios.patch(`${API}/admin/voters/${id}/status`, { enrollment_status }); setVoters(current => current.map(voter => voter.id === id ? { ...voter, enrollment_status } : voter)); }
    catch (err) { setError(err.response?.data?.error || 'Unable to update voter status.'); }
  };

  const normalizedSearch = String(filters.search || '').trim().toLowerCase();
  const searchFilteredVoters = !normalizedSearch ? voters : voters.filter(voter => {
    const haystack = [
      voter.voter_name,
      voter.voter_id,
      voter.mobile_number,
      voter.father_name,
      voter.constituency,
      voter.mandal,
      voter.village,
      voter.coordinator_name,
      voter.email
    ].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(normalizedSearch);
  });

  const exportData = () => { const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(searchFilteredVoters), 'Enrollments'); XLSX.writeFile(workbook, `kingmayker-enrollments-${filters.region || 'all-regions'}.xlsx`); };
  const go = id => { const path = id === 'overview' ? 'analytics' : id === 'audit' ? 'audit-logs' : id; navigate(`/admin/${path}`); setMobileOpen(false); };
  const filteredMetrics = {
    total: voters.length,
    pending: voters.filter(voter => ['pending', 'in_progress'].includes(voter.enrollment_status)).length,
    approved: voters.filter(voter => voter.enrollment_status === 'approved').length,
    rejected: voters.filter(voter => voter.enrollment_status === 'rejected').length,
    active_coordinators: metrics.active_coordinators || 0
  };
  const recentVoters = searchFilteredVoters.slice(0, 5);
  const recentCoordinators = coordinators.slice(0, 4);
  const regionOptions = [...new Set([
    ...regions.map(item => item.region),
    ...voters.map(voter => voter.region),
    'Nalgonda',
    'Warangal',
    'Khammam'
  ].filter(Boolean))];
  const regionGrowth = getRegionGrowth(voters, filters.region, regionOptions);
  const geographyConstituencies = [...new Set(geography.map(item => item.assembly_constituency).filter(Boolean))].map(name => {
    const rows = voters.filter(voter => voter.constituency === name);
    return { name, covered: new Set(rows.map(voter => voter.mandal).filter(Boolean)).size, enrolled: rows.length, status: rows.length ? 'Active' : 'No activity' };
  });
  const geographyMandals = [...new Set(geography.filter(item => !filters.constituency || item.assembly_constituency === filters.constituency).map(item => item.mandal).filter(Boolean))].map(name => {
    const rows = voters.filter(voter => voter.mandal === name);
    const approved = rows.filter(voter => voter.enrollment_status === 'approved').length;
    return { name, total: rows.length, approved, rate: rows.length ? Math.round((approved / rows.length) * 100) : 0 };
  });
  const geographyTrend = getLastSevenDays(voters);
  const scrollAudit = direction => {
    const container = auditLogRef.current;
    if (!container) return;
    const step = Math.max(container.clientHeight * 0.8, 180);
    container.scrollBy({ top: direction === 'down' ? step : -step, behavior: 'smooth' });
  };
  const handleAuditScroll = () => {
    const container = auditLogRef.current;
    if (!container) return;
    setShowScrollTop(container.scrollTop > 120);
  };

  return <div data-admin-view={active} className="min-h-screen bg-[#f4f7f8] text-slate-900">
    <header className="sticky top-0 z-30 flex h-[82px] items-center justify-between border-b border-slate-200 bg-white/95 px-4 shadow-[0_10px_30px_rgba(15,36,30,0.06)] backdrop-blur sm:px-6"><div className="flex items-center gap-3"><button onClick={() => setMobileOpen(true)} className="rounded-lg p-2 text-slate-600 lg:hidden" aria-label="Open navigation"><Menu size={20} /></button><img src="/rakeshreddy.png" alt="EMS" className="h-11 w-11 rounded-xl object-cover ring-2 ring-slate-200" /><div className="flex flex-col"><div className="app-brand-wrap"><p className="app-brand-text app-brand-desktop admin-brand-desktop">KINGMAYKER EMS</p><p className="app-brand-text app-brand-mobile admin-brand-mobile">EMS</p></div><h1 className="dashboard-page-title admin-page-title">ADMIN 360</h1></div></div><div className="flex items-center gap-3"><span className="hidden text-sm font-semibold text-slate-600 sm:block">{user?.name || 'Super Admin'}</span><button onClick={logout} className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100" title="Sign out" aria-label="Sign out"><LogOut size={18} /></button></div></header>
    <div className="flex">
      {mobileOpen && <button className="fixed inset-0 z-30 bg-slate-950/30 backdrop-blur-sm lg:hidden" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
      <aside className={`${mobileOpen ? 'translate-x-0' : '-translate-x-full'} ${collapsed ? 'lg:w-[76px]' : 'lg:w-[264px]'} fixed inset-y-0 left-0 z-40 mt-[82px] flex w-[280px] flex-col border-r border-slate-800 bg-[#172a3d] p-4 text-white transition-all lg:sticky lg:top-[82px] lg:mt-0 lg:h-[calc(100vh-82px)] lg:translate-x-0`}><div className="mb-8 flex items-center justify-between"><div className={collapsed ? 'lg:hidden' : ''}><p className="admin-sidebar-brand text-base font-black tracking-[0.14em]">KINGMAYKER EMS</p><span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">System Control Center</span></div><button onClick={() => setCollapsed(!collapsed)} className="hidden rounded-lg p-2 text-slate-200 hover:bg-white/10 lg:block" aria-label="Collapse sidebar">{collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}</button><button onClick={() => setMobileOpen(false)} className="lg:hidden" aria-label="Close navigation"><X size={19} /></button></div><nav className="space-y-1">{navItems.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => go(id)} title={collapsed ? label : undefined} className={`admin-nav-item flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-semibold transition ${active === id ? 'bg-teal-500 text-white shadow-lg shadow-teal-950/20' : 'text-slate-200 hover:bg-teal-700 hover:text-white'}`}><Icon size={18} /><span className={collapsed ? 'lg:hidden' : ''}>{label}</span></button>)}</nav><div className={`${collapsed ? 'lg:hidden' : ''} mt-auto rounded-xl border border-white/10 bg-white/5 p-4`}><div className="flex items-center gap-2 text-xs font-semibold text-slate-200"><Activity size={15} className="text-teal-300" /> Live system feed</div><p className="mt-2 text-xs leading-5 text-slate-300">Data refreshes automatically every 15 seconds.</p></div></aside>
      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8"><div className="mx-auto max-w-[1500px] space-y-8">{error && <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error"><X size={16} /></button></div>}
        <section id="overview" className="scroll-mt-24"><PageHeading eyebrow="Executive command center" title="Analytic Overview" detail="A live operational view of enrollment coverage, verification, and field capacity." action={<div className="flex gap-2"><button onClick={load} title="Refresh data" aria-label="Refresh data" className="rounded-lg border border-slate-300 bg-white p-2.5 text-teal-800 transition hover:bg-teal-50"><RefreshCw size={17} className={loading ? 'animate-spin' : ''} /></button><button onClick={exportData} className="flex items-center gap-2 rounded-lg bg-[#173b35] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0f2f2a]"><Download size={17} /> Selected geography XLS</button></div>} /><Panel className="mt-5"><div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600"><Map size={16} /> Executive filters</div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><select className={inputClass} value={filters.region} onChange={event => setFilters({ ...filters, region: event.target.value, constituency: '', mandal: '' })}><option value="">All Regions</option>{regions.map(item => <option key={item.region} value={item.region}>{item.region}</option>)}</select>{filters.region ? <select className={inputClass} value={filters.constituency} onChange={event => setFilters({ ...filters, constituency: event.target.value, mandal: '' })}>{constituencies.map(item => <option key={`${item.ac_no}-${item.assembly_constituency}`} value={item.assembly_constituency}>{item.assembly_constituency}</option>)}</select> : <select className={inputClass} value={filters.constituency} onChange={event => setFilters({ ...filters, constituency: event.target.value, mandal: '' })}><option value="">All 34 Constituencies</option>{constituencies.map(item => <option key={`${item.ac_no}-${item.assembly_constituency}`} value={item.assembly_constituency}>{item.assembly_constituency}</option>)}</select>}{filters.constituency ? <select className={inputClass} value={filters.mandal} onChange={event => setFilters({ ...filters, mandal: event.target.value })}>{mandals.map(item => <option key={item.mandal} value={item.mandal}>{item.mandal}</option>)}</select> : <select className={inputClass} value={filters.mandal} onChange={event => setFilters({ ...filters, mandal: event.target.value })} disabled={!filters.constituency}><option value="">All Mandals</option>{mandals.map(item => <option key={item.mandal} value={item.mandal}>{item.mandal}</option>)}</select>}<select className={inputClass} value={filters.status} onChange={event => setFilters({ ...filters, status: event.target.value })}><option value="">All Statuses</option><option value="approved">Approved</option><option value="pending">Pending</option><option value="rejected">Rejected</option></select></div><div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Total enrollments" value={filteredMetrics.total} icon={<BarChart3 size={19} />} tone="teal" /><Metric label="Pending review" value={filteredMetrics.pending} icon={<Clock3 size={19} />} tone="amber" /><Metric label="Approved" value={filteredMetrics.approved} icon={<CheckCircle2 size={19} />} tone="green" /><Metric label="Active coordinators" value={filteredMetrics.active_coordinators} icon={<Users size={19} />} tone="blue" /></div><div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]"><Panel title="Regional growth" detail="Seven-day enrollment growth for the selected geography"><RegionGrowthChart data={regionGrowth} /></Panel><Panel title="Status mix" detail="Current filtered enrollment pipeline"><StatusDonut metrics={filteredMetrics} /></Panel></div></Panel></section>
          <section id="enrollments" className="scroll-mt-24"><PageHeading eyebrow="Operations" title="Enrollments Master Feed" detail="Search, filter, review, and export the complete voter registration stream." action={<div className="mt-1 flex gap-2"><button onClick={() => { const defaultAgent = coordinators.find(item => item.email?.toLowerCase() === 'agent@kingmayker.com') || coordinators[0];
setEnrollmentCoordinatorId(defaultAgent?.id || ''); setShowEnrollment(true); }} className="flex items-center gap-2 rounded-lg border border-teal-700 bg-white px-4 py-2.5 text-sm font-semibold text-teal-800 transition hover:bg-teal-50"><FilePlus2 size={17} /> Add new enrollment</button><button onClick={exportData} className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"><Download size={17} /> Export XLS</button></div>} /><Panel className="mt-5"><div className="grid gap-3 border-b border-slate-100 pb-5 md:grid-cols-[1.5fr_1fr_1fr_1fr]"><div className="relative"><Search size={16} className="absolute left-3 top-3 text-slate-400" /><input className={`${inputClass} pl-9`} value={filters.search} onChange={e => setFilters({ ...filters, search: e.target.value })} placeholder="Search name, voter ID, mobile" /></div><select className={inputClass} value={filters.region} onChange={event => setFilters({ ...filters, region: event.target.value, constituency: '', mandal: '' })}><option value="">All regions</option>{regions.map(item => <option key={item.region} value={item.region}>{item.region}</option>)}</select>{filters.region ? <select className={inputClass} value={filters.constituency} onChange={event => setFilters({ ...filters, constituency: event.target.value, mandal: '' })}>{constituencies.map(item => <option key={`${item.ac_no}-${item.assembly_constituency}`} value={item.assembly_constituency}>{item.assembly_constituency}</option>)}</select> : <select className={inputClass} value={filters.constituency} onChange={event => setFilters({ ...filters, constituency: event.target.value, mandal: '' })}><option value="">All constituencies</option>{constituencies.map(item => <option key={`${item.ac_no}-${item.assembly_constituency}`} value={item.assembly_constituency}>{item.assembly_constituency}</option>)}</select>}<select className={inputClass} value={filters.status} onChange={event => setFilters({ ...filters, status: event.target.value })}><option value="">All Status</option><option value="pending">Pending</option><option value="in_progress">In Progress</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></div><div className="mt-5 overflow-hidden rounded-xl border border-slate-200"><div className="max-h-[420px] overflow-y-auto"><table className="min-w-full divide-y divide-slate-200 text-left text-sm"><thead className="bg-slate-50 text-left text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500"><tr><th className="px-4 py-3">Voter</th><th className="px-4 py-3">Voter ID</th><th className="px-4 py-3">Region</th><th className="px-4 py-3">Constituency</th><th className="px-4 py-3">Mandal</th><th className="px-4 py-3">Mobile</th><th className="px-4 py-3">Status</th></tr></thead><tbody className="divide-y divide-slate-100 bg-white">{searchFilteredVoters.map(voter => <tr key={voter.id || `${voter.voter_id}-${voter.name}`} className="align-top hover:bg-slate-50"><td className="px-4 py-3"><div className="font-semibold text-slate-900">{voter.name || 'Unknown voter'}</div><div className="mt-1 text-xs text-slate-500">{voter.email || 'No email'}</div></td><td className="px-4 py-3 text-slate-700">{voter.voter_id || '?'}</td><td className="px-4 py-3 text-slate-700">{voter.region || '?'}</td><td className="px-4 py-3 text-slate-700">{voter.constituency || '?'}</td><td className="px-4 py-3 text-slate-700">{voter.mandal || '?'}</td><td className="px-4 py-3 text-slate-700">{voter.mobile_number || '?'}</td><td className="px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${voter.enrollment_status === 'approved' ? 'bg-emerald-100 text-emerald-700' : voter.enrollment_status === 'pending' || voter.enrollment_status === 'in_progress' ? 'bg-amber-100 text-amber-700' : voter.enrollment_status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>{voter.enrollment_status || 'Pending'}</span></td></tr>)}</tbody></table>{!searchFilteredVoters.length && <div className="w-full py-12 text-center text-sm text-slate-500">No matching enrollments found.</div>}</div></div></Panel></section>
        <section id="coordinators" className="scroll-mt-24"><PageHeading eyebrow="Field operations" title="Coordinator Manager" detail={`${coordinators.length} constituency accounts provisioned in the system.`} /><Panel><InlineCoordinatorForm onCreated={load} /><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{recentCoordinators.map(coordinator => <div key={coordinator.id} className="rounded-xl border border-slate-200 p-4 transition hover:border-teal-300 hover:shadow-md"><div className="flex items-start justify-between gap-2"><div><h3 className="font-bold text-slate-900">{coordinator.name}</h3><p className="mt-1 text-xs text-teal-700">{coordinator.email}</p></div><span className="rounded-full bg-green-50 px-2 py-1 text-[10px] font-bold uppercase text-green-700">Active</span></div><div className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500"><p>{coordinator.assigned_constituency || 'Unassigned'}</p><p className="mt-1">{coordinator.assigned_region || 'Region pending'} · {coordinator.mobile_number || 'No mobile'}</p></div></div>)}{!coordinators.length && <Empty loading={loading} label="No coordinators provisioned." />}</div></Panel></section>
        <section id="geography" className="scroll-mt-24"><PageHeading eyebrow="Master geography" title="Geographic Explorer" detail="Search live enrollment coverage by constituency, mandal, and day." /><Panel><div className="mb-5 grid gap-3 border-b border-slate-100 pb-5 lg:grid-cols-[1.4fr_1fr_1fr]"><div className="relative"><Search size={16} className="absolute left-3 top-3 text-slate-400" /><input className={`${inputClass} pl-9`} value={geoSearch} onChange={e => setGeoSearch(e.target.value)} placeholder="Search village, mandal, or constituency" /></div><select className={inputClass} value={filters.constituency} onChange={event => setFilters({ ...filters, constituency: event.target.value })}><option value="">Choose a constituency</option>{constituencies.map(item => <option key={`${item.ac_no}-${item.assembly_constituency}`} value={item.assembly_constituency}>{item.assembly_constituency}</option>)}</select><select className={inputClass} value={filters.mandal} onChange={event => setFilters({ ...filters, mandal: event.target.value })} disabled={!filters.constituency}><option value="">Choose its mandal</option>{mandals.map(item => <option key={item.mandal} value={item.mandal}>{item.mandal}</option>)}</select></div><div className="grid gap-5 xl:grid-cols-[1.4fr_0.8fr]"><BreakdownPanel title="Constituency breakdown" subtitle="Enrollment coverage by constituency"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3">Constituency</th><th className="px-4 py-3">Mandals covered</th><th className="px-4 py-3">Enrolled</th><th className="px-4 py-3">Status</th></tr></thead><tbody>{geographyConstituencies.map(row => <tr key={row.name} className="border-t border-slate-100"><td className="px-4 py-3 font-semibold">{row.name}</td><td className="px-4 py-3">{row.covered}</td><td className="px-4 py-3 font-bold">{row.enrolled}</td><td className="px-4 py-3 text-xs font-semibold">{row.status}</td></tr>)}</tbody></table>{!geographyConstituencies.length && <Empty loading={loading} label="No enrollment data for the selected geography." />}</BreakdownPanel><BreakdownPanel title="Mandal breakdown" subtitle={filters.constituency ? `Approved enrollment rate in ${filters.constituency}` : 'Choose a constituency to view its mandals'}><div className="space-y-4 p-4">{filters.constituency && geographyMandals.length ? geographyMandals.slice(0, 12).map(row => <div key={row.name}><div className="flex justify-between text-sm"><span className="font-semibold">{row.name}</span><span className="text-slate-500">{row.total} total</span></div><div className="mt-2 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-teal-600" style={{ width: `${row.rate}%` }} /></div><div className="mt-1 flex justify-between text-[11px] text-slate-500"><span>{row.approved} approved</span><span>{row.rate}%</span></div></div>) : <Empty loading={false} label={filters.constituency ? 'No enrollment data for this constituency.' : 'Choose a constituency to view its mandal readings.'} />}</div></BreakdownPanel></div><div className="mt-5"><div className="mb-4 flex items-center justify-between"><div><h3 className="font-bold text-slate-900">Daily velocity trend</h3><p className="text-xs text-slate-500">Enrollment volume over the last seven days</p></div><span className="text-sm font-bold text-teal-800">{geographyTrend[geographyTrend.length - 1]?.value || 0} today</span></div><TrendGraph data={geographyTrend} /></div></Panel></section>
        <section id="audit" className="scroll-mt-24"><PageHeading eyebrow="Governance" title="System Audit Logs" detail="A transparent activity stream for authentication, provisioning, and enrollment actions." /><Panel><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><span className="text-xs font-medium text-slate-500">Know Others Activity</span><div className="flex flex-wrap items-center justify-end gap-2"><button type="button" onClick={() => scrollAudit('up')} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-teal-300 hover:text-teal-700">Scroll up</button><button type="button" onClick={() => scrollAudit('down')} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-teal-300 hover:text-teal-700">Scroll down</button></div></div><div ref={auditLogRef} onScroll={handleAuditScroll} className="max-h-[500px] overflow-y-auto rounded-xl border border-slate-200 bg-slate-50"><table className="min-w-full border-separate border-spacing-0 text-left"><thead className="sticky top-0 z-10 bg-slate-100 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500"><tr><th className="px-4 py-3 text-left">Time</th><th className="px-4 py-3 text-left">Action</th><th className="px-4 py-3 text-left">User</th><th className="px-4 py-3 text-left">Details</th></tr></thead><tbody>{logs.map(log => <tr key={log.id} className="border-t border-slate-200 bg-white/70 align-top transition hover:bg-slate-50"><td className="px-4 py-3 text-xs text-slate-500"><time>{new Date(log.timestamp).toLocaleString()}</time></td><td className="px-4 py-3"><strong className="text-sm font-semibold text-slate-900">{log.action}</strong></td><td className="px-4 py-3 text-sm text-slate-700"><p>{log.user_name || 'System'}</p><p className="mt-1 text-[11px] uppercase tracking-wide text-slate-400">{log.role || 'system'}</p></td><td className="px-4 py-3 text-xs leading-5 text-slate-500"><p className="break-words">{typeof log.details === 'object' ? JSON.stringify(log.details) : log.details || 'No additional details'}</p></td></tr>)}{!logs.length && <tr><td colSpan="4"><Empty loading={loading} label="No activity recorded." /></td></tr>}</tbody></table>{showScrollTop && <div className="flex justify-end border-t border-slate-200 bg-white p-3"><button type="button" onClick={() => auditLogRef.current?.scrollTo({ top: 0, behavior: 'smooth' })} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-teal-300 hover:text-teal-700">Scroll to top</button></div>}</div></Panel></section>
      </div></main></div>{showEnrollment && <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 p-4"><div className="mx-auto my-6 max-w-4xl rounded-xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h2 className="text-lg font-bold text-slate-900">Add new enrollment</h2><p className="text-xs text-slate-500">Assign this enrollment to a coordinator before submitting.</p></div><button onClick={() => setShowEnrollment(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close enrollment form"><X size={19} /></button></div><div className="border-b border-slate-100 px-5 py-4"><label className="block text-sm font-semibold text-slate-700">Coordinator</label><select className={`${inputClass} mt-2 max-w-xl`} value={enrollmentCoordinatorId} onChange={event => setEnrollmentCoordinatorId(event.target.value)}><option value="">Select coordinator</option>{coordinators.map(coordinator => <option key={coordinator.id} value={coordinator.id}>{coordinator.name} · {coordinator.assigned_region} · {coordinator.assigned_constituency}</option>)}</select></div><EnrollmentForm coordinatorId={enrollmentCoordinatorId} onSubmitted={() => { setShowEnrollment(false); load(); }} /></div></div>}</div>;
}

function InlineCoordinatorForm({ onCreated }) {
  const [formData, setFormData] = useState({ name: '', mobile_number: '', temp_password: '', assigned_region: '', assigned_constituency: '', assigned_mandal: '' });
  const [constituencies, setConstituencies] = useState([]);
  const [mandals, setMandals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    axios.get(`${API}/geo/assemblies`)
      .then(response => setConstituencies(response.data || []))
      .catch(() => setError('Failed to load constituencies.'));
  }, []);

  const handleChange = (event) => {
    const next = { ...formData, [event.target.name]: event.target.value };

    if (event.target.name === 'assigned_constituency') {
      const normalized = String(event.target.value || '').trim();
      const selected = constituencies.find(item => String(item.assembly_constituency || '').trim() === normalized);
      next.assigned_region = selected?.region || '';
      next.assigned_mandal = '';
      setMandals([]);

      if (normalized) {
        axios.get(`${API}/geo/mandals`, { params: { constituency: normalized } })
          .then(response => setMandals(Array.isArray(response.data) ? response.data.map(item => typeof item === 'string' ? { mandal: item } : item) : []))
          .catch(() => setError('Failed to load mandals.'));
      }
    }

    setFormData(next);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      await axios.post(`${API}/admin/create-coordinator`, formData);
      setSuccess('Coordinator created successfully.');
      setFormData({ name: '', mobile_number: '', temp_password: '', assigned_region: '', assigned_constituency: '', assigned_mandal: '' });
      setMandals([]);
      onCreated?.();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create coordinator account.');
    } finally {
      setLoading(false);
    }
  };

  return <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="mb-4"><h3 className="text-base font-bold text-slate-900">Add coordinator</h3><p className="mt-1 text-xs text-slate-500">Create a new constituency access account.</p></div>{error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}{success && <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div>}<form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2"><div><label className="mb-1 block text-sm font-medium text-slate-700">Full name</label><input type="text" name="name" required value={formData.name} onChange={handleChange} className={inputClass} placeholder="e.g. Ramesh Kumar" /></div><div><label className="mb-1 block text-sm font-medium text-slate-700">Mobile number</label><input type="tel" name="mobile_number" required pattern="[0-9]{10}" value={formData.mobile_number} onChange={handleChange} className={inputClass} placeholder="10-digit mobile number" /></div><div><label className="mb-1 block text-sm font-medium text-slate-700">Temporary password</label><input type="text" name="temp_password" required value={formData.temp_password} onChange={handleChange} className={inputClass} placeholder="e.g. Temp@123" /></div><div><label className="mb-1 block text-sm font-medium text-slate-700">Assigned region</label><input readOnly value={formData.assigned_region} className={`${inputClass} bg-slate-100 text-slate-600`} placeholder="Selected from constituency" /></div><div><label className="mb-1 block text-sm font-medium text-slate-700">Assigned constituency</label><select name="assigned_constituency" required value={formData.assigned_constituency} onChange={handleChange} className={inputClass}><option value="">Select constituency</option>{constituencies.map(item => <option key={`${item.ac_no}-${item.assembly_constituency}`} value={item.assembly_constituency}>{item.assembly_constituency} ({item.region})</option>)}</select></div><div><label className="mb-1 block text-sm font-medium text-slate-700">Assigned mandal</label><select name="assigned_mandal" required value={formData.assigned_mandal} onChange={handleChange} disabled={!formData.assigned_constituency} className={inputClass}><option value="">Select mandal</option>{mandals.map(item => <option key={item.mandal} value={item.mandal}>{item.mandal}</option>)}</select></div><div className="md:col-span-2"><label className="mb-1 block text-sm font-medium text-slate-700">Generated login email</label><input readOnly value={getLoginEmail(formData.name, formData.assigned_constituency)} className={`${inputClass} bg-slate-100 text-slate-600`} placeholder="Generated from name and constituency" /></div><div className="md:col-span-2 flex justify-end"><button type="submit" disabled={loading} className="flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-70"><Users size={17} className="text-white" />{loading ? 'Saving...' : 'Create account'}</button></div></form></div>;
}

function PageHeading({ eyebrow, title, detail, action }) { return <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-teal-700">{eyebrow}</p><h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{title}</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">{detail}</p></div>{action}</div>; }
function Panel({ title, detail, children, className = '' }) { return <div className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 ${className}`}>{title && <div className="mb-5"><h3 className="font-bold text-slate-900">{title}</h3>{detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}</div>}{children}</div>; }
function BreakdownPanel({ title, subtitle, children }) { return <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 p-4"><h3 className="font-bold text-slate-900">{title}</h3><p className="mt-1 text-xs text-slate-500">{subtitle}</p></div><div className="max-h-72 overflow-auto">{children}</div></div>; }
function AuditLog({ log }) { return <div className="grid gap-2 border-b border-slate-100 px-2 py-4 last:border-0 md:grid-cols-[1.2fr_1.2fr_1fr_2fr] md:gap-4"><div><p className="text-xs font-semibold text-slate-900 md:hidden">Time</p><time className="text-xs text-slate-500">{new Date(log.timestamp).toLocaleString()}</time></div><div><p className="text-xs font-semibold text-slate-900 md:hidden">Action</p><strong className="text-sm text-slate-900">{log.action}</strong></div><div><p className="text-xs font-semibold text-slate-900 md:hidden">User</p><p className="text-sm text-slate-700">{log.user_name || 'System'}</p><p className="text-xs text-slate-400">{log.role || 'system'}</p></div><div className="min-w-0"><p className="text-xs font-semibold text-slate-900 md:hidden">Details</p><p className="break-words text-xs leading-5 text-slate-500">{typeof log.details === 'object' ? JSON.stringify(log.details) : log.details || 'No additional details'}</p></div></div>; }
function Metric({ label, value, icon, tone }) { const tones = { teal: 'bg-teal-50 text-teal-700', amber: 'bg-amber-50 text-amber-700', green: 'bg-green-50 text-green-700', blue: 'bg-blue-50 text-blue-700' }; return <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span><span className={`rounded-lg p-2 ${tones[tone]}`}>{icon}</span></div><p className="mt-5 text-3xl font-bold tracking-tight text-slate-950">{Number(value).toLocaleString()}</p></div>; }
function RegionGrowthChart({ data = [] }) { const max = Math.max(...data.flatMap(item => item.values), 1); const width = 680; const height = 250; const chartWidth = 590; const chartHeight = 170; const left = 52; const bottom = 192; const colors = ['#0f766e', '#d97706', '#84b832']; return data.length ? <div><div className="overflow-x-auto"><svg viewBox={`0 0 ${width} ${height}`} className="min-w-[600px] w-full" role="img" aria-label="Region-wise seven-day enrollment growth line chart"><line x1={left} y1="18" x2={left} y2={bottom} stroke="#64748b" strokeWidth="1.5" /><line x1={left} y1={bottom} x2="642" y2={bottom} stroke="#64748b" strokeWidth="1.5" />{[0, 0.25, 0.5, 0.75, 1].map(level => { const y = bottom - level * chartHeight; return <g key={level}><line x1={left} y1={y} x2="642" y2={y} stroke="#e2e8f0" strokeDasharray="3 5" /><text x="42" y={y + 4} textAnchor="end" fontSize="10" fill="#64748b">{Math.round(max * level)}</text></g>; })}{data[0].labels.map((label, index) => { const x = left + (index / Math.max(data[0].labels.length - 1, 1)) * chartWidth; return <text key={label} x={x} y="214" textAnchor="middle" fontSize="11" fill="#64748b">{label}</text>; })}{data.map((series, seriesIndex) => { const points = series.values.map((value, index) => `${left + (index / Math.max(series.values.length - 1, 1)) * chartWidth},${bottom - (value / max) * chartHeight}`).join(' '); const color = colors[seriesIndex % colors.length]; return <g key={series.region}><polyline points={points} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />{series.values.map((value, index) => { const x = left + (index / Math.max(series.values.length - 1, 1)) * chartWidth; const y = bottom - (value / max) * chartHeight; return <circle key={`${series.region}-${index}`} cx={x} cy={y} r="4" fill={color} stroke="white" strokeWidth="1.5" />; })}</g>; })}</svg></div><div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-600">{data.map((series, index) => <span key={series.region} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />{series.region}</span>)}</div></div> : <Empty label="No enrollment data for the selected filters." />; }
function StatusDonut({ metrics }) { const total = Number(metrics.total) || 0; const approved = Number(metrics.approved) || 0; const pending = Number(metrics.pending) || 0; const rejected = Number(metrics.rejected) || 0; const approvedPct = total ? approved / total * 100 : 0; const pendingPct = total ? pending / total * 100 : 0; return <div className="flex flex-wrap items-center justify-center gap-7"><div className="grid h-40 w-40 place-items-center rounded-full" style={{ background: `conic-gradient(#0f766e 0 ${approvedPct}%, #d97706 ${approvedPct}% ${approvedPct + pendingPct}%, #dc2626 ${approvedPct + pendingPct}% 100%)` }}><div className="grid h-24 w-24 place-items-center rounded-full bg-white"><strong className="text-2xl">{total.toLocaleString()}</strong><span className="text-[10px] uppercase text-slate-400">total</span></div></div><div className="space-y-3 text-sm"><Legend color="bg-teal-600" label="Approved" value={approved} /><Legend color="bg-amber-500" label="Pending" value={pending} /><Legend color="bg-red-600" label="Rejected" value={rejected} /></div></div>; }
function Legend({ color, label, value }) { return <div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${color}`} /><span className="text-slate-600">{label}</span><strong className="ml-2 text-slate-900">{value.toLocaleString()}</strong></div>; }
function Empty({ loading, label }) { return <div className="w-full py-10 text-center text-sm text-slate-500">{loading ? 'Loading live data...' : label}</div>; }
function getLoginEmail(name, constituency) {
  const firstName = String(name || '').trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  const area = String(constituency || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return firstName && area ? `${firstName}.${area}@kingmayker.com` : '';
}
function getRegionGrowth(voters, selectedRegion, regionOptions = []) {
  const regionNames = selectedRegion ? [selectedRegion] : (regionOptions.length ? regionOptions : ['Nalgonda', 'Warangal', 'Khammam']);
  const labels = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    return date.toLocaleDateString(undefined, { weekday: 'short' });
  });

  return regionNames.map(region => ({
    region,
    labels,
    values: labels.map((_, index) => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - (6 - index));
      const key = toLocalDateKey(date);
      return voters.filter(voter => String(voter.region || '').trim() === String(region || '').trim() && toLocalDateKey(voter.created_at) === key).length;
    })
  }));
}
function toLocalDateKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
function getLastSevenDays(voters) { return Array.from({ length: 7 }, (_, index) => { const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - (6 - index)); const key = toLocalDateKey(date); return { label: date.toLocaleDateString(undefined, { weekday: 'short' }), value: voters.filter(voter => toLocalDateKey(voter.created_at) === key).length }; }); }
function TrendGraph({ data }) { const max = Math.max(...data.map(item => item.value), 1); return <div className="flex h-36 items-end gap-3 border-b border-l border-slate-200 px-3 pb-0 pt-4">{data.map(item => <div key={item.label} className="flex h-full flex-1 flex-col items-center justify-end gap-2"><span className="text-xs font-semibold text-teal-800">{item.value}</span><div className="w-full max-w-12 rounded-t-md bg-teal-700" style={{ height: `${Math.max(5, (item.value / max) * 100)}%` }} /><span className="text-[11px] text-slate-500">{item.label}</span></div>)}</div>; }