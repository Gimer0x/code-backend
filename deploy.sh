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
if ! flyctl apps list | grep -q "dappdojo-backend"; then
    echo "📱 Creating new Fly.io app..."
    flyctl apps create dappdojo-backend
else
    echo "✅ App 'dappdojo-backend' already exists"
fi

# Set environment variables
echo "🔧 Setting environment variables..."
flyctl secrets set NODE_ENV=production
flyctl secrets set PORT=3002
flyctl secrets set HOST=0.0.0.0

# Note: You'll need to set these manually with your actual values:
echo "⚠️  Please set the following secrets manually:"
echo "   flyctl secrets set DATABASE_URL='your-postgresql-url'"
echo "   flyctl secrets set CORS_ORIGIN='https://your-frontend-domain.com'"

# Deploy the application
echo "🚀 Deploying to Fly.io..."
flyctl deploy

# Check deployment status
echo "📊 Checking deployment status..."
flyctl status

echo "✅ Deployment complete!"
echo "🌐 Your backend service is now running on Fly.io"
echo "📋 Useful commands:"
echo "   flyctl logs          - View logs"
echo "   flyctl status        - Check status"
echo "   flyctl ssh console   - SSH into machine"
echo "   flyctl scale count 2 - Scale to 2 machines"
