const express = require('express');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
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
let PRIVATE_KEY_PEM;
try {
  PRIVATE_KEY_PEM = fs.readFileSync('/etc/secrets/private_key.pem', 'utf8').trim();
} catch(e) {
  PRIVATE_KEY_PEM = (process.env.KALSHI_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();
}

const HOST = 'api.elections.kalshi.com';

function kalshiRequest(method, path, body, res) {
  try {
    const timestamp = Date.now().toString();
    const msgString = timestamp + method.toUpperCase() + path.split('?')[0];
    
    const privateKey = crypto.createPrivateKey({
      key: PRIVATE_KEY_PEM,
      format: 'pem'
    });
    
    const sign = crypto.createSign('SHA256');
    sign.update(msgString);
    const signature = sign.sign({
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST
    }, 'base64');

    const options = {
      hostname: HOST, path, method,
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
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}

app.get('/debug', (req, res) => {
  res.json({
    key_id_set: !!KEY_ID,
    private_key_length: (PRIVATE_KEY_PEM || '').length,
    has_begin: (PRIVATE_KEY_PEM || '').includes('BEGIN')
  });
});

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
