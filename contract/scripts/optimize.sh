#!/bin/bash

# Optimize script for Soroban contract
set -e

echo "⚡ Optimizing Soroban contract..."

# Check if WASM file exists
WASM_FILE="target/wasm32-unknown-unknown/release/lumentix_contract.wasm"
if [ ! -f "$WASM_FILE" ]; then
    echo "❌ WASM file not found. Please build the contract first."
    echo "Run: ./scripts/build.sh"
    exit 1
fi

# Optimize the contract
echo "🔧 Optimizing WASM..."
soroban contract optimize "$WASM_FILE"

# Check if optimization was successful
if [ $? -eq 0 ]; then
    echo "✅ Optimization successful!"
    echo "📄 Optimized WASM file: target/wasm32-unknown-unknown/release/lumentix_contract.optimized.wasm"

    # Show file size comparison
    ORIGINAL_SIZE=$(wc -c < "$WASM_FILE")
    OPTIMIZED_SIZE=$(wc -c < "${WASM_FILE%.wasm}.optimized.wasm")
    REDUCTION=$((ORIGINAL_SIZE - OPTIMIZED_SIZE))
    PERCENTAGE=$((REDUCTION * 100 / ORIGINAL_SIZE))

    echo "📊 Size reduction: $REDUCTION bytes ($PERCENTAGE%)"
else
    echo "❌ Optimization failed!"
    exit 1
fi
