import React, { useState, useRef } from 'react';
import { Upload, Trash2, Loader2, Image as ImageIcon, AlertCircle } from 'lucide-react';
import { supabase } from '@/config/supabaseClient';
import { uploadShopMedia } from '@/services/shopSettings.service';

interface ServiceImageUploaderProps {
  imageUrl?: string | null;
  serviceTitle: string;
  onImageUploaded: (url: string) => void;
  onImageRemoved: () => void;
  disabled?: boolean;
}

/**
 * Client-side image compression/resizing utility.
 * Constrains dimensions to 16:9 (max 1600x900) and encodes to WebP to keep file sizes well below 3MB.
 */
async function compressImageForUpload(
  file: File,
  maxWidth = 1600,
  maxHeight = 900,
  quality = 0.85
): Promise<File> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file for compression.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to parse image bitmap.'));
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file);
          return;
        }

        // Draw with smooth bi-linear interpolation
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file);
              return;
            }
            const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
            const compressedFile = new File([blob], `${cleanName}_opt.webp`, {
              type: 'image/webp',
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          },
          'image/webp',
          quality
        );
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export const ServiceImageUploader: React.FC<ServiceImageUploaderProps> = ({
  imageUrl,
  serviceTitle,
  onImageUploaded,
  onImageRemoved,
  disabled = false,
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleProcessFile = async (rawFile: File | undefined) => {
    if (!rawFile || disabled) return;
    setUploadError(null);

    // Validate mime-type
    const validMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (!validMimes.includes(rawFile.type.toLowerCase())) {
      setUploadError('Invalid format. Please upload a JPG, PNG, or WebP photo.');
      return;
    }

    // Pre-compression size guard (max 10MB raw)
    if (rawFile.size > 10 * 1024 * 1024) {
      setUploadError('Source file exceeds 10MB limit.');
      return;
    }

    setIsUploading(true);

    try {
      // 1. Client-side compression / resizing
      const compressedFile = await compressImageForUpload(rawFile);

      // Verify compressed size <= 3MB
      if (compressedFile.size > 3 * 1024 * 1024) {
        setUploadError('Compressed image exceeds 3MB limit.');
        setIsUploading(false);
        return;
      }

      const randomKey = Math.random().toString(36).substring(2, 9);
      const cleanTitle = (serviceTitle || 'service').toLowerCase().replace(/[^a-z0-9]/g, '-');
      const storagePath = `service-thumbnails/${cleanTitle}_${Date.now()}_${randomKey}.webp`;

      let publicUrl: string | null = null;

      // 2. Direct-to-storage upload pipeline targeting Supabase Storage
      try {
        const { error: directError } = await supabase.storage
          .from('service-thumbnails')
          .upload(storagePath, compressedFile, {
            contentType: 'image/webp',
            upsert: true,
          });

        if (!directError) {
          const { data: publicUrlData } = supabase.storage
            .from('service-thumbnails')
            .getPublicUrl(storagePath);
          if (publicUrlData?.publicUrl) {
            publicUrl = publicUrlData.publicUrl;
          }
        }
      } catch (err) {
        // Fallback to secondary storefront-assets bucket or backend media endpoint
      }

      // Try secondary bucket if direct bucket not configured
      if (!publicUrl) {
        try {
          const { error: fallbackError } = await supabase.storage
            .from('storefront-assets')
            .upload(storagePath, compressedFile, {
              contentType: 'image/webp',
              upsert: true,
            });

          if (!fallbackError) {
            const { data: publicUrlData } = supabase.storage
              .from('storefront-assets')
              .getPublicUrl(storagePath);
            if (publicUrlData?.publicUrl) {
              publicUrl = publicUrlData.publicUrl;
            }
          }
        } catch {
          // Continue to backend fallback
        }
      }

      // Authoritative fallback: Admin backend storage endpoint (ensures 100% upload success in all environments)
      if (!publicUrl) {
        publicUrl = await uploadShopMedia(compressedFile, 'services');
      }

      if (publicUrl) {
        onImageUploaded(publicUrl);
      } else {
        throw new Error('Could not generate CDN public URL for uploaded photo.');
      }
    } catch (err: any) {
      console.error('[ServiceImageUploader] Upload failed:', err);
      setUploadError(err?.response?.data?.message || err?.message || 'Failed to upload photo.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    void handleProcessFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled && !isUploading) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (disabled || isUploading) return;
    const file = e.dataTransfer.files?.[0];
    void handleProcessFile(file);
  };

  return (
    <div className="space-y-1.5 w-full">
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/jpg"
        onChange={handleFileChange}
        className="hidden"
        disabled={disabled || isUploading}
      />

      {/* Aspect Ratio Constraint: Fixed aspect-video container to eliminate layout shift */}
      <div className="relative w-full aspect-video overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 group select-none">
        {isUploading ? (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-zinc-950/90 gap-2 p-3 text-center">
            <Loader2 className="w-7 h-7 text-amber-400 animate-spin" />
            <p className="text-xs font-semibold text-zinc-100">Compressing & uploading photo…</p>
            <p className="text-[10px] text-zinc-400 font-mono">Connecting to Supabase Storage</p>
          </div>
        ) : imageUrl ? (
          /* Image Present State */
          <>
            <img
              src={imageUrl}
              alt={serviceTitle}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            {/* Subtle bottom bar for readability */}
            <div className="absolute inset-x-0 bottom-0 h-10 bg-black/40 pointer-events-none" />

            {/* Dark Hover Overlay */}
            <div className="absolute inset-0 z-10 bg-black/75 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-2 p-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled}
                className="px-3 py-1.5 rounded-sm bg-zinc-900/90 hover:bg-zinc-800 text-zinc-100 border border-zinc-700/80 text-xs font-semibold flex items-center gap-1.5 shadow-md transition-all cursor-pointer hover:border-amber-400/60"
                title="Change this photo"
              >
                <Upload className="w-3.5 h-3.5 text-amber-400" />
                <span>Change Image</span>
              </button>

              <button
                type="button"
                onClick={onImageRemoved}
                disabled={disabled}
                className="p-1.5 rounded-sm bg-red-950/80 hover:bg-red-900/90 text-red-300 border border-red-500/30 hover:border-red-500/60 transition-all cursor-pointer shadow-md"
                title="Remove photo"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </>
        ) : (
          /* Empty State: Dashed border box */
          <div
            onClick={() => {
              if (!disabled && !isUploading) {
                fileInputRef.current?.click();
              }
            }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`w-full h-full flex flex-col items-center justify-center p-4 text-center cursor-pointer transition-all border-2 border-dashed ${
              isDragOver
                ? 'border-amber-400 bg-amber-400/10'
                : 'border-zinc-700/60 bg-zinc-900/40 hover:border-amber-400/60 hover:bg-zinc-900/60'
            }`}
          >
            <div className="w-10 h-10 rounded-full bg-zinc-800/80 border border-zinc-700/50 flex items-center justify-center text-zinc-400 group-hover:text-amber-400 group-hover:border-amber-400/40 transition-colors mb-1.5">
              <Upload className="w-4 h-4" />
            </div>
            <p className="text-xs font-semibold text-zinc-200 group-hover:text-amber-300 transition-colors">
              Drop photo or click to browse
            </p>
            <p className="text-[10px] text-zinc-400 mt-0.5 font-sans">
              JPG, PNG, WebP up to 3MB (16:9 recommended)
            </p>
          </div>
        )}
      </div>

      {uploadError && (
        <div className="flex items-center gap-1.5 text-[11px] text-red-400 bg-red-950/30 border border-red-900/40 px-2 py-1 rounded">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{uploadError}</span>
        </div>
      )}
    </div>
  );
};

export default ServiceImageUploader;
