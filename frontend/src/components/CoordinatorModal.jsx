import { useEffect, useState } from 'react';
import axios from 'axios';
import { X } from 'lucide-react';

export default function CoordinatorModal({ onClose }) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    mobile_number: '',
    temp_password: '',
    assigned_constituency: ''
  });
  const [constituencies, setConstituencies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    axios.get('http://localhost:5000/api/geo/assemblies')
      .then(response => setConstituencies(response.data || []))
      .catch(() => setError('Failed to load constituencies.'));
  }, []);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      await axios.post('http://localhost:5000/api/admin/create-coordinator', formData);
      setSuccess('Coordinator account created successfully!');
      setFormData({ name: '', email: '', mobile_number: '', temp_password: '', assigned_constituency: '' });
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Email <span className="font-normal text-gray-400">(optional)</span></label>
              <input type="email" name="email" value={formData.email} onChange={handleChange} className="w-full px-3 py-2 border rounded-md text-sm focus:ring-1 focus:ring-blue-500" placeholder="ramesh@mlc-campaign.org" />
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
                {constituencies.map(item => <option key={`${item.ac_no}-${item.assembly_constituency}`} value={item.assembly_constituency}>{item.assembly_constituency}</option>)}
              </select>
            </div>

            <div className="pt-4 flex justify-end space-x-3">
              <button type="button" onClick={onClose} className="px-4 py-2 border rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
                Close
              </button>
              <button type="submit" disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition flex items-center">
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
