const express = require('express');
const https = require('https');
const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const KALSHI_KEY_ID = process.env.KALSHI_KEY_ID;
const KALSHI_KEY_SECRET = process.env.KALSHI_KEY_SECRET;
const BASE_URL = 'api.elections.kalshi.com';

function kalshiRequest(method, path, body, res) {
  const options = {
    hostname: BASE_URL,
    path: path,
    method: method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${Buffer.from(KALSHI_KEY_ID + ':' + KALSHI_KEY_SECRET).toString('base64')}`
    }
  };
  const req = https.request(options, (r) => {
    let data = '';
    r.on('data', chunk => data += chunk);
    r.on('end', () => {
      try { res.json(JSON.parse(data)); }
      catch(e) { res.status(500).json({ error: 'Parse error', raw: data }); }
    });
  });
  req.on('error', e => res.status(500).json({ error: e.message }));
  if (body) req.write(JSON.stringify(body));
  req.end();
}

app.get('/balance', (req, res) => {
  kalshiRequest('GET', '/trade-api/v2/portfolio/balance', null, res);
});

app.get('/positions', (req, res) => {
  kalshiRequest('GET', '/trade-api/v2/portfolio/positions', null, res);
});

app.get('/markets', (req, res) => {
  const limit = req.query.limit || 100;
  kalshiRequest('GET', `/trade-api/v2/markets?limit=${limit}&status=open`, null, res);
});

app.post('/place-order', (req, res) => {
  kalshiRequest('POST', '/trade-api/v2/portfolio/orders', req.body, res);
});

app.get('/', (req, res) => res.json({ status: 'Kalshi proxy running' }));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Kalshi proxy running on port ${PORT}`));
