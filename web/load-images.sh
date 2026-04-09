#!/bin/bash
# Deploy script for ARM64 target server
# Usage: ./load-images.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGES_DIR="${SCRIPT_DIR}/images-arm64"

GREEN='\033[0;32m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }

# Check if images directory exists
if [ ! -d "${IMAGES_DIR}" ]; then
    echo "Error: ${IMAGES_DIR} not found"
    echo "Please copy the images-arm64 directory to this location"
    exit 1
fi

# Load all tar files
for tar_file in "${IMAGES_DIR}"/*.tar; do
    if [ -f "$tar_file" ]; then
        log_info "Loading $(basename "$tar_file")..."
        docker load -i "$tar_file"
    fi
done

log_info "All images loaded!"
echo ""
echo "Loaded images:"
docker images | grep summ-hub || true
echo ""
echo "To start services:"
echo "  docker compose -f docker-compose.arm64.yml up -d"
