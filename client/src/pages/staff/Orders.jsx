import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../api/client';
import { enablePushNotifications, pushSupported } from '../../lib/push';

const STATUS_LABELS = { pending: 'Pending', confirmed: 'Confirmed', fulfilled: 'Fulfilled', cancelled: 'Cancelled' };
const STATUS_ACTIONS = { pending: 'confirmed', confirmed: 'fulfilled' };

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [error, setError] = useState('');
  const [pushMsg, setPushMsg] = useState('');

  async function load() {
    try {
      const query = statusFilter ? `?status=${statusFilter}` : '';
      setOrders(await apiFetch(`/orders${query}`));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 20000);
    return () => clearInterval(interval);
  }, [statusFilter]);

  async function updateStatus(id, status) {
    try {
      await apiFetch(`/orders/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleEnablePush() {
    setPushMsg('');
    try {
      const { publicKey } = await apiFetch('/orders/push/vapid-public-key');
      if (!publicKey) {
        setPushMsg('Push notifications are not configured on the server yet.');
        return;
      }
      await enablePushNotifications(publicKey);
      setPushMsg('Push notifications enabled on this device.');
    } catch (err) {
      setPushMsg(err.message);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Orders</h2>
        {pushSupported() && (
          <button className="btn btn-secondary btn-sm" onClick={handleEnablePush}>
            Enable push notifications
          </button>
        )}
      </div>
      {pushMsg && <p className="muted">{pushMsg}</p>}
      {error && <p className="alert alert-error">{error}</p>}

      <div className="tab-group mb-3">
        {['', 'pending', 'confirmed', 'fulfilled', 'cancelled'].map((s) => (
          <button key={s} type="button" className={`tab-btn ${statusFilter === s ? 'active' : ''}`} onClick={() => setStatusFilter(s)}>
            {s ? STATUS_LABELS[s] : 'All'}
          </button>
        ))}
      </div>

      {orders.length === 0 && <p className="muted">No orders.</p>}
      {orders.map((o) => (
        <div key={o.id} className="visit-card">
          <div className="visit-card__row">
            <b><Link to={`/staff/patients/${o.patient_id}`}>{o.patient_name}</Link></b>
            {' '}· {o.patient_phone} · {new Date(o.order_date).toLocaleString()}
            {' '}<span className={`badge badge-status-${o.status}`}>{STATUS_LABELS[o.status] || o.status}</span>
          </div>
          <ul className="followup-list">
            {o.items.map((item) => (
              <li key={item.id}>{item.quantity}x {item.product_name} — ${item.unit_price}</li>
            ))}
          </ul>
          <div className="muted">Total: ${o.total} · Pay in store (cash on pickup)</div>
          {o.notes && <div className="muted">Note: {o.notes}</div>}
          <div className="row-actions mt-2">
            {STATUS_ACTIONS[o.status] && (
              <button className="btn btn-sm btn-primary" onClick={() => updateStatus(o.id, STATUS_ACTIONS[o.status])}>
                Mark {STATUS_LABELS[STATUS_ACTIONS[o.status]]}
              </button>
            )}
            {o.status !== 'fulfilled' && o.status !== 'cancelled' && (
              <button className="btn btn-sm btn-ghost" onClick={() => updateStatus(o.id, 'cancelled')}>
                Cancel
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
