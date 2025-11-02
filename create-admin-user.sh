#!/bin/bash

# Script to create admin user on Fly.io
APP_NAME="${1:-code-backend}"

echo "👤 Creating Admin User on Fly.io"
echo "   App: $APP_NAME"
echo ""

# Step 0: Check if DATABASE_URL is set
echo "📋 Step 0: Checking DATABASE_URL..."
echo ""

DATABASE_URL_SET=$(flyctl secrets list --app "$APP_NAME" 2>/dev/null | grep -q "DATABASE_URL" && echo "yes" || echo "no")

if [ "$DATABASE_URL_SET" = "no" ]; then
    echo "⚠️  DATABASE_URL not found!"
    echo ""
    echo "🔗 Checking for database to attach..."
    echo ""
    
    # Check if database exists
    DB_NAME="dappdojo-db"
    if flyctl postgres list 2>/dev/null | grep -q "$DB_NAME"; then
        echo "✅ Database '$DB_NAME' found"
        echo "   Attaching to app..."
        if flyctl postgres attach "$DB_NAME" --app "$APP_NAME"; then
            echo ""
            echo "✅ Database attached! DATABASE_URL has been set."
            echo ""
        else
            echo "❌ Failed to attach database"
            exit 1
        fi
    else
        echo "❌ Database '$DB_NAME' not found"
        echo ""
        echo "💡 Please create and attach the database first:"
        echo "   ./create-db.sh code-backend"
        echo "   Or: flyctl postgres attach <db-name> --app $APP_NAME"
        exit 1
    fi
else
    echo "✅ DATABASE_URL is set!"
    echo ""
fi

# Step 1: Check if secrets are set
echo "📋 Step 1: Checking admin credentials..."
echo ""

ADMIN_EMAIL_SET=$(flyctl secrets list --app "$APP_NAME" 2>/dev/null | grep -q "ADMIN_EMAIL" && echo "yes" || echo "no")
ADMIN_PASSWORD_SET=$(flyctl secrets list --app "$APP_NAME" 2>/dev/null | grep -q "ADMIN_PASSWORD" && echo "yes" || echo "no")

if [ "$ADMIN_EMAIL_SET" = "no" ] || [ "$ADMIN_PASSWORD_SET" = "no" ]; then
    echo "⚠️  Admin credentials not found in secrets!"
    echo ""
    echo "🔧 Setting admin credentials..."
    echo ""
    
    flyctl secrets set --app "$APP_NAME" ADMIN_EMAIL='gimer@dappdojo.com'
    flyctl secrets set --app "$APP_NAME" ADMIN_PASSWORD='Ottawa!1978'
    
    echo ""
    echo "✅ Admin credentials set!"
    echo ""
else
    echo "✅ Admin credentials already set!"
    echo ""
fi

# Step 2: Run database migrations
echo "📋 Step 2: Running database migrations..."
echo ""

if flyctl ssh console --app "$APP_NAME" -C 'npm run db:migrate:prod'; then
    echo ""
    echo "✅ Migrations completed"
else
    echo ""
    echo "⚠️  Migration failed or already completed"
fi
echo ""

# Step 3: Create admin user
echo "📋 Step 3: Creating admin user..."
echo ""

if flyctl ssh console --app "$APP_NAME" -C 'npm run create-admin'; then
    echo ""
    echo "✅ Admin user created successfully!"
else
    echo ""
    echo "⚠️  Admin creation failed or admin already exists"
    echo ""
    echo "💡 Let's verify if admin exists..."
    flyctl ssh console --app "$APP_NAME" -C 'npm run verify-admin'
    exit 1
fi
echo ""

# Step 4: Verify admin user
echo "📋 Step 4: Verifying admin user..."
echo ""

flyctl ssh console --app "$APP_NAME" -C 'npm run verify-admin'

echo ""
echo "✅ Done!"
echo ""
echo "🧪 Test login:"
echo "   curl -X POST https://code-backend.fly.dev/api/auth/login \\"
echo "     -H \"Content-Type: application/json\" \\"
echo "     -d '{\"email\":\"gimer@dappdojo.com\",\"password\":\"Ottawa!1978\"}'"

