# Database Configuration Verification Guide

## ✅ Does `flyctl postgres attach` create DATABASE_URL?

**YES!** When you run:
```bash
flyctl postgres attach dappdojo-db --app code-backend
```

Fly.io automatically:
1. Sets `DATABASE_URL` as a secret in your app
2. Configures it with the correct connection string
3. Uses internal Fly.io networking for security

## 🔍 How to Check Database Configuration

### Step 1: Verify DATABASE_URL Secret Exists
```bash
# Check if DATABASE_URL is set
flyctl secrets list --app code-backend | grep DATABASE_URL
```

**Expected output:**
```
DATABASE_URL
```

**If you see it:** ✅ DATABASE_URL is configured
**If you don't see it:** ❌ Database not attached yet

### Step 2: Verify Database Connection
```bash
# Test database connection from your app
flyctl ssh console --app code-backend -C 'node -e "const { PrismaClient } = require(\"@prisma/client\"); const prisma = new PrismaClient(); prisma.\$connect().then(() => { console.log(\"✅ Database connected!\"); process.exit(0); }).catch((e) => { console.error(\"❌ Connection failed:\", e.message); process.exit(1); });"'
```

**Expected output:**
```
✅ Database connected!
```

### Step 3: Check Database Schema (After Migrations)
```bash
# Run migrations (if not done yet)
flyctl ssh console --app code-backend -C 'npm run db:migrate:prod'

# Then verify tables exist
flyctl postgres connect --app code-backend -a code-backend -c '\dt'
```

**Expected output:** List of tables (users, courses, lessons, etc.)

### Step 4: Verify Database Logs
```bash
# Check backend logs for database connection
flyctl logs --app code-backend | grep -i database

# Look for:
# ✅ "Database connection successful"
# ❌ "Database connection failed"
```

### Step 5: Test Database Operations
```bash
# Try creating admin user (tests database write)
flyctl secrets set --app code-backend ADMIN_EMAIL='gimer@dappdojo.com'
flyctl secrets set --app code-backend ADMIN_PASSWORD='Ottawa!1978'
flyctl ssh console --app code-backend -C 'npm run create-admin'
```

**Expected output:**
```
✅ Admin user created successfully
```

## 🔧 Complete Verification Checklist

Run these commands in order:

```bash
# 1. Check DATABASE_URL exists
echo "1. Checking DATABASE_URL..."
flyctl secrets list --app code-backend | grep DATABASE_URL || echo "❌ DATABASE_URL not found - run: flyctl postgres attach dappdojo-db --app code-backend"

# 2. Check database connection
echo "2. Testing database connection..."
flyctl ssh console --app code-backend -C 'node -e "require(\"dotenv\").config(); const { PrismaClient } = require(\"@prisma/client\"); const prisma = new PrismaClient(); prisma.\$connect().then(() => { console.log(\"✅ Connected\"); prisma.\$disconnect(); }).catch((e) => { console.error(\"❌ Failed:\", e.message); process.exit(1); });"' || echo "❌ Connection test failed"

# 3. Check if migrations have run
echo "3. Checking database schema..."
flyctl postgres connect --app code-backend -a code-backend -c '\dt' | grep -q "users" && echo "✅ Tables exist" || echo "⚠️  Tables not found - run migrations: flyctl ssh console --app code-backend -C 'npm run db:migrate:prod'"

# 4. Check backend logs
echo "4. Checking backend logs..."
flyctl logs --app code-backend --limit 50 | grep -i "database\|connection" | tail -5
```

## 🚨 Common Issues

### Issue 1: DATABASE_URL not found
**Solution:**
```bash
flyctl postgres attach dappdojo-db --app code-backend
```

### Issue 2: Connection failed
**Possible causes:**
- Database not created yet
- Wrong database name
- Database in different region

**Solution:**
```bash
# List all databases
flyctl postgres list

# Create new database if needed
flyctl postgres create --name dappdojo-db --region sjc --vm-size shared-cpu-1x --volume-size 10
```

### Issue 3: Tables don't exist
**Solution:**
```bash
# Run migrations
flyctl ssh console --app code-backend -C 'npm run db:migrate:prod'
```

## 📋 Quick Status Check

Create a one-liner to check everything:

```bash
echo "=== Database Status ===" && \
echo "DATABASE_URL:" && flyctl secrets list --app code-backend | grep -q DATABASE_URL && echo "  ✅ Set" || echo "  ❌ Missing" && \
echo "Backend Status:" && flyctl status --app code-backend | grep -q "started" && echo "  ✅ Running" || echo "  ❌ Not running" && \
echo "Database:" && flyctl postgres list | grep -q "dappdojo-db" && echo "  ✅ Exists" || echo "  ❌ Not found"
```

