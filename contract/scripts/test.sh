#!/bin/bash

# Test script for Soroban contract
set -e

echo "🧪 Running Soroban contract tests..."

# Check if Rust is installed
if ! command -v cargo &> /dev/null; then
    echo "❌ Rust is not installed. Please install Rust first."
    exit 1
fi

# Run tests
echo "🔍 Running unit tests..."
cargo test

# Check if tests were successful
if [ $? -eq 0 ]; then
    echo "✅ All tests passed!"
else
    echo "❌ Some tests failed!"
    exit 1
fi
