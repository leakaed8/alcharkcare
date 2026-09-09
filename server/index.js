require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const patientRoutes = require('./routes/patients');
const visitRoutes = require('./routes/visits');
const followupRoutes = require('./routes/followups');
const productRoutes = require('./routes/products');
const labRoutes = require('./routes/labs');
const purchaseRoutes = require('./routes/purchases');
const managerRoutes = require('./routes/manager');
const carePlanRoutes = require('./routes/carePlans');
const photoRoutes = require('./routes/photos');

// Last-resort net: a third-party lib (e.g. the OCR worker) throwing outside
// any promise chain would otherwise crash the whole process for every user
// over one bad request. Log and keep serving instead.
process.on('unhandledRejection', (err) => console.error('Unhandled rejection:', err));
process.on('uncaughtException', (err) => console.error('Uncaught exception:', err));

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/visits', visitRoutes);
app.use('/api/followups', followupRoutes);
app.use('/api/products', productRoutes);
app.use('/api/labs', labRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/manager', managerRoutes);
app.use('/api/care-plans', carePlanRoutes);
app.use('/api/photos', photoRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(clientDist));
  app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Al Chark CRM server listening on port ${PORT}`));
