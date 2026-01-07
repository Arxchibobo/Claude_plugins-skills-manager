#!/bin/bash
# Claude Plugins & Skills Manager Startup Script

echo ""
echo "============================================================"
echo "  Starting Claude Plugins & Skills Manager..."
echo "============================================================"
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "[WARNING] Dependencies not found. Running installation..."
    npm install
    if [ $? -ne 0 ]; then
        echo "[ERROR] Failed to install dependencies"
        exit 1
    fi
fi

# Start the server
node server-static.js
