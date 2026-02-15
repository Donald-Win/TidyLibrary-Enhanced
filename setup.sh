#!/bin/bash

echo "====================================="
echo "Audiobookshelf Library Tidy Setup"
echo "====================================="
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first:"
    echo "   curl -sSL https://get.docker.com | sh"
    echo "   sudo usermod -aG docker $USER"
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install it first:"
    echo "   sudo apt-get install docker-compose"
    exit 1
fi

echo "✅ Docker and Docker Compose are installed"
echo ""

# Ask for library path
echo "Enter the path to your audiobook library on this system:"
echo "Examples:"
echo "  /mnt/audiobooks"
echo "  /home/pi/audiobooks"
echo "  /media/usbdrive/audiobooks"
echo ""
read -p "Library path: " LIBRARY_PATH

if [ ! -d "$LIBRARY_PATH" ]; then
    echo "⚠️  Warning: Directory $LIBRARY_PATH does not exist"
    read -p "Continue anyway? (y/n): " CONTINUE
    if [ "$CONTINUE" != "y" ]; then
        exit 1
    fi
fi

# Update docker-compose.yml
echo ""
echo "Updating configuration..."
sed -i "s|/path/to/your/audiobooks|$LIBRARY_PATH|g" docker-compose.yml

# Build and start
echo ""
echo "Building and starting container..."
docker-compose up -d

# Get IP address
IP=$(hostname -I | awk '{print $1}')

echo ""
echo "====================================="
echo "✅ Setup Complete!"
echo "====================================="
echo ""
echo "Access the app at:"
echo "  http://$IP:3000"
echo "  http://localhost:3000"
echo ""
echo "In the app, use this path: /library"
echo ""
echo "Commands:"
echo "  View logs:    docker-compose logs -f"
echo "  Stop:         docker-compose down"
echo "  Restart:      docker-compose restart"
echo ""
