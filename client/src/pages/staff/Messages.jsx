import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../api/client';

const CATEGORY_LABELS = {
  question: 'Question', product_issue: 'Product issue', routine_question: 'Routine question',
  follow_up_request: 'Follow-up request', general: 'General',
};

// Staff "Ask my pharmacist" inbox -- one row per patient conversation,
// most recently active first, with a simple thread view alongside.
export default function Messages() {
  const [inbox, setInbox] = useState([]);
  const [selected, setSelected] = useState(null);
  const [thread, setThread] = useState(null);
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  function loadInbox() {
    apiFetch('/messages').then(setInbox).catch((err) => setError(err.message));
  }

  useEffect(() => {
    loadInbox();
  }, []);

  function openThread(patientId) {
    setSelected(patientId);
    setThread(null);
    apiFetch(`/messages/${patientId}`).then((rows) => {
      setThread(rows);
      loadInbox();
    }).catch((err) => setError(err.message));
  }

  async function send(e) {
    e.preventDefault();
    const text = body.trim();
    if (!text || !selected) return;
    setSending(true);
    try {
      await apiFetch('/messages', { method: 'POST', body: JSON.stringify({ patient_id: selected, body: text }) });
      setBody('');
      openThread(selected);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  const selectedRow = inbox.find((r) => r.patient_id === selected);

  return (
    <div>
      <div className="page-header">
        <h2>Messages</h2>
      </div>
      <p className="muted">Patient conversations from "Ask my pharmacist" in the patient app.</p>
      {error && <p className="alert alert-error">{error}</p>}

      <div className="staff-inbox">
        <div className="staff-inbox__list">
          {inbox.length === 0 && <p className="muted">No conversations yet.</p>}
          {inbox.map((r) => (
            <button
              key={r.patient_id}
              type="button"
              className={`staff-inbox__row ${selected === r.patient_id ? 'active' : ''}`}
              onClick={() => openThread(r.patient_id)}
            >
              <div className="staff-inbox__row-top">
                <span>{r.patient_name}</span>
                {r.unread_count > 0 && <span className="badge badge-status-due_today">{r.unread_count}</span>}
              </div>
              <div className="staff-inbox__preview">{r.last_sender === 'staff' ? 'You: ' : ''}{r.last_message}</div>
            </button>
          ))}
        </div>

        <div className="staff-inbox__thread">
          {!selected && <p className="muted">Select a conversation to view it.</p>}
          {selected && (
            <>
              <div className="page-header">
                <h3><Link to={`/staff/patients/${selected}`}>{selectedRow?.patient_name}</Link></h3>
                <a href={`https://wa.me/${(selectedRow?.patient_phone || '').replace(/[^\d]/g, '')}`} target="_blank" rel="noreferrer" className="btn btn-sm btn-secondary">
                  WhatsApp
                </a>
              </div>
              <div className="p-chat" style={{ flex: 1, overflowY: 'auto' }}>
                {thread == null && <p className="muted">Loading…</p>}
                {thread?.map((m) => (
                  <div key={m.id} className={`p-chat__bubble p-chat__bubble--${m.sender === 'staff' ? 'patient' : 'staff'}`}>
                    <div>{m.body}</div>
                    <div className="p-chat__meta">
                      {m.sender === 'staff' ? 'You' : selectedRow?.patient_name}
                      {m.category && m.category !== 'general' ? ` · ${CATEGORY_LABELS[m.category] || m.category}` : ''}
                      {' · '}{new Date(m.created_at).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
              <form className="p-chat__composer" onSubmit={send}>
                <input
                  placeholder="Reply…"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  disabled={sending}
                />
                <button type="submit" className="btn btn-primary" disabled={sending || !body.trim()}>Send</button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
