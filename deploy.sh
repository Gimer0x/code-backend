#!/bin/bash

# DappDojo Backend Deployment Script for Fly.io
# This script handles the deployment of the backend service to Fly.io

set -e

echo "🚀 Starting DappDojo Backend Deployment to Fly.io..."

# Check if flyctl is installed
if ! command -v flyctl &> /dev/null; then
    echo "❌ flyctl is not installed. Please install it first:"
    echo "   brew install flyctl"
    exit 1
fi

# Check if user is logged in to Fly.io
if ! flyctl auth whoami &> /dev/null; then
    echo "🔐 Please log in to Fly.io first:"
    flyctl auth login
fi

# Navigate to backend directory
cd backend

# Check if app exists, if not create it
APP_NAME="${APP_NAME:-dappdojo-backend}"
if ! flyctl apps list | grep -q "$APP_NAME"; then
    echo "📱 Creating new Fly.io app: $APP_NAME..."
    flyctl apps create "$APP_NAME"
else
    echo "✅ App '$APP_NAME' already exists"
fi

# Check if PostgreSQL database exists, if not create it
DB_NAME="${DB_NAME:-dappdojo-db}"
if ! flyctl postgres list | grep -q "$DB_NAME"; then
    echo "🗄️  Creating PostgreSQL database: $DB_NAME..."
    echo "   This will take a few minutes..."
    flyctl postgres create --name "$DB_NAME" --region sjc --vm-size shared-cpu-1x --volume-size 10
    echo "✅ Database created!"
    
    # Attach database to app (automatically sets DATABASE_URL secret)
    echo "🔗 Attaching database to app..."
    flyctl postgres attach "$DB_NAME" --app "$APP_NAME"
    echo "✅ Database attached! DATABASE_URL secret has been set automatically."
else
    echo "✅ Database '$DB_NAME' already exists"
    
    # Check if database is attached
    if ! flyctl secrets list --app "$APP_NAME" | grep -q "DATABASE_URL"; then
        echo "🔗 Attaching existing database to app..."
        flyctl postgres attach "$DB_NAME" --app "$APP_NAME"
        echo "✅ Database attached!"
    else
        echo "✅ Database is already attached"
    fi
fi

# Set environment variables
echo "🔧 Setting environment variables..."
flyctl secrets set --app "$APP_NAME" NODE_ENV=production
flyctl secrets set --app "$APP_NAME" PORT=3002
flyctl secrets set --app "$APP_NAME" HOST=0.0.0.0

# Note: You'll need to set these manually with your actual values:
echo "⚠️  Please set the following secrets manually if not already set:"
echo "   flyctl secrets set --app $APP_NAME CORS_ORIGIN='https://your-frontend-domain.com'"
echo "   flyctl secrets set --app $APP_NAME JWT_SECRET='your-jwt-secret'"
echo "   flyctl secrets set --app $APP_NAME SESSION_SECRET='your-session-secret'"

# Deploy the application
echo "🚀 Deploying to Fly.io..."
flyctl deploy --app "$APP_NAME"

# Check deployment status
echo "📊 Checking deployment status..."
flyctl status --app "$APP_NAME"

echo "✅ Deployment complete!"
echo "🌐 Your backend service is now running on Fly.io"
echo ""
echo "📋 Next steps:"
echo "   1. Run database migrations:"
echo "      flyctl ssh console --app $APP_NAME -C 'npm run db:migrate:prod'"
echo ""
echo "📋 Useful commands:"
echo "   flyctl logs --app $APP_NAME          - View logs"
echo "   flyctl status --app $APP_NAME        - Check status"
echo "   flyctl ssh console --app $APP_NAME   - SSH into machine"
echo "   flyctl postgres connect --app $APP_NAME - Connect to database"
