# Fly.io Database Configuration Guide

## Understanding DATABASE_URL

### ⚠️ Important:
- **DATABASE_URL** is a **BACKEND-only** environment variable
- Your **frontend** should NEVER have DATABASE_URL
- Frontend only needs `NEXT_PUBLIC_API_BASE_URL` (which you already have ✅)

## Fly.io PostgreSQL Setup

When you attach a PostgreSQL database to your Fly.io app, the `DATABASE_URL` is **automatically set** as a secret.

### 1. Check if DATABASE_URL is Set

```bash
# Check secrets (will show DATABASE_URL if attached)
flyctl secrets list --app code-backend

# Or specifically check for DATABASE_URL
flyctl secrets list --app code-backend | grep DATABASE_URL
```

### 2. If DATABASE_URL is Missing

Attach your PostgreSQL database:

```bash
# List available databases
flyctl postgres list

# Attach database to your app (automatically sets DATABASE_URL)
flyctl postgres attach <your-db-name> --app code-backend

# Example:
flyctl postgres attach dappdojo-db --app code-backend
```

### 3. View the DATABASE_URL (if needed)

```bash
# Get the connection string
flyctl postgres connect --app code-backend -a code-backend

# Or see it in secrets (value is hidden for security)
flyctl secrets list --app code-backend
```

## Architecture

```
Frontend (Next.js)
  ↓ Uses: NEXT_PUBLIC_API_BASE_URL=https://code-backend.fly.dev
  ↓ Makes API calls to backend
Backend (Fly.io)
  ↓ Uses: DATABASE_URL (automatically set by Fly.io)
  ↓ Connects to PostgreSQL
PostgreSQL Database (Fly.io)
```

## Local Development vs Production

### Local Development:
```bash
# Backend .env file
DATABASE_URL=postgresql://dappdojo:Admin123@localhost:5432/dappdojo_dev
```

### Production (Fly.io):
```bash
# Automatically set when you attach database
# Format: Attached databases use internal Fly.io networking
DATABASE_URL=postgresql://user:pass@hostname.internal:5432/dbname
# This is automatically configured - you don't need to set it manually!
```

## Configuration Summary

### ✅ Your Frontend (.env.local or .env.production):
```env
NEXT_PUBLIC_API_BASE_URL=https://code-backend.fly.dev
```

### ✅ Your Backend (Fly.io Secrets - Automatically Set):
```bash
# DATABASE_URL is automatically set when you attach PostgreSQL
# You don't need to manually configure it!

# But you DO need these:
flyctl secrets set --app code-backend JWT_SECRET='your-secret'
flyctl secrets set --app code-backend SESSION_SECRET='your-secret'
flyctl secrets set --app code-backend CORS_ORIGIN='https://your-frontend-domain.com'
```

## Verification Steps

1. **Check database is attached:**
   ```bash
   flyctl secrets list --app code-backend | grep DATABASE_URL
   ```

2. **Test database connection:**
   ```bash
   flyctl ssh console --app code-backend -C 'npm run db:migrate:prod'
   ```

3. **Verify backend can connect:**
   ```bash
   flyctl logs --app code-backend | grep -i database
   ```

## Important Notes

- ✅ **DATABASE_URL is backend-only** - never expose it to frontend
- ✅ **Fly.io sets it automatically** when you attach PostgreSQL
- ✅ **Local DATABASE_URL** is only for local development
- ✅ **Production DATABASE_URL** uses Fly.io internal networking
- ✅ **No manual configuration needed** - it's handled by Fly.io

