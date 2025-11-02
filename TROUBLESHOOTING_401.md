# Troubleshooting 401 Unauthorized Errors

## Common Causes

### 1. Missing Required Secrets
The backend needs these secrets set in Fly.io:

```bash
# Check current secrets
flyctl secrets list --app code-backend

# Set missing secrets
flyctl secrets set --app code-backend JWT_SECRET='your-random-secret-key-here'
flyctl secrets set --app code-backend SESSION_SECRET='another-random-secret-key'
flyctl secrets set --app code-backend CORS_ORIGIN='https://your-frontend-domain.com'
```

### 2. Database Not Connected
Check if database is properly attached:

```bash
# Check if DATABASE_URL is set
flyctl secrets list --app code-backend | grep DATABASE_URL

# If missing, attach database
flyctl postgres attach dappdojo-db --app code-backend
```

### 3. Database Migrations Not Run
The database schema might not be set up:

```bash
# Run migrations
flyctl ssh console --app code-backend -C 'npm run db:migrate:prod'
```

### 4. No Users in Database
If migrations ran but no users exist, create one:

```bash
# Set admin credentials
flyctl secrets set --app code-backend ADMIN_EMAIL='gimer@dappdojo.com'
flyctl secrets set --app code-backend ADMIN_PASSWORD='Ottawa!1978'

# Create admin user
flyctl ssh console --app code-backend -C 'npm run create-admin'
```

### 5. Check Backend Logs
View logs to see actual error:

```bash
flyctl logs --app code-backend
```

Look for:
- Database connection errors
- JWT secret errors
- CORS errors
- Missing environment variables

## Quick Fix Checklist

1. ✅ Database attached? `flyctl secrets list --app code-backend | grep DATABASE_URL`
2. ✅ Migrations run? `flyctl ssh console --app code-backend -C 'npm run db:migrate:prod'`
3. ✅ JWT_SECRET set? `flyctl secrets list --app code-backend | grep JWT_SECRET`
4. ✅ CORS_ORIGIN set? `flyctl secrets list --app code-backend | grep CORS_ORIGIN`
5. ✅ Admin user created? `flyctl ssh console --app code-backend -C 'npm run create-admin'`
6. ✅ Backend running? `flyctl status --app code-backend`

## Test Backend Connection

```bash
# Health check
curl https://code-backend.fly.dev/health

# Should return: {"status":"healthy",...}
```

## Common Error Messages

- **"Invalid token"** → JWT_SECRET not set or changed
- **"User not found"** → Database migrations not run or user doesn't exist
- **"Database connection failed"** → DATABASE_URL not set or database not accessible
- **CORS errors** → CORS_ORIGIN not set correctly
