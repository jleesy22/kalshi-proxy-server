const express = require('express');
const https = require('https');
const crypto = require('crypto');
const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const KEY_ID = process.env.KALSHI_KEY_ID;
const PRIVATE_KEY_PEM = process.env.KALSHI_PRIVATE_KEY;
const HOST = 'api.elections.kalshi.com';

function signRequest(method, path) {
  const timestamp = Date.now().toString();
  const msgString = timestamp + method.toUpperCase() + path.split('?')[0];
  const sign = crypto.createSign('SHA256');
  sign.update(msgString);
  const signature = sign.sign({
    key: PRIVATE_KEY_PEM,
    padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST
  }, 'base64');
  return { timestamp, signature };
}

function kalshiRequest(method, path, body, res) {
  const { timestamp, signature } = signRequest(method, path);
  const options = {
    hostname: HOST,
    path: path,
    method: method,
    headers: {
      'Content-Type': 'application/json',
      'KALSHI-ACCESS-KEY': KEY_ID,
      'KALSHI-ACCESS-TIMESTAMP': timestamp,
      'KALSHI-ACCESS-SIGNATURE': signature
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

app.get('/balance', (req, res) => kalshiRequest('GET', '/trade-api/v2/portfolio/balance', null, res));
app.get('/positions', (req, res) => kalshiRequest('GET', '/trade-api/v2/portfolio/positions', null, res));
app.get('/markets', (req, res) => {
  const limit = req.query.limit || 100;
  kalshiRequest('GET', `/trade-api/v2/markets?limit=${limit}&status=open`, null, res);
});
app.post('/place-order', (req, res) => kalshiRequest('POST', '/trade-api/v2/portfolio/orders', req.body, res));
app.get('/', (req, res) => res.json({ status: 'Kalshi proxy running' }));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Kalshi proxy running on port ${PORT}`));
