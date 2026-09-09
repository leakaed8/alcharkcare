import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function Login() {
  const [mode, setMode] = useState('staff'); // 'staff' | 'patient'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const { loginStaff, loginPatient } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      if (mode === 'staff') {
        await loginStaff(username, password);
        navigate('/staff/patients');
      } else {
        await loginPatient(phone, pin);
        navigate('/patient');
      }
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1>Al Chark</h1>
        <p className="auth-subtitle">Patient CRM</p>

        <div className="tab-group">
          <button
            type="button"
            className={`tab-btn ${mode === 'staff' ? 'active' : ''}`}
            onClick={() => setMode('staff')}
          >
            Staff login
          </button>
          <button
            type="button"
            className={`tab-btn ${mode === 'patient' ? 'active' : ''}`}
            onClick={() => setMode('patient')}
          >
            Patient login
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {mode === 'staff' ? (
            <>
              <div className="form-field">
                <input
                  className="input"
                  placeholder="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
              <div className="form-field">
                <input
                  className="input"
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </>
          ) : (
            <>
              <div className="form-field">
                <input
                  className="input"
                  placeholder="Phone number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div className="form-field">
                <input
                  className="input"
                  type="password"
                  placeholder="PIN"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                />
              </div>
            </>
          )}

          {error && <p className="alert alert-error">{error}</p>}
          <button type="submit" className="btn btn-primary btn-block">
            Log in
          </button>
        </form>
      </div>
    </div>
  );
}
