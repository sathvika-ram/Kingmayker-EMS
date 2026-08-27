import { useEffect, useState } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { Activity, CheckCircle, Clock3, Download, FilePlus2, Filter, LayoutDashboard, LogOut, Map, Menu, RefreshCw, ShieldCheck, Users, X, XCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import CoordinatorModal from '../components/CoordinatorModal';
import VotersTable from '../components/VotersTable';
import { API } from '../utils/api';

const selectClass = 'rounded-md border border-[#b5c9c1] bg-white px-3 py-2 text-sm text-[#173b35]';

export default function SuperAdminDashboard() {
  const { user, logout } = useAuth();
  const [voters, setVoters] = useState([]);
  const [logs, setLogs] = useState([]);
  const [regions, setRegions] = useState([]);
  const [constituencies, setConstituencies] = useState([]);
  const [mandals, setMandals] = useState([]);
  const [region, setRegion] = useState('');
  const [constituency, setConstituency] = useState('');
  const [mandal, setMandal] = useState('');
  const [status, setStatus] = useState('');
  const [view, setView] = useState('overview');
  const [showModal, setShowModal] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [auditLoading, setAuditLoading] = useState(false);
  const [error, setError] = useState('');

  const loadVoters = async () => {
    setLoading(true);
    try {
      const result = await axios.get(`${API}/admin/voters`, { params: { region, constituency, mandal, status } });
      setVoters(result.data.voters || []);
      setError('');
    } catch { setError('Unable to load enrollment data.'); }
    finally { setLoading(false); }
  };
  const loadAudit = async () => {
    setAuditLoading(true);
    try { const result = await axios.get(`${API}/admin/audit-logs`); setLogs(result.data.logs || []); }
    catch { setError('Unable to load audit log.'); }
    finally { setAuditLoading(false); }
  };
  useEffect(() => { axios.get(`${API}/geo/regions`).then(result => setRegions(result.data || [])).catch(() => setError('Unable to load regions.')); loadAudit(); }, []);
  useEffect(() => {
    setConstituency(''); setMandal(''); setMandals([]);
    axios.get(`${API}/geo/assemblies`, { params: region ? { region } : {} }).then(result => setConstituencies(result.data || [])).catch(() => setError('Unable to load constituencies.'));
  }, [region]);
  useEffect(() => {
    if (!constituency) { setMandals([]); return; }
    setMandal('');
    axios.get(`${API}/geo/mandals`, { params: { constituency } }).then(result => setMandals(result.data || [])).catch(() => setError('Unable to load mandals.'));
  }, [constituency]);
  useEffect(() => { loadVoters(); }, [region, constituency, mandal, status]);
  useEffect(() => {
    const interval = setInterval(loadVoters, 10000);
    return () => clearInterval(interval);
  }, [region, constituency, mandal, status]);

  const total = voters.length;
  const approved = voters.filter(voter => voter.enrollment_status === 'approved').length;
  const pending = voters.filter(voter => ['pending', 'in_progress'].includes(voter.enrollment_status)).length;
  const rejected = voters.filter(voter => voter.enrollment_status === 'rejected').length;
  const updateStatus = async (id, enrollment_status) => {
    try { await axios.patch(`${API}/admin/voters/${id}/status`, { enrollment_status }); setVoters(current => current.map(voter => voter.id === id ? { ...voter, enrollment_status } : voter)); loadAudit(); }
    catch { setError('Unable to update voter status.'); }
  };
  const exportData = () => { const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(voters), 'Selected Geography'); XLSX.writeFile(workbook, `kingmayker-admin-${(constituency || region || 'all-regions').toLowerCase().replace(/\s+/g, '-')}.xlsx`); };
  const navigate = nextView => { setView(nextView); setSidebarOpen(false); document.getElementById(nextView)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

  return <div className="min-h-screen bg-[#f3f7f5] text-[#173b35]"><header className="sticky top-0 z-30 border-b border-[#e4ebe7] bg-white px-4 py-3 shadow-sm sm:px-8"><div className="flex w-full items-center justify-between gap-3"><button onClick={() => setSidebarOpen(true)} className="rounded-md p-2 text-[#1d6b5d] lg:hidden" title="Open navigation" aria-label="Open navigation"><Menu size={20} /></button><div className="flex items-center gap-3"><img src="/India.jfif" alt="Kingmayker" className="h-10 w-10 rounded-lg object-cover" /><div><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#7b9b3a]">Kingmayker EMS</p><h1 className="text-lg font-bold">Admin Control Center</h1></div></div><div className="flex items-center gap-3"><span className="hidden text-xs text-[#64736f] sm:inline">{user?.name || 'Super Admin'}</span><button onClick={logout} title="Sign out" aria-label="Sign out" className="rounded-md p-2 text-[#64736f]"><LogOut size={18} /></button></div></div></header><div className="flex w-full"><aside className={`${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} fixed inset-y-0 left-0 z-40 mt-[65px] w-72 border-r border-[#dce8e2] bg-[#173b35] p-4 text-white transition-transform lg:sticky lg:top-[65px] lg:mt-0 lg:h-[calc(100vh-65px)] lg:w-64 lg:translate-x-0`}><div className="mb-5 flex justify-between lg:hidden"><span className="text-xs font-bold uppercase tracking-wider text-[#d8f36a]">Navigation</span><button onClick={() => setSidebarOpen(false)} aria-label="Close navigation"><X size={19} /></button></div><nav className="space-y-1"><SideLink icon={<LayoutDashboard size={17} />} label="Admin overview" active={view === 'overview'} onClick={() => navigate('overview')} /><SideLink icon={<Map size={17} />} label="Geographic enrollments" active={view === 'enrollments'} onClick={() => navigate('enrollments')} /><SideLink icon={<Activity size={17} />} label="Audit log" active={view === 'audit'} onClick={() => navigate('audit')} /></nav><button onClick={() => setShowModal(true)} className="mt-7 flex w-full items-center justify-center gap-2 rounded-md bg-[#d8f36a] px-3 py-2.5 text-sm font-bold text-[#173b35]"><FilePlus2 size={17} /> New coordinator</button></aside>{sidebarOpen && <button type="button" aria-label="Close navigation overlay" onClick={() => setSidebarOpen(false)} className="fixed inset-0 z-30 bg-[#173b35]/40 lg:hidden" />}<main className="min-w-0 flex-1 space-y-5 p-4 sm:p-8" id="overview"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#7b9b3a]">Super admin workspace</p><h2 className="mt-1 text-2xl font-bold">System oversight</h2><p className="mt-1 text-sm text-[#64736f]">Manage enrollments, coordinators, and operational history.</p></div><div className="flex gap-2"><button onClick={loadVoters} title="Refresh data" aria-label="Refresh data" className="rounded-md border border-[#b5c9c1] bg-white p-2 text-[#1d6b5d]"><RefreshCw size={17} /></button><button onClick={exportData} className="flex items-center gap-2 rounded-md bg-[#173b35] px-3 py-2 text-sm font-semibold text-white"><Download size={16} /> Selected geography XLS</button></div></div><section className="rounded-lg border border-[#e4ebe7] bg-white p-4 shadow-sm" id="enrollments"><div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#52736a]"><Filter size={16} /> Geographic filters</div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><select value={region} onChange={event => setRegion(event.target.value)} className={selectClass}><option value="">All Regions</option>{regions.map(item => <option key={item.region} value={item.region}>{item.region}</option>)}</select><select value={constituency} onChange={event => setConstituency(event.target.value)} className={selectClass}><option value="">All Constituencies</option>{constituencies.map(item => <option key={`${item.ac_no}-${item.assembly_constituency}`} value={item.assembly_constituency}>{item.assembly_constituency}</option>)}</select><select value={mandal} onChange={event => setMandal(event.target.value)} disabled={!constituency} className={selectClass}><option value="">All Mandals</option>{mandals.map(item => <option key={item.mandal} value={item.mandal}>{item.mandal}</option>)}</select><select value={status} onChange={event => setStatus(event.target.value)} className={selectClass}><option value="">All Statuses</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></div></section>{error && <div className="rounded-md border border-[#f0c8c2] bg-[#fff3f1] p-3 text-sm text-[#a84b43]">{error}</div>}<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Metric icon={<Users size={19} />} label="Total enrollments" value={total} /><Metric icon={<CheckCircle size={19} />} label="Approved" value={approved} /><Metric icon={<Clock3 size={19} />} label="Pending review" value={pending} /><Metric icon={<XCircle size={19} />} label="Rejected" value={rejected} /></div><section className="overflow-hidden rounded-lg border border-[#e4ebe7] bg-white shadow-sm"><div className="flex items-center justify-between border-b border-[#e4ebe7] p-4"><div><h3 className="font-bold">Enrollment data</h3><p className="text-xs text-[#64736f]">Status changes are recorded in the audit log.</p></div><ShieldCheck size={19} className="text-[#1d6b5d]" /></div><div className="min-h-[360px] overflow-x-auto">{loading ? <div className="flex h-64 items-center justify-center text-sm text-[#64736f]">Loading data...</div> : <VotersTable voters={voters} onUpdateStatus={updateStatus} />}</div></section><section className="rounded-lg border border-[#e4ebe7] bg-white p-4 shadow-sm" id="audit"><div className="mb-4 flex items-center justify-between"><div><h3 className="font-bold">Audit log</h3><p className="text-xs text-[#64736f]">Timestamped activity across the application.</p></div><button onClick={loadAudit} title="Refresh audit log" aria-label="Refresh audit log" className="rounded-md p-2 text-[#1d6b5d]"><RefreshCw size={17} /></button></div>{auditLoading ? <p className="p-6 text-center text-sm text-[#64736f]">Loading audit activity...</p> : <div className="max-h-80 overflow-auto"><table className="w-full text-left text-sm"><thead className="bg-[#f5f8f6] text-xs uppercase tracking-wider text-[#64736f]"><tr><th className="px-3 py-3">Time</th><th className="px-3 py-3">Action</th><th className="px-3 py-3">User</th><th className="px-3 py-3">Details</th></tr></thead><tbody>{logs.map(log => <tr key={log.id} className="border-t border-[#e4ebe7]"><td className="whitespace-nowrap px-3 py-3 text-xs text-[#64736f]">{new Date(log.timestamp).toLocaleString()}</td><td className="px-3 py-3 font-semibold">{log.action}</td><td className="px-3 py-3">{log.user_name || 'System'}<div className="text-xs text-[#64736f]">{log.role || ''}</div></td><td className="max-w-xs truncate px-3 py-3 text-xs text-[#64736f]">{JSON.stringify(log.details || {})}</td></tr>)}</tbody></table>{!logs.length && <p className="p-6 text-center text-sm text-[#64736f]">No recorded activity yet.</p>}</div>}</section></main></div>{showModal && <CoordinatorModal onClose={() => { setShowModal(false); loadAudit(); }} />}</div>;
}

function SideLink({ icon, label, active, onClick }) { return <button type="button" onClick={onClick} className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-semibold ${active ? 'bg-white/15 text-[#d8f36a]' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}>{icon}{label}</button>; }
function Metric({ icon, label, value }) { return <div className="rounded-lg border border-[#e4ebe7] bg-white p-4 shadow-sm"><div className="flex items-center gap-3"><span className="rounded-md bg-[#eef8f0] p-2 text-[#2f7c57]">{icon}</span><span className="text-xs font-semibold text-[#64736f]">{label}</span></div><div className="mt-3 text-3xl font-bold">{value}</div></div>; }
