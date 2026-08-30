import { useState, useEffect } from 'react';
import axios from 'axios';
import { Clock, CheckCircle, XCircle, UserRound } from 'lucide-react';
import { API } from '../utils/api';

export default function EnrollmentHistory({ search = '', statusOnly = false }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchHistory();
    const interval = setInterval(fetchHistory, 10000);
    return () => clearInterval(interval);
  }, [search]);

  const fetchHistory = async () => {
    try {
      const res = await axios.get(`${API}/coordinator/history`, { params: { search } });
      setHistory(res.data.voters || []);
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

  const visibleHistory = history.filter(voter => !statusOnly || ['pending', 'in_progress'].includes(voter.enrollment_status));
  const emptyMessage = statusOnly ? 'No pending requests' : search ? 'No enrollment found for this Voter ID' : 'No enrollments submitted yet.';

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold text-gray-800 mb-4">Submission History</h2>
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
                <p className="mt-1 text-xs font-semibold text-[#1d6b5d]">Voter ID: {voter.voter_id || 'Not available'}</p>
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
                {statusOnly && voter.enrollment_status === 'pending' && (
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
        </div>
      )}
    </div>
  );
}
