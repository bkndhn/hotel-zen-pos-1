/**
 * usePrinter - React hook for Bluetooth printer connection
 * 
 * Provides:
 * - Connection state (connected/disconnected/connecting/error)
 * - Device name when connected
 * - Connect/disconnect functions
 * - Print function
 */

import { useState, useEffect, useCallback } from 'react';
import { printerManager, PrinterConnectionState } from '@/utils/printerManager';
import { PrintData } from '@/utils/bluetoothPrinter';

interface UsePrinterResult {
    // Connection state
    connectionState: PrinterConnectionState;
    deviceName: string;
    isConnected: boolean;
    isBluetoothSupported: boolean;

    // Queue info
    queueSize: number;

    // Actions
    connect: (forceNewDevice?: boolean) => Promise<boolean>;
    disconnect: () => void;
    print: (data: PrintData) => Promise<boolean>;
    clearQueue: () => void;
}

export const usePrinter = (): UsePrinterResult => {
    const [connectionState, setConnectionState] = useState<PrinterConnectionState>('disconnected');
    const [deviceName, setDeviceName] = useState<string>('');
    const [queueSize, setQueueSize] = useState<number>(0);

    // Subscribe to printer manager state changes
    useEffect(() => {
        const unsubscribe = printerManager.subscribe((state, name) => {
            setConnectionState(state);
            setDeviceName(name || '');
            setQueueSize(printerManager.getQueueSize());
        });

        // Check initial state
        setConnectionState(printerManager.getState());
        setDeviceName(printerManager.getDeviceName());
        setQueueSize(printerManager.getQueueSize());

        return unsubscribe;
    }, []);

    // Connect to printer
    const connect = useCallback(async (forceNewDevice: boolean = false): Promise<boolean> => {
        return printerManager.connect(forceNewDevice);
    }, []);

    // Disconnect from printer
    const disconnect = useCallback((): void => {
        printerManager.disconnect();
    }, []);

    // Print receipt
    const print = useCallback(async (data: PrintData): Promise<boolean> => {
        const result = await printerManager.print(data);
        // Update queue size after print attempt
        setQueueSize(printerManager.getQueueSize());
        return result;
    }, []);

    // Clear print queue
    const clearQueue = useCallback((): void => {
        printerManager.clearQueue();
        setQueueSize(0);
    }, []);

    return {
        connectionState,
        deviceName,
        isConnected: connectionState === 'connected',
        isBluetoothSupported: printerManager.isBluetoothSupported(),
        queueSize,
        connect,
        disconnect,
        print,
        clearQueue
    };
};

export default usePrinter;
