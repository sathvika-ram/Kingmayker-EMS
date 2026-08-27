import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ArrowRight } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      const data = await login(email, password);
      if (['super_admin', 'party_leader'].includes(data.role)) {
        navigate(data.role === 'party_leader' ? '/leader' : '/admin');
      } else {
        navigate('/coordinator');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white p-4 sm:p-8">
      <div className="max-w-md w-full bg-white rounded-2xl border border-[#e4ebe7] shadow-sm p-7 sm:p-10">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-[#f0f8f4] rounded-2xl flex items-center justify-center overflow-hidden">
            <img src="/India.jfif" alt="India" className="w-full h-full object-cover" />
          </div>
        </div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#7b9b3a] text-center mb-2">Kingmayker EMS</p>
        <h2 className="text-2xl font-bold text-center text-gray-800 mb-2">Sign in to your workspace</h2>
        <p className="text-sm text-center text-gray-500 mb-8">Authorized access for constituency operations</p>
        
        {error && (
          <div className="bg-red-50 text-red-500 p-3 rounded-md text-sm mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter your email"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter your password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
            ) : (
              <>Sign in <ArrowRight size={17} /></>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
