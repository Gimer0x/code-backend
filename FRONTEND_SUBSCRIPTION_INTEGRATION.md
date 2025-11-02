# Frontend Subscription Integration Guide

This guide provides everything the frontend needs to integrate with the paid plan subscription service.

## Overview

The subscription system supports:
- **Monthly** subscriptions
- **Yearly** subscriptions
- Automatic Stripe payment processing
- Webhook-based subscription updates
- Subscription status checking

## API Endpoints

### 1. Start Subscription Checkout

**Endpoint:** `POST /api/user-auth/subscribe/start`

**Authentication:** Required (Bearer token)

**Request Body:**
```typescript
{
  plan: 'MONTHLY' | 'YEARLY';  // Required
  successUrl?: string;          // Optional, defaults to FRONTEND_URL/billing/success
  cancelUrl?: string;           // Optional, defaults to FRONTEND_URL/billing/cancel
}
```

**Response (Success):**
```typescript
{
  success: true;
  checkoutUrl: string;  // Stripe Checkout URL - redirect user here
  sessionId: string;   // Stripe session ID for tracking
}
```

**Response (Error):**
```typescript
{
  success: false;
  error: string;
  code: 'STRIPE_NOT_CONFIGURED' | 'USER_NOT_FOUND' | 'SUBSCRIPTION_START_FAILED';
}
```

**Example:**
```typescript
      const response = await fetch('/api/user-auth/subscribe/start', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    plan: 'MONTHLY'
  })
});

const data = await response.json();
if (data.success) {
  // Redirect user to Stripe Checkout
  window.location.href = data.checkoutUrl;
}
```

---

### 2. Get Subscription Status

**Endpoint:** `GET /api/user-auth/subscription`

**Authentication:** Required (Bearer token)

**Response (Success):**
```typescript
{
  success: true;
  subscription: {
    plan: 'FREE' | 'MONTHLY' | 'YEARLY';
    status: 'ACTIVE' | 'INACTIVE' | 'CANCELED' | 'PAST_DUE' | 'TRIALING';
    isPremium: boolean;
    startsAt: string | null;        // ISO 8601 date string
    endsAt: string | null;          // ISO 8601 date string
    trialEndsAt: string | null;     // ISO 8601 date string
    stripeSubscriptionId: string | null;
    hasActivePlan: boolean;         // Computed: true if plan is active and not expired
  };
}
```

**Response (Error):**
```typescript
{
  success: false;
  error: string;
  code: 'USER_NOT_FOUND' | 'SUBSCRIPTION_STATUS_FAILED';
  details?: string;
}
```

**Example:**
```typescript
const response = await fetch('/api/user-auth/subscription', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const data = await response.json();
if (data.success) {
  const { subscription } = data;
  console.log(`Plan: ${subscription.plan}`);
  console.log(`Active: ${subscription.hasActivePlan}`);
  console.log(`Ends: ${subscription.endsAt}`);
}
```

---

### 3. Stripe Webhook (Backend Only)

**Endpoint:** `POST /api/user-auth/stripe/webhook`

**Note:** This is handled automatically by Stripe. The frontend doesn't need to call this directly.

The webhook handles:
- `checkout.session.completed` - New subscription created
- `customer.subscription.updated` - Subscription renewed or changed
- `customer.subscription.deleted` - Subscription canceled
- `invoice.payment_succeeded` - Payment successful (renewal)
- `invoice.payment_failed` - Payment failed

---

## TypeScript Types

```typescript
// Subscription Plan Types
type SubscriptionPlan = 'FREE' | 'MONTHLY' | 'YEARLY';

type SubscriptionStatus = 
  | 'ACTIVE' 
  | 'INACTIVE' 
  | 'CANCELED' 
  | 'PAST_DUE' 
  | 'TRIALING';

// Subscription Response
interface SubscriptionResponse {
  success: boolean;
  subscription?: {
    plan: SubscriptionPlan;
    status: SubscriptionStatus;
    isPremium: boolean;
    startsAt: string | null;
    endsAt: string | null;
    trialEndsAt: string | null;
    stripeSubscriptionId: string | null;
    hasActivePlan: boolean;
  };
  error?: string;
  code?: string;
  details?: string;
}

// Checkout Request
interface CheckoutRequest {
  plan: 'MONTHLY' | 'YEARLY';
  successUrl?: string;
  cancelUrl?: string;
}

// Checkout Response
interface CheckoutResponse {
  success: boolean;
  checkoutUrl?: string;
  sessionId?: string;
  error?: string;
  code?: string;
}
```

---

## Complete Flow Example

### Flow 1: User Subscribes to Monthly Plan

```typescript
async function subscribeToPlan(plan: 'MONTHLY' | 'YEARLY') {
  try {
    // 1. Start checkout session
    const response = await fetch('/api/user-auth/subscribe/start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ plan })
    });

    const data: CheckoutResponse = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to start checkout');
    }

    // 2. Redirect to Stripe Checkout
    window.location.href = data.checkoutUrl!;
    
  } catch (error) {
    console.error('Subscription error:', error);
    // Show error to user
  }
}
```

### Flow 2: Handle Stripe Redirect

```typescript
// In your success page (/billing/success)
useEffect(() => {
  async function verifySubscription() {
    // Wait a moment for webhook to process
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const response = await fetch('/api/user-auth/subscription', {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    const data: SubscriptionResponse = await response.json();
    
    if (data.success && data.subscription?.hasActivePlan) {
      // Show success message
      // Redirect to dashboard
    } else {
      // Show "processing" message or error
    }
  }

  verifySubscription();
}, []);
```

### Flow 3: Check Subscription Status

```typescript
async function checkSubscriptionStatus(): Promise<SubscriptionResponse> {
  const response = await fetch('/api/user-auth/subscription', {
    headers: {
      'Authorization': `Bearer ${authToken}`
    }
  });

  return await response.json();
}

// Usage
const subscription = await checkSubscriptionStatus();
if (subscription.success && subscription.subscription) {
  const { plan, hasActivePlan, endsAt } = subscription.subscription;
  
  if (hasActivePlan) {
    console.log(`Active ${plan} subscription until ${endsAt}`);
  } else {
    console.log('No active subscription');
  }
}
```

---

## React Component Examples

### Subscription Status Component

```typescript
import { useEffect, useState } from 'react';

interface SubscriptionStatusProps {
  token: string;
}

export function SubscriptionStatus({ token }: SubscriptionStatusProps) {
  const [subscription, setSubscription] = useState<SubscriptionResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSubscription() {
      try {
        const response = await fetch('/api/user-auth/subscription', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        const data = await response.json();
        setSubscription(data);
      } catch (error) {
        console.error('Failed to fetch subscription:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchSubscription();
  }, [token]);

  if (loading) return <div>Loading subscription...</div>;
  if (!subscription?.success || !subscription.subscription) {
    return <div>No subscription found</div>;
  }

  const { plan, status, hasActivePlan, endsAt, startsAt } = subscription.subscription;

  return (
    <div className="subscription-status">
      <h3>Subscription Details</h3>
      <p>Plan: <strong>{plan}</strong></p>
      <p>Status: <strong>{status}</strong></p>
      <p>Active: {hasActivePlan ? '✅ Yes' : '❌ No'}</p>
      {startsAt && <p>Started: {new Date(startsAt).toLocaleDateString()}</p>}
      {endsAt && <p>Ends: {new Date(endsAt).toLocaleDateString()}</p>}
    </div>
  );
}
```

### Subscribe Button Component

```typescript
interface SubscribeButtonProps {
  plan: 'MONTHLY' | 'YEARLY';
  token: string;
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

export function SubscribeButton({ plan, token, onSuccess, onError }: SubscribeButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleSubscribe = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/user-auth/subscribe/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ plan })
      });

      const data: CheckoutResponse = await response.json();

      if (data.success && data.checkoutUrl) {
        // Redirect to Stripe Checkout
        window.location.href = data.checkoutUrl;
        onSuccess?.();
      } else {
        throw new Error(data.error || 'Failed to start checkout');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      onError?.(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button 
      onClick={handleSubscribe} 
      disabled={loading}
      className="subscribe-button"
    >
      {loading ? 'Processing...' : `Subscribe ${plan}`}
    </button>
  );
}
```

---

## Error Handling

### Common Error Codes

| Code | Description | Action |
|------|-------------|--------|
| `STRIPE_NOT_CONFIGURED` | Stripe is not set up | Contact admin |
| `USER_NOT_FOUND` | User doesn't exist | Log out and log back in |
| `SUBSCRIPTION_START_FAILED` | Checkout failed | Retry or contact support |
| `SUBSCRIPTION_STATUS_FAILED` | Failed to fetch status | Retry later |

### Error Handling Example

```typescript
async function handleSubscriptionCheckout(plan: 'MONTHLY' | 'YEARLY') {
  try {
    const response = await fetch('/api/user-auth/subscribe/start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ plan })
    });

    const data: CheckoutResponse = await response.json();

    if (!data.success) {
      switch (data.code) {
        case 'STRIPE_NOT_CONFIGURED':
          showError('Payment system is not configured. Please contact support.');
          break;
        case 'USER_NOT_FOUND':
          showError('User session expired. Please log in again.');
          // Redirect to login
          break;
        case 'SUBSCRIPTION_START_FAILED':
          showError('Failed to start checkout. Please try again.');
          break;
        default:
          showError(data.error || 'An unexpected error occurred');
      }
      return;
    }

    // Success - redirect to Stripe
    window.location.href = data.checkoutUrl!;
    
  } catch (error) {
    console.error('Network error:', error);
    showError('Network error. Please check your connection and try again.');
  }
}
```

---

## Helper Functions

### Check if User Has Active Paid Plan

```typescript
async function hasActivePaidPlan(token: string): Promise<boolean> {
  try {
    const response = await fetch('/api/user-auth/subscription', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const data: SubscriptionResponse = await response.json();
    return data.success && data.subscription?.hasActivePlan === true;
  } catch (error) {
    console.error('Failed to check subscription:', error);
    return false;
  }
}
```

### Format Subscription Dates

```typescript
function formatSubscriptionDate(dateString: string | null): string {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

// Usage
const formattedEndDate = formatSubscriptionDate(subscription.endsAt);
```

### Calculate Days Remaining

```typescript
function getDaysRemaining(endsAt: string | null): number | null {
  if (!endsAt) return null;
  const endDate = new Date(endsAt);
  const now = new Date();
  const diffTime = endDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
}

// Usage
const daysRemaining = getDaysRemaining(subscription.endsAt);
if (daysRemaining !== null) {
  console.log(`${daysRemaining} days remaining`);
}
```

---

## Stripe Configuration

### Required Environment Variables (Backend)

Make sure these are set in your backend `.env`:

```env
STRIPE_SECRET_KEY=sk_test_... or sk_live_...
STRIPE_PRICE_MONTHLY=price_...
STRIPE_PRICE_YEARLY=price_...
STRIPE_WEBHOOK_SECRET=whsec_...
FRONTEND_URL=http://localhost:3000  # or your production URL
```

### Stripe Webhook Setup

1. Go to Stripe Dashboard → Developers → Webhooks
2. Add endpoint: `https://your-backend-url.com/api/user-auth/stripe/webhook`
3. Subscribe to these events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
4. Copy the webhook signing secret to `STRIPE_WEBHOOK_SECRET`

---

## Testing

### Test Flow

1. **User selects plan** → Frontend calls `/api/user-auth/subscription/checkout`
2. **User redirected to Stripe** → Completes payment
3. **Stripe redirects back** → Frontend success page (`/billing/success`)
4. **Webhook processes** → Backend updates user subscription
5. **Frontend verifies** → Calls `/api/user-auth/subscription` to check status

### Test Subscription Status

```typescript
// Poll subscription status after checkout
async function pollSubscriptionStatus(maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch('/api/user-auth/subscription', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const data: SubscriptionResponse = await response.json();
    
    if (data.success && data.subscription?.hasActivePlan) {
      return data.subscription;
    }
    
    // Wait 1 second before next attempt
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  throw new Error('Subscription not activated after checkout');
}
```

---

## Summary

### Quick Reference

| Action | Endpoint | Method | Auth Required |
|--------|----------|--------|---------------|
| Start checkout | `/api/user-auth/subscribe/start` | POST | Yes |
| Get status | `/api/user-auth/subscription` | GET | Yes |
| Webhook | `/api/user-auth/stripe/webhook` | POST | No (Stripe signature) |

### Response Format

All endpoints return:
```typescript
{
  success: boolean;
  // ... other fields based on endpoint
  error?: string;
  code?: string;
}
```

---

## Support

For issues or questions:
1. Check error codes in responses
2. Verify Stripe webhook is configured correctly
3. Ensure backend environment variables are set
4. Check browser console for network errors

