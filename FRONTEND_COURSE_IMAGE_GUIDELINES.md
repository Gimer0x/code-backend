# Frontend Course Image Recovery Guidelines

## Overview

This document provides guidelines for properly recovering and displaying course thumbnail images in the frontend application.

## Backend Image Storage

- **Storage Location**: Images are stored in `/uploads/courses/` directory on the backend
- **File Format**: Images are automatically converted to WebP format for better compression
- **Database Storage**: Thumbnails are stored as relative paths like `/uploads/courses/filename-{timestamp}.webp`
- **Image Processing**: Images are automatically resized to 800x600px with center crop

## Backend Image Serving

The backend serves images via two static routes:
1. **Direct Path**: `/uploads/*` - Direct access to uploaded files
2. **API Alias**: `/api/images/*` - Alternative path for consistency

## Frontend Implementation

### 1. Base URL Configuration

First, ensure you have the correct backend API base URL configured:

```typescript
// .env.local or environment configuration
NEXT_PUBLIC_API_BASE_URL=https://code-backend.fly.dev  // Production
// or
NEXT_PUBLIC_API_BASE_URL=http://localhost:3002       // Local development
```

### 2. Image URL Construction

When receiving course data from the API, the `thumbnail` field will contain a relative path like:
- `/uploads/courses/course1-1761665802204.webp`
- `null` or empty string if no thumbnail exists

**Important**: The thumbnail path from the database is relative, so you need to prepend the backend base URL.

### 3. Image URL Helper Function

**CRITICAL**: The database stores thumbnail paths like `uploads/courses/filename.webp` (no leading slash). The backend serves images at:
- `/uploads/*` - Direct path
- `/api/images/*` - Alias path (maps to same `uploads/` directory)

**IMPORTANT**: Do NOT use `/api/images/uploads/` - this is incorrect! The `/api/images/` path already maps to the `uploads/` directory, so adding `/uploads/` again creates a wrong path.

Create a helper function to construct the full image URL:

```typescript
// utils/imageUtils.ts
export function getCourseImageUrl(thumbnail: string | null | undefined): string | null {
  // If no thumbnail provided, return null
  if (!thumbnail || thumbnail.trim() === '') {
    return null;
  }

  // Get backend base URL from environment
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3002';
  
  // Normalize the thumbnail path
  // Database may store: "uploads/courses/filename.webp" or "/uploads/courses/filename.webp"
  let cleanPath = thumbnail.trim();
  
  // Remove leading slash if present
  if (cleanPath.startsWith('/')) {
    cleanPath = cleanPath.slice(1);
  }
  
  // IMPORTANT: If path starts with "uploads/", use it directly with /uploads/ prefix
  // If path starts with "api/images/", remove that prefix (it's redundant)
  if (cleanPath.startsWith('api/images/')) {
    // Remove the "api/images/" prefix since we'll use /uploads/ directly
    cleanPath = cleanPath.replace('^api/images/', '');
  }
  
  // Ensure path starts with "uploads/" (database may or may not have it)
  if (!cleanPath.startsWith('uploads/')) {
    cleanPath = `uploads/${cleanPath}`;
  }
  
  // Construct full URL using /uploads/ path (not /api/images/)
  return `${apiBaseUrl}/${cleanPath}`;
}
```

**Alternative simpler version** (if database always stores paths starting with "uploads/"):

```typescript
// utils/imageUtils.ts
export function getCourseImageUrl(thumbnail: string | null | undefined): string | null {
  if (!thumbnail || thumbnail.trim() === '') {
    return null;
  }

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3002';
  
  // Normalize: remove leading slash, ensure it starts with "uploads/"
  let path = thumbnail.trim();
  if (path.startsWith('/')) {
    path = path.slice(1);
  }
  
  // If path doesn't start with "uploads/", add it
  if (!path.startsWith('uploads/')) {
    path = `uploads/${path}`;
  }
  
  // Use /uploads/ path directly (NOT /api/images/uploads/)
  return `${apiBaseUrl}/${path}`;
}
```

### 4. Image Component with Fallback

Create a reusable course image component that handles missing images gracefully:

```typescript
// components/CourseImage.tsx
import Image from 'next/image';
import { getCourseImageUrl } from '@/utils/imageUtils';

interface CourseImageProps {
  thumbnail: string | null | undefined;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  fallbackSrc?: string;
}

export default function CourseImage({
  thumbnail,
  alt,
  width = 800,
  height = 600,
  className = '',
  fallbackSrc = '/images/default-course-thumbnail.png'
}: CourseImageProps) {
  const imageUrl = getCourseImageUrl(thumbnail);
  
  // If no image URL, use fallback
  if (!imageUrl) {
    return (
      <Image
        src={fallbackSrc}
        alt={alt}
        width={width}
        height={height}
        className={className}
        style={{ objectFit: 'cover' }}
      />
    );
  }
  
  return (
    <Image
      src={imageUrl}
      alt={alt}
      width={width}
      height={height}
      className={className}
      style={{ objectFit: 'cover' }}
      onError={(e) => {
        // Fallback to default image on error
        e.currentTarget.src = fallbackSrc;
      }}
    />
  );
}
```

### 5. Usage in Course Components

Use the `CourseImage` component in your course listing and detail pages:

```typescript
// components/CourseCard.tsx
import CourseImage from './CourseImage';

interface CourseCardProps {
  course: {
    id: string;
    title: string;
    thumbnail: string | null;
    // ... other course fields
  };
}

export default function CourseCard({ course }: CourseCardProps) {
  return (
    <div className="course-card">
      <CourseImage
        thumbnail={course.thumbnail}
        alt={course.title}
        width={400}
        height={300}
        className="course-thumbnail"
      />
      <h3>{course.title}</h3>
      {/* ... rest of course card */}
    </div>
  );
}
```

### 6. Direct Image URL (Alternative Approach)

If you prefer to construct URLs directly without a helper:

```typescript
// In your component
const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3002';
const imageUrl = course.thumbnail 
  ? `${apiBaseUrl}${course.thumbnail.startsWith('/') ? '' : '/'}${course.thumbnail}`
  : '/images/default-course-thumbnail.png';
```

### 7. Error Handling

Always handle image loading errors:

```typescript
// Using Next.js Image component
<Image
  src={imageUrl}
  alt={course.title}
  onError={(e) => {
    console.error('Failed to load course image:', imageUrl);
    e.currentTarget.src = '/images/default-course-thumbnail.png';
  }}
/>
```

### 8. Image Upload Flow

When uploading a new course thumbnail:

1. **Upload Image**:
   ```typescript
   const formData = new FormData();
   formData.append('thumbnail', file);
   
   const response = await fetch(`${apiBaseUrl}/api/upload/course-thumbnail`, {
     method: 'POST',
     headers: {
       'Authorization': `Bearer ${token}`
     },
     body: formData
   });
   
   const data = await response.json();
   // data.imagePath contains: "/uploads/courses/filename-{timestamp}.webp"
   ```

2. **Use the returned path** when creating/updating the course:
   ```typescript
   const courseData = {
     // ... other course data
     thumbnail: data.imagePath  // Use the path returned from upload endpoint
   };
   ```

## Common Issues and Solutions

### Issue 1: Images not loading (404 errors)

**Cause**: Incorrect URL construction or missing base URL

**Solution**:
- Verify `NEXT_PUBLIC_API_BASE_URL` is set correctly
- Ensure thumbnail path starts with `/uploads`
- Check browser network tab for actual requested URL

### Issue 2: CORS errors when loading images

**Cause**: Backend CORS configuration not allowing image requests

**Solution**:
- Verify backend `CORS_ORIGIN` environment variable includes your frontend domain
- Images served via static middleware should not require CORS, but verify backend configuration

### Issue 3: Images load slowly

**Cause**: Large image files or slow network

**Solution**:
- Backend automatically converts to WebP format (smaller file size)
- Use Next.js Image component with `priority` prop for above-the-fold images
- Consider implementing image lazy loading

### Issue 4: Missing images (null/undefined thumbnails)

**Cause**: Course created without thumbnail or thumbnail path lost

**Solution**:
- Always provide a fallback image
- Use the `CourseImage` component which handles null thumbnails automatically

## Testing Checklist

- [ ] Images load correctly in production
- [ ] Images load correctly in local development
- [ ] Fallback image displays when thumbnail is null
- [ ] Fallback image displays when image fails to load
- [ ] Image URLs are correctly constructed with base URL
- [ ] Images are responsive and maintain aspect ratio
- [ ] Image upload flow works end-to-end

## Example: Complete Course Card Implementation

```typescript
// components/CourseCard.tsx
'use client';

import Image from 'next/image';
import { useState } from 'react';

interface Course {
  id: string;
  title: string;
  thumbnail: string | null;
  goals: string;
  level: string;
}

interface CourseCardProps {
  course: Course;
}

export default function CourseCard({ course }: CourseCardProps) {
  const [imageError, setImageError] = useState(false);
  
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3002';
  const defaultImage = '/images/default-course-thumbnail.png';
  
  const imageUrl = course.thumbnail && !imageError
    ? `${apiBaseUrl}${course.thumbnail}`
    : defaultImage;
  
  return (
    <div className="course-card">
      <div className="course-image-container">
        <Image
          src={imageUrl}
          alt={course.title}
          width={400}
          height={300}
          className="course-thumbnail"
          style={{ objectFit: 'cover' }}
          onError={() => setImageError(true)}
        />
      </div>
      <div className="course-content">
        <h3>{course.title}</h3>
        <p>{course.goals}</p>
        <span className="course-level">{course.level}</span>
      </div>
    </div>
  );
}
```

## Environment Variables

Make sure these are set in your frontend `.env.local`:

```bash
# Production
NEXT_PUBLIC_API_BASE_URL=https://code-backend.fly.dev

# Local Development
# NEXT_PUBLIC_API_BASE_URL=http://localhost:3002
```

## Summary

1. **Always prepend the backend base URL** to thumbnail paths from the API
2. **Use a helper function** to construct image URLs consistently
3. **Always provide fallback images** for missing or failed image loads
4. **Handle errors gracefully** with error handlers
5. **Test in both environments** (local and production)
6. **Use Next.js Image component** for optimized image loading

