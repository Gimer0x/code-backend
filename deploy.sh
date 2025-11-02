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

# Navigate to backend directory (if script is run from project root)
if [ -d "backend" ]; then
    cd backend
elif [ ! -f "index.js" ] && [ ! -f "package.json" ]; then
    echo "❌ Error: Please run this script from the project root or backend directory"
    exit 1
fi

# Git handling: Check if we're in a git repository
if [ -d ".git" ]; then
    echo "📦 Checking git status..."
    
    # Check if there are uncommitted changes
    if ! git diff-index --quiet HEAD --; then
        echo "⚠️  Warning: You have uncommitted changes."
        echo "   These changes will be included in the deployment."
        read -p "   Continue? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "❌ Deployment cancelled"
            exit 1
        fi
    fi
    
    # Fetch latest changes
    echo "📥 Fetching latest changes from remote..."
    git fetch origin || echo "⚠️  Could not fetch from remote (may not have remote configured)"
    
    # Check if branches have diverged
    LOCAL=$(git rev-parse @)
    REMOTE=$(git rev-parse @{u} 2>/dev/null || echo "")
    BASE=$(git merge-base @ @{u} 2>/dev/null || echo "")
    
    if [ -n "$REMOTE" ] && [ "$LOCAL" != "$REMOTE" ] && [ "$LOCAL" != "$BASE" ]; then
        echo "⚠️  Your branch has diverged from origin."
        echo "   Local commits: $(git rev-list --count @ ^@{u} 2>/dev/null || echo '?')"
        echo "   Remote commits: $(git rev-list --count @{u} ^@ 2>/dev/null || echo '?')"
        echo ""
        echo "   Options:"
        echo "   1. Merge remote changes (recommended for collaboration)"
        echo "   2. Rebase local changes on top of remote"
        echo "   3. Skip git sync and deploy current state"
        read -p "   Choose option (1/2/3): " -n 1 -r
        echo
        
        case $REPLY in
            1)
                echo "🔄 Merging remote changes..."
                git pull --no-rebase || {
                    echo "❌ Merge failed. Please resolve conflicts manually."
                    exit 1
                }
                ;;
            2)
                echo "🔄 Rebasing local changes..."
                git pull --rebase || {
                    echo "❌ Rebase failed. Please resolve conflicts manually."
                    exit 1
                }
                ;;
            3)
                echo "⏭️  Skipping git sync..."
                ;;
            *)
                echo "❌ Invalid option. Deployment cancelled."
                exit 1
                ;;
        esac
    elif [ -n "$REMOTE" ] && [ "$LOCAL" != "$REMOTE" ]; then
        # Just need to pull (fast-forward)
        echo "📥 Pulling latest changes..."
        git pull || echo "⚠️  Could not pull changes"
    fi
    
    # Show current git status
    echo "📋 Current git status:"
    git log --oneline -5 || echo "   (git log unavailable)"
    echo ""
fi

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
echo ""
echo "📧 Admin user credentials (optional - will be created after migration):"
echo "   flyctl secrets set --app $APP_NAME ADMIN_EMAIL='gimer@dappdojo.com'"
echo "   flyctl secrets set --app $APP_NAME ADMIN_PASSWORD='Ottawa!1978'"

# Deploy the application
echo "🚀 Deploying to Fly.io..."
flyctl deploy --app "$APP_NAME"

# Check deployment status
echo "📊 Checking deployment status..."
flyctl status --app "$APP_NAME"

echo "✅ Deployment complete!"
echo "🌐 Your backend service is now running on Fly.io"
echo ""

# Check if admin credentials are set
ADMIN_EMAIL_SET=$(flyctl secrets list --app "$APP_NAME" 2>/dev/null | grep -q "ADMIN_EMAIL" && echo "yes" || echo "no")
ADMIN_PASSWORD_SET=$(flyctl secrets list --app "$APP_NAME" 2>/dev/null | grep -q "ADMIN_PASSWORD" && echo "yes" || echo "no")

if [ "$ADMIN_EMAIL_SET" = "yes" ] && [ "$ADMIN_PASSWORD_SET" = "yes" ]; then
    echo "📋 Admin credentials detected. Running post-deployment setup..."
    echo ""
    
    echo "   1. Running database migrations..."
    if flyctl ssh console --app "$APP_NAME" -C 'npm run db:migrate:prod'; then
        echo "   ✅ Migrations completed"
    else
        echo "   ⚠️  Migration failed or already completed"
    fi
    echo ""
    
    echo "   2. Creating admin user..."
    if flyctl ssh console --app "$APP_NAME" -C 'npm run create-admin'; then
        echo "   ✅ Admin user setup completed"
    else
        echo "   ⚠️  Admin creation failed or admin already exists"
    fi
    echo ""
else
    echo "📋 Next steps:"
    echo "   1. Set admin credentials (if not already set):"
    echo "      flyctl secrets set --app $APP_NAME ADMIN_EMAIL='gimer@dappdojo.com'"
    echo "      flyctl secrets set --app $APP_NAME ADMIN_PASSWORD='Ottawa!1978'"
    echo ""
    echo "   2. Run database migrations:"
    echo "      flyctl ssh console --app $APP_NAME -C 'npm run db:migrate:prod'"
    echo ""
    echo "   3. Create admin user:"
    echo "      flyctl ssh console --app $APP_NAME -C 'npm run create-admin'"
    echo ""
    echo "   Note: Once ADMIN_EMAIL and ADMIN_PASSWORD are set, this script will"
    echo "   automatically run migrations and create the admin on future deployments."
fi
echo ""
echo "📋 Useful commands:"
echo "   flyctl logs --app $APP_NAME          - View logs"
echo "   flyctl status --app $APP_NAME        - Check status"
echo "   flyctl ssh console --app $APP_NAME   - SSH into machine"
echo "   flyctl postgres connect --app $APP_NAME - Connect to database"
