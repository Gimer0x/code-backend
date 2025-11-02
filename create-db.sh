#!/bin/bash

# Script to create and attach PostgreSQL database
APP_NAME="${1:-code-backend}"
DB_NAME="${2:-dappdojo-db}"

echo "🗄️  Creating PostgreSQL Database: $DB_NAME"
echo ""
echo "This will take a few minutes..."
echo ""

# Create the database
flyctl postgres create \
  --name "$DB_NAME" \
  --region sjc \
  --vm-size shared-cpu-1x \
  --volume-size 10

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Database created successfully!"
    echo ""
    echo "🔗 Attaching database to app: $APP_NAME"
    
    flyctl postgres attach "$DB_NAME" --app "$APP_NAME"
    
    if [ $? -eq 0 ]; then
        echo ""
        echo "✅ Database attached successfully!"
        echo ""
        echo "📋 DATABASE_URL has been automatically set"
        echo ""
        echo "🔍 Verifying..."
        flyctl secrets list --app "$APP_NAME" | grep DATABASE_URL && echo "✅ DATABASE_URL is set!" || echo "⚠️  DATABASE_URL not found"
    else
        echo "❌ Failed to attach database"
        exit 1
    fi
else
    echo "❌ Failed to create database"
    exit 1
fi
