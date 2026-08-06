import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HeartPulse, Lock, User, Mail, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import api, { setAuthSession } from '../services/api';
import { showToast } from '../components/Toast';

export default function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const endpoint = isLogin ? '/api/login/' : '/api/register/';
    const payload = isLogin ? { username, password } : { username, email, password };

    try {
      const data = await api.post(endpoint, payload);
      setAuthSession(data);
      showToast(isLogin ? 'Welcome back!' : 'Account created successfully!', 'success');
      navigate('/home');
      window.location.reload();
    } catch (err) {
      setError(err.message || 'Authentication failed');
      showToast(err.message || 'Authentication failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #f8fafc 0%, #e0f2fe 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px'
    }}>
      <div style={{
        maxWidth: '440px',
        width: '100%',
        backgroundColor: '#ffffff',
        borderRadius: '24px',
        padding: '36px 32px',
        boxShadow: '0 20px 40px -15px rgba(2, 132, 199, 0.15)',
        border: '1px solid #e2e8f0'
      }}>
        {/* Brand Logo & Header */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '20px',
            background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            margin: '0 auto 16px',
            boxShadow: '0 8px 20px rgba(2, 132, 199, 0.3)'
          }}>
            <HeartPulse size={36} />
          </div>
          <h1 style={{ fontSize: '28px', fontWeight: '800', color: 'var(--primary-color)', margin: 0 }}>MediMate</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '6px' }}>
            Your Intelligent Healthcare Companion
          </p>
        </div>

        {/* Tab Toggle */}
        <div style={{
          display: 'flex',
          background: 'var(--bg-subtle)',
          borderRadius: '14px',
          padding: '4px',
          marginBottom: '28px'
        }}>
          <button
            type="button"
            onClick={() => { setIsLogin(true); setError(''); }}
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: '10px',
              border: 'none',
              background: isLogin ? 'var(--primary-gradient)' : 'transparent',
              color: isLogin ? '#ffffff' : 'var(--text-secondary)',
              fontWeight: '700',
              fontSize: '14px',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            Log In
          </button>
          <button
            type="button"
            onClick={() => { setIsLogin(false); setError(''); }}
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: '10px',
              border: 'none',
              background: !isLogin ? 'var(--primary-gradient)' : 'transparent',
              color: !isLogin ? '#ffffff' : 'var(--text-secondary)',
              fontWeight: '700',
              fontSize: '14px',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            Sign Up
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div style={{
            backgroundColor: 'var(--danger-light)',
            color: 'var(--danger-color)',
            padding: '12px 16px',
            borderRadius: '12px',
            fontSize: '14px',
            marginBottom: '20px',
            fontWeight: '600'
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label className="input-label">Username</label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                className="input-field"
                style={{ paddingLeft: '44px' }}
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Enter username"
                required
              />
              <User size={18} color="var(--text-secondary)" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
            </div>
          </div>

          {!isLogin && (
            <div className="input-group">
              <label className="input-label">Email (Optional)</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="email"
                  className="input-field"
                  style={{ paddingLeft: '44px' }}
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="Enter email address"
                />
                <Mail size={18} color="var(--text-secondary)" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
              </div>
            </div>
          )}

          <div className="input-group">
            <label className="input-label">Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                className="input-field"
                style={{ paddingLeft: '44px', paddingRight: '44px' }}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter password"
                required
              />
              <Lock size={18} color="var(--text-secondary)" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ marginTop: '12px', padding: '14px' }}
          >
            {loading ? (isLogin ? 'Signing In...' : 'Creating Account...') : (isLogin ? 'Sign In' : 'Create Account')}
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '24px', fontSize: '13px', color: 'var(--text-secondary)' }}>
          <ShieldCheck size={16} color="var(--secondary-color)" />
          <span>Encrypted Medical Health Data</span>
        </div>
      </div>
    </div>
  );
}
