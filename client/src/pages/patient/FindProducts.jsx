import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { apiFetch } from '../../api/client';
import { addToCart } from '../../lib/cart';
import AvailabilityBadge from '../../components/patient/AvailabilityBadge';

function AskAboutProduct({ prefill }) {
  const [text, setText] = useState(prefill || '');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch('/product-requests', { method: 'POST', body: JSON.stringify({ requested_text: text.trim() }) });
      setDone(true);
      setText('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="p-card p-card--highlight">
        <p className="p-card__title">Request submitted.</p>
        <p className="p-card__body">We'll let you know if/when it becomes available.</p>
        <button className="p-cta p-cta--secondary" onClick={() => setDone(false)}>Ask about another product</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="p-card">
      <p className="p-card__title">What product are you looking for?</p>
      <p className="muted">e.g. Magnesium glycinate, Collagen powder, CeraVe moisturizer, Iron supplement</p>
      <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a product name…" />
      {error && <p className="alert alert-error">{error}</p>}
      <button type="submit" className="p-cta" disabled={busy || !text.trim()}>Ask Al Chark</button>
    </form>
  );
}

export default function FindProducts() {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [searched, setSearched] = useState(false);
  const [message, setMessage] = useState('');

  async function search(e) {
    e?.preventDefault();
    if (!query.trim()) return;
    setSearched(true);
    const data = await apiFetch(`/products/search?q=${encodeURIComponent(query.trim())}`);
    setResults(data);
  }

  function handleAdd(product) {
    addToCart(user.id, product);
    setMessage(`${product.name} added to cart.`);
  }

  return (
    <div>
      <p className="p-greeting">Find products</p>
      <p className="muted">Search the Al Chark catalog by name, brand, or category.</p>

      <form onSubmit={search} className="p-search-bar">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products…" />
        <button type="submit" className="p-cta">Search</button>
      </form>

      {message && <p className="alert alert-success">{message}</p>}

      {searched && results && results.length === 0 && (
        <div className="p-card p-empty">
          <p>No exact match found.</p>
          <p className="muted">Couldn't find what you're looking for?</p>
        </div>
      )}

      {results?.map((p) => (
        <div key={p.id} className="p-card">
          <div className="p-product-row">
            {p.image_url && <img className="p-product-row__image" src={p.image_url} alt={p.name} />}
            <div style={{ flex: 1 }}>
              <div className="p-card__title">{p.name}</div>
              {p.brand && <div className="muted">{p.brand}</div>}
              {p.price != null && <div>${p.price}</div>}
              <div style={{ marginTop: 6 }}><AvailabilityBadge availability={p.availability} /></div>
            </div>
          </div>
          <div className="row-actions mt-2">
            <Link className="p-cta p-cta--secondary" to={`/patient/shop/${p.id}`}>View Product</Link>
            {(p.availability.level === 'green' || p.availability.level === 'orange') && (
              <button className="p-cta" onClick={() => handleAdd(p)}>Add to Cart</button>
            )}
            {(p.availability.level === 'red' || p.availability.level === 'gray') && (
              <Link className="p-cta" to="/patient/find">Ask Al Chark to Order</Link>
            )}
          </div>
        </div>
      ))}

      <p className="p-section-title">Ask about a product</p>
      <AskAboutProduct key={searched && results?.length === 0 ? query : 'empty'} prefill={searched && results?.length === 0 ? query : ''} />
    </div>
  );
}
