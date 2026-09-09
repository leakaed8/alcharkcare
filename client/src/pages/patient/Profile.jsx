import { useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { apiFetch } from '../../api/client';

const CONTACT_METHODS = [
  { value: 'phone', label: 'Phone call' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'sms', label: 'Text message' },
  { value: 'email', label: 'Email' },
];

export default function Profile() {
  const { user, logout } = useAuth();
  const [patient, setPatient] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch(`/patients/${user.id}`).then((d) => setPatient(d.patient)).catch((err) => setError(err.message));
  }, [user.id]);

  async function updateContactMethod(value) {
    setSaving(true);
    setMessage('');
    try {
      const updated = await apiFetch(`/patients/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ preferred_contact_method: value }),
      });
      setPatient(updated);
      setMessage('Saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (error) return <p className="alert alert-error">{error}</p>;
  if (!patient) return <p className="muted">Loading…</p>;

  return (
    <div>
      <p className="p-greeting">My profile</p>

      <div className="p-card">
        <p className="p-card__meta">Name</p>
        <p className="p-card__title">{patient.name}</p>

        <p className="p-card__meta" style={{ marginTop: 14 }}>Phone</p>
        <p className="p-card__body">{patient.phone}</p>

        {patient.dob && (
          <>
            <p className="p-card__meta" style={{ marginTop: 14 }}>Date of birth</p>
            <p className="p-card__body">{new Date(patient.dob).toLocaleDateString()}</p>
          </>
        )}

        <p className="p-card__meta" style={{ marginTop: 14 }}>Loyalty tier</p>
        <span className={`badge badge-${patient.loyalty_tier}`}>{patient.loyalty_tier}</span>
      </div>

      <p className="p-section-title">Preferred communication method</p>
      <div className="p-card">
        <div className="row-actions">
          {CONTACT_METHODS.map((m) => (
            <button
              key={m.value}
              type="button"
              className={`p-tab ${patient.preferred_contact_method === m.value ? 'active' : ''}`}
              disabled={saving}
              onClick={() => updateContactMethod(m.value)}
            >
              {m.label}
            </button>
          ))}
        </div>
        {message && <p className="muted">{message}</p>}
      </div>

      <button className="p-cta p-cta--secondary mt-3" onClick={logout}>Log out</button>
    </div>
  );
}
