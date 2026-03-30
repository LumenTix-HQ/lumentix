# GitHub Actions Workflows

## Issue Fixed: Soroban CLI Installation Error

**Problem:**
The original installation command was failing with `sh: 1: Not: not found` error:
```bash
curl ... | sh  # ❌ This was failing
```

**Root Cause:**
- The install script from `soroban-example/soroban-cli` was either:
  - Incorrectly formatted
  - Had wrong URL
  - Used unsupported shell commands

**Solution Implemented:**

### Option 1: Install via Cargo (Recommended - `contract-ci.yml`)
```bash
cargo install --locked soroban-cli --features opt
```
✅ **Pros:**
- Most reliable method
- Direct from crates.io
- Well-tested and stable
- No external script dependencies

### Option 2: Fixed Install Script Method (`contract-ci-alternative.yml`)
```bash
# Download explicitly
curl -o soroban-cli-install.sh https://github.com/stellar/soroban-cli/releases/latest/download/soroban-cli-install.sh

# Debug: Show contents
cat soroban-cli-install.sh

# Make executable and run
chmod +x soroban-cli-install.sh
bash soroban-cli-install.sh
```
✅ **Pros:**
- Uses official Stellar repository (not soroban-example)
- Explicit steps for easier debugging
- Shows script contents if it fails

## Workflows

### `contract-ci.yml` (Main)
- Runs on every push/PR to `contract/**`
- Installs Soroban via cargo (most reliable)
- Runs tests, formatting, clippy
- Builds optimized WASM contract
- Uses caching for faster builds

### `contract-ci-alternative.yml` (Manual)
- Manual trigger only (`workflow_dispatch`)
- Uses fixed install script method
- Includes debugging steps
- Useful for troubleshooting

## Usage

The main workflow runs automatically. To manually trigger the alternative:
1. Go to GitHub Actions tab
2. Select "Smart Contract CI (Alternative)"
3. Click "Run workflow"

## Key Fixes Applied

1. ✅ Changed URL from `soroban-example/soroban-cli` to `stellar/soroban-cli`
2. ✅ Split download and execution into separate steps
3. ✅ Added debug output to see script contents
4. ✅ Used `bash` explicitly instead of `sh`
5. ✅ Added cargo-based installation as primary method
