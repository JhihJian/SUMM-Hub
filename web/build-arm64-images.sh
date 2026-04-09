#!/bin/bash
# Build ARM64 Docker images for SUMM-Hub web project
# Usage: ./build-arm64-images.sh [proxy_port]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_DIR="${SCRIPT_DIR}/images-arm64"
PROXY_PORT="${1:-7897}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Get host IP for proxy (cannot use 127.0.0.1 in docker-container builder)
get_host_ip() {
    ip addr show | grep -oP 'inet \K[\d.]+' | grep -v '127.0.0.1' | head -1
}

# Setup buildx builder with proxy
setup_builder() {
    local host_ip=$(get_host_ip)

    if [ -z "$host_ip" ]; then
        log_error "Cannot determine host IP address"
        exit 1
    fi

    log_info "Host IP: $host_ip"
    log_info "Setting up ARM64 builder with proxy on port $PROXY_PORT..."

    # Remove existing builder if exists
    docker buildx rm arm64-builder 2>/dev/null || true

    # Create new builder with proxy
    docker buildx create --name arm64-builder \
        --driver docker-container \
        --driver-opt env.HTTP_PROXY="http://${host_ip}:${PROXY_PORT}" \
        --driver-opt env.HTTPS_PROXY="http://${host_ip}:${PROXY_PORT}" \
        --use

    # Bootstrap the builder
    docker buildx inspect --bootstrap

    log_info "ARM64 builder ready"
}

# Build and save image
build_image() {
    local name=$1
    local context=$2
    local dockerfile=$3
    local tag="summ-hub-${name}:arm64"
    local tar_file="${OUTPUT_DIR}/${name}-arm64.tar"

    log_info "Building ${name} for ARM64..."

    docker buildx build \
        --platform linux/arm64 \
        -t "${tag}" \
        -f "${context}/${dockerfile}" \
        --load \
        "${context}"

    log_info "Saving ${name} to tar..."
    mkdir -p "${OUTPUT_DIR}"
    docker save -o "${tar_file}" "${tag}"

    log_info "Saved: ${tar_file}"
    ls -lh "${tar_file}"
}

# Cleanup builder
cleanup_builder() {
    log_info "Cleaning up builder..."
    docker buildx rm arm64-builder 2>/dev/null || true
    docker buildx use default
}

# Main
main() {
    log_info "Starting ARM64 image build process..."
    log_info "Output directory: ${OUTPUT_DIR}"

    # Create output directory
    mkdir -p "${OUTPUT_DIR}"

    # Setup builder
    setup_builder

    # Build images
    log_info "Building all images..."

    # 1. Frontend
    build_image "frontend" "${SCRIPT_DIR}/frontend" "Dockerfile"

    # 2. Backend
    build_image "backend" "${SCRIPT_DIR}/backend" "Dockerfile"

    # 3. Claude Consumer
    build_image "claude-consumer" "${SCRIPT_DIR}/../consumer/claude-code-consumer" "Dockerfile"

    # 4. NATS (use buildx to get correct ARM64 image)
    log_info "Building NATS ARM64 image..."
    local nats_dir=$(mktemp -d)
    echo "FROM nats:2.10-alpine" > "${nats_dir}/Dockerfile"
    docker buildx build --platform linux/arm64 -t nats:2.10-arm64 -f "${nats_dir}/Dockerfile" --load "${nats_dir}"
    rm -rf "${nats_dir}"
    docker save -o "${OUTPUT_DIR}/nats-arm64.tar" nats:2.10-arm64
    log_info "Saved: ${OUTPUT_DIR}/nats-arm64.tar"
    ls -lh "${OUTPUT_DIR}/nats-arm64.tar"

    # Cleanup
    cleanup_builder

    # Summary
    log_info "=========================================="
    log_info "Build complete! Image files:"
    ls -lh "${OUTPUT_DIR}"/*.tar
    log_info "=========================================="
    log_info ""
    log_info "To deploy on target ARM64 server:"
    log_info "  1. Copy all .tar files to the server"
    log_info "  2. Load images: docker load -i <tar-file>"
    log_info "  3. Run with: docker compose up -d"
    log_info ""
    log_info "Or use the included deploy script"
}

# Handle interrupts
trap 'log_warn "Interrupted"; cleanup_builder; exit 1' INT TERM

main "$@"
