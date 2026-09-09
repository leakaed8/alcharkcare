const path = require('path');
const { createWorker } = require('tesseract.js');

// Bundled via the @tesseract.js-data/eng npm package instead of the
// default jsdelivr CDN fetch, so OCR never needs a runtime network call
// (faster, and immune to that CDN being unreachable in some environments).
const LANG_PATH = path.dirname(require.resolve('@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'));

const TIMEOUT_MS = 30000;

function withTimeout(promise, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), TIMEOUT_MS);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

// Runs free/offline OCR on an image buffer and returns the raw text.
// The buffer itself is never written to disk or the database -- callers
// discard it right after this resolves.
//
// tesseract.js's worker rethrows load/recognize failures synchronously
// from its internal message handler unless an errorHandler is supplied,
// which otherwise crashes the whole Node process regardless of any
// try/catch around this call -- so one must always be passed here. On top
// of that, a network failure while loading language data can leave the
// worker promise never settling at all, so this is also bounded by a
// timeout rather than trusting the library to always resolve or reject.
async function extractText(buffer) {
  let ocrError = null;
  const worker = await withTimeout(
    createWorker('eng', 1, {
      langPath: LANG_PATH,
      cacheMethod: 'none',
      errorHandler: (err) => { ocrError = err; },
    }),
    'OCR worker failed to start (timed out)'
  );
  try {
    if (ocrError) throw ocrError;
    const { data } = await withTimeout(worker.recognize(buffer), 'OCR timed out reading the image');
    if (ocrError) throw ocrError;
    return data.text || '';
  } finally {
    await worker.terminate().catch(() => {});
  }
}

module.exports = { extractText };
