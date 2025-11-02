# Creating PostgreSQL Database on Fly.io

## Option 1: Managed Postgres (Recommended by Fly.io)

```bash
# Create managed PostgreSQL database
flyctl postgres create --name dappdojo-db --region sjc --vm-size shared-cpu-1x --volume-size 10

# If it asks for confirmation, use:
flyctl postgres create --name dappdojo-db --region sjc --vm-size shared-cpu-1x --volume-size 10 --yes

# Then attach it
flyctl postgres attach dappdojo-db --app code-backend
```

## Option 2: Using Fly.io Web Dashboard

1. Go to https://fly.io/dashboard
2. Click "Create Postgres"
3. Name it: `dappdojo-db`
4. Region: `sjc` (San Jose)
5. VM Size: `shared-cpu-1x`
6. Volume Size: `10 GB`
7. After creation, attach it to your app:
   ```bash
   flyctl postgres attach dappdojo-db --app code-backend
   ```

## After Creation

Once the database is created, attach it:

```bash
flyctl postgres attach dappdojo-db --app code-backend
```

This will automatically set DATABASE_URL in your app secrets.

## Verify

```bash
# Check DATABASE_URL is set
flyctl secrets list --app code-backend | grep DATABASE_URL

# Run verification script
./verify-db.sh code-backend
```
