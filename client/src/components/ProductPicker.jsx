import { useState } from 'react';
import { apiFetch } from '../api/client';

// Multi-select product/supplement picker with a per-product "how to use it"
// instructions field. Typing filters the catalog; if nothing matches, an
// inline "create new" option adds it to the catalog (POST /api/products)
// and selects it immediately.
//
// `items` is [{ product_id, dosing_notes }] rather than a plain id array so
// each selected product can carry its own instructions.
export default function ProductPicker({ products, items, onChange, onProductCreated }) {
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const selectedIds = items.map((i) => i.product_id);
  const q = query.trim().toLowerCase();
  const matches = q ? products.filter((p) => p.name.toLowerCase().includes(q)) : products;
  const exactMatch = products.some((p) => p.name.toLowerCase() === q);

  function toggle(id) {
    if (selectedIds.includes(id)) {
      onChange(items.filter((i) => i.product_id !== id));
    } else {
      onChange([...items, { product_id: id, dosing_notes: '', reason: '' }]);
    }
  }

  function remove(id) {
    onChange(items.filter((i) => i.product_id !== id));
  }

  function updateNotes(id, dosing_notes) {
    onChange(items.map((i) => (i.product_id === id ? { ...i, dosing_notes } : i)));
  }

  function updateReason(id, reason) {
    onChange(items.map((i) => (i.product_id === id ? { ...i, reason } : i)));
  }

  async function createAndSelect() {
    setCreating(true);
    setError('');
    try {
      const product = await apiFetch('/products', { method: 'POST', body: JSON.stringify({ name: query.trim() }) });
      onProductCreated(product);
      onChange([...items, { product_id: product.id, dosing_notes: '', reason: '' }]);
      setQuery('');
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      {items.length > 0 && (
        <div className="mb-3">
          {items.map((item) => {
            const product = products.find((p) => p.id === item.product_id);
            return (
              <div key={item.product_id} className="dosing-row">
                <div className="row-actions">
                  <span className="badge badge-status-upcoming">
                    {product?.name || `#${item.product_id}`}{' '}
                    <button
                      type="button"
                      className="chip-remove"
                      onClick={() => remove(item.product_id)}
                      aria-label={`Remove ${product?.name}`}
                    >
                      ×
                    </button>
                  </span>
                </div>
                <input
                  className="input input-sm"
                  placeholder="How to use it (e.g. twice daily after cleansing)"
                  value={item.dosing_notes}
                  onChange={(e) => updateNotes(item.product_id, e.target.value)}
                />
                <input
                  className="input input-sm"
                  placeholder="Why recommended (shown to the patient, optional)"
                  value={item.reason || ''}
                  onChange={(e) => updateReason(item.product_id, e.target.value)}
                />
              </div>
            );
          })}
        </div>
      )}

      <input
        className="input"
        placeholder="Search products/supplements…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="product-picker__list">
        {matches.map((p) => (
          <label key={p.id} className="checkbox-item">
            <input type="checkbox" checked={selectedIds.includes(p.id)} onChange={() => toggle(p.id)} />
            {p.name}
          </label>
        ))}
        {matches.length === 0 && <p className="muted">No matches.</p>}
      </div>

      {q && !exactMatch && (
        <button type="button" className="btn btn-secondary btn-sm mt-3" onClick={createAndSelect} disabled={creating}>
          + Add "{query.trim()}" as a new product
        </button>
      )}
      {error && <p className="alert alert-error">{error}</p>}
    </div>
  );
}
