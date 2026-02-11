/**
 * DevicePermissions - One-time permission request overlay
 * Shows after first login to request Location & Camera access
 */

import React, { useState, useEffect } from 'react';
import { MapPin, Camera, CheckCircle2, XCircle, Shield, ChevronRight, Loader2 } from 'lucide-react';

const PERMISSIONS_KEY = 'hotel_pos_permissions_requested';

type PermissionState = 'pending' | 'requesting' | 'granted' | 'denied';

interface PermissionStatus {
    location: PermissionState;
    camera: PermissionState;
}

export const DevicePermissions: React.FC = () => {
    const [show, setShow] = useState(false);
    const [permissions, setPermissions] = useState<PermissionStatus>({
        location: 'pending',
        camera: 'pending'
    });

    useEffect(() => {
        // Only show if not already requested
        const alreadyRequested = localStorage.getItem(PERMISSIONS_KEY);
        if (alreadyRequested) return;

        // Check current permission states
        const checkPermissions = async () => {
            const newState: PermissionStatus = { location: 'pending', camera: 'pending' };

            try {
                if (navigator.permissions) {
                    // Check location
                    try {
                        const geo = await navigator.permissions.query({ name: 'geolocation' });
                        if (geo.state === 'granted') newState.location = 'granted';
                        else if (geo.state === 'denied') newState.location = 'denied';
                    } catch { /* Not supported */ }

                    // Check camera
                    try {
                        const cam = await navigator.permissions.query({ name: 'camera' as PermissionName });
                        if (cam.state === 'granted') newState.camera = 'granted';
                        else if (cam.state === 'denied') newState.camera = 'denied';
                    } catch { /* Not supported on some browsers */ }
                }
            } catch { /* Permissions API not available */ }

            setPermissions(newState);

            // If both already granted, don't show the dialog
            if (newState.location === 'granted' && newState.camera === 'granted') {
                localStorage.setItem(PERMISSIONS_KEY, 'true');
                return;
            }

            // Show after a short delay (let the app load first)
            setTimeout(() => setShow(true), 1500);
        };

        checkPermissions();
    }, []);

    const requestLocation = async () => {
        setPermissions(prev => ({ ...prev, location: 'requesting' }));

        try {
            await new Promise<GeolocationPosition>((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: false,
                    timeout: 10000,
                    maximumAge: 60000
                });
            });
            setPermissions(prev => ({ ...prev, location: 'granted' }));
        } catch (error: any) {
            if (error?.code === 1) {
                // Permission denied
                setPermissions(prev => ({ ...prev, location: 'denied' }));
            } else {
                // Position unavailable or timeout — but permission may have been granted
                // Check actual state
                try {
                    const geo = await navigator.permissions.query({ name: 'geolocation' });
                    setPermissions(prev => ({
                        ...prev,
                        location: geo.state === 'granted' ? 'granted' : geo.state === 'denied' ? 'denied' : 'pending'
                    }));
                } catch {
                    // If we can't check, treat as granted (the error was GPS, not permission)
                    setPermissions(prev => ({ ...prev, location: 'granted' }));
                }
            }
        }
    };

    const requestCamera = async () => {
        setPermissions(prev => ({ ...prev, camera: 'requesting' }));

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            // Stop all tracks immediately — we just wanted the permission
            stream.getTracks().forEach(track => track.stop());
            setPermissions(prev => ({ ...prev, camera: 'granted' }));
        } catch (error: any) {
            if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') {
                setPermissions(prev => ({ ...prev, camera: 'denied' }));
            } else if (error?.name === 'NotFoundError') {
                // No camera available — mark as granted (no camera to deny)
                setPermissions(prev => ({ ...prev, camera: 'granted' }));
            } else {
                setPermissions(prev => ({ ...prev, camera: 'denied' }));
            }
        }
    };

    const handleContinue = () => {
        localStorage.setItem(PERMISSIONS_KEY, 'true');
        setShow(false);
    };

    const allHandled = permissions.location !== 'pending' && permissions.location !== 'requesting'
        && permissions.camera !== 'pending' && permissions.camera !== 'requesting';

    if (!show) return null;

    return (
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden animate-in fade-in zoom-in-95 duration-300">
                {/* Header */}
                <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-5 text-white text-center">
                    <div className="w-14 h-14 mx-auto mb-3 bg-white/20 rounded-full flex items-center justify-center">
                        <Shield className="w-7 h-7" />
                    </div>
                    <h2 className="text-lg font-bold">App Permissions</h2>
                    <p className="text-sm text-white/80 mt-1">
                        Allow access for the best experience
                    </p>
                </div>

                {/* Permission Items */}
                <div className="px-5 py-4 space-y-3">
                    {/* Location */}
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${permissions.location === 'granted' ? 'bg-green-100 text-green-600' :
                                permissions.location === 'denied' ? 'bg-red-100 text-red-600' :
                                    'bg-blue-100 text-blue-600'
                            }`}>
                            <MapPin className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm">Location</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                {permissions.location === 'granted' ? 'Access granted ✓' :
                                    permissions.location === 'denied' ? 'Denied — enable in browser settings' :
                                        'Auto-detect your shop location'}
                            </p>
                        </div>
                        {permissions.location === 'granted' ? (
                            <CheckCircle2 className="w-6 h-6 text-green-500 flex-shrink-0" />
                        ) : permissions.location === 'denied' ? (
                            <XCircle className="w-6 h-6 text-red-400 flex-shrink-0" />
                        ) : permissions.location === 'requesting' ? (
                            <Loader2 className="w-6 h-6 text-blue-500 animate-spin flex-shrink-0" />
                        ) : (
                            <button
                                onClick={requestLocation}
                                className="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 active:scale-95 transition-all flex-shrink-0"
                            >
                                Allow
                            </button>
                        )}
                    </div>

                    {/* Camera */}
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${permissions.camera === 'granted' ? 'bg-green-100 text-green-600' :
                                permissions.camera === 'denied' ? 'bg-red-100 text-red-600' :
                                    'bg-purple-100 text-purple-600'
                            }`}>
                            <Camera className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm">Camera</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                {permissions.camera === 'granted' ? 'Access granted ✓' :
                                    permissions.camera === 'denied' ? 'Denied — enable in browser settings' :
                                        'Take photos of menu items & receipts'}
                            </p>
                        </div>
                        {permissions.camera === 'granted' ? (
                            <CheckCircle2 className="w-6 h-6 text-green-500 flex-shrink-0" />
                        ) : permissions.camera === 'denied' ? (
                            <XCircle className="w-6 h-6 text-red-400 flex-shrink-0" />
                        ) : permissions.camera === 'requesting' ? (
                            <Loader2 className="w-6 h-6 text-purple-500 animate-spin flex-shrink-0" />
                        ) : (
                            <button
                                onClick={requestCamera}
                                className="px-3 py-1.5 bg-purple-600 text-white text-xs font-bold rounded-lg hover:bg-purple-700 active:scale-95 transition-all flex-shrink-0"
                            >
                                Allow
                            </button>
                        )}
                    </div>

                    {/* Denied instruction */}
                    {(permissions.location === 'denied' || permissions.camera === 'denied') && (
                        <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                            <p className="text-xs text-amber-800 dark:text-amber-300 font-medium">
                                ⚠️ Permission denied? To fix:
                            </p>
                            <ul className="text-xs text-amber-700 dark:text-amber-400 mt-1 space-y-0.5 list-disc pl-4">
                                <li><strong>Android:</strong> Tap 🔒 in address bar → Permissions → Allow</li>
                                <li><strong>iPhone:</strong> Settings → Safari → Location/Camera → Allow</li>
                                <li><strong>PWA:</strong> App Info → Permissions → Enable</li>
                            </ul>
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="px-5 pb-5">
                    {!allHandled ? (
                        <div className="flex gap-2">
                            <button
                                onClick={() => { requestLocation(); setTimeout(requestCamera, 500); }}
                                className="flex-1 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold rounded-xl hover:opacity-90 active:scale-[0.98] transition-all text-sm"
                            >
                                Allow All
                            </button>
                            <button
                                onClick={handleContinue}
                                className="px-4 py-2.5 text-gray-500 font-medium text-sm hover:text-gray-700 transition-colors"
                            >
                                Skip
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={handleContinue}
                            className="w-full py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold rounded-xl hover:opacity-90 active:scale-[0.98] transition-all text-sm flex items-center justify-center gap-2"
                        >
                            Continue to App <ChevronRight className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
