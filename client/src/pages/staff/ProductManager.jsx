import { useEffect, useState } from 'react';
import { apiFetch } from '../../api/client';

const EMPTY_FORM = { name: '', category: '', sku: '', price: '', stock_qty: '', duration_days: '', description: '' };

export default function ProductManager() {
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function load() {
    try {
      setProducts(await apiFetch('/products'));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function startEdit(p) {
    setEditingId(p.id);
    setForm({
      name: p.name || '',
      category: p.category || '',
      sku: p.sku || '',
      price: p.price ?? '',
      stock_qty: p.stock_qty ?? '',
      duration_days: p.duration_days ?? '',
      description: p.description || '',
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
        await apiFetch(`/products/${editingId}`, { method: 'PATCH', body: JSON.stringify(form) });
        setSuccess('Product updated.');
      } else {
        await apiFetch('/products', { method: 'POST', body: JSON.stringify(form) });
        setSuccess('Product added.');
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
        <h2>Products</h2>
      </div>
      <p className="muted">
        Anything added here becomes available to pick from on the "New visit" form's product/supplement list.
      </p>

      <form onSubmit={handleSubmit} className="card mb-5">
        <p className="field-label">{editingId ? 'Edit product' : 'Add a product'}</p>
        <div className="form-field">
          <label className="field-label" htmlFor="p-name">Name</label>
          <input id="p-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="p-category">Category</label>
          <input id="p-category" className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. skincare, supplement" />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="p-sku">SKU</label>
          <input id="p-sku" className="input" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="p-price">Price</label>
          <input id="p-price" className="input" type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="p-stock">Stock quantity</label>
          <input id="p-stock" className="input" type="number" value={form.stock_qty} onChange={(e) => setForm({ ...form, stock_qty: e.target.value })} />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="p-duration">Duration (days)</label>
          <input id="p-duration" className="input" type="number" value={form.duration_days} onChange={(e) => setForm({ ...form, duration_days: e.target.value })} placeholder="How long a supply lasts, if relevant" />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="p-description">Description</label>
          <textarea id="p-description" className="textarea" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>

        {error && <p className="alert alert-error">{error}</p>}
        {success && <p className="alert alert-success">{success}</p>}

        <div className="row-actions">
          <button type="submit" className="btn btn-primary">{editingId ? 'Save changes' : 'Add product'}</button>
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
              <th>Category</th>
              <th>SKU</th>
              <th>Price</th>
              <th>Stock</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.category || '—'}</td>
                <td>{p.sku || '—'}</td>
                <td>{p.price != null ? `$${p.price}` : '—'}</td>
                <td>{p.stock_qty ?? '—'}</td>
                <td>
                  <button className="btn btn-sm btn-secondary" onClick={() => startEdit(p)}>Edit</button>
                </td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr><td colSpan={6} className="muted">No products yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
