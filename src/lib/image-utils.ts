// Image processing utilities for photo uploads

export const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
export const ACCEPTED_FORMATS = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
export const MAX_DIMENSION = 1024;

export interface ImageProcessingResult {
  file: File;
  preview: string;
}

/**
 * Validates image file size and format
 */
export function validateImageFile(file: File): { valid: boolean; error?: string } {
  if (!ACCEPTED_FORMATS.includes(file.type)) {
    return {
      valid: false,
      error: 'Formato no permitido. Usa JPG, PNG o WebP.'
    };
  }

  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: 'Archivo muy grande. Máximo 2MB.'
    };
  }

  return { valid: true };
}

/**
 * Resizes and compresses image to WebP format
 */
export function processImage(file: File): Promise<ImageProcessingResult> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('No se pudo crear el contexto de canvas'));
      return;
    }

    img.onload = () => {
      // Calculate new dimensions maintaining aspect ratio
      let { width, height } = img;
      
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        if (width > height) {
          height = Math.round((height * MAX_DIMENSION) / width);
          width = MAX_DIMENSION;
        } else {
          width = Math.round((width * MAX_DIMENSION) / height);
          height = MAX_DIMENSION;
        }
      }

      canvas.width = width;
      canvas.height = height;

      // Draw and compress
      ctx.drawImage(img, 0, 0, width, height);
      
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('No se pudo procesar la imagen'));
            return;
          }

          // Create new file with WebP format
          const processedFile = new File([blob], `${Date.now()}.webp`, {
            type: 'image/webp'
          });

          // Create preview URL
          const preview = URL.createObjectURL(blob);

          resolve({ file: processedFile, preview });
        },
        'image/webp',
        0.8 // 80% quality
      );
    };

    img.onerror = () => reject(new Error('No se pudo cargar la imagen'));
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Generates a unique filename for storage
 */
export function generateFileName(): string {
  return `${crypto.randomUUID()}.webp`;
}

/**
 * Gets the storage path for a professional's photo
 */
export function getProfessionalPhotoPath(professionalId: string, filename: string): string {
  return `professionals/${professionalId}/${filename}`;
}

/**
 * Gets the storage path for a category's icon
 */
export function getCategoryIconPath(categoryId: string, filename: string): string {
  return `categories/${categoryId}/${filename}`;
}

/**
 * Extracts filename from a storage URL
 */
export function extractFilenameFromUrl(url: string): string | null {
  try {
    const urlParts = url.split('/');
    return urlParts[urlParts.length - 1];
  } catch {
    return null;
  }
}

/**
 * Checks if URL is from our storage bucket
 */
export function isOurStorageUrl(url: string): boolean {
  return url.includes('/storage/v1/object/public/public-media/professionals/') ||
         url.includes('/storage/v1/object/public/public-media/categories/');
}