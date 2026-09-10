import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { apiFetch } from '../../api/client';

const CATEGORIES = [
  { value: 'question', label: 'A question' },
  { value: 'product_issue', label: 'Product issue' },
  { value: 'routine_question', label: 'About my routine' },
  { value: 'follow_up_request', label: 'Follow-up request' },
  { value: 'general', label: 'Something else' },
];

// "Ask my pharmacist" -- a single, simple conversation thread. No internal
// pharmacist notes ever appear here; the backend only ever returns messages
// meant for the patient.
export default function Messages() {
  const { user } = useAuth();
  const [thread, setThread] = useState(null);
  const [error, setError] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('question');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  function load() {
    apiFetch(`/messages/${user.id}`).then(setThread).catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
  }, [user.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [thread]);

  async function send(e) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setSending(true);
    setError('');
    try {
      await apiFetch('/messages', { method: 'POST', body: JSON.stringify({ body: text, category }) });
      setBody('');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <p className="p-greeting">Ask my pharmacist</p>
      <p className="muted">Send a question, a concern about a product, or ask for a follow-up -- your pharmacist will get back to you here.</p>
      {error && <p className="alert alert-error">{error}</p>}

      <div className="p-chat">
        {thread == null && <p className="muted">Loading…</p>}
        {thread?.length === 0 && (
          <div className="p-card p-empty">
            <p>No messages yet. Say hello below!</p>
          </div>
        )}
        {thread?.map((m) => (
          <div key={m.id} className={`p-chat__bubble p-chat__bubble--${m.sender}`}>
            <div>{m.body}</div>
            <div className="p-chat__meta">{new Date(m.created_at).toLocaleString()}</div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form className="p-chat__composer" onSubmit={send}>
        <select className="input input-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        <input
          placeholder="Type a message…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={sending}
        />
        <button type="submit" className="p-cta" disabled={sending || !body.trim()}>Send</button>
      </form>
    </div>
  );
}
