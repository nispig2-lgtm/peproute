import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export function loadDotEnv(filePath = ".env") {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) return;

  const content = fs.readFileSync(absolutePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const equalsIndex = line.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) process.env[key] = value;
  }
}

export function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function optionalEnv(name, fallback) {
  return process.env[name] || fallback;
}

export function randomNonce(bytes = 16) {
  return crypto.randomBytes(bytes).toString("hex");
}

export function minorUnits(amount, currency = "USD") {
  const normalizedCurrency = currency.toUpperCase();
  const zeroDecimalCurrencies = new Set(["JPY", "KRW", "VND"]);
  const factor = zeroDecimalCurrencies.has(normalizedCurrency) ? 1 : 100;
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid amount: ${amount}`);
  }
  return Math.round(value * factor);
}

export function signRequest({ appId, timestamp, nonce, requestBody, appSecret }) {
  const signContent = `${appId}${timestamp}${nonce}${requestBody}`;
  return crypto
    .createHmac("sha256", appSecret)
    .update(signContent, "utf8")
    .digest("base64");
}

export function signNotification({ timestamp, nonce, dataRaw, appSecret }) {
  const signContent = `${String(timestamp)}${nonce}${dataRaw}`;
  return crypto
    .createHmac("sha256", appSecret)
    .update(signContent, "utf8")
    .digest("hex");
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a), "utf8");
  const right = Buffer.from(String(b), "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function verifyNotification(notify, appSecret) {
  if (!notify || typeof notify !== "object") return false;
  if (!notify.timestamp || !notify.nonce || !notify.sign) return false;

  const dataRaw =
    typeof notify.data_raw === "string"
      ? notify.data_raw
      : JSON.stringify(notify.data ?? {});

  const expectedSign = signNotification({
    timestamp: notify.timestamp,
    nonce: notify.nonce,
    dataRaw,
    appSecret,
  });

  return safeEqual(expectedSign, notify.sign);
}

export function loadConfig() {
  loadDotEnv();
  return {
    baseUrl: optionalEnv("CONFLUX_BASE_URL", "https://sandbox-api.confluxapi.com"),
    mchNo: requiredEnv("CONFLUX_MCH_NO"),
    gatewayNo: requiredEnv("CONFLUX_GATEWAY_NO"),
    appId: requiredEnv("CONFLUX_APP_ID"),
    appSecret: requiredEnv("CONFLUX_APP_SECRET"),
  };
}

export async function postConfluxJson(pathname, payload, config = loadConfig()) {
  const url = new URL(pathname, config.baseUrl);
  const requestBody = JSON.stringify(payload);
  const timestamp = String(Date.now());
  const nonce = randomNonce();
  const sign = signRequest({
    appId: config.appId,
    timestamp,
    nonce,
    requestBody,
    appSecret: config.appSecret,
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-App-Id": config.appId,
      "X-Timestamp": timestamp,
      "X-Nonce": nonce,
      "X-Signature": sign,
    },
    body: requestBody,
    signal: AbortSignal.timeout(30000),
  });

  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!response.ok) {
    const error = new Error(`ConfluxAPI HTTP ${response.status}`);
    error.status = response.status;
    error.body = text;
    throw error;
  }

  return json ?? text;
}

export function printJson(label, value) {
  console.log(label);
  console.log(JSON.stringify(value, null, 2));
}
