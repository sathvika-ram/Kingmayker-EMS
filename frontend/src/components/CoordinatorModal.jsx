import { useEffect, useState } from 'react';
import axios from 'axios';
import { X } from 'lucide-react';
import { API } from '../utils/api';

export default function CoordinatorModal({ onClose }) {
  const [formData, setFormData] = useState({
    name: '',
    mobile_number: '',
    temp_password: '',
    assigned_region: '',
    assigned_constituency: '',
    assigned_mandal: ''
  });
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

  const handleChange = (e) => {
    const next = { ...formData, [e.target.name]: e.target.value };
    if (e.target.name === 'assigned_constituency') {
      const normalized = String(e.target.value || '').trim();
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const response = await axios.post(`${API}/admin/create-coordinator`, formData);
      setSuccess(response.data.message);
      setFormData({ name: '', mobile_number: '', temp_password: '', assigned_region: '', assigned_constituency: '', assigned_mandal: '' });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="flex justify-between items-center p-4 border-b bg-gray-50">
          <h3 className="font-bold text-gray-800">Provision Coordinator</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6">
          {error && <div className="bg-red-50 text-red-500 p-3 rounded-md text-sm mb-4">{error}</div>}
          {success && <div className="bg-green-50 text-green-600 p-3 rounded-md text-sm mb-4">{success}</div>}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
              <input type="text" name="name" required value={formData.name} onChange={handleChange} className="w-full px-3 py-2 border rounded-md text-sm focus:ring-1 focus:ring-blue-500" placeholder="e.g. Ramesh Kumar" />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Personal email</label>
              <input type="text" readOnly value={getLoginEmail(formData.name, formData.assigned_constituency)} className="w-full px-3 py-2 border rounded-md text-sm bg-gray-50 text-gray-500" placeholder="Generated from name and assigned area" />
              <p className="mt-1 text-xs text-gray-500">This is the coordinator's login email and is generated automatically.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Assigned region</label>
              <input readOnly value={formData.assigned_region} className="w-full px-3 py-2 border rounded-md text-sm bg-gray-50 text-gray-500" placeholder="Selected from constituency" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mobile number</label>
              <input type="tel" name="mobile_number" required pattern="[0-9]{10}" value={formData.mobile_number} onChange={handleChange} className="w-full px-3 py-2 border rounded-md text-sm focus:ring-1 focus:ring-blue-500" placeholder="10-digit mobile number" />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Temporary Password</label>
              <input type="text" name="temp_password" required value={formData.temp_password} onChange={handleChange} className="w-full px-3 py-2 border rounded-md text-sm focus:ring-1 focus:ring-blue-500" placeholder="e.g. Temp@123" />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Assigned Constituency</label>
              <select name="assigned_constituency" required value={formData.assigned_constituency} onChange={handleChange} className="w-full px-3 py-2 border rounded-md text-sm focus:ring-1 focus:ring-blue-500">
                <option value="">Select constituency</option>
                {constituencies.map(item => <option key={`${item.ac_no}-${item.assembly_constituency}`} value={item.assembly_constituency}>{item.assembly_constituency} ({item.region})</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Assigned Mandal</label>
              <select name="assigned_mandal" required value={formData.assigned_mandal} onChange={handleChange} disabled={!formData.assigned_constituency} className="w-full px-3 py-2 border rounded-md text-sm focus:ring-1 focus:ring-blue-500">
                <option value="">Select mandal</option>
                {mandals.map(item => <option key={item.mandal} value={item.mandal}>{item.mandal}</option>)}
              </select>
            </div>

            <div className="pt-4 flex justify-end space-x-3">
              <button type="button" onClick={onClose} className="px-4 py-2 border rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
                Close
              </button>
              <button type="submit" disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition flex items-center text-white">
                {loading ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></span> : null}
                Create Account
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function getLoginEmail(name, constituency) {
  const firstName = String(name || '').trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  const area = String(constituency || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return firstName && area ? `${firstName}.${area}@kingmayker.com` : '';
}
