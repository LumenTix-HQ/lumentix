#!/bin/bash

# Build script for Soroban contract
set -e

echo "🔨 Building Soroban contract..."

# Check if Rust is installed
if ! command -v cargo &> /dev/null; then
    echo "❌ Rust is not installed. Please install Rust first."
    exit 1
fi

# Check if WASM target is installed
if ! rustup target list --installed | grep -q wasm32-unknown-unknown; then
    echo "📦 Installing WASM target..."
    rustup target add wasm32-unknown-unknown
fi

# Build the contract
echo "🏗️  Building contract..."
cargo build --target wasm32-unknown-unknown --release

# Check if build was successful
if [ $? -eq 0 ]; then
    echo "✅ Build successful!"
    echo "📄 WASM file: target/wasm32-unknown-unknown/release/lumentix_contract.wasm"
else
    echo "❌ Build failed!"
    exit 1
fi
