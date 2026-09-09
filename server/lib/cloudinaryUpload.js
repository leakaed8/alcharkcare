const cloudinary = require('cloudinary').v2;

// Cloudinary auto-configures itself from the CLOUDINARY_URL env var. We
// never store image bytes ourselves -- only the resulting URL goes in
// products.image_url -- so product photos don't grow the app's own
// database or disk on a free-tier plan.
function isConfigured() {
  return !!process.env.CLOUDINARY_URL;
}

async function uploadProductImage(buffer, mimetype, productId) {
  if (!isConfigured()) {
    throw new Error('Image hosting is not configured yet (set CLOUDINARY_URL).');
  }
  const dataUri = `data:${mimetype};base64,${buffer.toString('base64')}`;
  const result = await cloudinary.uploader.upload(dataUri, {
    folder: 'alcharkcare/products',
    public_id: `product_${productId}`,
    overwrite: true,
    resource_type: 'image',
  });
  return result.secure_url;
}

module.exports = { isConfigured, uploadProductImage };
