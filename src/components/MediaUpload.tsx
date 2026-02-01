import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { X, Upload, Image as ImageIcon, Film, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { uploadItemImage } from '@/utils/imageUtils';

interface MediaUploadProps {
    imageUrl?: string;
    videoUrl?: string;
    mediaType: 'image' | 'gif' | 'video';
    onImageChange: (url: string) => void;
    onVideoChange: (url: string) => void;
    onMediaTypeChange: (type: 'image' | 'gif' | 'video') => void;
    itemId?: string;
    hasPremiumAccess: boolean;
}

export const MediaUpload: React.FC<MediaUploadProps> = ({
    imageUrl,
    videoUrl,
    mediaType,
    onImageChange,
    onVideoChange,
    onMediaTypeChange,
    itemId,
    hasPremiumAccess
}) => {
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const videoInputRef = useRef<HTMLInputElement>(null);
    const { toast } = useToast();
    const { profile } = useAuth();

    const adminId = profile?.role === 'admin' ? profile.id : profile?.admin_id;

    const handleImageSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('image/')) {
            toast({
                title: "Invalid file type",
                description: "Please select an image file",
                variant: "destructive"
            });
            return;
        }

        // Validate file size (max 5MB for images)
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
            const url = await uploadItemImage(file, itemId || Date.now().toString());
            onImageChange(url);
            onVideoChange('');
            onMediaTypeChange('image');
            toast({
                title: "Image uploaded",
                description: "Image has been compressed and uploaded"
            });
        } catch (error) {
            console.error('Upload error:', error);
            toast({
                title: "Upload failed",
                description: "Failed to upload image",
                variant: "destructive"
            });
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleVideoSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        // Check if it's GIF or video
        const isGif = file.type === 'image/gif';
        const isVideo = file.type.startsWith('video/');

        if (!isGif && !isVideo) {
            toast({
                title: "Invalid file type",
                description: "Please select a GIF or video file (MP4, WebM)",
                variant: "destructive"
            });
            return;
        }

        // Validate file size (max 1MB for video/GIF)
        if (file.size > 1 * 1024 * 1024) {
            toast({
                title: "File too large",
                description: "GIF/Video must be smaller than 1MB",
                variant: "destructive"
            });
            return;
        }

        try {
            setIsUploading(true);

            // Upload to Supabase storage
            const fileExt = file.name.split('.').pop();
            const fileName = `${adminId}/${itemId || Date.now()}-media.${fileExt}`;

            const { data, error } = await supabase.storage
                .from('item-media')
                .upload(fileName, file, {
                    cacheControl: '3600',
                    upsert: true
                });

            if (error) throw error;

            // Get public URL
            const { data: publicData } = supabase.storage
                .from('item-media')
                .getPublicUrl(fileName);

            const url = publicData.publicUrl;

            onVideoChange(url);
            onImageChange('');
            onMediaTypeChange(isGif ? 'gif' : 'video');

            toast({
                title: isGif ? "GIF uploaded" : "Video uploaded",
                description: "Media has been uploaded successfully"
            });
        } catch (error) {
            console.error('Upload error:', error);
            toast({
                title: "Upload failed",
                description: "Failed to upload media. Make sure storage bucket exists.",
                variant: "destructive"
            });
        } finally {
            setIsUploading(false);
            if (videoInputRef.current) videoInputRef.current.value = '';
        }
    };

    const handleRemove = () => {
        onImageChange('');
        onVideoChange('');
        onMediaTypeChange('image');
    };

    // Check which URL is present - image_url for images, video_url for gif/video
    const currentUrl = videoUrl || imageUrl;

    return (
        <div className="space-y-3">
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                className="hidden"
            />
            <input
                ref={videoInputRef}
                type="file"
                accept=".gif,video/mp4,video/webm"
                onChange={handleVideoSelect}
                className="hidden"
            />

            {currentUrl ? (
                <div className="relative">
                    {mediaType === 'video' ? (
                        <video
                            src={currentUrl}
                            className="w-full h-32 object-cover rounded-lg border"
                            autoPlay
                            loop
                            muted
                            playsInline
                        />
                    ) : mediaType === 'gif' ? (
                        <img
                            src={currentUrl}
                            alt="Item GIF"
                            className="w-full h-32 object-cover rounded-lg border"
                        />
                    ) : (
                        <img
                            src={currentUrl}
                            alt="Item"
                            className="w-full h-32 object-cover rounded-lg border"
                        />
                    )}
                    <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleRemove();
                        }}
                        className="absolute top-2 right-2 h-6 w-6 p-0"
                    >
                        <X className="h-3 w-3" />
                    </Button>
                    <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded">
                        {mediaType.toUpperCase()}
                    </div>
                </div>
            ) : (
                <div className="flex gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className="flex-1 h-20 border-2 border-dashed"
                    >
                        <div className="flex flex-col items-center space-y-1">
                            {isUploading ? (
                                <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                                <ImageIcon className="h-5 w-5" />
                            )}
                            <span className="text-xs">Image</span>
                        </div>
                    </Button>

                    {hasPremiumAccess && (
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => videoInputRef.current?.click()}
                            disabled={isUploading}
                            className="flex-1 h-20 border-2 border-dashed border-purple-300 bg-purple-50/50"
                        >
                            <div className="flex flex-col items-center space-y-1">
                                {isUploading ? (
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                ) : (
                                    <Film className="h-5 w-5 text-purple-600" />
                                )}
                                <span className="text-xs text-purple-600">GIF/Video</span>
                            </div>
                        </Button>
                    )}
                </div>
            )}

            <p className="text-xs text-muted-foreground text-center">
                Image: Max 5MB (compressed) |
                {hasPremiumAccess && <span className="text-purple-600"> GIF/Video: Max 1MB</span>}
            </p>
        </div>
    );
};
