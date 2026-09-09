import { useEffect, useState } from 'react';
import { apiFetch } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';

const EMPTY_FORM = { key: '', label: '', unit: '', ref_low: '', ref_high: '', aliases: '', specimen: '', description: '' };
const EMPTY_CLASSIFICATION = { category: '', routine_status: '', nutrient_key: '', reference_range_type: '', requires_clinical_context: false, is_active: true };
const ROUTINE_STATUSES = ['ROUTINE', 'SELECTIVE', 'SPECIALIZED', 'NOT_ROUTINE_SCREENING'];
const REF_RANGE_TYPES = ['LAB_PROVIDED', 'STANDARD_REFERENCE', 'CLINICAL_INTERPRETATION', 'NOT_ESTABLISHED'];

export default function LabTestTypeManager() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [testTypes, setTestTypes] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [classification, setClassification] = useState(EMPTY_CLASSIFICATION);
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
      specimen: t.specimen || '',
      description: t.description || '',
    });
    setClassification({
      category: t.category || '',
      routine_status: t.routine_status || '',
      nutrient_key: t.nutrient_key || '',
      reference_range_type: t.reference_range_type || '',
      requires_clinical_context: !!t.requires_clinical_context,
      is_active: t.is_active !== false,
    });
    setError('');
    setSuccess('');
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setClassification(EMPTY_CLASSIFICATION);
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

  async function handleClassificationSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      await apiFetch(`/lab-test-types/${editingId}/classification`, { method: 'PATCH', body: JSON.stringify(classification) });
      setSuccess('Classification updated.');
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
          <label className="field-label" htmlFor="t-specimen">Specimen</label>
          <input id="t-specimen" className="input" value={form.specimen} onChange={(e) => setForm({ ...form, specimen: e.target.value })} placeholder="e.g. serum, plasma, whole_blood" />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="t-description">Description</label>
          <input id="t-description" className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
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

      {editingId && isAdmin && (
        <form onSubmit={handleClassificationSubmit} className="card mb-5">
          <p className="field-label">Clinical classification (admin only -- affects how the rule engine treats this test)</p>
          <div className="form-field">
            <label className="field-label" htmlFor="c-category">Category</label>
            <input id="c-category" className="input" value={classification.category} onChange={(e) => setClassification({ ...classification, category: e.target.value })} placeholder="e.g. VITAMINS, MINERALS, IRON_STATUS" />
          </div>
          <div className="form-field">
            <label className="field-label" htmlFor="c-routine">Routine status</label>
            <select id="c-routine" className="input" value={classification.routine_status} onChange={(e) => setClassification({ ...classification, routine_status: e.target.value })}>
              <option value="">— select —</option>
              {ROUTINE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="form-field">
            <label className="field-label" htmlFor="c-reftype">Reference range type</label>
            <select id="c-reftype" className="input" value={classification.reference_range_type} onChange={(e) => setClassification({ ...classification, reference_range_type: e.target.value })}>
              <option value="">— select —</option>
              {REF_RANGE_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="form-field">
            <label className="field-label" htmlFor="c-nutrient">Nutrient key</label>
            <input id="c-nutrient" className="input" value={classification.nutrient_key} onChange={(e) => setClassification({ ...classification, nutrient_key: e.target.value })} placeholder="e.g. vitamin_d" />
          </div>
          <label className="field-label">
            <input type="checkbox" checked={classification.requires_clinical_context} onChange={(e) => setClassification({ ...classification, requires_clinical_context: e.target.checked })} /> Requires patient sex/age/pregnancy context
          </label>
          <label className="field-label">
            <input type="checkbox" checked={classification.is_active} onChange={(e) => setClassification({ ...classification, is_active: e.target.checked })} /> Active in catalog
          </label>
          <div className="row-actions">
            <button type="submit" className="btn btn-primary">Save classification</button>
          </div>
        </form>
      )}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Unit</th>
              <th>Range</th>
              <th>Category</th>
              <th>Routine status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {testTypes.map((t) => (
              <tr key={t.id}>
                <td>{t.label}</td>
                <td>{t.unit}</td>
                <td>{t.ref_low != null && t.ref_high != null ? `${t.ref_low}–${t.ref_high}` : '—'}</td>
                <td>{t.category || '—'}</td>
                <td>{t.routine_status || '—'}</td>
                <td>
                  <button className="btn btn-sm btn-secondary" onClick={() => startEdit(t)}>Edit</button>
                </td>
              </tr>
            ))}
            {testTypes.length === 0 && (
              <tr><td colSpan={6} className="muted">No test types yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
