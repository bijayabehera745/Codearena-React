import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function AuthModal({ onClose }) {
  const { login, register } = useAuth();
  const [mode, setMode]     = useState('login');   // 'login' | 'register'
  const [form, setForm]     = useState({ username: '', email: '', password: '' });
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async () => {
    setError('');
    if (!form.username || !form.password) { setError('Username and password are required.'); return; }

    setLoading(true);
    try {
      if (mode === 'login') {
        await login(form.username, form.password);
      } else {
        if (form.password.length < 6) { setError('Password must be at least 6 characters.'); setLoading(false); return; }
        await register(form.username, form.email, form.password);
      }
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => { if (e.key === 'Enter') handleSubmit(); };

  return (
    /* Backdrop */
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      {/* Modal card */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-light)',
          borderRadius: 'var(--radius-lg)',
          padding: '32px 28px',
          width: '100%',
          maxWidth: 380,
          animation: 'fadeIn 0.2s ease',
          boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
        }}
      >
        {/* Logo + title */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 40, height: 40,
            background: 'var(--accent)',
            borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: 20, color: '#fff',
            margin: '0 auto 12px',
          }}>C</div>
          <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 20, marginBottom: 4 }}>
            {mode === 'login' ? 'Welcome back' : 'Create account'}
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {mode === 'login' ? 'Sign in to access AI code review' : 'Join CodeArena — it\'s free'}
          </p>
        </div>

        {/* Tab switcher */}
        <div style={{
          display: 'flex',
          background: 'var(--bg-surface)',
          borderRadius: 'var(--radius-sm)',
          padding: 3,
          marginBottom: 20,
          border: '1px solid var(--border)',
        }}>
          {['login', 'register'].map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(''); }}
              style={{
                flex: 1,
                padding: '7px 0',
                border: 'none',
                borderRadius: 'calc(var(--radius-sm) - 2px)',
                background: mode === m ? 'var(--bg-elevated)' : 'transparent',
                color: mode === m ? 'var(--text-primary)' : 'var(--text-muted)',
                fontSize: 13,
                fontWeight: mode === m ? 500 : 400,
                cursor: 'pointer',
                fontFamily: 'var(--font-ui)',
                transition: 'all var(--transition)',
                boxShadow: mode === m ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
              }}
            >
              {m === 'login' ? 'Sign In' : 'Register'}
            </button>
          ))}
        </div>

        {/* Fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
          <Field label="Username" type="text"     value={form.username} onChange={set('username')} onKeyDown={handleKey} placeholder="your_handle" autoFocus />
          {mode === 'register' && (
            <Field label="Email (optional)" type="email" value={form.email} onChange={set('email')} onKeyDown={handleKey} placeholder="you@example.com" />
          )}
          <Field label="Password" type="password" value={form.password} onChange={set('password')} onKeyDown={handleKey} placeholder={mode === 'register' ? 'At least 6 characters' : '••••••••'} />
        </div>

        {/* Error */}
        {error && (
          <div style={{
            padding: '9px 12px',
            background: 'var(--red-dim)',
            border: '1px solid rgba(248,113,113,0.3)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--red)',
            fontSize: 12,
            marginBottom: 14,
          }}>
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          className="btn btn-primary"
          style={{ width: '100%', justifyContent: 'center', padding: '10px', fontSize: 14, fontWeight: 600 }}
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <><div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }}/> {mode === 'login' ? 'Signing in...' : 'Creating account...'}</>
          ) : mode === 'login' ? 'Sign In' : 'Create Account'}
        </button>

        <div style={{ textAlign: 'center', marginTop: 14, fontSize: 12, color: 'var(--text-muted)' }}>
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
            style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-ui)', fontWeight: 500 }}
          >
            {mode === 'login' ? 'Register' : 'Sign In'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, ...props }) {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 5, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {label}
      </label>
      <input
        {...props}
        onFocus={e => { setFocused(true); props.onFocus?.(e); }}
        onBlur={e  => { setFocused(false); props.onBlur?.(e); }}
        style={{
          width: '100%',
          padding: '9px 12px',
          background: 'var(--bg-surface)',
          border: `1px solid ${focused ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 'var(--radius-sm)',
          color: 'var(--text-primary)',
          fontSize: 14,
          fontFamily: 'var(--font-ui)',
          outline: 'none',
          transition: 'border-color var(--transition)',
          boxShadow: focused ? '0 0 0 3px var(--accent-glow)' : 'none',
        }}
      />
    </div>
  );
}