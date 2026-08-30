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
        navigate(data.role === 'party_leader' ? '/leader' : '/admin/analytics');
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
    <div className="login-page">
      <div className="login-shell">
        <div className="login-visual" aria-label="Civic engagement backdrop">
          <div className="login-visual__overlay" />
          <div className="login-visual__content">
            <div className="login-brand-badge">
              <img src="/India.jfif" alt="India" className="login-brand-icon" />
              <span className="login-brand-text">KINGMAYKER EMS</span>
            </div>

            <div className="login-motto">
              <p className="login-kicker">Trusted civic operations</p>
              <h1>Every leader needs a strong system.</h1>
              <p className="login-quote">
                “Democracy grows stronger when every citizen is heard, counted, and represented.”
              </p>
            </div>
          </div>
        </div>

        <div className="login-form-panel">
          <div className="login-card">
            <div className="login-card__header">
              <div className="login-card__logo-wrap">
                <img src="/parl.jfif" alt="Parliament" className="login-card__logo" />
              </div>
              <p className="login-eyebrow">Secure access</p>
              <h2>Sign in to your workspace</h2>
              <p className="login-subtitle">Authorized access for constituency operations</p>
            </div>

            {error && (
              <div className="login-error">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="login-form">
              <div className="login-field">
                <label htmlFor="login-email">Email Address</label>
                <input
                  id="login-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                />
              </div>

              <div className="login-field">
                <label htmlFor="login-password">Password</label>
                <input
                  id="login-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                />
              </div>

              <button type="submit" disabled={loading} className="login-submit">
                {loading ? (
                  <span className="login-spinner" aria-label="Loading" />
                ) : (
                  <>
                    Sign in <ArrowRight size={17} />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
