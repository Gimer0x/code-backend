# Stripe Webhook Local Development Setup

## Prerequisites

1. Install Stripe CLI: https://stripe.com/docs/stripe-cli
2. Authenticate with Stripe: `stripe login`

## Quick Setup

### Step 1: Install Stripe CLI

**macOS:**
```bash
brew install stripe/stripe-cli/stripe
```

**Other platforms:** See https://stripe.com/docs/stripe-cli

### Step 2: Login to Stripe
```bash
stripe login
```

This will open your browser to authenticate.

### Step 3: Forward Webhooks to Local Server

Run this command in a separate terminal (keep it running):

```bash
stripe listen --forward-to localhost:3002/api/user-auth/stripe/webhook
```

**Note:** Replace `3002` with your backend port if different.

### Step 4: Copy Webhook Signing Secret

After running `stripe listen`, you'll see output like:

```
> Ready! Your webhook signing secret is whsec_xxxxxxxxxxxxx (^C to quit)
```

Copy this secret and add it to your `.env` file:

```env
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
```

### Step 5: Restart Your Backend Server

Restart your backend so it picks up the new webhook secret.

## Testing

1. Start your backend server: `npm run dev` or `npm start`
2. In another terminal, run: `stripe listen --forward-to localhost:3002/api/user-auth/stripe/webhook`
3. Test webhook by triggering a test event:
   ```bash
   stripe trigger checkout.session.completed
   ```
4. Check your backend logs for webhook processing messages

## Alternative: Test Mode Webhooks

If you're using Stripe test mode, you can also:

1. Go to Stripe Dashboard → Developers → Webhooks
2. Add endpoint: `http://localhost:3002/api/user-auth/stripe/webhook` (won't work directly)
3. Use Stripe CLI as shown above (recommended for local dev)

## Troubleshooting

### Webhook not receiving events?
- Make sure `stripe listen` is running
- Check that the port matches your backend (`3002` by default)
- Verify `STRIPE_WEBHOOK_SECRET` is set correctly

### Signature verification fails?
- Make sure you're using the secret from `stripe listen` output
- Restart backend after updating `.env`

### Events not processing?
- Check backend logs for `[Stripe Webhook]` messages
- Verify events are being forwarded: Check `stripe listen` output

