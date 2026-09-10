import { useEffect, useRef, useState } from 'react';
import { apiFetch, apiUpload } from '../../api/client';

const EMPTY_FORM = {
  name: '', brand: '', category: '', subcategory: '', sku: '', barcode: '', price: '', cost: '',
  stock_qty: '', min_stock: '', duration_days: '', description: '', benefits: '', ingredients: '',
  directions_for_use: '', frequency: '', supplier: '', country: '', allergens: '', tags: '', is_active: true,
};

const APPROVAL_LABELS = { draft: 'Draft', review_required: 'Needs review', approved: 'Approved', published: 'Published' };
const APPROVAL_FILTERS = [{ value: '', label: 'All' }, ...Object.entries(APPROVAL_LABELS).map(([value, label]) => ({ value, label }))];

function ImportPanel({ onImported }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const inputRef = useRef(null);

  async function handlePreview(e) {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    setError('');
    setResult(null);
    setBusy(true);
    try {
      const formData = new FormData();
      formData.append('file', f);
      const data = await apiUpload('/products/import?preview=true', formData);
      setPreview(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleCommit() {
    setBusy(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const data = await apiUpload('/products/import', formData);
      setResult(data);
      setPreview(null);
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      onImported();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card mb-5">
      <p className="field-label">Import products from Excel (.xlsx)</p>
      <p className="muted">
        Expects columns like Name, Category, SKU, Price, Stock, Duration (days), Description, Allergens -- header
        names are matched flexibly. Existing products are matched and updated by SKU.
      </p>
      <input ref={inputRef} type="file" accept=".xlsx" onChange={handlePreview} disabled={busy} />
      {error && <p className="alert alert-error">{error}</p>}
      {result && (
        <p className="alert alert-success">
          Imported: {result.created} created, {result.updated} updated
          {result.skipped?.length > 0 && `, ${result.skipped.length} skipped`}.
        </p>
      )}
      {preview && (
        <div className="table-wrap mt-3">
          <table className="table">
            <thead>
              <tr><th>Row</th><th>Name</th><th>Brand</th><th>SKU</th><th>Category</th><th>Price</th><th>Stock</th></tr>
            </thead>
            <tbody>
              {preview.rows.map((r) => (
                <tr key={r.row}>
                  <td>{r.row}</td><td>{r.name}</td><td>{r.brand || '—'}</td><td>{r.sku || '—'}</td><td>{r.category || '—'}</td><td>{r.price ?? '—'}</td><td>{r.stock_qty ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {preview.unmatchedHeaders?.length > 0 && (
            <p className="muted">Unrecognized columns (ignored): {preview.unmatchedHeaders.join(', ')}</p>
          )}
          <button className="btn btn-primary mt-2" onClick={handleCommit} disabled={busy}>
            Import {preview.rows.length} product{preview.rows.length === 1 ? '' : 's'}
          </button>
        </div>
      )}
    </div>
  );
}

function ImageUpload({ product, onUploaded }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('image', file);
      const updated = await apiUpload(`/products/${product.id}/image`, formData);
      onUploaded(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  }

  return (
    <div>
      {product.image_url && <img src={product.image_url} alt={product.name} style={{ width: 48, height: 48, borderRadius: 6, objectFit: 'cover' }} />}
      <input type="file" accept="image/*" onChange={handleFile} disabled={busy} style={{ maxWidth: 140 }} />
      {error && <span className="alert alert-error">{error}</span>}
    </div>
  );
}

export default function ProductManager() {
  const [products, setProducts] = useState([]);
  const [approvalFilter, setApprovalFilter] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function load() {
    try {
      const query = approvalFilter ? `?approval_status=${approvalFilter}` : '';
      setProducts(await apiFetch(`/products${query}`));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, [approvalFilter]);

  function startEdit(p) {
    setEditingId(p.id);
    setForm({
      name: p.name || '',
      brand: p.brand || '',
      category: p.category || '',
      subcategory: p.subcategory || '',
      sku: p.sku || '',
      barcode: p.barcode || '',
      price: p.price ?? '',
      cost: p.cost ?? '',
      stock_qty: p.stock_qty ?? '',
      min_stock: p.min_stock ?? '',
      duration_days: p.duration_days ?? '',
      description: p.description || '',
      benefits: p.benefits || '',
      ingredients: p.ingredients || '',
      directions_for_use: p.directions_for_use || '',
      frequency: p.frequency || '',
      supplier: p.supplier || '',
      country: p.country || '',
      allergens: (p.allergens || []).join(', '),
      tags: (p.tags || []).join(', '),
      is_active: p.is_active !== false,
    });
    setError('');
    setSuccess('');
  }

  async function approve(p, approval_status) {
    try {
      const updated = await apiFetch(`/products/${p.id}/approval`, { method: 'PATCH', body: JSON.stringify({ approval_status }) });
      setProducts((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    } catch (err) {
      setError(err.message);
    }
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

  function handleImageUploaded(updated) {
    setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  }

  return (
    <div>
      <div className="page-header">
        <h2>Products</h2>
      </div>
      <p className="muted">
        Anything added here becomes available to pick from on the "New visit" form's product/supplement list, and --
        when active -- in the patient-facing shop.
      </p>

      <ImportPanel onImported={load} />

      <form onSubmit={handleSubmit} className="card mb-5">
        <p className="field-label">{editingId ? 'Edit product' : 'Add a product'}</p>
        <div className="form-field">
          <label className="field-label" htmlFor="p-name">Name</label>
          <input id="p-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="p-brand">Brand</label>
          <input id="p-brand" className="input" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} placeholder="e.g. CeraVe, Mason Naturals" />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="p-category">Category</label>
          <input id="p-category" className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. skincare, supplement" />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="p-subcategory">Subcategory</label>
          <input id="p-subcategory" className="input" value={form.subcategory} onChange={(e) => setForm({ ...form, subcategory: e.target.value })} />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="p-sku">SKU</label>
          <input id="p-sku" className="input" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="p-barcode">Barcode</label>
          <input id="p-barcode" className="input" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="p-price">Price</label>
          <input id="p-price" className="input" type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="p-cost">Cost (wholesale, internal only)</label>
          <input id="p-cost" className="input" type="number" step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="p-stock">Stock quantity</label>
          <input id="p-stock" className="input" type="number" value={form.stock_qty} onChange={(e) => setForm({ ...form, stock_qty: e.target.value })} />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="p-min-stock">Minimum stock (reorder threshold)</label>
          <input id="p-min-stock" className="input" type="number" value={form.min_stock} onChange={(e) => setForm({ ...form, min_stock: e.target.value })} />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="p-duration">Duration (days)</label>
          <input id="p-duration" className="input" type="number" value={form.duration_days} onChange={(e) => setForm({ ...form, duration_days: e.target.value })} placeholder="How long a supply lasts, if relevant" />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="p-description">Description</label>
          <textarea id="p-description" className="textarea" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="p-benefits">Benefits</label>
          <textarea id="p-benefits" className="textarea" value={form.benefits} onChange={(e) => setForm({ ...form, benefits: e.target.value })} />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="p-ingredients">Ingredients</label>
          <textarea id="p-ingredients" className="textarea" value={form.ingredients} onChange={(e) => setForm({ ...form, ingredients: e.target.value })} />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="p-directions">Directions for use</label>
          <textarea id="p-directions" className="textarea" value={form.directions_for_use} onChange={(e) => setForm({ ...form, directions_for_use: e.target.value })} />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="p-frequency">Frequency</label>
          <input id="p-frequency" className="input" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })} placeholder="e.g. once daily" />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="p-supplier">Supplier</label>
          <input id="p-supplier" className="input" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="p-country">Country of origin</label>
          <input id="p-country" className="input" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="p-allergens">Allergens (comma-separated)</label>
          <input id="p-allergens" className="input" value={form.allergens} onChange={(e) => setForm({ ...form, allergens: e.target.value })} placeholder="e.g. fragrance, nuts" />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="p-tags">Tags (comma-separated)</label>
          <input id="p-tags" className="input" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
        </div>
        <label className="field-label">
          <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Visible in the patient-facing shop
        </label>

        {error && <p className="alert alert-error">{error}</p>}
        {success && <p className="alert alert-success">{success}</p>}

        <div className="row-actions">
          <button type="submit" className="btn btn-primary">{editingId ? 'Save changes' : 'Add product'}</button>
          {editingId && (
            <button type="button" className="btn btn-ghost" onClick={cancelEdit}>Cancel</button>
          )}
        </div>
      </form>

      <div className="tab-group mb-3">
        {APPROVAL_FILTERS.map((f) => (
          <button key={f.value} type="button" className={`tab-btn ${approvalFilter === f.value ? 'active' : ''}`} onClick={() => setApprovalFilter(f.value)}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Photo</th>
              <th>Name</th>
              <th>Category</th>
              <th>SKU</th>
              <th>Price</th>
              <th>Stock</th>
              <th>Shop</th>
              <th>Approval</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td><ImageUpload product={p} onUploaded={handleImageUploaded} /></td>
                <td>{p.name}</td>
                <td>{p.category || '—'}</td>
                <td>{p.sku || '—'}</td>
                <td>{p.price != null ? `$${p.price}` : '—'}</td>
                <td>{p.stock_qty ?? '—'}</td>
                <td>{p.is_active !== false ? 'Visible' : 'Hidden'}</td>
                <td>
                  <span className={`badge badge-status-${p.approval_status || 'published'}`}>
                    {APPROVAL_LABELS[p.approval_status] || p.approval_status}
                  </span>
                </td>
                <td>
                  <div className="row-actions">
                    <button className="btn btn-sm btn-secondary" onClick={() => startEdit(p)}>Edit</button>
                    {p.approval_status !== 'published' && (
                      <button className="btn btn-sm btn-primary" onClick={() => approve(p, 'published')}>Approve & publish</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr><td colSpan={9} className="muted">No products.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
