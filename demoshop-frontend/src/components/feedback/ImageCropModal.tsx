import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, Check, X } from 'lucide-react';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/ui/Button';

interface ImageCropModalProps {
  isOpen: boolean;
  imageSrc: string | null;
  onCropComplete: (croppedBlob: Blob, previewUrl: string) => void;
  onClose: () => void;
}

export const ImageCropModal: React.FC<ImageCropModalProps> = ({
  isOpen,
  imageSrc,
  onCropComplete,
  onClose,
}) => {
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Reset when a new image is loaded
  useEffect(() => {
    if (isOpen) {
      setZoom(1);
      setPosition({ x: 0, y: 0 });
      setIsDragging(false);
    }
  }, [isOpen, imageSrc]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      setDragStart({
        x: e.touches[0].clientX - position.x,
        y: e.touches[0].clientY - position.y,
      });
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return;
    setPosition({
      x: e.touches[0].clientX - dragStart.x,
      y: e.touches[0].clientY - dragStart.y,
    });
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom((prev) => Math.min(Math.max(1, Number((prev + delta).toFixed(2))), 3));
  };

  const handleCrop = () => {
    if (!imageRef.current || !containerRef.current) return;

    const img = imageRef.current;
    const canvas = document.createElement('canvas');
    const outputSize = 512;
    canvas.width = outputSize;
    canvas.height = outputSize;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const cropCircleDiameter = 256; // w-64 is 16rem = 256px
    const displayedImgRect = img.getBoundingClientRect();

    // Scale from displayed (unscaled natural layout size) to actual image natural size
    // img.width is the rendered layout size before CSS scale transform
    const naturalToLayoutRatio = img.naturalWidth / img.width;

    // Viewport circle center relative to container center
    const circleCenterX = containerRect.left + containerRect.width / 2;
    const circleCenterY = containerRect.top + containerRect.height / 2;

    // Crop box in viewport space
    const cropLeftInViewport = circleCenterX - cropCircleDiameter / 2;
    const cropTopInViewport = circleCenterY - cropCircleDiameter / 2;

    // Offset in transformed image space (relative to displayedImgRect top-left)
    const cropLeftInDisplayed = (cropLeftInViewport - displayedImgRect.left) / zoom;
    const cropTopInDisplayed = (cropTopInViewport - displayedImgRect.top) / zoom;
    const cropDiameterInDisplayed = cropCircleDiameter / zoom;

    // Convert to natural coordinates
    const sx = cropLeftInDisplayed * naturalToLayoutRatio;
    const sy = cropTopInDisplayed * naturalToLayoutRatio;
    const sWidth = cropDiameterInDisplayed * naturalToLayoutRatio;
    const sHeight = cropDiameterInDisplayed * naturalToLayoutRatio;

    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      img,
      sx,
      sy,
      sWidth,
      sHeight,
      0,
      0,
      outputSize,
      outputSize
    );

    canvas.toBlob(
      (blob) => {
        if (blob) {
          const previewUrl = URL.createObjectURL(blob);
          onCropComplete(blob, previewUrl);
        }
      },
      'image/jpeg',
      0.92
    );
  };

  if (!imageSrc) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Crop & Zoom Photo"
      size="md"
    >
      <div className="flex flex-col items-center space-y-5">
        <p className="text-xs text-ivory-dim text-center">
          Drag to reposition and use the slider or scroll wheel to zoom.
        </p>

        {/* Viewport Box */}
        <div
          ref={containerRef}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="relative w-72 h-72 rounded-2xl overflow-hidden bg-charcoal-dark border border-white/10 cursor-grab active:cursor-grabbing select-none flex items-center justify-center touch-none shadow-inner"
        >
          {/* Draggable & Scalable Image */}
          <img
            ref={imageRef}
            src={imageSrc}
            alt="Crop target"
            draggable={false}
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
              transition: isDragging ? 'none' : 'transform 0.1s ease-out',
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
            }}
            className="pointer-events-none select-none will-change-transform"
          />

          {/* Circular Crop Overlay Guide */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            {/* Shaded backdrop outside circle */}
            <div className="w-64 h-64 rounded-full border-2 border-gold shadow-[0_0_0_9999px_rgba(0,0,0,0.65)]" />
          </div>
        </div>

        {/* Zoom Controls */}
        <div className="w-full max-w-xs flex items-center space-x-3 bg-white/5 p-3 rounded-xl border border-white/10">
          <button
            type="button"
            onClick={() => setZoom((prev) => Math.max(1, Number((prev - 0.2).toFixed(2))))}
            disabled={zoom <= 1}
            className="p-1.5 rounded-lg text-ivory-dim hover:text-gold hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          <input
            type="range"
            min="1"
            max="3"
            step="0.05"
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            className="w-full h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-gold"
          />

          <button
            type="button"
            onClick={() => setZoom((prev) => Math.min(3, Number((prev + 0.2).toFixed(2))))}
            disabled={zoom >= 3}
            className="p-1.5 rounded-lg text-ivory-dim hover:text-gold hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setPosition({ x: 0, y: 0 });
            }}
            title="Reset"
            className="p-1.5 rounded-lg text-ivory-dim hover:text-gold hover:bg-white/10 transition-colors ml-1"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex w-full justify-end space-x-3 pt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            className="flex items-center space-x-1"
          >
            <X className="w-4 h-4" />
            <span>Cancel</span>
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleCrop}
            className="flex items-center space-x-1"
          >
            <Check className="w-4 h-4" />
            <span>Apply Crop</span>
          </Button>
        </div>
      </div>
    </Modal>
  );
};
