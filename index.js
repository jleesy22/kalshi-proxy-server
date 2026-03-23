import express from "express";
import cors from "cors";
import crypto from "crypto";
const app = express();
const PORT = process.env.PORT || 3000;
const KALSHI_BASE = "https://api.elections.kalshi.com/trade-api/v2";
const KALSHI_PATH_PREFIX = "/trade-api/v2";
app.use(cors({ origin: "*", methods: ["GET", "POST", "OPTIONS"] }));
app.options("*", cors());
app.use(express.json());
function buildAuthHeaders(keyId, privateKey, method, path) {
  const normalizedKey = privateKey.replace(/\\n/g, "\n").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").map((line) => line.trim()).filter((line) => line.length > 0).join("\n").trim();
  const timestamp = Date.now().toString();
  const pathWithoutQuery = path.split("?")[0];
  const fullPath = KALSHI_PATH_PREFIX + pathWithoutQuery;
  const message = timestamp + method.toUpperCase() + fullPath;
  const privateKeyObj = crypto.createPrivateKey({ key: normalizedKey, format: "pem" });
  const signatureBuffer = crypto.sign("sha256", Buffer.from(message), { key: privateKeyObj, padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 });
  return { "KALSHI-ACCESS-KEY": keyId, "KALSHI-ACCESS-SIGNATURE": signatureBuffer.toString("base64"), "KALSHI-ACCESS-TIMESTAMP": timestamp, "Content-Type": "application/json" };
}
async function kalshiRequest(method, path, keyId, privateKey, body) {
  const headers = buildAuthHeaders(keyId, privateKey, method, path);
  const options = { method, headers };
  if (body && method !== "GET") { options.body = JSON.stringify(body); }
  const res = await fetch(`${KALSHI_BASE}${path}`, options);
  const data = await res.json();
  return { status: res.status, data };
}
app.post("/balance", async (req, res) => {
  const { keyId, privateKey } = req.body;
  if (!keyId || !privateKey) return res.status(400).json({ error: "keyId and privateKey are required" });
  try { const result = await kalshiRequest("GET", "/portfolio/balance", keyId, privateKey); res.status(result.status).json(result.data); }
  catch (err) { res.status(500).json({ error: "Failed to fetch balance", detail: err.message }); }
});
app.post("/positions", async (req, res) => {
  const { keyId, privateKey } = req.body;
  if (!keyId || !privateKey) return res.status(400).json({ error: "keyId and privateKey are required" });
  try { const result = await kalshiRequest("GET", "/portfolio/positions", keyId, privateKey); res.status(result.status).json(result.data); }
  catch (err) { res.status(500).json({ error: "Failed to fetch positions", detail: err.message }); }
});
app.post("/markets", async (req, res) => {
  const { keyId, privateKey } = req.body;
  if (!keyId || !privateKey) return res.status(400).json({ error: "keyId and privateKey are required" });
  try { const result = await kalshiRequest("GET", "/markets?status=open&limit=100", keyId, privateKey); res.status(result.status).json(result.data); }
  catch (err) { res.status(500).json({ error: "Failed to fetch markets", detail: err.message }); }
});
app.post("/place-order", async (req, res) => {
  const { keyId, privateKey, ticker, side, count, price } = req.body;
  if (!keyId || !privateKey || !ticker || !side || count == null || price == null) return res.status(400).json({ error: "Missing required fields" });
  try {
    const orderBody = { ticker, side, count, type: "limit", yes_price: side === "yes" ? price : 100 - price, no_price: side === "no" ? price : 100 - price, action: "buy" };
    const result = await kalshiRequest("POST", "/portfolio/orders", keyId, privateKey, orderBody);
    res.status(result.status).json(result.data);
  }
  catch (err) { res.status(500).json({ error: "Failed to place order", detail: err.message }); }
});
app.get("/health", (req, res) => res.json({ status: "ok" }));
app.listen(PORT, () => console.log(`Kalshi proxy running on port ${PORT}`));
