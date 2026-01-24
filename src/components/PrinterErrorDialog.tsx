import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, Printer, X, Wifi, WifiOff } from 'lucide-react';

interface PrinterErrorDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    errorMessage?: string;
    onRetry: () => void;
    onSaveWithoutPrint: () => void;
    isRetrying?: boolean;
}

export const PrinterErrorDialog: React.FC<PrinterErrorDialogProps> = ({
    open,
    onOpenChange,
    errorMessage = "Unable to connect to printer",
    onRetry,
    onSaveWithoutPrint,
    isRetrying = false
}) => {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-sm p-0 overflow-hidden rounded-2xl border-0 shadow-2xl">
                {/* Header with gradient */}
                <div className="bg-gradient-to-br from-red-500 via-red-600 to-orange-500 p-6 text-white text-center">
                    <div className="w-20 h-20 mx-auto mb-4 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center animate-pulse">
                        <Printer className="w-10 h-10" />
                    </div>
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold text-white">
                            Bluetooth Print Failed
                        </DialogTitle>
                    </DialogHeader>
                    <p className="text-white/90 text-sm mt-2">{errorMessage}</p>
                </div>

                {/* Troubleshooting tips */}
                <div className="p-5 space-y-4">
                    <div className="bg-amber-50 dark:bg-amber-950/30 rounded-xl p-4 border border-amber-200 dark:border-amber-800">
                        <h4 className="font-semibold text-sm text-amber-800 dark:text-amber-300 mb-3 flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4" />
                            Quick Fixes
                        </h4>
                        <ul className="space-y-2.5 text-sm text-amber-700 dark:text-amber-400">
                            <li className="flex items-start gap-2">
                                <span className="w-5 h-5 rounded-full bg-amber-200 dark:bg-amber-800 flex items-center justify-center text-xs font-bold flex-shrink-0">1</span>
                                <span>Check if printer is powered ON</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="w-5 h-5 rounded-full bg-amber-200 dark:bg-amber-800 flex items-center justify-center text-xs font-bold flex-shrink-0">2</span>
                                <span>Ensure Bluetooth is enabled on device</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="w-5 h-5 rounded-full bg-amber-200 dark:bg-amber-800 flex items-center justify-center text-xs font-bold flex-shrink-0">3</span>
                                <span>Move closer to the printer</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="w-5 h-5 rounded-full bg-amber-200 dark:bg-amber-800 flex items-center justify-center text-xs font-bold flex-shrink-0">4</span>
                                <span>Check if printer has paper loaded</span>
                            </li>
                        </ul>
                    </div>

                    {/* Action buttons */}
                    <div className="space-y-3">
                        <Button
                            onClick={onRetry}
                            disabled={isRetrying}
                            className="w-full h-12 text-base font-semibold bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg rounded-xl"
                        >
                            {isRetrying ? (
                                <>
                                    <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                                    Retrying...
                                </>
                            ) : (
                                <>
                                    <RefreshCw className="w-5 h-5 mr-2" />
                                    Retry Bluetooth Print
                                </>
                            )}
                        </Button>

                        <Button
                            onClick={onSaveWithoutPrint}
                            variant="outline"
                            className="w-full h-12 text-base font-semibold rounded-xl border-2"
                        >
                            <Printer className="w-5 h-5 mr-2" />
                            Use Wired/Browser Print
                        </Button>
                    </div>

                    <p className="text-xs text-muted-foreground text-center">
                        "Use Wired/Browser Print" saves bill & opens browser print dialog for wired printers.
                    </p>
                </div>
            </DialogContent>
        </Dialog>
    );
};
