# PepRoute ConfluxAPI payment backend

This is a small Node.js backend for ConfluxAPI hosted checkout.

It provides:

- Private admin payment form
- Hosted checkout order creation
- Payment success and cancel pages
- ConfluxAPI webhook endpoint with signature verification
- Order query and signature test scripts

## Routes

```text
GET  /                         Admin checkout form
GET  /?token=YOUR_ADMIN_TOKEN  Admin checkout form when ADMIN_TOKEN is enabled
POST /api/checkout/create      Create hosted checkout and redirect customer
POST /api/conflux/notify       ConfluxAPI payment notification webhook
GET  /payment/success          Hosted checkout return page
GET  /payment/cancel           Hosted checkout cancel page
GET  /healthz                  Deployment health check
```

## Setup

Copy the example env file:

```bash
cp .env.example .env
```

Fill these values:

```bash
CONFLUX_BASE_URL=https://sandbox-api.confluxapi.com
CONFLUX_MCH_NO=10051
CONFLUX_GATEWAY_NO=10051001
CONFLUX_APP_ID=your_app_id
CONFLUX_APP_SECRET=your_app_secret
PUBLIC_BASE_URL=https://pay.peproute.com
ADMIN_TOKEN=your_private_admin_token
PORT=8787
```

Do not commit `.env`.

## Local commands

```bash
npm test
npm run server
npm run checkout
npm run query -- YOUR_MERCHANT_ORDER_NO
```

Open the local admin form:

```text
http://localhost:8787/?token=your_private_admin_token
```

## Deploying with pay.peproute.com

Keep `www.peproute.com` on GitHub Pages. Deploy this backend on a separate subdomain:

```text
pay.peproute.com
```

Recommended first deployment path:

1. Push this folder to a private GitHub repository.
2. Create a Render web service from the repo.
3. Use `render.yaml`, or set these manually:

```text
Build command: npm install
Start command: npm run server
Health check path: /healthz
```

4. Add environment variables in Render:

```text
CONFLUX_BASE_URL=https://sandbox-api.confluxapi.com
CONFLUX_MCH_NO=10051
CONFLUX_GATEWAY_NO=10051001
CONFLUX_APP_ID=...
CONFLUX_APP_SECRET=...
PUBLIC_BASE_URL=https://pay.peproute.com
ADMIN_TOKEN=make-a-long-random-password
```

5. In your DNS provider, add a CNAME record:

```text
Name: pay
Type: CNAME
Value: your-render-service.onrender.com
```

Render will show the exact target value after the service is created.

## ConfluxAPI URLs

Use these after deployment:

```text
Notify URL: https://pay.peproute.com/api/conflux/notify
Return URL: https://pay.peproute.com/payment/success
Cancel URL: https://pay.peproute.com/payment/cancel
Admin form: https://pay.peproute.com/?token=YOUR_ADMIN_TOKEN
```

## Production switch

When production credentials arrive, change only the environment variables:

```bash
CONFLUX_BASE_URL=https://api.confluxapi.com
CONFLUX_MCH_NO=...
CONFLUX_GATEWAY_NO=...
CONFLUX_APP_ID=...
CONFLUX_APP_SECRET=...
PUBLIC_BASE_URL=https://pay.peproute.com
```

The request signing and webhook verification logic stays the same.
