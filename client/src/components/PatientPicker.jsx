import { useState } from 'react';
import { apiFetch } from '../api/client';

const SKIN_TYPES = ['normal', 'oily', 'dry', 'combination', 'sensitive'];

function randomPin() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

// Find an existing patient by name/phone, or create a new one -- either
// way, hands the resolved patient id back to the caller.
export default function PatientPicker({ onSelect }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', pin: randomPin(), dob: '', skin_type: '', allergies: '' });
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  async function search(q) {
    setQuery(q);
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      setResults(await apiFetch(`/patients?q=${encodeURIComponent(q)}`));
    } catch (err) {
      setError(err.message);
    } finally {
      setSearching(false);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    setCreating(true);
    try {
      const patient = await apiFetch('/patients', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          allergies: form.allergies ? form.allergies.split(',').map((a) => a.trim()).filter(Boolean) : [],
        }),
      });
      onSelect(patient.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  if (showNewForm) {
    return (
      <div className="card">
        <div className="page-header">
          <p className="field-label">New patient</p>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowNewForm(false)}>
            Search instead
          </button>
        </div>
        <form onSubmit={handleCreate}>
          <div className="form-field">
            <label className="field-label" htmlFor="np-name">Name</label>
            <input id="np-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="form-field">
            <label className="field-label" htmlFor="np-phone">Phone</label>
            <input id="np-phone" className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
          </div>
          <div className="form-field">
            <label className="field-label" htmlFor="np-pin">Portal PIN (for patient login)</label>
            <input id="np-pin" className="input" value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} required />
          </div>
          <div className="form-field">
            <label className="field-label" htmlFor="np-dob">Date of birth</label>
            <input id="np-dob" className="input" type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} />
          </div>
          <div className="form-field">
            <label className="field-label" htmlFor="np-skin">Skin type</label>
            <select id="np-skin" className="input" value={form.skin_type} onChange={(e) => setForm({ ...form, skin_type: e.target.value })}>
              <option value="">Not set</option>
              {SKIN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="form-field">
            <label className="field-label" htmlFor="np-allergies">Allergies (comma-separated)</label>
            <input id="np-allergies" className="input" value={form.allergies} onChange={(e) => setForm({ ...form, allergies: e.target.value })} placeholder="e.g. penicillin, latex" />
          </div>
          {error && <p className="alert alert-error">{error}</p>}
          <button type="submit" className="btn btn-primary btn-block" disabled={creating}>
            Create patient &amp; start visit
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="card">
      <p className="field-label">Find patient</p>
      <input
        className="input"
        placeholder="Search by name or phone"
        value={query}
        onChange={(e) => search(e.target.value)}
        autoFocus
      />
      {error && <p className="alert alert-error">{error}</p>}
      {searching && <p className="muted">Searching…</p>}

      <div className="patient-picker__results">
        {results.map((p) => (
          <button key={p.id} type="button" className="patient-picker__result" onClick={() => onSelect(p.id)}>
            <span>{p.name} <span className="muted">— {p.phone}</span></span>
            <span className={`badge badge-${p.loyalty_tier}`}>{p.loyalty_tier}</span>
          </button>
        ))}
        {query.trim() && !searching && results.length === 0 && (
          <p className="muted">No matching patients.</p>
        )}
      </div>

      <button type="button" className="btn btn-secondary btn-block mt-3" onClick={() => setShowNewForm(true)}>
        + New patient
      </button>
    </div>
  );
}
