import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../api/client';

const STATUS_LABELS = {
  overdue: 'Overdue',
  due_today: 'Due today',
  this_week: 'This week',
  upcoming: 'Upcoming',
  escalated: 'Escalated',
};

// Bucket order + which dashboard_status values fall into each, per the
// spec's exact 4 buckets. 'escalated'/'closed' rows (status != pending)
// still show up wherever their own dashboard_status lands (overdue etc.).
const BUCKETS = [
  { key: 'overdue', label: 'Overdue' },
  { key: 'due_today', label: 'Today' },
  { key: 'this_week', label: 'This week' },
  { key: 'upcoming', label: 'Upcoming' },
];

function waLink(phone, patientName) {
  const digits = phone.replace(/[^\d]/g, '');
  const message = `Hi ${patientName}, checking in on how you're doing since your last visit at Al Chark.`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export default function FollowupDashboard() {
  const [followups, setFollowups] = useState([]);
  const [error, setError] = useState('');

  async function load() {
    try {
      setFollowups(await apiFetch('/followups'));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function logResponse(id, response) {
    try {
      await apiFetch(`/followups/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ response, status: response === 'worse' ? 'escalated' : 'closed' }),
      });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  const grouped = useMemo(() => {
    const map = { overdue: [], due_today: [], this_week: [], upcoming: [] };
    for (const f of followups) {
      (map[f.dashboard_status] || map.upcoming).push(f);
    }
    return map;
  }, [followups]);

  return (
    <div>
      <div className="page-header">
        <h2>Follow-up dashboard</h2>
      </div>
      {error && <p className="alert alert-error">{error}</p>}

      {followups.length === 0 && <p className="muted">No follow-ups due.</p>}

      {BUCKETS.map((bucket) => (
        grouped[bucket.key].length > 0 && (
          <div key={bucket.key} className="mb-4">
            <p className="p-subsection-title">{bucket.label.toUpperCase()} ({grouped[bucket.key].length})</p>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>Scheduled</th>
                    <th>Reason</th>
                    <th>Assigned</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped[bucket.key].map((f) => (
                    <tr key={f.id}>
                      <td>
                        <Link to={`/staff/patients/${f.patient_id}`}>{f.patient_name}</Link>
                      </td>
                      <td>{new Date(f.scheduled_date).toLocaleDateString()}</td>
                      <td>{f.reason || '—'}</td>
                      <td>{f.assigned_staff_name || '—'}</td>
                      <td>
                        <span className={`badge badge-status-${f.dashboard_status}`}>
                          {STATUS_LABELS[f.dashboard_status] || f.dashboard_status}
                        </span>
                      </td>
                      <td>
                        <div className="row-actions">
                          <a
                            className="btn btn-sm btn-secondary"
                            href={waLink(f.patient_phone, f.patient_name)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            WhatsApp
                          </a>
                          <button className="btn btn-sm btn-ghost" onClick={() => logResponse(f.id, 'better')}>
                            Better
                          </button>
                          <button className="btn btn-sm btn-ghost" onClick={() => logResponse(f.id, 'same')}>
                            Same
                          </button>
                          <button className="btn btn-sm btn-ghost" onClick={() => logResponse(f.id, 'worse')}>
                            Worse
                          </button>
                          <button className="btn btn-sm btn-ghost" onClick={() => logResponse(f.id, 'no_response')}>
                            No response
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      ))}
    </div>
  );
}
