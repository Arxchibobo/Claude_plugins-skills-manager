#!/bin/bash
# Claude Plugin Manager Startup Script

echo ""
echo "============================================================"
echo "  Starting Claude Plugin Manager..."
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

# Start the server in background
node server.js &
SERVER_PID=$!

# Wait for server to start
sleep 2

# Open browser
URL="http://localhost:3456"
if command -v xdg-open > /dev/null; then
    xdg-open "$URL"  # Linux
elif command -v open > /dev/null; then
    open "$URL"  # macOS
else
    echo "Please open: $URL"
fi

echo ""
echo "✓ Server started: $URL"
echo "✓ Browser opened automatically"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Wait for Ctrl+C
trap "kill $SERVER_PID 2>/dev/null; echo '\nServer stopped'; exit" INT TERM
wait $SERVER_PID
