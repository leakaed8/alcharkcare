const multer = require('multer');

// Unlike lib/upload.js (used for OCR, where the buffer is discarded
// immediately), a progress photo's buffer is stored permanently as base64
// in Postgres -- so this cap is tighter to keep database size sane on a
// free-tier plan (a 3MB photo becomes ~4MB of stored text).
module.exports = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Only image uploads are allowed'));
    cb(null, true);
  },
});
