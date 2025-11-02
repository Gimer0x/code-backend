#!/bin/bash

# Script to attach PostgreSQL database to Fly.io app
APP_NAME="${1:-code-backend}"
DB_NAME="${2:-dappdojo-db}"

echo "🔗 Attaching PostgreSQL Database to $APP_NAME"
echo ""

# Check if logged in
if ! flyctl auth whoami &> /dev/null; then
    echo "❌ Not logged in to Fly.io"
    echo "💡 Run: flyctl auth login"
    exit 1
fi

echo "✅ Logged in to Fly.io"
echo ""

# Check if database exists
echo "📋 Checking for database: $DB_NAME"
if flyctl postgres list 2>/dev/null | grep -q "$DB_NAME"; then
    echo "✅ Database '$DB_NAME' found"
    echo ""
    echo "🔗 Attaching database to app..."
    if flyctl postgres attach "$DB_NAME" --app "$APP_NAME"; then
        echo ""
        echo "✅ Database attached successfully!"
        echo ""
        echo "📋 DATABASE_URL has been automatically set"
        echo "   Verify with: flyctl secrets list --app $APP_NAME | grep DATABASE_URL"
    else
        echo "❌ Failed to attach database"
        exit 1
    fi
else
    echo "❌ Database '$DB_NAME' not found"
    echo ""
    echo "📋 Available databases:"
    flyctl postgres list 2>/dev/null || echo "   (Could not list databases)"
    echo ""
    echo "💡 Options:"
    echo "   1. Create new database:"
    echo "      flyctl postgres create --name $DB_NAME --region sjc --vm-size shared-cpu-1x --volume-size 10"
    echo ""
    echo "   2. Or attach existing database:"
    echo "      flyctl postgres attach <existing-db-name> --app $APP_NAME"
    exit 1
fi
