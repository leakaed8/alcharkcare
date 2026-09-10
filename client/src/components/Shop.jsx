import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { getCart, setCart as persistCart } from '../lib/cart';
import AvailabilityBadge from './patient/AvailabilityBadge';
import PriceDisplay from './patient/PriceDisplay';

const ORDER_STATUS_LABELS = { pending: 'Pending', confirmed: 'Confirmed', fulfilled: 'Ready/fulfilled', cancelled: 'Cancelled' };

// How staff feature something here: set a product's Brand to "Al Chark"
// (Product Manager) to put it in "Our own skincare line". "Special offer
// this month" is sourced from whatever the pricing engine actually
// discounted (an active promotion or expiration-clearance rule) -- not a
// manually-applied tag -- so it's never out of sync with the real price.
const OWN_BRAND_NAME = 'al chark';

// Order-ahead shop: browse the active catalog, build a cart, and submit it
// as an order. No online payment -- the order is a reservation the patient
// pays for in store on pickup (payment_method = cash_on_pickup, set
// server-side). The cart lives in localStorage (see lib/cart.js) rather
// than a database table, shared with the product detail page's "Add to
// cart" -- the submitted order IS the persisted cart.
export default function Shop({ patientId }) {
  const [catalog, setCatalog] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [cart, setCart] = useState(() => getCart(patientId));
  const [cartPricing, setCartPricing] = useState(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    persistCart(patientId, cart);
  }, [cart, patientId]);

  // Runs the exact same pricing engine checkout uses, so the total shown
  // here always matches what's actually charged -- never a separately
  // computed (and possibly conflicting) client-side total.
  useEffect(() => {
    const items = Object.values(cart).map((i) => ({ product_id: i.product.id, quantity: i.quantity }));
    if (items.length === 0) {
      setCartPricing(null);
      return;
    }
    apiFetch('/orders/cart-preview', { method: 'POST', body: JSON.stringify({ items }) })
      .then(setCartPricing)
      .catch(() => setCartPricing(null));
  }, [cart]);

  function loadOrders() {
    apiFetch(`/orders/${patientId}`).then(setOrders).catch((err) => setError(err.message));
  }

  useEffect(() => {
    apiFetch('/products/catalog').then(setCatalog).catch((err) => setError(err.message));
    apiFetch(`/products/suggestions/${patientId}`).then(setSuggestions).catch(() => {});
    loadOrders();
  }, [patientId]);

  function addToCart(product) {
    setCart((prev) => ({ ...prev, [product.id]: { product, quantity: (prev[product.id]?.quantity || 0) + 1 } }));
    setMessage(`${product.name} added to cart.`);
  }

  function updateQuantity(productId, quantity) {
    setCart((prev) => {
      if (quantity <= 0) {
        const next = { ...prev };
        delete next[productId];
        return next;
      }
      return { ...prev, [productId]: { ...prev[productId], quantity } };
    });
  }

  const cartItems = Object.values(cart);
  const cartLineByProductId = useMemo(() => new Map((cartPricing?.items || []).map((i) => [i.product_id, i])), [cartPricing]);
  const cartTotal = cartPricing?.total ?? cartItems.reduce((sum, i) => sum + Number(i.product.price || 0) * i.quantity, 0);

  const ownLine = useMemo(() => catalog.filter((p) => (p.brand || '').trim().toLowerCase() === OWN_BRAND_NAME), [catalog]);
  const specialOffers = useMemo(() => catalog.filter((p) => p.pricing?.discount), [catalog]);

  async function checkout() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await apiFetch('/orders', {
        method: 'POST',
        body: JSON.stringify({
          items: cartItems.map((i) => ({ product_id: i.product.id, quantity: i.quantity })),
          notes: notes || undefined,
        }),
      });
      setCart({});
      setNotes('');
      setMessage('Order placed. Pay in store when you pick it up.');
      loadOrders();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {error && <p className="alert alert-error">{error}</p>}
      {message && <p className="alert alert-success">{message}</p>}

      {suggestions.length > 0 && (
        <>
          <p className="field-label">Suggested for you</p>
          <div className="product-grid mb-3">
            {suggestions.map((p) => (
              <div key={p.id} className="product-card">
                {p.image_url && <img src={p.image_url} alt={p.name} />}
                <strong>{p.name}</strong>
                <PriceDisplay pricing={p.pricing} price={p.price} />
                <AvailabilityBadge availability={p.availability} />
                {p.reasons.map((r, i) => <p key={i} className="muted" style={{ fontSize: 12 }}>{r}</p>)}
                <div className="row-actions">
                  <Link className="btn btn-sm btn-secondary" to={`/patient/shop/${p.id}`}>View</Link>
                  {p.availability?.level === 'green' || p.availability?.level === 'orange' ? (
                    <button className="btn btn-sm btn-primary" onClick={() => addToCart(p)}>Add to cart</button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {specialOffers.length > 0 && (
        <>
          <p className="field-label">Special offer this month</p>
          <div className="product-grid mb-3">
            {specialOffers.map((p) => (
              <div key={p.id} className="product-card">
                {p.image_url && <img src={p.image_url} alt={p.name} />}
                <strong>{p.name}</strong>
                <PriceDisplay pricing={p.pricing} price={p.price} />
                <AvailabilityBadge availability={p.availability} />
                <div className="row-actions">
                  <Link className="btn btn-sm btn-secondary" to={`/patient/shop/${p.id}`}>View</Link>
                  {p.availability?.level === 'green' || p.availability?.level === 'orange' ? (
                    <button className="btn btn-sm btn-primary" onClick={() => addToCart(p)}>Add to cart</button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {ownLine.length > 0 && (
        <>
          <p className="field-label">Our own skincare line</p>
          <div className="product-grid mb-3">
            {ownLine.map((p) => (
              <div key={p.id} className="product-card">
                {p.image_url && <img src={p.image_url} alt={p.name} />}
                <strong>{p.name}</strong>
                <PriceDisplay pricing={p.pricing} price={p.price} />
                <AvailabilityBadge availability={p.availability} />
                <div className="row-actions">
                  <Link className="btn btn-sm btn-secondary" to={`/patient/shop/${p.id}`}>View</Link>
                  {p.availability?.level === 'green' || p.availability?.level === 'orange' ? (
                    <button className="btn btn-sm btn-primary" onClick={() => addToCart(p)}>Add to cart</button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="field-label">Shop</p>
      <div className="product-grid mb-3">
        {catalog.map((p) => (
          <div key={p.id} className="product-card">
            {p.image_url && <img src={p.image_url} alt={p.name} />}
            <strong>{p.name}</strong>
            {p.brand && <span className="muted">{p.brand}</span>}
            <span className="muted">{p.category}</span>
            <PriceDisplay pricing={p.pricing} price={p.price} />
            <AvailabilityBadge availability={p.availability} />
            <div className="row-actions">
              <Link className="btn btn-sm btn-secondary" to={`/patient/shop/${p.id}`}>View</Link>
              {p.availability?.level === 'green' || p.availability?.level === 'orange' ? (
                <button className="btn btn-sm btn-primary" onClick={() => addToCart(p)}>Add to cart</button>
              ) : null}
            </div>
          </div>
        ))}
        {catalog.length === 0 && <p className="muted">Nothing in the shop yet.</p>}
      </div>

      {cartItems.length > 0 && (
        <div className="card mb-3">
          <p className="field-label">Your cart</p>
          {cartItems.map((i) => {
            const line = cartLineByProductId.get(i.product.id);
            return (
              <div key={i.product.id} className="mb-2">
                <div className="row-actions">
                  <span style={{ flex: 1 }}>{i.product.name}</span>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    style={{ width: 70 }}
                    value={i.quantity}
                    onChange={(e) => updateQuantity(i.product.id, Number(e.target.value))}
                  />
                  <span className="muted">
                    ${(line ? line.line_total : Number(i.product.price || 0) * i.quantity).toFixed(2)}
                  </span>
                </div>
                {line?.free_or_discounted_units > 0 && (
                  <p className="muted" style={{ fontSize: 12 }}>
                    Includes {line.free_or_discounted_units} unit{line.free_or_discounted_units === 1 ? '' : 's'} at a promotional discount ({line.bogo_promotion?.name}).
                  </p>
                )}
              </div>
            );
          })}
          <textarea className="textarea" placeholder="Notes for pickup (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <div className="row-actions mt-2">
            <strong>Total: ${cartTotal.toFixed(2)}</strong>
            <button className="btn btn-primary" disabled={busy} onClick={checkout}>
              Place order (pay in store)
            </button>
          </div>
        </div>
      )}

      <p className="field-label">Your orders</p>
      {orders.length === 0 && <p className="muted">No orders yet.</p>}
      {orders.map((o) => (
        <div key={o.id} className="visit-card">
          <div className="visit-card__row">
            {new Date(o.order_date).toLocaleDateString()}{' '}
            <span className={`badge badge-status-${o.status}`}>{ORDER_STATUS_LABELS[o.status] || o.status}</span>
          </div>
          <ul className="followup-list">
            {o.items.map((item) => <li key={item.id}>{item.quantity}x {item.product_name}</li>)}
          </ul>
          <div className="muted">Total: ${o.total} · Pay in store on pickup</div>
        </div>
      ))}
    </div>
  );
}
