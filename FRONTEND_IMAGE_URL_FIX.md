# Frontend Image URL Fix - URGENT

## Problem

The frontend is constructing image URLs incorrectly, resulting in 404 errors:

**Current (WRONG)**:
```
https://code.dappdojo.com/api/images/uploads/courses/Arbitrum_Course-1762871469069.webp
```

**Should be**:
```
https://code-backend.fly.dev/uploads/courses/Arbitrum_Course-1762871469069.webp
```

## Root Cause

1. **Database stores**: `uploads/courses/filename.webp` (no leading slash)
2. **Backend serves at**: 
   - `/uploads/*` → maps to `uploads/` directory
   - `/api/images/*` → also maps to `uploads/` directory (alias)
3. **Frontend is doing**: `/api/images/uploads/courses/` which looks for `uploads/uploads/courses/` (WRONG!)

## Quick Fix

### Option 1: Use `/uploads/` path directly (RECOMMENDED)

```typescript
// Fix your image URL construction
const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3002';
const thumbnail = course.thumbnail; // e.g., "uploads/courses/filename.webp"

// Remove leading slash if present
const cleanPath = thumbnail?.startsWith('/') ? thumbnail.slice(1) : thumbnail;

// Construct URL using /uploads/ path
const imageUrl = cleanPath ? `${apiBaseUrl}/${cleanPath}` : '/default-image.png';
```

### Option 2: Use `/api/images/` but remove `/uploads/` prefix

```typescript
const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3002';
let thumbnail = course.thumbnail; // e.g., "uploads/courses/filename.webp"

// Remove leading slash
if (thumbnail?.startsWith('/')) {
  thumbnail = thumbnail.slice(1);
}

// Remove "uploads/" prefix if using /api/images/ path
const pathWithoutUploads = thumbnail?.replace(/^uploads\//, '') || '';
const imageUrl = pathWithoutUploads 
  ? `${apiBaseUrl}/api/images/${pathWithoutUploads}`
  : '/default-image.png';
```

## Complete Fix Example

```typescript
// utils/imageUtils.ts
export function getCourseImageUrl(thumbnail: string | null | undefined): string | null {
  if (!thumbnail || thumbnail.trim() === '') {
    return null;
  }

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3002';
  
  // Normalize path: remove leading slash
  let path = thumbnail.trim();
  if (path.startsWith('/')) {
    path = path.slice(1);
  }
  
  // Ensure path starts with "uploads/" (database should already have this)
  if (!path.startsWith('uploads/')) {
    path = `uploads/${path}`;
  }
  
  // Use /uploads/ path directly (NOT /api/images/uploads/)
  return `${apiBaseUrl}/${path}`;
}
```

## Where to Fix in Your Code

Search your frontend codebase for:
- `api/images/uploads` - This is the wrong pattern
- Image URL construction logic
- Any code that processes `course.thumbnail`

## Testing

After fixing, test with:
```typescript
// Should work:
getCourseImageUrl("uploads/courses/filename.webp")
// Returns: "https://code-backend.fly.dev/uploads/courses/filename.webp"

// Should also work:
getCourseImageUrl("/uploads/courses/filename.webp")
// Returns: "https://code-backend.fly.dev/uploads/courses/filename.webp"
```

## Additional Issues

1. **Backend domain**: Make sure `NEXT_PUBLIC_API_BASE_URL` is set to `https://code-backend.fly.dev` (not `code.dappdojo.com` unless that's a proxy)
2. **Missing images**: Some images may be missing from the backend (404). You'll need to re-upload them.
3. **Persistent storage**: The backend now has a volume mount for uploads, so future uploads will persist.

