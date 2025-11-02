# Foundry Installation Issue

## Problem

The Foundry binaries are installed but cannot execute due to a library compatibility issue:

```
Error loading shared library ld-linux-x86-64.so.2: No such file or directory
Error relocating /root/.foundry/bin/forge: __snprintf_chk: symbol not found
```

## Root Cause

- **Docker Image**: `node:18-alpine` (Alpine Linux with musl libc)
- **Foundry Binaries**: Compiled for glibc (standard Linux)
- **Issue**: Alpine uses musl libc, but Foundry requires glibc

## Solutions

### Option 1: Install glibc Compatibility Layer (Quick Fix)

Add to Dockerfile before Foundry installation:

```dockerfile
# Install glibc compatibility for Alpine
RUN apk add --no-cache gcompat
```

### Option 2: Use Debian/Ubuntu Base Image (Recommended)

Change from `node:18-alpine` to `node:18` (Debian-based):

```dockerfile
FROM node:18
```

This provides full glibc support.

### Option 3: Use Foundry Docker Image

Use the official Foundry Docker image as base:

```dockerfile
FROM ghcr.io/foundry-rs/foundry:latest as foundry
FROM node:18
COPY --from=foundry /usr/local/bin/* /usr/local/bin/
```

## Current Status

✅ **Binaries exist**: `/root/.foundry/bin/forge` (64.4M)
✅ **Permissions correct**: `-rwxr-xr-x`
❌ **Cannot execute**: Missing glibc compatibility

## Verification Commands

To check if Foundry works after fix:

```bash
# On Fly.io
flyctl ssh console --app code-backend -C 'bash -c "/root/.foundry/bin/forge --version"'

# Or test compilation
flyctl ssh console --app code-backend -C 'bash -c "cd /tmp && forge init test --force && cd test && forge build"'
```

## Recommended Fix

Use Option 2 (Debian base image) for full compatibility and fewer issues.

