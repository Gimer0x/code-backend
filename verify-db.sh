#!/bin/bash

# Database Configuration Verification Script
APP_NAME="${1:-code-backend}"

echo "🔍 Verifying Database Configuration for: $APP_NAME"
echo ""

# Check 1: DATABASE_URL secret
echo "1️⃣  Checking DATABASE_URL secret..."
if flyctl secrets list --app "$APP_NAME" 2>/dev/null | grep -q "DATABASE_URL"; then
    echo "   ✅ DATABASE_URL is set"
else
    echo "   ❌ DATABASE_URL not found"
    echo "   💡 Run: flyctl postgres attach dappdojo-db --app $APP_NAME"
    exit 1
fi
echo ""

# Check 2: Database exists
echo "2️⃣  Checking if database exists..."
if flyctl postgres list 2>/dev/null | grep -q "dappdojo-db"; then
    echo "   ✅ Database 'dappdojo-db' exists"
else
    echo "   ⚠️  Database 'dappdojo-db' not found"
    echo "   💡 Available databases:"
    flyctl postgres list 2>/dev/null || echo "   (Could not list databases)"
fi
echo ""

# Check 3: Backend is running
echo "3️⃣  Checking backend status..."
if flyctl status --app "$APP_NAME" 2>/dev/null | grep -q "started\|running"; then
    echo "   ✅ Backend is running"
else
    echo "   ⚠️  Backend may not be running"
fi
echo ""

# Check 4: Database connection test
echo "4️⃣  Testing database connection..."
echo "   (This may take a moment...)"
if flyctl ssh console --app "$APP_NAME" -C 'node -e "require(\"dotenv\").config(); const { PrismaClient } = require(\"@prisma/client\"); const prisma = new PrismaClient(); prisma.\$connect().then(() => { console.log(\"✅ Database connected successfully\"); prisma.\$disconnect(); process.exit(0); }).catch((e) => { console.error(\"❌ Connection failed:\", e.message); process.exit(1); });"' 2>/dev/null | grep -q "✅ Database connected"; then
    echo "   ✅ Database connection successful"
else
    echo "   ❌ Database connection failed"
    echo "   💡 Check logs: flyctl logs --app $APP_NAME"
fi
echo ""

# Check 5: Database migrations
echo "5️⃣  Checking database schema..."
echo "   (Checking if migrations have been run...)"
MIGRATION_CHECK=$(flyctl postgres connect --app "$APP_NAME" -a "$APP_NAME" -c '\dt' 2>/dev/null | grep -c "users\|courses" || echo "0")
if [ "$MIGRATION_CHECK" -gt "0" ]; then
    echo "   ✅ Database tables exist (migrations appear to have run)"
else
    echo "   ⚠️  Database tables not found"
    echo "   💡 Run migrations: flyctl ssh console --app $APP_NAME -C 'npm run db:migrate:prod'"
fi
echo ""

echo "📋 Summary:"
echo "   Use 'flyctl logs --app $APP_NAME' to see detailed logs"
echo "   Use 'flyctl postgres connect --app $APP_NAME -a $APP_NAME' to connect to database"
