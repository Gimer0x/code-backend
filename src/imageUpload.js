import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import { promises as fs } from 'fs';

// Configure multer for memory storage
const storage = multer.memoryStorage();

// File filter for images only
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

// Multer configuration
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  }
});

// Sanitize filename to handle UTF-8 and special characters safely
function sanitizeFilename(filename) {
  // Decode if needed, then remove/replace problematic characters
  let safe = filename
    .normalize('NFD') // Decompose accented characters
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^a-zA-Z0-9.-]/g, '_') // Replace non-alphanumeric with underscore
    .replace(/_{2,}/g, '_') // Collapse multiple underscores
    .trim();
  // Ensure we have something valid
  if (!safe || safe.length === 0) safe = 'image';
  return safe.substring(0, 100); // Limit length
}

// Image processing function
export async function processImage(buffer, filename) {
  try {
    // Create uploads directory if it doesn't exist
    const uploadsDir = path.join(process.cwd(), 'uploads', 'courses');
    await fs.mkdir(uploadsDir, { recursive: true });

    // Generate unique filename with sanitization
    const timestamp = Date.now();
    const name = sanitizeFilename(path.parse(filename).name);
    const ext = '.webp'; // Convert to WebP for better compression
    const processedFilename = `${name}-${timestamp}${ext}`;
    const filePath = path.join(uploadsDir, processedFilename);

    // Process image with Sharp
    await sharp(buffer)
      .resize(800, 600, { 
        fit: 'cover',
        position: 'center'
      })
      .webp({ quality: 80 })
      .toFile(filePath);

    // Return relative path for database storage (leading slash)
    return `/uploads/courses/${processedFilename}`;
  } catch (error) {
    console.error('Image processing error:', error);
    throw new Error('Failed to process image');
  }
}

// Middleware for single image upload
export const uploadSingleImage = upload.single('thumbnail');

// Middleware for multiple images
export const uploadMultipleImages = upload.array('images', 5);

export default upload;
