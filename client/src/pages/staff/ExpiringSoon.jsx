import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../api/client';

const TABS = [
  { key: 'batches', label: 'Expiring batches' },
  { key: 'rules', label: 'Discount rules' },
];

const WINDOW_OPTIONS = [
  { value: '30', label: 'Within 30 days' },
  { value: '60', label: 'Within 60 days' },
  { value: '90', label: 'Within 90 days' },
  { value: '', label: 'All batches' },
];

const BATCH_STATUSES = ['active', 'expired', 'discontinued'];

const EMPTY_BATCH_FORM = { product_id: '', batch_number: '', quantity: '', expiration_date: '', cost: '' };

function Batches({ products }) {
  const [windowDays, setWindowDays] = useState('30');
  const [batches, setBatches] = useState([]);
  const [form, setForm] = useState(EMPTY_BATCH_FORM);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function load() {
    const query = windowDays ? `?within_days=${windowDays}` : '';
    apiFetch(`/batches${query}`).then(setBatches).catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
  }, [windowDays]);

  async function addBatch(e) {
    e.preventDefault();
    if (!form.product_id || !form.expiration_date) return;
    setSaving(true);
    setError('');
    try {
      await apiFetch('/batches', {
        method: 'POST',
        body: JSON.stringify({ ...form, product_id: Number(form.product_id) }),
      });
      setForm(EMPTY_BATCH_FORM);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(batch, status) {
    try {
      await apiFetch(`/batches/${batch.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <form onSubmit={addBatch} className="card mb-4">
        <p className="field-label">Add a batch</p>
        <div className="form-field">
          <label className="field-label" htmlFor="b-product">Product</label>
          <select id="b-product" className="input" value={form.product_id} onChange={(e) => setForm({ ...form, product_id: e.target.value })} required>
            <option value="">Select a product…</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ''}</option>)}
          </select>
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="b-number">Batch number</label>
          <input id="b-number" className="input" value={form.batch_number} onChange={(e) => setForm({ ...form, batch_number: e.target.value })} />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="b-quantity">Quantity</label>
          <input id="b-quantity" className="input" type="number" min="0" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="b-expiration">Expiration date</label>
          <input id="b-expiration" className="input" type="date" value={form.expiration_date} onChange={(e) => setForm({ ...form, expiration_date: e.target.value })} required />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="b-cost">Cost (optional)</label>
          <input id="b-cost" className="input" type="number" step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
        </div>
        {error && <p className="alert alert-error">{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={saving}>Add batch</button>
      </form>

      <div className="tab-group mb-3">
        {WINDOW_OPTIONS.map((o) => (
          <button key={o.value} type="button" className={`tab-btn ${windowDays === o.value ? 'active' : ''}`} onClick={() => setWindowDays(o.value)}>
            {o.label}
          </button>
        ))}
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th>Product</th><th>Batch #</th><th>Qty</th><th>Expires</th><th>Days left</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.id}>
                <td>{b.product_name}</td>
                <td>{b.batch_number || '—'}</td>
                <td>{b.quantity}</td>
                <td>{new Date(b.expiration_date).toLocaleDateString()}</td>
                <td>{b.days_until_expiration != null ? (b.days_until_expiration < 0 ? `Expired ${Math.abs(b.days_until_expiration)}d ago` : `${b.days_until_expiration}d`) : '—'}</td>
                <td><span className={`badge badge-status-${b.status === 'active' ? 'started' : b.status === 'expired' ? 'not_available' : 'cancelled'}`}>{b.status}</span></td>
                <td>
                  {b.status === 'active' && (
                    <div className="row-actions">
                      <button className="btn btn-sm btn-ghost" onClick={() => setStatus(b, 'expired')}>Mark expired</button>
                      <button className="btn btn-sm btn-ghost" onClick={() => setStatus(b, 'discontinued')}>Discontinue</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {batches.length === 0 && <tr><td colSpan={7} className="muted">No batches in this window.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const EMPTY_RULE_FORM = { name: '', days_remaining_max: '', discount_percent: '', eligible_categories: '', eligible_brands: '', active: true };

function DiscountRules() {
  const [rules, setRules] = useState([]);
  const [form, setForm] = useState(EMPTY_RULE_FORM);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function load() {
    apiFetch('/expiration-discount-rules').then(setRules).catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
  }, []);

  function startEdit(r) {
    setEditingId(r.id);
    setForm({
      name: r.name,
      days_remaining_max: r.days_remaining_max,
      discount_percent: r.discount_percent,
      eligible_categories: (r.eligible_categories || []).join(', '),
      eligible_brands: (r.eligible_brands || []).join(', '),
      active: r.active,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_RULE_FORM);
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editingId) {
        await apiFetch(`/expiration-discount-rules/${editingId}`, { method: 'PATCH', body: JSON.stringify(form) });
      } else {
        await apiFetch('/expiration-discount-rules', { method: 'POST', body: JSON.stringify(form) });
      }
      cancelEdit();
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    try {
      await apiFetch(`/expiration-discount-rules/${id}`, { method: 'DELETE' });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleActive(rule) {
    try {
      await apiFetch(`/expiration-discount-rules/${rule.id}`, { method: 'PATCH', body: JSON.stringify({ active: !rule.active }) });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <p className="muted">
        Automatic discounts based on how close a product's nearest batch is to expiring. A product only discounts
        when an active rule matches it -- no rule means no automatic discount. When more than one tier qualifies,
        the highest discount applies.
      </p>

      <form onSubmit={save} className="card mb-4">
        <p className="field-label">{editingId ? 'Edit rule' : 'Add a discount rule'}</p>
        <div className="form-field">
          <label className="field-label" htmlFor="r-name">Name</label>
          <input id="r-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. 30-day clearance" required />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="r-days">Applies within (days of expiration)</label>
          <input id="r-days" className="input" type="number" min="0" value={form.days_remaining_max} onChange={(e) => setForm({ ...form, days_remaining_max: e.target.value })} required />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="r-percent">Discount percent</label>
          <input id="r-percent" className="input" type="number" min="0" max="100" value={form.discount_percent} onChange={(e) => setForm({ ...form, discount_percent: e.target.value })} required />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="r-categories">Eligible categories (comma-separated, blank = all)</label>
          <input id="r-categories" className="input" value={form.eligible_categories} onChange={(e) => setForm({ ...form, eligible_categories: e.target.value })} />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="r-brands">Eligible brands (comma-separated, blank = all)</label>
          <input id="r-brands" className="input" value={form.eligible_brands} onChange={(e) => setForm({ ...form, eligible_brands: e.target.value })} />
        </div>
        <label className="field-label">
          <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Active
        </label>
        {error && <p className="alert alert-error">{error}</p>}
        <div className="row-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>{editingId ? 'Save changes' : 'Add rule'}</button>
          {editingId && <button type="button" className="btn btn-ghost" onClick={cancelEdit}>Cancel</button>}
        </div>
      </form>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th>Name</th><th>Window</th><th>Discount</th><th>Categories</th><th>Brands</th><th>Active</th><th></th></tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>≤ {r.days_remaining_max}d</td>
                <td>{r.discount_percent}%</td>
                <td>{(r.eligible_categories || []).join(', ') || 'All'}</td>
                <td>{(r.eligible_brands || []).join(', ') || 'All'}</td>
                <td><button className="btn btn-sm btn-ghost" onClick={() => toggleActive(r)}>{r.active ? 'Yes' : 'No'}</button></td>
                <td>
                  <div className="row-actions">
                    <button className="btn btn-sm btn-secondary" onClick={() => startEdit(r)}>Edit</button>
                    <button className="btn btn-sm btn-ghost" onClick={() => remove(r.id)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
            {rules.length === 0 && <tr><td colSpan={7} className="muted">No discount rules yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ExpiringSoon() {
  const [tab, setTab] = useState('batches');
  const [products, setProducts] = useState([]);

  useEffect(() => {
    apiFetch('/products').then(setProducts).catch(() => {});
  }, []);

  const sortedProducts = useMemo(() => [...products].sort((a, b) => a.name.localeCompare(b.name)), [products]);

  return (
    <div>
      <div className="page-header">
        <h2>Expiring soon</h2>
      </div>
      <p className="muted">Track batch expiration dates and configure automatic clearance discounts as stock nears expiry.</p>

      <div className="tab-group mb-3">
        {TABS.map((t) => (
          <button key={t.key} type="button" className={`tab-btn ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'batches' && <Batches products={sortedProducts} />}
      {tab === 'rules' && <DiscountRules />}
    </div>
  );
}
