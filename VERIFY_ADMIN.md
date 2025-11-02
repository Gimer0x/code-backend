# How to Verify Admin User

This guide shows you how to check if the admin user exists in your database.

## Admin User Credentials

- **Email**: `gimer@dappdojo.com`
- **Password**: `Ottawa!1978`

## Method 1: Local Verification (if connected to same database)

```bash
npm run verify-admin
```

This will:
- Check if the user exists
- Display user details (ID, email, name, role, etc.)
- Verify the password matches
- Show all admin users in the database

## Method 2: Verify on Fly.io (Production)

### Step 1: Verify via SSH Console

```bash
flyctl ssh console --app code-backend -C "npm run verify-admin"
```

### Step 2: Verify via Direct Database Query

```bash
flyctl postgres connect --app code-backend
```

Then in the PostgreSQL console:

```sql
-- Check if user exists
SELECT id, email, name, role, "isPremium", "createdAt"
FROM "User"
WHERE email = 'gimer@dappdojo.com';

-- Check all admin users
SELECT id, email, name, role, "isPremium", "createdAt"
FROM "User"
WHERE role = 'ADMIN';

-- Exit
\q
```

## Method 3: Test Login via API

Test if the admin user can login:

```bash
curl -X POST https://code-backend.fly.dev/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "gimer@dappdojo.com",
    "password": "Ottawa!1978"
  }'
```

If successful, you'll get a response with a JWT token.

## What the Script Checks

The `verify-admin.js` script will:

1. ✅ **Check if user exists** - Queries database for email `gimer@dappdojo.com`
2. ✅ **Display user details** - Shows ID, email, name, role, premium status, dates
3. ✅ **Verify password** - Checks if password matches `Ottawa!1978`
4. ✅ **List all admins** - Shows all users with `role = 'ADMIN'`

## Expected Output

If admin user exists:

```
✅ User found!

📋 User Details:
   ID: [user-id]
   Email: gimer@dappdojo.com
   Name: DappDojo Admin
   Role: ADMIN
   Premium: Yes
   Created: [timestamp]
   Updated: [timestamp]

✅ Password verification: CORRECT

🎉 Admin user is properly configured!
```

If admin user doesn't exist:

```
❌ User not found!

   Email: gimer@dappdojo.com

💡 This user may not have been created yet.
   Run: npm run create-admin
   Or via Fly.io: flyctl ssh console --app code-backend -C "npm run create-admin"
```

## Troubleshooting

### User Not Found

1. **Check if database migrations ran:**
   ```bash
   flyctl ssh console --app code-backend -C "npm run db:migrate:prod"
   ```

2. **Create admin user:**
   ```bash
   flyctl ssh console --app code-backend -C "npm run create-admin"
   ```

3. **Verify secrets are set:**
   ```bash
   flyctl secrets list --app code-backend | grep ADMIN
   ```

### Password Doesn't Match

1. **Update admin password:**
   ```bash
   # First, update the script with correct password, then:
   flyctl ssh console --app code-backend -C "npm run update-admin-password"
   ```

2. **Or create admin with correct credentials:**
   ```bash
   flyctl secrets set --app code-backend ADMIN_EMAIL='gimer@dappdojo.com'
   flyctl secrets set --app code-backend ADMIN_PASSWORD='Ottawa!1978'
   flyctl ssh console --app code-backend -C "npm run create-admin"
   ```

### Database Connection Error

1. **Check DATABASE_URL is set:**
   ```bash
   flyctl secrets list --app code-backend | grep DATABASE_URL
   ```

2. **Verify database is attached:**
   ```bash
   flyctl postgres list
   ```

3. **Reattach database if needed:**
   ```bash
   flyctl postgres attach dappdojo-db --app code-backend
   ```

## Quick Verification Commands

```bash
# Check if admin exists (Fly.io)
flyctl ssh console --app code-backend -C "npm run verify-admin"

# Test login
curl -X POST https://code-backend.fly.dev/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"gimer@dappdojo.com","password":"Ottawa!1978"}'

# Check logs for admin creation
flyctl logs --app code-backend | grep -i admin
```

## Summary

**To verify admin user:**
1. Run `npm run verify-admin` locally (if connected to same DB)
2. Or run `flyctl ssh console --app code-backend -C "npm run verify-admin"` on Fly.io
3. Or test login via API endpoint

**If admin doesn't exist:**
1. Set secrets: `ADMIN_EMAIL` and `ADMIN_PASSWORD`
2. Run: `flyctl ssh console --app code-backend -C "npm run create-admin"`

