#!/bin/bash
# Claude Plugins & Skills Manager Installation Script for Unix/Linux/Mac

echo ""
echo "============================================================"
echo "  Claude Plugins & Skills Manager - Installation"
echo "============================================================"
echo ""

# Check Node.js installation
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not installed!"
    echo ""
    echo "Please install Node.js from https://nodejs.org/"
    echo ""
    exit 1
fi

echo "[1/3] Installing dependencies..."
npm install
if [ $? -ne 0 ]; then
    echo ""
    echo "[ERROR] Failed to install dependencies"
    exit 1
fi

echo ""
echo "[2/3] Setting up configuration..."
echo "Configuration complete."

echo ""
echo "[3/3] Making scripts executable..."
chmod +x start.sh install.sh

echo ""
echo "============================================================"
echo "  Installation Complete!"
echo "============================================================"
echo ""
echo "To start the manager:"
echo "  1. Run: ./start.sh"
echo "  2. Or run: npm start"
echo "  3. Or run: node server-static.js"
echo ""
echo "The manager will be available at: http://localhost:3456"
echo ""
