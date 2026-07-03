import {
  loadConfig,
  minorUnits,
  optionalEnv,
  postConfluxJson,
  printJson,
} from "./conflux.mjs";

const config = loadConfig();
const orderNo =
  process.argv[2] ||
  optionalEnv("CHECKOUT_ORDER_NO", `TEST_${new Date().toISOString().replace(/[-:.TZ]/g, "")}`);
const currency = optionalEnv("CHECKOUT_CURRENCY", "USD").toUpperCase();
const amount = minorUnits(process.argv[3] || optionalEnv("CHECKOUT_AMOUNT_USD", "1.00"), currency);
const publicBaseUrl = optionalEnv("PUBLIC_BASE_URL", "https://your-public-domain.example").replace(/\/$/, "");

const payload = {
  mch_no: config.mchNo,
  gateway_no: config.gatewayNo,
  mch_order_no: orderNo,
  amount,
  currency,
  description: optionalEnv("CHECKOUT_DESCRIPTION", "Order payment"),
  notify_url: `${publicBaseUrl}/api/conflux/notify`,
  return_url: `${publicBaseUrl}/payment/success`,
  cancel_url: `${publicBaseUrl}/payment/cancel`,
  customer: {
    email: optionalEnv("TEST_CUSTOMER_EMAIL", "test@example.com"),
    country: optionalEnv("TEST_CUSTOMER_COUNTRY", "US"),
    first_name: optionalEnv("TEST_CUSTOMER_FIRST_NAME", "Test"),
    last_name: optionalEnv("TEST_CUSTOMER_LAST_NAME", "Buyer"),
    phone: optionalEnv("TEST_CUSTOMER_PHONE", "+1234567890"),
  },
  custom_params: {
    source: "codex_sandbox_template",
  },
};

const result = await postConfluxJson("/api/v1/checkout/create", payload, config);

printJson("Checkout created:", {
  orderNo,
  amount,
  currency,
  result,
});
