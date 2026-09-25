import { useState, useEffect } from 'react';
import axios from 'axios';
import { Clock, CheckCircle, XCircle, UserRound } from 'lucide-react';
import { API } from '../utils/api';

export default function EnrollmentHistory({ search = '', statusFilter = '' }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total_pages: 1 });
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    fetchHistory();
    const interval = setInterval(fetchHistory, 10000);
    return () => clearInterval(interval);
  }, [search, statusFilter, page]);

  useEffect(() => { setPage(1); }, [search, statusFilter]);

  const fetchHistory = async () => {
    try {
      const res = await axios.get(`${API}/coordinator/history`, { params: { search, status: statusFilter, page, limit: 50 } });
      setHistory(res.data.voters || []);
      setPagination(res.data.pagination || {});
      setTotalCount(Number(res.data.total_count || 0));
    } catch (err) {
      setError('Failed to load history');
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id, status) => {
    const confirmed = window.confirm('This status cannot be changed or corrected again. Do you want to continue?');
    if (!confirmed) return;
    try {
      await axios.patch(`${API}/coordinator/voters/${id}/status`, { status });
      setHistory(current => current.map(voter => voter.id === id ? { ...voter, enrollment_status: status } : voter));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update enrollment status');
    }
  };

  const StatusIcon = ({ status }) => {
    switch(status) {
      case 'approved': return <CheckCircle className="text-green-500 w-5 h-5" />;
      case 'rejected': return <XCircle className="text-red-500 w-5 h-5" />;
      default: return <Clock className="text-yellow-500 w-5 h-5" />;
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading history...</div>;
  }

  const emptyMessage = statusFilter ? `No ${statusFilter} enrollments` : search ? 'No enrollment found for this Voter ID or Application ID' : 'No enrollments submitted yet.';

  return (
    <div className="p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold text-gray-800">Submission History</h2><div className="rounded-md bg-[#eef8f0] px-3 py-2 text-sm font-bold text-[#1d6b5d]">Total enrollments: {totalCount.toLocaleString()}</div></div>
      {error && <div className="text-red-500 mb-4">{error}</div>}
      
      {visibleHistory.length === 0 ? (
        <div className="bg-gray-50 p-6 rounded-lg text-center text-gray-500">
          {emptyMessage}
        </div>
      ) : (
        <div className="space-y-3 pb-8">
          {visibleHistory.map(voter => (
            <div key={voter.id} className="bg-white border rounded-lg p-4 shadow-sm flex items-center justify-between">
              <div>
                <h4 className="flex items-center gap-2 font-semibold text-gray-800"><UserRound size={16} className="text-[#1d6b5d]" />{voter.voter_name}</h4>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-[#1d6b5d]"><span>Voter ID: {voter.voter_id || 'Not available'}</span><span>Application ID: {voter.acknowledgement_number || 'Not available'}</span></div>
                <p className="text-xs text-gray-500">{voter.village}, {voter.mandal}</p>
                <span className="text-xs text-gray-400 mt-1 block">
                  {new Date(voter.created_at).toLocaleDateString()}
                </span>
              </div>
              <div className="flex flex-col items-center">
                <StatusIcon status={voter.enrollment_status} />
                <span className={`text-[10px] uppercase font-bold mt-1 ${
                  voter.enrollment_status === 'approved' ? 'text-green-600' :
                  voter.enrollment_status === 'rejected' ? 'text-red-600' : 'text-yellow-600'
                }`}>
                  {voter.enrollment_status}
                </span>
                {!statusFilter && voter.enrollment_status === 'pending' && (
                  <select
                    value=""
                    onChange={e => {
                      const nextStatus = e.target.value;
                      if (nextStatus) updateStatus(voter.id, nextStatus);
                    }}
                    className="mt-2 rounded border border-[#b5c9c1] bg-white px-1 py-1 text-[10px] text-[#173b35]"
                  >
                    <option value="">Select status</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                  </select>
                )}
              </div>
            </div>
          ))}
          <div className="flex items-center justify-end gap-2 py-3 text-xs font-semibold text-gray-500"><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded border border-gray-300 bg-white px-3 py-1.5 disabled:opacity-40">Previous</button><span>Page {page} of {Math.max(pagination.total_pages || 1, 1)}</span><button type="button" disabled={page >= (pagination.total_pages || 1)} onClick={() => setPage(page + 1)} className="rounded border border-gray-300 bg-white px-3 py-1.5 disabled:opacity-40">Next</button></div>
        </div>
      )}
    </div>
  );
}
