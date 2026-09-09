import { useEffect, useState } from 'react';
import { apiFetch } from '../../api/client';

const EMPTY_FORM = { key: '', label: '', unit: '', ref_low: '', ref_high: '', aliases: '' };

export default function LabTestTypeManager() {
  const [testTypes, setTestTypes] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function load() {
    try {
      setTestTypes(await apiFetch('/lab-test-types'));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function startEdit(t) {
    setEditingId(t.id);
    setForm({
      key: t.key,
      label: t.label,
      unit: t.unit,
      ref_low: t.ref_low ?? '',
      ref_high: t.ref_high ?? '',
      aliases: (t.aliases || []).join(', '),
    });
    setError('');
    setSuccess('');
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      if (editingId) {
        await apiFetch(`/lab-test-types/${editingId}`, { method: 'PATCH', body: JSON.stringify(form) });
        setSuccess('Test type updated.');
      } else {
        await apiFetch('/lab-test-types', { method: 'POST', body: JSON.stringify(form) });
        setSuccess('Test type added.');
      }
      setForm(EMPTY_FORM);
      setEditingId(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Lab tests</h2>
      </div>
      <p className="muted">
        The markers scanning/manual entry can recognize on a lab result -- shows up as the dropdown when entering
        results manually, and as what OCR looks for on a scanned photo.
      </p>

      <form onSubmit={handleSubmit} className="card mb-5">
        <p className="field-label">{editingId ? 'Edit test type' : 'Add a test type'}</p>
        <div className="form-field">
          <label className="field-label" htmlFor="t-label">Name</label>
          <input
            id="t-label"
            className="input"
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            placeholder="e.g. Vitamin D (25-OH)"
            required
          />
        </div>
        {!editingId && (
          <div className="form-field">
            <label className="field-label" htmlFor="t-key">Key</label>
            <input
              id="t-key"
              className="input"
              value={form.key}
              onChange={(e) => setForm({ ...form, key: e.target.value })}
              placeholder="e.g. vitamin_d -- lowercase, no spaces"
              required
            />
          </div>
        )}
        <div className="form-field">
          <label className="field-label" htmlFor="t-unit">Unit</label>
          <input
            id="t-unit"
            className="input"
            value={form.unit}
            onChange={(e) => setForm({ ...form, unit: e.target.value })}
            placeholder="e.g. ng/mL"
            required
          />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="t-low">Reference range low</label>
          <input id="t-low" className="input" type="number" step="0.01" value={form.ref_low} onChange={(e) => setForm({ ...form, ref_low: e.target.value })} />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="t-high">Reference range high</label>
          <input id="t-high" className="input" type="number" step="0.01" value={form.ref_high} onChange={(e) => setForm({ ...form, ref_high: e.target.value })} />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="t-aliases">Alternate names OCR should match (comma-separated)</label>
          <input
            id="t-aliases"
            className="input"
            value={form.aliases}
            onChange={(e) => setForm({ ...form, aliases: e.target.value })}
            placeholder="e.g. vit d, vitamin d3, 25(oh)d"
          />
        </div>

        {error && <p className="alert alert-error">{error}</p>}
        {success && <p className="alert alert-success">{success}</p>}

        <div className="row-actions">
          <button type="submit" className="btn btn-primary">{editingId ? 'Save changes' : 'Add test type'}</button>
          {editingId && (
            <button type="button" className="btn btn-ghost" onClick={cancelEdit}>Cancel</button>
          )}
        </div>
      </form>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Unit</th>
              <th>Range</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {testTypes.map((t) => (
              <tr key={t.id}>
                <td>{t.label}</td>
                <td>{t.unit}</td>
                <td>{t.ref_low != null && t.ref_high != null ? `${t.ref_low}–${t.ref_high}` : '—'}</td>
                <td>
                  <button className="btn btn-sm btn-secondary" onClick={() => startEdit(t)}>Edit</button>
                </td>
              </tr>
            ))}
            {testTypes.length === 0 && (
              <tr><td colSpan={4} className="muted">No test types yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
