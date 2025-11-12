# Fix Course Image Issues - Complete Guide

## Problems Identified

1. **Frontend URL Construction Error**: Frontend is using `/api/images/uploads/courses/` which is incorrect
2. **Missing Persistent Storage**: Uploads directory not mounted to volume (images lost on restart)
3. **Missing Image Files**: Some images return 404 because they were lost

## Solutions

### 1. Fix Frontend URL Construction (URGENT)

The frontend is constructing URLs incorrectly. See `FRONTEND_IMAGE_URL_FIX.md` for the complete fix.

**Quick Fix**:
```typescript
// WRONG (current):
const imageUrl = `${apiBaseUrl}/api/images/${thumbnail}`;
// This creates: /api/images/uploads/courses/filename.webp (WRONG!)

// CORRECT:
const imageUrl = `${apiBaseUrl}/${thumbnail}`;
// This creates: /uploads/courses/filename.webp (CORRECT!)
```

### 2. Create Uploads Volume

Run these commands to create a persistent volume for uploads:

```bash
# Create the volume
flyctl volumes create uploads_vol --size 1 --app code-backend --region sjc

# The fly.toml has been updated to mount this volume
# Deploy the changes
flyctl deploy --app code-backend
```

### 3. Re-upload Missing Images

After fixing the frontend and creating the volume, you'll need to re-upload any missing course thumbnails through the admin interface.

## Backend Status

✅ **Backend is healthy** - Database connection working
✅ **Image serving configured** - `/uploads/` and `/api/images/` routes active
✅ **Volume mount added** - `fly.toml` updated to mount `uploads_vol`
⚠️ **Volume needs creation** - Run `flyctl volumes create` command above
⚠️ **Some images missing** - Need to re-upload after volume is created

## Testing After Fix

1. **Test image URL construction**:
   ```bash
   # Should work:
   curl -I https://code-backend.fly.dev/uploads/courses/filename.webp
   
   # Should also work:
   curl -I https://code-backend.fly.dev/api/images/courses/filename.webp
   
   # Should NOT work (wrong path):
   curl -I https://code-backend.fly.dev/api/images/uploads/courses/filename.webp
   ```

2. **Verify frontend can load images**:
   - Check browser network tab
   - Verify URLs are: `https://code-backend.fly.dev/uploads/courses/...`
   - NOT: `https://code.dappdojo.com/api/images/uploads/courses/...`

## Next Steps

1. **Frontend Team**: Fix URL construction (see `FRONTEND_IMAGE_URL_FIX.md`)
2. **Backend Team**: Create uploads volume and deploy
3. **Admin**: Re-upload missing course thumbnails

