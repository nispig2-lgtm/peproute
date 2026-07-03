import assert from "node:assert/strict";
import { once } from "node:events";
import http from "node:http";
import test from "node:test";

import { signNotification } from "./conflux.mjs";
import { createPaymentServer } from "./payment-server.mjs";

const config = {
  baseUrl: "https://sandbox-api.confluxapi.com",
  mchNo: "10051",
  gatewayNo: "10051001",
  appId: "app_test",
  appSecret: "secret_test",
};

async function withServer(handler, fn) {
  const server = http.createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const { port } = server.address();
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("creates hosted checkout orders from the payment form", async () => {
  let capturedPayload;
  const handler = createPaymentServer({
    config,
    publicBaseUrl: "https://pay.peproute.com",
    checkoutClient: async (pathname, payload) => {
      capturedPayload = { pathname, payload };
      return {
        success: true,
        data: {
          next_action: {
            type: "redirect",
            url: "https://sandbox-api.confluxapi.com/hosted-checkout?checkout_token=test_token",
          },
        },
      };
    },
  });

  await withServer(handler, async (baseUrl) => {
    const form = new URLSearchParams({
      amount: "12.34",
      currency: "USD",
      description: "Test order",
      email: "buyer@example.com",
      country: "US",
      first_name: "Test",
      last_name: "Buyer",
      phone: "+1234567890",
    });

    const response = await fetch(`${baseUrl}/api/checkout/create`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
      redirect: "manual",
    });

    assert.equal(response.status, 303);
    assert.equal(
      response.headers.get("location"),
      "https://sandbox-api.confluxapi.com/hosted-checkout?checkout_token=test_token",
    );
  });

  assert.equal(capturedPayload.pathname, "/api/v1/checkout/create");
  assert.equal(capturedPayload.payload.amount, 1234);
  assert.equal(capturedPayload.payload.currency, "USD");
  assert.equal(capturedPayload.payload.notify_url, "https://pay.peproute.com/api/conflux/notify");
  assert.equal(capturedPayload.payload.return_url, "https://pay.peproute.com/payment/success");
  assert.equal(capturedPayload.payload.cancel_url, "https://pay.peproute.com/payment/cancel");
  assert.equal(capturedPayload.payload.customer.email, "buyer@example.com");
});

test("accepts signed Conflux notifications and rejects invalid signatures", async () => {
  const dataRaw =
    '{"mch_order_no":"ORDER_001","flow_order_no":"FLW001","trade_status":"SUCCESS","amount":100,"currency":"USD"}';
  const signedNotify = {
    notify_type: "PAYMENT",
    notify_id: "NT_001",
    timestamp: 1704067200000,
    nonce: "random_string_001",
    data: JSON.parse(dataRaw),
    data_raw: dataRaw,
  };
  signedNotify.sign = signNotification({
    timestamp: signedNotify.timestamp,
    nonce: signedNotify.nonce,
    dataRaw,
    appSecret: config.appSecret,
  });

  const handler = createPaymentServer({
    config,
    publicBaseUrl: "https://pay.peproute.com",
    checkoutClient: async () => {
      throw new Error("checkout should not be called");
    },
  });

  await withServer(handler, async (baseUrl) => {
    const okResponse = await fetch(`${baseUrl}/api/conflux/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(signedNotify),
    });

    assert.equal(okResponse.status, 200);
    assert.equal(await okResponse.text(), "success");

    const badResponse = await fetch(`${baseUrl}/api/conflux/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...signedNotify, sign: "bad" }),
    });

    assert.equal(badResponse.status, 400);
    assert.equal(await badResponse.text(), "invalid signature");
  });
});

test("serves payment status pages", async () => {
  const handler = createPaymentServer({
    config,
    publicBaseUrl: "https://pay.peproute.com",
    checkoutClient: async () => {
      throw new Error("checkout should not be called");
    },
  });

  await withServer(handler, async (baseUrl) => {
    const successResponse = await fetch(`${baseUrl}/payment/success`);
    const cancelResponse = await fetch(`${baseUrl}/payment/cancel`);

    assert.equal(successResponse.status, 200);
    assert.match(await successResponse.text(), /Payment submitted/);
    assert.equal(cancelResponse.status, 200);
    assert.match(await cancelResponse.text(), /Payment canceled/);
  });
});

test("protects checkout creation when an admin token is configured", async () => {
  const handler = createPaymentServer({
    config,
    publicBaseUrl: "https://pay.peproute.com",
    adminToken: "private-token",
    checkoutClient: async () => {
      throw new Error("checkout should not be called");
    },
  });

  await withServer(handler, async (baseUrl) => {
    const deniedForm = await fetch(`${baseUrl}/`);
    assert.equal(deniedForm.status, 401);

    const allowedForm = await fetch(`${baseUrl}/?token=private-token`);
    assert.equal(allowedForm.status, 200);
    assert.match(await allowedForm.text(), /name="admin_token" value="private-token"/);

    const deniedCreate = await fetch(`${baseUrl}/api/checkout/create`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ amount: "1.00", currency: "USD" }),
      redirect: "manual",
    });
    assert.equal(deniedCreate.status, 401);
  });
});
