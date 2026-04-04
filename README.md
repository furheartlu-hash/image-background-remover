# Background Remover — Cloudflare Pages + Workers

Remove image backgrounds instantly using remove.bg AI.

## Project Structure

```
image-background-remover/
├── index.html                          # Frontend (single page)
├── worker.js                           # Legacy Cloudflare Worker (kept for reference)
├── wrangler.toml                       # Cloudflare config
├── schema.sql                          # D1 database schema
├── README.md
└── functions/
    ├── auth/
    │   ├── google.js                   # OAuth login entry
    │   ├── callback.js                 # OAuth callback (creates user, sets credits=5)
    │   └── logout.js
    └── api/
        ├── me.js                       # Get current user info
        ├── remove-bg.js                # Remove background (credits-gated)
        ├── paypal-create-order.js      # Create PayPal order
        └── paypal-capture-order.js     # Capture PayPal payment, top up credits
```

## User Plans

| Plan         | Price      | Credits       | Resolution |
|---|---|---|---|
| Free         | $0         | 5 (one-time)  | Preview    |
| Pay-as-you-go| $5         | 20 (no expiry)| Full       |
| Basic        | $7/month   | 30/month      | Full       |
| Pro          | $25/month  | 100/month     | Full       |
| Business     | $65/month  | 300/month     | 4K         |

## Setup

### 1. Database

Run `schema.sql` in your Cloudflare D1 console:

```
Cloudflare Dashboard → D1 → image-background-remover → Console → paste schema.sql
```

### 2. Configure Secrets

Run these commands (never put real keys in code or README):

```bash
wrangler secret put REMOVE_BG_API_KEY
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put PAYPAL_CLIENT_ID
wrangler secret put PAYPAL_CLIENT_SECRET
```

### 3. PayPal Setup

1. Go to https://developer.paypal.com → My Apps & Credentials
2. Create a new app → get Client ID and Secret
3. Switch to Live mode when ready (Sandbox for testing)

### 4. Deploy

```bash
# Install Wrangler
npm install -g wrangler
wrangler login

# Deploy
wrangler deploy
```

### 5. Cloudflare Pages

1. Dashboard → Pages → Create project → Connect GitHub repo
2. Build command: *(leave empty)*
3. Build output directory: `/`
4. Deploy

## Notes

- Free users get **preview resolution** (same AI quality, lower pixel size) — drives upgrade motivation
- Paid users get **full / 4K resolution**
- Credits are deducted only on successful API response
- PayPal payment capture happens server-side via redirect callback
