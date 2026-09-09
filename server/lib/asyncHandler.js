// Express 4 doesn't catch rejected promises from async route handlers, so
// an OCR/DB error would otherwise crash the whole process. Wrap routes with
// this to forward errors to the error-handling middleware instead.
module.exports = function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
