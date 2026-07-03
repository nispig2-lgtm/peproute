import http from "node:http";

import { loadConfig, optionalEnv } from "./conflux.mjs";
import { createPaymentServer } from "./payment-server.mjs";

const config = loadConfig();
const port = Number(optionalEnv("PORT", "8787"));
const publicBaseUrl = optionalEnv("PUBLIC_BASE_URL", `http://localhost:${port}`);
const adminToken = optionalEnv("ADMIN_TOKEN", "");

const server = http.createServer(
  createPaymentServer({
    config,
    publicBaseUrl,
    adminToken,
  }),
);

server.listen(port, () => {
  console.log(`Payment server listening on http://localhost:${port}`);
  console.log(`Public base URL: ${publicBaseUrl}`);
  console.log(`Webhook URL: ${publicBaseUrl.replace(/\/$/, "")}/api/conflux/notify`);
  if (adminToken) {
    console.log(`Admin form: ${publicBaseUrl.replace(/\/$/, "")}/?token=${encodeURIComponent(adminToken)}`);
  }
});
