# Fly.io Performance Optimization Guide

## Current Issues

1. **Cold Starts**: `min_machines_running = 0` means machines stop when idle
2. **Low Database Resources**: Shared CPU might be slow
3. **No Connection Pooling**: Prisma uses default connection settings
4. **Limited Memory**: 1024MB might be tight for compilation tasks

## Recommended Optimizations

### 1. Keep Machines Running (Immediate Fix)

**Problem**: Machines stop when idle, causing cold starts (5-10 second delays)

**Fix**: Set `min_machines_running = 1` in `fly.toml`

```toml
[http_service]
  min_machines_running = 1  # Keep at least 1 machine running
```

**Impact**: Eliminates cold start delays
**Cost**: ~$2-5/month extra (keeps 1 machine running 24/7)

### 2. Increase VM Resources

**Current**: 2 CPUs, 1024MB RAM
**Recommended**: 2 CPUs, 2048MB RAM (better for compilation)

```toml
[[vm]]
  cpu_kind = 'shared'
  cpus = 2
  memory_mb = 2048  # Increased from 1024
```

**Impact**: Better performance for Foundry compilation
**Cost**: ~$5-10/month extra

### 3. Optimize Database Connection

**Add connection pooling** to Prisma:

```javascript
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'production' ? ['error'] : ['query', 'error', 'warn'],
  datasources: {
    db: {
      url: process.env.DATABASE_URL + '?connection_limit=10&pool_timeout=20'
    }
  }
});
```

Or use connection pooling in DATABASE_URL:
```
DATABASE_URL=postgresql://user:pass@host/db?connection_limit=10&pool_timeout=20
```

### 4. Upgrade Database (If Needed)

**Current**: shared-cpu-1x (basic tier)
**Recommended**: shared-cpu-2x or dedicated CPU

**Check database performance**:
```bash
flyctl postgres list
```

**Upgrade database**:
```bash
flyctl postgres update --vm-size shared-cpu-2x dappdojo-db
```

### 5. Add Database Indexes

Ensure database has proper indexes for common queries.

## Quick Wins (Apply Now)

1. ✅ Set `min_machines_running = 1` (eliminates cold starts)
2. ✅ Increase memory to 2048MB (better for compilation)
3. ✅ Add connection pooling to DATABASE_URL

## Cost Estimate

- **Current**: ~$10-15/month
- **Optimized**: ~$20-30/month
- **Performance Gain**: 3-5x faster response times

