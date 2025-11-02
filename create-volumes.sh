#!/bin/bash

# Script to create Foundry projects volumes
APP_NAME="${1:-code-backend}"
REGION="${2:-sjc}"

echo "💾 Creating Foundry Projects Volumes"
echo "   App: $APP_NAME"
echo "   Region: $REGION"
echo ""

# Get number of machines
MACHINE_COUNT=$(flyctl machines list --app "$APP_NAME" 2>/dev/null | grep -c "started\|stopped" || echo "0")

if [ "$MACHINE_COUNT" -eq "0" ]; then
    echo "⚠️  No machines found. Creating 1 volume (will create more if needed)..."
    NEEDED_VOLUMES=1
else
    echo "📊 Found $MACHINE_COUNT machine(s)"
    NEEDED_VOLUMES=$MACHINE_COUNT
fi

# Get existing volumes
EXISTING_VOLUMES=$(flyctl volumes list --app "$APP_NAME" 2>/dev/null | grep -c "foundry_projects_vol" 2>/dev/null | head -1 || echo "0")
EXISTING_VOLUMES=${EXISTING_VOLUMES//[^0-9]/}  # Remove non-numeric characters
EXISTING_VOLUMES=${EXISTING_VOLUMES:-0}  # Default to 0 if empty
echo "📦 Existing volumes: $EXISTING_VOLUMES"
echo "📦 Needed volumes: $NEEDED_VOLUMES"
echo ""

# Create volumes
VOLUMES_TO_CREATE=$((NEEDED_VOLUMES - EXISTING_VOLUMES))

if [ $VOLUMES_TO_CREATE -gt 0 ]; then
    echo "🔧 Creating $VOLUMES_TO_CREATE volume(s)..."
    for i in $(seq 1 $VOLUMES_TO_CREATE); do
        echo "   Creating volume $i of $VOLUMES_TO_CREATE..."
        if flyctl volumes create foundry_projects_vol \
          --size 10 \
          --region "$REGION" \
          --app "$APP_NAME" \
          --yes; then
            echo "   ✅ Volume $i created"
        else
            echo "   ⚠️  Volume $i creation failed (may already exist)"
        fi
        echo ""
    done
    echo "✅ Done!"
else
    echo "✅ All required volumes already exist"
fi

echo ""
echo "📋 Current volumes:"
flyctl volumes list --app "$APP_NAME" | grep "foundry_projects_vol" || echo "   (none)"
