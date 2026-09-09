// Shared cart storage so "Add to cart" works the same whether it happens
// from the Shop page or a product detail page reached via a recommendation
// link. The cart lives in localStorage per patient -- the submitted order
// (see components/Shop.jsx) is the actual persisted cart, this is just the
// in-progress one.
function cartKey(patientId) {
  return `alcrm_cart_${patientId}`;
}

export function getCart(patientId) {
  try {
    return JSON.parse(localStorage.getItem(cartKey(patientId))) || {};
  } catch {
    return {};
  }
}

export function setCart(patientId, cart) {
  localStorage.setItem(cartKey(patientId), JSON.stringify(cart));
}

export function addToCart(patientId, product) {
  const cart = getCart(patientId);
  const existing = cart[product.id];
  cart[product.id] = { product, quantity: (existing?.quantity || 0) + 1 };
  setCart(patientId, cart);
  return cart;
}
