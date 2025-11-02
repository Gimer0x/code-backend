# PostgreSQL Cluster Size Explanation

## What is "Initial Cluster Size"?

**Cluster Size** = Number of PostgreSQL instances in your database cluster

### For Development/Testing (Recommended):
- **Cluster Size: 1** (Single instance)
- ✅ Cheaper (~$2-3/month)
- ✅ Simple setup
- ✅ Perfect for development and small apps
- ❌ No high availability (if instance goes down, database is down)

### For Production/High Availability:
- **Cluster Size: 3** (Minimum for HA)
- ✅ High Availability (HA)
- ✅ Automatic failover
- ✅ Data replication
- ❌ More expensive (~$6-9/month)
- ❌ More complex setup

## Recommendation for Your Case

Since you're setting up a development/staging environment, use:
- **Cluster Size: 1** (or just press Enter for default)

You can upgrade to 3 later if you need HA for production.

## How to Set It

When creating the database, you'll see a prompt:
```
Initial cluster size - Specify at least 3 for HA (3)
```

**For development/staging:**
- Press `1` and Enter (single instance)
- Or just press Enter if 1 is acceptable

**For production with HA:**
- Type `3` and Enter (minimum for high availability)

## Cost Impact

- **Size 1**: ~$2-3/month
- **Size 3**: ~$6-9/month (3x the cost)

## When to Use What

| Use Case | Cluster Size | Why |
|----------|--------------|-----|
| Development | 1 | Cost-effective, simple |
| Testing | 1 | Enough for testing |
| Staging | 1 | Similar to dev |
| Production (small) | 1 | If downtime is acceptable |
| Production (critical) | 3+ | Need HA and failover |

## Your Current Situation

Since you're setting up the database for `code-backend`:
- **Recommended: Cluster Size 1** (single instance)
- This is fine for development, testing, and even small production apps
- You can always upgrade to HA (size 3) later if needed

## Command with Cluster Size

```bash
# Create with cluster size 1 (development)
flyctl postgres create \
  --name dappdojo-db \
  --region sjc \
  --vm-size shared-cpu-1x \
  --volume-size 10 \
  --initial-cluster-size 1

# Create with cluster size 3 (production HA)
flyctl postgres create \
  --name dappdojo-db \
  --region sjc \
  --vm-size shared-cpu-1x \
  --volume-size 10 \
  --initial-cluster-size 3
```

## Summary

**For your case (development/testing):**
- Use **cluster size 1**
- Type `1` when prompted, or use `--initial-cluster-size 1` flag
- Much cheaper and sufficient for your needs
- You can upgrade to 3 later if you need HA
