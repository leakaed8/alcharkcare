import { useEffect, useState } from 'react';
import { apiFetch } from '../api/client';

const STATUS_LABELS = { active: 'Active', completed: 'Completed', paused: 'Paused', cancelled: 'Cancelled' };

// Shows a patient's care plans, each with the visits logged under it.
// Staff (canManage) can start a new plan and adjust an existing one's
// status -- that status change is how a plan gets "revised" over time.
export default function CarePlanList({ patientId, canManage, onPlansLoaded }) {
  const [plans, setPlans] = useState(null);
  const [error, setError] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ title: '', goal: '', target_end_date: '' });
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const data = await apiFetch(`/care-plans/${patientId}`);
      setPlans(data);
      if (onPlansLoaded) onPlansLoaded(data);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, [patientId]);

  async function handleCreate(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiFetch('/care-plans', {
        method: 'POST',
        body: JSON.stringify({ patient_id: patientId, ...form }),
      });
      setForm({ title: '', goal: '', target_end_date: '' });
      setShowNew(false);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(id, status) {
    try {
      await apiFetch(`/care-plans/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!plans) return <p className="muted">Loading…</p>;

  return (
    <div>
      {error && <p className="alert alert-error">{error}</p>}

      {plans.length === 0 && <p className="muted">No care plans yet.</p>}
      {plans.map((plan) => (
        <div key={plan.id} className="care-plan-card">
          <div className="care-plan-card__head">
            <strong>{plan.title}</strong>
            <span className={`badge badge-plan-${plan.status}`}>{STATUS_LABELS[plan.status] || plan.status}</span>
          </div>
          {plan.goal && <p className="care-plan-card__goal">{plan.goal}</p>}
          <p className="muted">
            Started {new Date(plan.start_date).toLocaleDateString()}
            {plan.target_end_date && ` · target ${new Date(plan.target_end_date).toLocaleDateString()}`}
            {' · '}
            {plan.visits.length} visit{plan.visits.length === 1 ? '' : 's'}
          </p>

          {canManage && plan.status !== 'completed' && plan.status !== 'cancelled' && (
            <div className="row-actions mt-3">
              {plan.status !== 'active' && (
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => updateStatus(plan.id, 'active')}>
                  Resume
                </button>
              )}
              {plan.status === 'active' && (
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => updateStatus(plan.id, 'paused')}>
                  Pause
                </button>
              )}
              <button type="button" className="btn btn-sm btn-secondary" onClick={() => updateStatus(plan.id, 'completed')}>
                Mark completed
              </button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => updateStatus(plan.id, 'cancelled')}>
                Cancel
              </button>
            </div>
          )}
        </div>
      ))}

      {canManage &&
        (showNew ? (
          <form onSubmit={handleCreate} className="card mt-3">
            <div className="form-field">
              <label className="field-label" htmlFor="cp-title">Title</label>
              <input
                id="cp-title"
                className="input"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Acne routine"
                required
              />
            </div>
            <div className="form-field">
              <label className="field-label" htmlFor="cp-goal">Goal</label>
              <textarea
                id="cp-goal"
                className="textarea"
                value={form.goal}
                onChange={(e) => setForm({ ...form, goal: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label className="field-label" htmlFor="cp-target">Target end date</label>
              <input
                id="cp-target"
                className="input"
                type="date"
                value={form.target_end_date}
                onChange={(e) => setForm({ ...form, target_end_date: e.target.value })}
              />
            </div>
            <div className="row-actions">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                Start plan
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setShowNew(false)}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button type="button" className="btn btn-secondary mt-3" onClick={() => setShowNew(true)}>
            + New care plan
          </button>
        ))}
    </div>
  );
}
