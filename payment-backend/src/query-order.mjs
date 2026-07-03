import { loadConfig, postConfluxJson, printJson } from "./conflux.mjs";

const orderNo = process.argv[2];
if (!orderNo) {
  console.error("Usage: npm run query -- YOUR_MERCHANT_ORDER_NO");
  process.exit(1);
}

const config = loadConfig();
const result = await postConfluxJson(
  "/api/v1/query",
  {
    mch_order_no: orderNo,
  },
  config,
);

printJson("Order query result:", result);
