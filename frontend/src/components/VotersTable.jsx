import { Check, X, Eye, FileText } from 'lucide-react';

export default function VotersTable({ voters, onUpdateStatus }) {
  if (voters.length === 0) {
    return <div className="p-8 text-center text-gray-500">No voters found matching the criteria.</div>;
  }

  const getStatusBadge = (status) => {
    switch(status) {
      case 'approved': return <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full font-medium">Approved</span>;
      case 'rejected': return <span className="bg-red-100 text-red-800 text-xs px-2 py-1 rounded-full font-medium">Rejected</span>;
      default: return <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded-full font-medium">Pending</span>;
    }
  };

  return (
    <table className="w-full text-left border-collapse text-sm">
      <thead>
        <tr className="bg-gray-50 text-gray-600 border-b">
          <th className="p-4 font-semibold">Voter Info</th>
          <th className="p-4 font-semibold">Location</th>
          <th className="p-4 font-semibold">Qualification</th>
          <th className="p-4 font-semibold">Submitted By</th>
          <th className="p-4 font-semibold">Status</th>
          <th className="p-4 font-semibold text-right">Actions</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {voters.map((voter) => (
          <tr key={voter.id} className="hover:bg-gray-50 transition-colors">
            <td className="p-4">
              <div className="font-medium text-gray-800">{voter.voter_name}</div>
              <div className="text-xs text-gray-500">Ph: {voter.mobile_number || 'N/A'}</div>
              <div className="text-xs text-gray-500">F/o: {voter.father_name}</div>
            </td>
            <td className="p-4">
              <div className="text-gray-800">{voter.constituency}</div>
              <div className="text-xs text-gray-500">{voter.mandal}, {voter.village}</div>
            </td>
            <td className="p-4">
              <div className="text-gray-800">{voter.degree_qualification}</div>
              <div className="text-xs text-gray-500">Year: {voter.graduation_year}</div>
              <a 
                href={voter.degree_certificate_url} 
                target="_blank" 
                rel="noreferrer"
                className="inline-flex items-center space-x-1 text-blue-600 hover:text-blue-800 text-xs mt-1 font-medium"
              >
                <FileText size={12} /> <span>View Proof</span>
              </a>
            </td>
            <td className="p-4">
              <div className="text-gray-800">{voter.coordinator_name || `ID: ${voter.coordinator_id}`}</div>
              <div className="text-[10px] text-gray-400">{new Date(voter.created_at).toLocaleDateString()}</div>
            </td>
            <td className="p-4">
              {getStatusBadge(voter.enrollment_status)}
            </td>
            <td className="p-4 text-right space-x-2">
              <button 
                onClick={() => onUpdateStatus(voter.id, 'approved')}
                disabled={voter.enrollment_status === 'approved'}
                className="p-1.5 text-green-600 hover:bg-green-100 rounded transition disabled:opacity-30"
                title="Approve"
              >
                <Check size={18} />
              </button>
              <button 
                onClick={() => onUpdateStatus(voter.id, 'rejected')}
                disabled={voter.enrollment_status === 'rejected'}
                className="p-1.5 text-red-600 hover:bg-red-100 rounded transition disabled:opacity-30"
                title="Reject"
              >
                <X size={18} />
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
