// Image compression and upload utilities
import { supabase } from '@/integrations/supabase/client';

// Image cache for performance
const imageCache = new Map<string, string>();

export const compressImage = (file: File, maxSizeKB: number = 65): Promise<Blob> => {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const img = new Image();

    img.onload = () => {
      // Calculate dimensions to maintain aspect ratio - reduced for smaller file size
      const maxDimension = 600; // Reduced from 800 for smaller files
      let { width, height } = img;

      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = (height * maxDimension) / width;
          width = maxDimension;
        } else {
          width = (width * maxDimension) / height;
          height = maxDimension;
        }
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);

      // Start with quality 0.6 and reduce if needed for 50-75KB target
      let quality = 0.6;
      const compress = () => {
        canvas.toBlob((blob) => {
          if (blob && blob.size <= maxSizeKB * 1024) {
            resolve(blob);
          } else if (quality > 0.1) {
            quality -= 0.1;
            compress();
          } else {
            resolve(blob!);
          }
        }, 'image/jpeg', quality);
      };

      compress();
    };

    img.src = URL.createObjectURL(file);
  });
};

export const uploadItemImage = async (file: File, itemId: string): Promise<string> => {
  try {
    // Compress the image
    const compressedBlob = await compressImage(file);

    // Generate unique filename
    const timestamp = Date.now();
    const fileName = `${itemId}_${timestamp}.jpg`;
    const filePath = `items/${fileName}`;

    // Upload to Supabase storage
    const { data, error } = await supabase.storage
      .from('item-images')
      .upload(filePath, compressedBlob, {
        cacheControl: '3600',
        upsert: true
      });

    if (error) throw error;

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('item-images')
      .getPublicUrl(filePath);

    // Cache the URL
    imageCache.set(itemId, publicUrl);

    return publicUrl;
  } catch (error) {
    console.error('Error uploading image:', error);
    throw error;
  }
};

export const getCachedImageUrl = (itemId: string): string | null => {
  return imageCache.get(itemId) || null;
};

export const cacheImageUrl = (itemId: string, url: string) => {
  imageCache.set(itemId, url);
};

export const deleteItemImage = async (imageUrl: string): Promise<void> => {
  try {
    // Extract file path from URL
    const urlParts = imageUrl.split('/');
    const fileName = urlParts[urlParts.length - 1];
    const filePath = `items/${fileName}`;

    const { error } = await supabase.storage
      .from('item-images')
      .remove([filePath]);

    if (error) throw error;
  } catch (error) {
    console.error('Error deleting image:', error);
    throw error;
  }
};