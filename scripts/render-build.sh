#!/usr/bin/env bash
set -e

# Run pnpm via npx — no global install or corepack needed
npx --yes pnpm@10.26.1 install --frozen-lockfile

# Build the API server
npx --yes pnpm@10.26.1 --filter @workspace/api-server run build

# Build the admin panel at root path (served by the API server)
BASE_PATH=/ npx --yes pnpm@10.26.1 --filter @workspace/admin run build
