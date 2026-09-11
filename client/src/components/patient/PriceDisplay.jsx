// Renders the exact price the pricing engine computed -- the same
// unit_price/discount every endpoint (catalog/search/detail/cart) attaches,
// so a discount always looks the same wherever a price is shown. Falls
// back to a plain price if `pricing` wasn't attached (e.g. an older cached
// response) or there's no discount.
export default function PriceDisplay({ pricing, price, size }) {
  const original = pricing?.original_price ?? price;
  if (original == null) return null;

  const discount = pricing?.discount;
  const unitPrice = pricing?.unit_price ?? original;
  const style = size === 'lg' ? { fontSize: 20, fontWeight: 700 } : undefined;

  if (!discount) {
    return <span className="p-price" style={style}>${Number(original).toFixed(2)}</span>;
  }

  const badgeLabel = discount.source === 'expiration'
    ? `${discount.percent_off}% off -- expiring soon`
    : discount.label;

  return (
    <span className="p-price-discounted" style={style}>
      <span className="p-price-discounted__original">${Number(original).toFixed(2)}</span>
      <span className="p-price-discounted__current">${Number(unitPrice).toFixed(2)}</span>
      <span className="p-price-discounted__badge">{badgeLabel}</span>
    </span>
  );
}
