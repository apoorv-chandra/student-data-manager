#!/usr/bin/env bash
set -e

# Enable pnpm via corepack (built into Node.js — no global install needed)
corepack enable pnpm
corepack prepare pnpm@10.26.1 --activate

# Install all workspace dependencies
pnpm install --frozen-lockfile

# Build the API server
pnpm --filter @workspace/api-server run build
