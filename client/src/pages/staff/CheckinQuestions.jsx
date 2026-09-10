import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../api/client';

const TABS = [
  { key: 'alerts', label: 'Problem alerts' },
  { key: 'questions', label: 'Question manager' },
];

const EMPTY_FORM = { text: '', day_offset: 1, target_scope: 'all', target_product_id: '', target_category: '', response_type: 'mood' };

function ProblemAlerts() {
  const [checkins, setCheckins] = useState([]);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState('');

  function load() {
    apiFetch(`/checkins?unacknowledged=${!showAll}`).then(setCheckins).catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
  }, [showAll]);

  async function acknowledge(id) {
    try {
      await apiFetch(`/checkins/${id}/acknowledge`, { method: 'PATCH' });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div className="row-actions mb-3">
        <button className={`tab-btn ${!showAll ? 'active' : ''}`} onClick={() => setShowAll(false)}>Unacknowledged</button>
        <button className={`tab-btn ${showAll ? 'active' : ''}`} onClick={() => setShowAll(true)}>All problem reports</button>
      </div>
      {error && <p className="alert alert-error">{error}</p>}
      {checkins.length === 0 && <p className="muted">Nothing to review.</p>}
      {checkins.map((c) => (
        <div key={c.id} className="visit-card">
          <div className="visit-card__row">
            <b><Link to={`/staff/patients/${c.patient_id}`}>{c.patient_name}</Link></b>
            {' '}· {c.patient_phone} · {new Date(c.created_at).toLocaleString()}
            {c.staff_acknowledged && <span className="badge badge-status-completed"> Acknowledged</span>}
          </div>
          {c.question_text && <p className="muted">{c.question_text}</p>}
          <p><b>Response:</b> {c.response_label || c.response_value}</p>
          {c.notes && <p className="muted">Notes: {c.notes}</p>}
          {!c.staff_acknowledged && (
            <div className="row-actions mt-2">
              <button className="btn btn-sm btn-primary" onClick={() => acknowledge(c.id)}>Acknowledge</button>
              <Link className="btn btn-sm btn-secondary" to={`/staff/patients/${c.patient_id}`}>View patient</Link>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function QuestionManager() {
  const [questions, setQuestions] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function load() {
    apiFetch('/checkins/questions/all').then(setQuestions).catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
  }, []);

  async function create(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiFetch('/checkins/questions', {
        method: 'POST',
        body: JSON.stringify({
          text: form.text,
          day_offset: Number(form.day_offset),
          target_scope: form.target_scope,
          target_product_id: form.target_scope === 'product' && form.target_product_id ? Number(form.target_product_id) : null,
          target_category: form.target_scope === 'category' ? form.target_category : null,
          response_type: form.response_type,
        }),
      });
      setForm(EMPTY_FORM);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(q) {
    try {
      await apiFetch(`/checkins/questions/${q.id}`, { method: 'PATCH', body: JSON.stringify({ active: !q.active }) });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div className="card mb-4">
        <p className="field-label">Add a check-in question</p>
        <p className="muted">Configurable per the rules staff set -- targeted by product or category, and how many days after starting.</p>
        <form onSubmit={create}>
          <div className="form-field">
            <label className="field-label" htmlFor="q-text">Question text</label>
            <input id="q-text" className="input" required value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} />
          </div>
          <div className="form-field">
            <label className="field-label" htmlFor="q-day">Day since started</label>
            <input id="q-day" type="number" min="0" className="input" required value={form.day_offset} onChange={(e) => setForm({ ...form, day_offset: e.target.value })} />
          </div>
          <div className="form-field">
            <label className="field-label" htmlFor="q-scope">Target</label>
            <select id="q-scope" className="input" value={form.target_scope} onChange={(e) => setForm({ ...form, target_scope: e.target.value })}>
              <option value="all">All active routine items</option>
              <option value="product">Specific product (by ID)</option>
              <option value="category">Category</option>
            </select>
          </div>
          {form.target_scope === 'product' && (
            <div className="form-field">
              <label className="field-label" htmlFor="q-product">Product ID</label>
              <input id="q-product" className="input" value={form.target_product_id} onChange={(e) => setForm({ ...form, target_product_id: e.target.value })} />
            </div>
          )}
          {form.target_scope === 'category' && (
            <div className="form-field">
              <label className="field-label" htmlFor="q-category">Category</label>
              <input id="q-category" className="input" value={form.target_category} onChange={(e) => setForm({ ...form, target_category: e.target.value })} />
            </div>
          )}
          <div className="form-field">
            <label className="field-label" htmlFor="q-type">Response type</label>
            <select id="q-type" className="input" value={form.response_type} onChange={(e) => setForm({ ...form, response_type: e.target.value })}>
              <option value="mood">Mood (good / okay / having difficulty)</option>
              <option value="yes_no">Yes / no</option>
            </select>
          </div>
          {error && <p className="alert alert-error">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={saving}>Add question</button>
        </form>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Day</th><th>Question</th><th>Target</th><th>Type</th><th>Active</th><th></th>
            </tr>
          </thead>
          <tbody>
            {questions.map((q) => (
              <tr key={q.id}>
                <td>{q.day_offset}</td>
                <td>{q.text}</td>
                <td>{q.target_scope === 'all' ? 'All' : q.target_scope === 'product' ? `Product #${q.target_product_id}` : q.target_category}</td>
                <td>{q.response_type}</td>
                <td>{q.active ? 'Yes' : 'No'}</td>
                <td>
                  <button className="btn btn-sm btn-ghost" onClick={() => toggleActive(q)}>
                    {q.active ? 'Disable' : 'Enable'}
                  </button>
                </td>
              </tr>
            ))}
            {questions.length === 0 && (
              <tr><td colSpan={6} className="muted">No questions yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function CheckinQuestions() {
  const [tab, setTab] = useState('alerts');

  return (
    <div>
      <div className="page-header">
        <h2>Check-ins</h2>
      </div>
      <div className="tab-group mb-3">
        {TABS.map((t) => (
          <button key={t.key} type="button" className={`tab-btn ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'alerts' ? <ProblemAlerts /> : <QuestionManager />}
    </div>
  );
}
