import assert from "node:assert/strict";
import {
  signNotification,
  signRequest,
  verifyNotification,
} from "./conflux.mjs";

const appSecret = "test_secret";
const requestSign = signRequest({
  appId: "app_123",
  timestamp: "1704067200000",
  nonce: "nonce_001",
  requestBody: '{"mch_order_no":"ORDER_001","amount":100,"currency":"USD"}',
  appSecret,
});

assert.equal(typeof requestSign, "string");
assert.ok(requestSign.length > 20);

const dataRaw =
  '{"mch_order_no":"ORDER_001","flow_order_no":"FLW001","trade_status":"SUCCESS","amount":100,"currency":"USD","complete_time":1704067200000}';

const notify = {
  notify_type: "PAYMENT",
  notify_id: "NT_001",
  timestamp: 1704067200000,
  nonce: "random_string_001",
  data: JSON.parse(dataRaw),
  data_raw: dataRaw,
};

notify.sign = signNotification({
  timestamp: notify.timestamp,
  nonce: notify.nonce,
  dataRaw: notify.data_raw,
  appSecret,
});

assert.equal(verifyNotification(notify, appSecret), true);
assert.equal(verifyNotification({ ...notify, sign: "bad" }, appSecret), false);

console.log("Signature self-test passed.");
