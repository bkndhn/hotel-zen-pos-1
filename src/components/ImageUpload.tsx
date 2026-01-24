import React, { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Upload, X, Camera, Image as ImageIcon } from 'lucide-react';
import { uploadItemImage, getCachedImageUrl } from '@/utils/imageUtils';
import { useToast } from '@/hooks/use-toast';

interface ImageUploadProps {
  value?: string;
  onChange: (url: string) => void;
  itemId?: string;
  className?: string;
}

export const ImageUpload: React.FC<ImageUploadProps> = ({
  value,
  onChange,
  itemId,
  className = ""
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [cropMode, setCropMode] = useState(false);
  const [cropStart, setCropStart] = useState({ x: 0, y: 0 });
  const [cropEnd, setCropEnd] = useState({ x: 100, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const { toast } = useToast();

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await processFile(file);
  };

  const processFile = async (file: File) => {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid file type",
        description: "Please select an image file",
        variant: "destructive"
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please select an image smaller than 5MB",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsUploading(true);
      const imageUrl = await uploadItemImage(file, itemId || Date.now().toString());
      onChange(imageUrl);
      toast({
        title: "Image uploaded successfully",
        description: "Image has been compressed and uploaded"
      });
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Upload failed",
        description: "Failed to upload image. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } 
      });
      streamRef.current = stream;
      setShowCamera(true);
      
      // Wait for dialog to open then set video source
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      }, 100);
    } catch (error) {
      console.error('Camera error:', error);
      toast({
        title: "Camera access denied",
        description: "Please allow camera access to take photos",
        variant: "destructive"
      });
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setShowCamera(false);
    setCapturedImage(null);
    setCropMode(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0);
      const imageData = canvas.toDataURL('image/jpeg', 0.9);
      setCapturedImage(imageData);
      setCropMode(true);
      setCropStart({ x: 10, y: 10 });
      setCropEnd({ x: 90, y: 90 });
    }
  };

  const retakePhoto = () => {
    setCapturedImage(null);
    setCropMode(false);
  };

  const handleCropMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setCropStart({ x, y });
    setCropEnd({ x, y });
    setIsDragging(true);
  };

  const handleCropMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100));
    setCropEnd({ x, y });
  };

  const handleCropMouseUp = () => {
    setIsDragging(false);
  };

  const getCropStyle = () => {
    const left = Math.min(cropStart.x, cropEnd.x);
    const top = Math.min(cropStart.y, cropEnd.y);
    const width = Math.abs(cropEnd.x - cropStart.x);
    const height = Math.abs(cropEnd.y - cropStart.y);
    return { left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` };
  };

  const applyCropAndUpload = async () => {
    if (!capturedImage || !canvasRef.current) return;

    try {
      setIsUploading(true);
      
      const img = new Image();
      img.src = capturedImage;
      
      await new Promise((resolve) => {
        img.onload = resolve;
      });

      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Calculate crop area
      const cropLeft = Math.min(cropStart.x, cropEnd.x) / 100;
      const cropTop = Math.min(cropStart.y, cropEnd.y) / 100;
      const cropWidth = Math.abs(cropEnd.x - cropStart.x) / 100;
      const cropHeight = Math.abs(cropEnd.y - cropStart.y) / 100;

      const srcX = img.width * cropLeft;
      const srcY = img.height * cropTop;
      const srcW = img.width * cropWidth;
      const srcH = img.height * cropHeight;

      // Set canvas to cropped dimensions (max 600px)
      const maxDim = 600;
      let destW = srcW;
      let destH = srcH;
      if (destW > maxDim || destH > maxDim) {
        if (destW > destH) {
          destH = (destH * maxDim) / destW;
          destW = maxDim;
        } else {
          destW = (destW * maxDim) / destH;
          destH = maxDim;
        }
      }

      canvas.width = destW;
      canvas.height = destH;
      ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, destW, destH);

      // Convert to blob and upload
      canvas.toBlob(async (blob) => {
        if (blob) {
          const file = new File([blob], 'captured-image.jpg', { type: 'image/jpeg' });
          const imageUrl = await uploadItemImage(file, itemId || Date.now().toString());
          onChange(imageUrl);
          toast({
            title: "Image uploaded successfully",
            description: "Photo has been cropped and uploaded"
          });
          stopCamera();
        }
      }, 'image/jpeg', 0.85);

    } catch (error) {
      console.error('Crop/Upload error:', error);
      toast({
        title: "Upload failed",
        description: "Failed to process and upload image",
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveImage = () => {
    onChange('');
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />
      <canvas ref={canvasRef} className="hidden" />

      {value ? (
        <div className="relative">
          <img
            src={value}
            alt="Item"
            className="w-full h-32 object-cover rounded-lg border"
          />
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleRemoveImage}
            className="absolute top-2 right-2 h-6 w-6 p-0"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex-1 h-24 border-2 border-dashed"
          >
            <div className="flex flex-col items-center space-y-1">
              {isUploading ? (
                <Upload className="h-5 w-5 animate-spin" />
              ) : (
                <ImageIcon className="h-5 w-5" />
              )}
              <span className="text-xs">
                {isUploading ? 'Uploading...' : 'Gallery'}
              </span>
            </div>
          </Button>
          
          <Button
            type="button"
            variant="outline"
            onClick={startCamera}
            disabled={isUploading}
            className="flex-1 h-24 border-2 border-dashed"
          >
            <div className="flex flex-col items-center space-y-1">
              <Camera className="h-5 w-5" />
              <span className="text-xs">Camera</span>
            </div>
          </Button>
        </div>
      )}

      <p className="text-xs text-muted-foreground text-center">
        Max 5MB, will be compressed to ~60KB
      </p>

      {/* Camera Dialog */}
      <Dialog open={showCamera} onOpenChange={(open) => !open && stopCamera()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{cropMode ? 'Crop Image' : 'Take Photo'}</DialogTitle>
          </DialogHeader>
          
          <div className="relative aspect-[4/3] bg-black rounded-lg overflow-hidden">
            {!capturedImage ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
            ) : (
              <div 
                className="relative w-full h-full cursor-crosshair"
                onMouseDown={handleCropMouseDown}
                onMouseMove={handleCropMouseMove}
                onMouseUp={handleCropMouseUp}
                onMouseLeave={handleCropMouseUp}
              >
                <img 
                  src={capturedImage} 
                  alt="Captured" 
                  className="w-full h-full object-contain"
                  draggable={false}
                />
                {/* Crop overlay */}
                <div className="absolute inset-0 bg-black/50 pointer-events-none" />
                <div 
                  className="absolute border-2 border-white bg-transparent pointer-events-none"
                  style={getCropStyle()}
                >
                  <div className="absolute inset-0 bg-white/10" />
                </div>
                {/* Clear area showing the crop */}
                <div 
                  className="absolute overflow-hidden pointer-events-none"
                  style={getCropStyle()}
                >
                  <img 
                    src={capturedImage} 
                    alt="Crop preview" 
                    className="absolute"
                    style={{
                      width: `${100 / (Math.abs(cropEnd.x - cropStart.x) / 100)}%`,
                      height: `${100 / (Math.abs(cropEnd.y - cropStart.y) / 100)}%`,
                      left: `-${Math.min(cropStart.x, cropEnd.x) / (Math.abs(cropEnd.x - cropStart.x) / 100)}%`,
                      top: `-${Math.min(cropStart.y, cropEnd.y) / (Math.abs(cropEnd.y - cropStart.y) / 100)}%`,
                      objectFit: 'contain'
                    }}
                    draggable={false}
                  />
                </div>
              </div>
            )}
          </div>

          {cropMode && (
            <p className="text-xs text-muted-foreground text-center">
              Click and drag to select crop area
            </p>
          )}

          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={stopCamera}>
              Cancel
            </Button>
            
            {!capturedImage ? (
              <Button onClick={capturePhoto} className="bg-primary">
                <Camera className="h-4 w-4 mr-2" />
                Capture
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={retakePhoto}>
                  Retake
                </Button>
                <Button 
                  onClick={applyCropAndUpload} 
                  disabled={isUploading}
                  className="bg-primary"
                >
                  {isUploading ? 'Uploading...' : 'Use Photo'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};