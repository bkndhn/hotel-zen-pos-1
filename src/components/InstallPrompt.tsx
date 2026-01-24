import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { X, Download } from 'lucide-react';

export const InstallPrompt = () => {
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [isVisible, setIsVisible] = useState(false);
    const [isIOS, setIsIOS] = useState(false);

    useEffect(() => {
        // Detect iOS
        const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
        setIsIOS(isIOSDevice);

        // Check if app is already installed
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
            (window.navigator as any).standalone === true;

        if (isStandalone) {
            return;
        }

        if (isIOSDevice) {
            // For iOS, we can show instructions immediately or after a delay
            setTimeout(() => setIsVisible(true), 3000);
        } else {
            const handler = (e: any) => {
                e.preventDefault();
                setDeferredPrompt(e);
                setIsVisible(true);
            };

            window.addEventListener('beforeinstallprompt', handler);

            return () => window.removeEventListener('beforeinstallprompt', handler);
        }
    }, []);

    const handleInstallClick = async () => {
        if (!deferredPrompt) return;

        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;

        if (outcome === 'accepted') {
            setIsVisible(false);
        }
        setDeferredPrompt(null);
    };

    if (!isVisible) return null;

    return (
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 bg-primary text-primary-foreground p-4 rounded-lg shadow-lg z-50 animate-in slide-in-from-bottom-5">
            <div className="flex justify-between items-start mb-2">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                    <Download className="h-5 w-5" />
                    Install App
                </h3>
                <button onClick={() => setIsVisible(false)} className="text-primary-foreground/80 hover:text-white">
                    <X className="h-5 w-5" />
                </button>
            </div>

            <p className="text-sm mb-4 text-primary-foreground/90">
                {isIOS
                    ? "To install: Tap the share button below and select 'Add to Home Screen'"
                    : "Install Zen POS for a better experience with offline access and full-screen data entry."
                }
            </p>

            {!isIOS && (
                <Button
                    onClick={handleInstallClick}
                    variant="secondary"
                    className="w-full font-semibold"
                >
                    Install Now
                </Button>
            )}

            {isIOS && (
                <div className="text-xs text-center border-t border-primary-foreground/20 pt-2 mt-2">
                    Tap <span className="font-bold">Share</span> then <span className="font-bold">Add to Home Screen +</span>
                </div>
            )}
        </div>
    );
};
