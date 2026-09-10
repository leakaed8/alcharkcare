import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../api/client';

const TYPE_LABELS = { percentage: '% off', fixed: '$ off', special_price: 'Special price', bogo: 'Buy X get Y' };

const EMPTY_FORM = {
  name: '', description: '', image_url: '', type: 'percentage', discount_value: '',
  buy_quantity: '', get_quantity: '', get_discount_percent: '100',
  start_date: '', end_date: '', eligible_categories: '', eligible_brands: '',
  excluded_product_ids: '', min_quantity: '1', visible_to_patients: true,
  send_push_notification: false, active: true, product_ids: [],
};

function formToBody(form) {
  return {
    ...form,
    discount_value: form.discount_value === '' ? null : Number(form.discount_value),
    buy_quantity: form.buy_quantity === '' ? null : Number(form.buy_quantity),
    get_quantity: form.get_quantity === '' ? null : Number(form.get_quantity),
    get_discount_percent: form.get_discount_percent === '' ? null : Number(form.get_discount_percent),
    min_quantity: form.min_quantity === '' ? 1 : Number(form.min_quantity),
    start_date: form.start_date || null,
    end_date: form.end_date || null,
  };
}

function PublishControl({ promotion, onPublished }) {
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function loadPreview() {
    setError('');
    try {
      setPreview(await apiFetch(`/promotions/${promotion.id}/publish-preview`));
    } catch (err) {
      setError(err.message);
    }
  }

  async function confirmSend() {
    setBusy(true);
    setError('');
    try {
      const updated = await apiFetch(`/promotions/${promotion.id}/publish`, { method: 'POST', body: JSON.stringify({ confirm: true }) });
      onPublished(updated);
      setPreview(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (promotion.notified_at) {
    return <span className="muted">Sent {new Date(promotion.notified_at).toLocaleString()}</span>;
  }

  return (
    <div>
      {!preview && <button className="btn btn-sm btn-secondary" onClick={loadPreview}>Preview notification</button>}
      {preview && (
        <div className="card mt-2">
          <p><b>{preview.title}</b></p>
          <p className="muted">{preview.body}</p>
          <p className="muted">Will notify {preview.recipient_count} patient(s) with notifications enabled{!preview.push_configured && ' (push not configured on the server yet)'}.</p>
          {error && <p className="alert alert-error">{error}</p>}
          <div className="row-actions">
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={confirmSend}>Confirm & send</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setPreview(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Promotions() {
  const [promotions, setPromotions] = useState([]);
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function load() {
    apiFetch('/promotions').then(setPromotions).catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
    apiFetch('/products').then(setProducts).catch(() => {});
  }, []);

  const sortedProducts = useMemo(() => [...products].sort((a, b) => a.name.localeCompare(b.name)), [products]);

  function startEdit(p) {
    setEditingId(p.id);
    setForm({
      name: p.name, description: p.description || '', image_url: p.image_url || '', type: p.type,
      discount_value: p.discount_value ?? '', buy_quantity: p.buy_quantity ?? '', get_quantity: p.get_quantity ?? '',
      get_discount_percent: p.get_discount_percent ?? '100',
      start_date: p.start_date || '', end_date: p.end_date || '',
      eligible_categories: (p.eligible_categories || []).join(', '), eligible_brands: (p.eligible_brands || []).join(', '),
      excluded_product_ids: (p.excluded_product_ids || []).join(', '), min_quantity: p.min_quantity ?? '1',
      visible_to_patients: p.visible_to_patients, send_push_notification: p.send_push_notification,
      active: p.active, product_ids: p.product_ids || [],
    });
    setError('');
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editingId) {
        await apiFetch(`/promotions/${editingId}`, { method: 'PATCH', body: JSON.stringify(formToBody(form)) });
      } else {
        await apiFetch('/promotions', { method: 'POST', body: JSON.stringify(formToBody(form)) });
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
      await apiFetch(`/promotions/${id}`, { method: 'DELETE' });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleActive(promo) {
    try {
      await apiFetch(`/promotions/${promo.id}`, { method: 'PATCH', body: JSON.stringify({ active: !promo.active }) });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  function handlePublished(updated) {
    setPromotions((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
  }

  return (
    <div>
      <div className="page-header">
        <h2>Promotions</h2>
      </div>
      <p className="muted">
        Percentage, fixed-amount, special-price or buy-X-get-Y offers. Only one discount ever applies to a product at
        a time (the best one, never stacked with an expiration-clearance discount) -- see Expiring Soon for those.
      </p>

      <form onSubmit={save} className="card mb-4">
        <p className="field-label">{editingId ? 'Edit promotion' : 'Add a promotion'}</p>
        <div className="form-field">
          <label className="field-label" htmlFor="promo-name">Name</label>
          <input id="promo-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="promo-description">Description (shown to patients)</label>
          <textarea id="promo-description" className="textarea" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="promo-image">Image URL (optional)</label>
          <input id="promo-image" className="input" value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="promo-type">Type</label>
          <select id="promo-type" className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>

        {form.type !== 'bogo' && (
          <div className="form-field">
            <label className="field-label" htmlFor="promo-value">
              {form.type === 'percentage' ? 'Percent off' : form.type === 'fixed' ? 'Amount off' : 'Special price'}
            </label>
            <input id="promo-value" className="input" type="number" step="0.01" value={form.discount_value} onChange={(e) => setForm({ ...form, discount_value: e.target.value })} required />
          </div>
        )}

        {form.type === 'bogo' && (
          <>
            <div className="form-field">
              <label className="field-label" htmlFor="promo-buy">Buy quantity</label>
              <input id="promo-buy" className="input" type="number" min="1" value={form.buy_quantity} onChange={(e) => setForm({ ...form, buy_quantity: e.target.value })} required />
            </div>
            <div className="form-field">
              <label className="field-label" htmlFor="promo-get">Get quantity</label>
              <input id="promo-get" className="input" type="number" min="1" value={form.get_quantity} onChange={(e) => setForm({ ...form, get_quantity: e.target.value })} required />
            </div>
            <div className="form-field">
              <label className="field-label" htmlFor="promo-get-discount">Discount on the "get" items (% -- 100 = free)</label>
              <input id="promo-get-discount" className="input" type="number" min="0" max="100" value={form.get_discount_percent} onChange={(e) => setForm({ ...form, get_discount_percent: e.target.value })} />
            </div>
            <p className="muted">Only complete buy+get groups are discounted -- a leftover quantity that doesn't reach a full group is always charged in full.</p>
          </>
        )}

        <div className="form-field">
          <label className="field-label" htmlFor="promo-start">Start date (optional)</label>
          <input id="promo-start" className="input" type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="promo-end">End date (optional)</label>
          <input id="promo-end" className="input" type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="promo-categories">Eligible categories (comma-separated, blank = all)</label>
          <input id="promo-categories" className="input" value={form.eligible_categories} onChange={(e) => setForm({ ...form, eligible_categories: e.target.value })} />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="promo-brands">Eligible brands (comma-separated, blank = all)</label>
          <input id="promo-brands" className="input" value={form.eligible_brands} onChange={(e) => setForm({ ...form, eligible_brands: e.target.value })} />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="promo-products">Specific products (optional, in addition to categories/brands)</label>
          <select
            id="promo-products"
            className="input"
            multiple
            size={6}
            value={form.product_ids.map(String)}
            onChange={(e) => setForm({ ...form, product_ids: Array.from(e.target.selectedOptions, (o) => Number(o.value)) })}
          >
            {sortedProducts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="promo-excluded">Excluded product IDs (comma-separated, optional)</label>
          <input id="promo-excluded" className="input" value={form.excluded_product_ids} onChange={(e) => setForm({ ...form, excluded_product_ids: e.target.value })} />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="promo-min-qty">Minimum quantity to qualify</label>
          <input id="promo-min-qty" className="input" type="number" min="1" value={form.min_quantity} onChange={(e) => setForm({ ...form, min_quantity: e.target.value })} />
        </div>
        <label className="field-label">
          <input type="checkbox" checked={form.visible_to_patients} onChange={(e) => setForm({ ...form, visible_to_patients: e.target.checked })} /> Visible to patients in the shop
        </label>
        <label className="field-label">
          <input type="checkbox" checked={form.send_push_notification} onChange={(e) => setForm({ ...form, send_push_notification: e.target.checked })} /> Announce with a push notification when published
        </label>
        <label className="field-label">
          <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Active
        </label>

        {error && <p className="alert alert-error">{error}</p>}
        <div className="row-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>{editingId ? 'Save changes' : 'Add promotion'}</button>
          {editingId && <button type="button" className="btn btn-ghost" onClick={cancelEdit}>Cancel</button>}
        </div>
      </form>

      {promotions.map((p) => (
        <div key={p.id} className="visit-card">
          <div className="visit-card__row">
            <b>{p.name}</b> · <span className="muted">{TYPE_LABELS[p.type]}</span>
            {' '}<span className={`badge badge-status-${p.active ? 'started' : 'cancelled'}`}>{p.active ? 'Active' : 'Inactive'}</span>
          </div>
          {p.description && <p className="muted">{p.description}</p>}
          <p className="muted">
            {p.type === 'bogo'
              ? `Buy ${p.buy_quantity} get ${p.get_quantity} at ${p.get_discount_percent}% off`
              : p.type === 'percentage' ? `${p.discount_value}% off`
              : p.type === 'fixed' ? `$${p.discount_value} off`
              : `Special price: $${p.discount_value}`}
            {(p.start_date || p.end_date) && ` · ${p.start_date || 'no start'} to ${p.end_date || 'no end'}`}
          </p>
          <div className="row-actions mt-2">
            <button className="btn btn-sm btn-secondary" onClick={() => startEdit(p)}>Edit</button>
            <button className="btn btn-sm btn-ghost" onClick={() => toggleActive(p)}>{p.active ? 'Deactivate' : 'Activate'}</button>
            <button className="btn btn-sm btn-ghost" onClick={() => remove(p.id)}>Delete</button>
          </div>
          {p.send_push_notification && (
            <div className="mt-2">
              <PublishControl promotion={p} onPublished={handlePublished} />
            </div>
          )}
        </div>
      ))}
      {promotions.length === 0 && <p className="muted">No promotions yet.</p>}
    </div>
  );
}
