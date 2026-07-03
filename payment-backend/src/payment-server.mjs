import { minorUnits, postConfluxJson, verifyNotification } from "./conflux.mjs";

const MAX_BODY_BYTES = 1024 * 1024;

function htmlPage(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: light;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f6f7f8;
      color: #18211f;
    }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 32px 16px;
    }
    main {
      width: min(720px, 100%);
      background: #fff;
      border: 1px solid #dfe5e2;
      border-radius: 8px;
      padding: 28px;
      box-shadow: 0 18px 48px rgba(24, 33, 31, 0.08);
    }
    h1 {
      margin: 0 0 8px;
      font-size: clamp(24px, 4vw, 34px);
      line-height: 1.1;
    }
    p {
      line-height: 1.6;
      color: #51615d;
    }
    form {
      display: grid;
      gap: 16px;
      margin-top: 24px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
    }
    label {
      display: grid;
      gap: 6px;
      color: #2b3935;
      font-size: 14px;
      font-weight: 650;
    }
    input, select, textarea {
      box-sizing: border-box;
      width: 100%;
      min-height: 44px;
      border: 1px solid #cdd7d3;
      border-radius: 6px;
      padding: 10px 12px;
      font: inherit;
      color: #17211e;
      background: #fbfcfc;
    }
    textarea {
      min-height: 88px;
      resize: vertical;
    }
    button, a.button {
      min-height: 46px;
      border: 0;
      border-radius: 6px;
      padding: 11px 16px;
      font: inherit;
      font-weight: 750;
      color: #fff;
      background: #0b5c45;
      cursor: pointer;
      text-decoration: none;
      display: inline-grid;
      place-items: center;
    }
    .muted {
      color: #6a7774;
      font-size: 13px;
    }
    .error {
      border-color: #e6b0a5;
      background: #fff6f4;
      color: #8a2f22;
      padding: 12px 14px;
      border-radius: 6px;
    }
    code {
      background: #eef2f1;
      border-radius: 4px;
      padding: 2px 5px;
    }
    @media (max-width: 640px) {
      main {
        padding: 22px;
      }
      .grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <main>${body}</main>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function send(res, status, body, contentType = "text/plain; charset=utf-8", headers = {}) {
  res.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(body);
}

function sendHtml(res, status, title, body) {
  send(res, status, htmlPage(title, body), "text/html; charset=utf-8");
}

function redirect(res, location) {
  res.writeHead(303, {
    Location: location,
    "Cache-Control": "no-store",
  });
  res.end();
}

function wantsJson(req) {
  return String(req.headers.accept || "").includes("application/json");
}

async function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function parseBody(rawBody, contentType = "") {
  if (contentType.includes("application/json")) {
    return rawBody ? JSON.parse(rawBody) : {};
  }

  const params = new URLSearchParams(rawBody);
  return Object.fromEntries(params.entries());
}

function paymentForm(adminToken = "") {
  const hiddenAdminToken = adminToken
    ? `<input type="hidden" name="admin_token" value="${escapeHtml(adminToken)}">`
    : "";

  return `<h1>PepRoute payment</h1>
<p>Create a ConfluxAPI hosted checkout link. Card details are collected on the hosted checkout page.</p>
<form method="post" action="/api/checkout/create">
  ${hiddenAdminToken}
  <div class="grid">
    <label>
      Amount
      <input name="amount" inputmode="decimal" placeholder="849.00" required>
    </label>
    <label>
      Currency
      <select name="currency">
        <option value="USD" selected>USD</option>
        <option value="MYR">MYR</option>
        <option value="CNY">CNY</option>
      </select>
    </label>
  </div>
  <label>
    Description
    <textarea name="description" placeholder="Order payment" required></textarea>
  </label>
  <label>
    Merchant order number
    <input name="order_no" placeholder="Leave blank to auto-generate">
  </label>
  <div class="grid">
    <label>
      Customer email
      <input name="email" type="email" placeholder="buyer@example.com">
    </label>
    <label>
      Customer country
      <input name="country" placeholder="US">
    </label>
    <label>
      First name
      <input name="first_name" placeholder="Test">
    </label>
    <label>
      Last name
      <input name="last_name" placeholder="Buyer">
    </label>
  </div>
  <label>
    Phone
    <input name="phone" placeholder="+1234567890">
  </label>
  <button type="submit">Create checkout</button>
  <p class="muted">Use this only from your private admin link. Do not expose your API credentials in browser code.</p>
</form>`;
}

function statusPage(title, message) {
  return `<h1>${escapeHtml(title)}</h1>
<p>${escapeHtml(message)}</p>
<a class="button" href="/">Create another checkout</a>`;
}

function errorPage(message) {
  return `<h1>Payment error</h1>
<div class="error">${escapeHtml(message)}</div>
<p><a href="/">Back to payment form</a></p>`;
}

function autoOrderNo() {
  return `WEB_${new Date().toISOString().replace(/[-:.TZ]/g, "")}`;
}

function normalizePublicBaseUrl(publicBaseUrl) {
  return String(publicBaseUrl || "").replace(/\/$/, "");
}

function buildCheckoutPayload(form, config, publicBaseUrl) {
  const currency = String(form.currency || "USD").toUpperCase();
  const amount = minorUnits(form.amount, currency);
  const description = String(form.description || "Order payment").trim();
  const baseUrl = normalizePublicBaseUrl(publicBaseUrl);

  if (!baseUrl) {
    throw new Error("PUBLIC_BASE_URL is required");
  }

  return {
    mch_no: config.mchNo,
    gateway_no: config.gatewayNo,
    mch_order_no: String(form.order_no || "").trim() || autoOrderNo(),
    amount,
    currency,
    description,
    notify_url: `${baseUrl}/api/conflux/notify`,
    return_url: `${baseUrl}/payment/success`,
    cancel_url: `${baseUrl}/payment/cancel`,
    customer: {
      email: String(form.email || "test@example.com").trim(),
      country: String(form.country || "US").trim().toUpperCase(),
      first_name: String(form.first_name || "Test").trim(),
      last_name: String(form.last_name || "Buyer").trim(),
      phone: String(form.phone || "+1234567890").trim(),
    },
    custom_params: {
      source: "peproute_payment_backend",
    },
  };
}

function checkoutUrlFromResult(result) {
  return result?.data?.next_action?.url || result?.next_action?.url || result?.data?.checkout_url;
}

function isAuthorized({ adminToken, requestUrl, form = {}, req }) {
  if (!adminToken) return true;

  const providedToken =
    requestUrl.searchParams.get("token") ||
    form.admin_token ||
    req.headers["x-admin-token"];

  return providedToken === adminToken;
}

export function createPaymentServer({
  config,
  publicBaseUrl,
  adminToken = "",
  checkoutClient = (pathname, payload) => postConfluxJson(pathname, payload, config),
  logger = console,
}) {
  const processedNotifyIds = new Set();

  return async function paymentServer(req, res) {
    const requestUrl = new URL(req.url, "http://localhost");

    if (req.method === "GET" && (requestUrl.pathname === "/" || requestUrl.pathname === "/create-checkout")) {
      if (!isAuthorized({ adminToken, requestUrl, req })) {
        send(res, 401, "unauthorized");
        return;
      }

      sendHtml(res, 200, "PepRoute payment", paymentForm(adminToken));
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/healthz") {
      send(res, 200, "ok");
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/payment/success") {
      sendHtml(
        res,
        200,
        "Payment submitted",
        statusPage("Payment submitted", "Your payment was submitted. We will confirm the final payment status shortly."),
      );
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/payment/cancel") {
      sendHtml(
        res,
        200,
        "Payment canceled",
        statusPage("Payment canceled", "The hosted checkout was canceled. You can create a new payment link if needed."),
      );
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/checkout/create") {
      try {
        const rawBody = await readRequestBody(req);
        const form = parseBody(rawBody, String(req.headers["content-type"] || ""));

        if (!isAuthorized({ adminToken, requestUrl, form, req })) {
          send(res, 401, "unauthorized");
          return;
        }

        const payload = buildCheckoutPayload(form, config, publicBaseUrl);
        const result = await checkoutClient("/api/v1/checkout/create", payload);
        const checkoutUrl = checkoutUrlFromResult(result);

        if (!checkoutUrl) {
          throw new Error("ConfluxAPI did not return a hosted checkout URL");
        }

        if (wantsJson(req)) {
          send(res, 200, JSON.stringify({ checkout_url: checkoutUrl, result }, null, 2), "application/json; charset=utf-8");
          return;
        }

        redirect(res, checkoutUrl);
      } catch (error) {
        logger.error("Checkout create error:", error.message);
        if (wantsJson(req)) {
          send(
            res,
            400,
            JSON.stringify({ error: error.message }, null, 2),
            "application/json; charset=utf-8",
          );
          return;
        }
        sendHtml(res, 400, "Payment error", errorPage(error.message));
      }
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/conflux/notify") {
      try {
        const rawBody = await readRequestBody(req);
        const notify = JSON.parse(rawBody);

        if (!verifyNotification(notify, config.appSecret)) {
          send(res, 400, "invalid signature");
          return;
        }

        if (!processedNotifyIds.has(notify.notify_id)) {
          processedNotifyIds.add(notify.notify_id);

          if (notify.notify_type === "PAYMENT") {
            const data = notify.data || {};
            logger.log("Payment notification:", {
              notifyId: notify.notify_id,
              merchantOrderNo: data.mch_order_no,
              flowOrderNo: data.flow_order_no,
              tradeStatus: data.trade_status,
              amount: data.amount,
              currency: data.currency,
            });
          } else {
            logger.log("Conflux notification:", {
              notifyId: notify.notify_id,
              notifyType: notify.notify_type,
            });
          }
        }

        send(res, 200, "success");
      } catch (error) {
        logger.error("Webhook error:", error.message);
        send(res, 400, "bad request");
      }
      return;
    }

    send(res, 404, "not found");
  };
}
