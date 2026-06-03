#!/usr/bin/env bash
set -e

# Run pnpm via npx — no global install or corepack needed
# This downloads the exact version to npx cache without touching system dirs
npx --yes pnpm@10.26.1 install --frozen-lockfile
npx --yes pnpm@10.26.1 --filter @workspace/api-server run build
