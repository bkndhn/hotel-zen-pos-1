import React from 'react';
import { QrCode } from 'lucide-react';
import QRCodeSettings from '@/components/QRCodeSettings';

/**
 * QR Menu Page
 * Dedicated page for QR code menu settings
 * Premium feature - controlled by Super Admin via has_qr_menu_access
 */
const QRMenu: React.FC = () => {
    return (
        <div className="container mx-auto py-4 px-4 max-w-4xl">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary/80 rounded-xl flex items-center justify-center shadow-md shadow-primary/20">
                    <QrCode className="w-5 h-5 text-primary-foreground" />
                </div>
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold tracking-tight">QR Menu</h1>
                    <p className="text-muted-foreground text-xs sm:text-sm">
                        Generate and manage your digital menu QR codes
                    </p>
                </div>
            </div>

            {/* QR Code Settings Component */}
            <QRCodeSettings />
        </div>
    );
};

export default QRMenu;
