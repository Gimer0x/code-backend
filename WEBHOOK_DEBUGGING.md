# Webhook Debugging Guide

## Quick Checklist

1. ✅ **Stripe CLI is running** in a separate terminal
2. ✅ **Backend server is running** 
3. ✅ **STRIPE_WEBHOOK_SECRET** is set in `.env` (from `stripe listen` output)
4. ✅ **Backend logs show webhook messages** when events are received

## Debugging Steps

### Step 1: Verify Stripe CLI is Running

```bash
# Check if stripe listen is running
# You should see output like:
# > Ready! Your webhook signing secret is whsec_...
```

### Step 2: Check Backend Logs

When you complete a payment, check your backend console. You should see:

```
[Stripe Webhook] Received event, signature: present
[Stripe Webhook] Signature verified successfully. Event ID: evt_...
[Stripe Webhook] Processing event type: checkout.session.completed
[Stripe Webhook] Checkout session completed: { sessionId: '...', ... }
[Stripe Webhook] Registering paid plan: { userId: '...', plan: 'MONTHLY', ... }
[Stripe Webhook] Successfully registered paid plan for user: user@example.com
```

**If you DON'T see these logs:**
- Stripe CLI is not forwarding events
- Check Stripe CLI terminal for errors
- Verify the port matches (3002)

### Step 3: Test Webhook Manually

In the Stripe CLI terminal, trigger a test event:

```bash
stripe trigger checkout.session.completed
```

You should see in Stripe CLI:
```
2024-01-XX XX:XX:XX   --> checkout.session.completed [evt_...]
2024-01-XX XX:XX:XX  <--  [200] POST http://localhost:3002/api/user-auth/stripe/webhook [evt_...]
```

And in your backend logs:
```
[Stripe Webhook] Received event, signature: present
[Stripe Webhook] Processing event type: checkout.session.completed
```

### Step 4: Check Environment Variables

Verify your `.env` has:

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...  # From stripe listen output
STRIPE_PRICE_MONTHLY=price_...
STRIPE_PRICE_YEARLY=price_...
```

### Step 5: Verify Webhook Endpoint

The endpoint should be accessible:
```bash
curl -X POST http://localhost:3002/api/user-auth/stripe/webhook \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'
```

This should return an error (signature missing), but confirms endpoint is reachable.

## Common Issues

### Issue: No webhook logs in backend
**Solution:** 
- Make sure `stripe listen` is running
- Check Stripe CLI terminal for forwarding messages
- Verify port matches (3002)

### Issue: Signature verification fails
**Solution:**
- Make sure `STRIPE_WEBHOOK_SECRET` matches the secret from `stripe listen`
- Restart backend after updating `.env`
- Don't use webhook secret from Stripe Dashboard (use CLI secret)

### Issue: Webhook received but subscription not updated
**Solution:**
- Check backend logs for errors
- Verify user lookup is working (check logs for "User not found")
- Check database to see if subscription was updated

### Issue: Events not being sent
**Solution:**
- Make sure you're using Stripe test mode
- Complete a test payment in test mode
- Check Stripe Dashboard → Events to see if events were created

## Manual Test

After completing a test payment:

1. Check Stripe Dashboard → Events
2. Look for `checkout.session.completed` event
3. Check if webhook was sent (if using Stripe Dashboard webhook)
4. Or check Stripe CLI terminal for forwarded events

## Verify Subscription Update

After webhook processes, check database:

```sql
SELECT email, "subscriptionPlan", "subscriptionStatus", "isPremium", 
       "subscriptionStartsAt", "subscriptionEndsAt"
FROM users 
WHERE email = 'your-email@example.com';
```

