// ImgBB image hosting -- a free-tier image host with a plain API-key
// signup (no billing/KYC step), used for product photos in place of
// Cloudinary, whose sign-up isn't reachable from Lebanon. Only the
// resulting URL is stored in products.image_url -- never the image bytes
// -- so product photos don't grow the app's own database or disk.
const IMGBB_UPLOAD_URL = 'https://api.imgbb.com/1/upload';

function isConfigured() {
  return !!process.env.IMGBB_API_KEY;
}

async function uploadProductImage(buffer, mimetype, productId) {
  if (!isConfigured()) {
    throw new Error('Image hosting is not configured yet (set IMGBB_API_KEY).');
  }

  const form = new FormData();
  form.append('image', buffer.toString('base64'));
  form.append('name', `product_${productId}`);

  const res = await fetch(`${IMGBB_UPLOAD_URL}?key=${process.env.IMGBB_API_KEY}`, {
    method: 'POST',
    body: form,
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error?.message || 'Image upload failed');
  }
  return data.data.url;
}

module.exports = { isConfigured, uploadProductImage };
