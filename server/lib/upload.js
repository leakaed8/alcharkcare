const multer = require('multer');

// Memory storage only -- the buffer is used for OCR and discarded; it is
// never written to disk or the database.
module.exports = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Only image uploads are allowed'));
    cb(null, true);
  },
});
