/**
 * Printer Manager - Singleton for persistent Bluetooth printer connection
 * 
 * Key Features:
 * - Caches Bluetooth device and GATT connection
 * - Auto-reconnects on disconnect
 * - Only asks for device once per session
 * - Provides connection status observable
 */

import { generateReceiptBytes, PrintData } from './bluetoothPrinter';

// Connection states
export type PrinterConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

// Event types
type ConnectionListener = (state: PrinterConnectionState, deviceName?: string) => void;

// Printer Manager Singleton
class PrinterManager {
    private static instance: PrinterManager;

    // Connection state
    private device: BluetoothDevice | null = null;
    private server: BluetoothRemoteGATTServer | null = null;
    private characteristic: BluetoothRemoteGATTCharacteristic | null = null;
    private connectionState: PrinterConnectionState = 'disconnected';
    private deviceName: string = '';

    // Listeners for React components
    private listeners: Set<ConnectionListener> = new Set();

    // Reconnection settings
    private reconnectAttempts: number = 0;
    private maxReconnectAttempts: number = 3;
    private reconnectDelay: number = 1000;

    // Print queue for offline/disconnected scenarios
    private printQueue: PrintData[] = [];
    private isProcessingQueue: boolean = false;

    private constructor() {
        // Private constructor for singleton
    }

    public static getInstance(): PrinterManager {
        if (!PrinterManager.instance) {
            PrinterManager.instance = new PrinterManager();
        }
        return PrinterManager.instance;
    }

    // Subscribe to connection state changes
    public subscribe(listener: ConnectionListener): () => void {
        this.listeners.add(listener);
        // Immediately notify with current state
        listener(this.connectionState, this.deviceName);
        // Return unsubscribe function
        return () => this.listeners.delete(listener);
    }

    private notifyListeners(): void {
        this.listeners.forEach(listener => listener(this.connectionState, this.deviceName));
    }

    private setState(state: PrinterConnectionState): void {
        this.connectionState = state;
        this.notifyListeners();
    }

    public getState(): PrinterConnectionState {
        return this.connectionState;
    }

    public getDeviceName(): string {
        return this.deviceName;
    }

    public isConnected(): boolean {
        return this.connectionState === 'connected' &&
            this.server !== null &&
            this.server.connected === true;
    }

    // Check if Bluetooth is supported
    public isBluetoothSupported(): boolean {
        const nav = navigator as any;
        return 'bluetooth' in nav;
    }

    // Connect to printer (will use cached device if available)
    public async connect(forceNewDevice: boolean = false): Promise<boolean> {
        const nav = navigator as any;

        if (!nav.bluetooth) {
            console.error('Bluetooth not supported');
            this.setState('error');
            return false;
        }

        // If already connected, return true
        if (this.isConnected() && !forceNewDevice) {
            console.log('Already connected to:', this.deviceName);
            return true;
        }

        this.setState('connecting');

        try {
            // If we have a cached device and it's not a forced new connection, try to reconnect
            if (this.device && !forceNewDevice) {
                console.log('Attempting to reconnect to cached device:', this.device.name);
                const reconnected = await this.reconnectToDevice();
                if (reconnected) {
                    return true;
                }
                // If reconnection failed, request new device
            }

            // Request new device from user
            console.log('Requesting new Bluetooth device...');
            this.device = await nav.bluetooth.requestDevice({
                acceptAllDevices: true,
                optionalServices: [
                    '000018f0-0000-1000-8000-00805f9b34fb', // Common thermal printer service
                    '49535343-fe7d-4ae5-8fa9-9fafd205e455', // Alternative service UUID
                    '18f0',
                    'e7810a71-73ae-499d-8c15-faa9aef0c3f2'
                ]
            });

            if (!this.device) {
                throw new Error('No device selected');
            }

            this.deviceName = this.device.name || 'Bluetooth Printer';

            // Setup disconnect listener
            this.device.addEventListener('gattserverdisconnected', () => {
                console.log('Printer disconnected');
                this.handleDisconnect();
            });

            // Connect to GATT server
            const connected = await this.connectToGATT();

            if (connected) {
                this.reconnectAttempts = 0;
                this.setState('connected');
                // Process any queued prints
                this.processQueue();
                return true;
            } else {
                throw new Error('Failed to connect to GATT server');
            }

        } catch (error: any) {
            console.error('Connection error:', error);

            // Don't show error state if user cancelled
            if (error.name === 'NotFoundError' || error.message?.includes('cancelled')) {
                this.setState('disconnected');
            } else {
                this.setState('error');
            }
            return false;
        }
    }

    // Reconnect to cached device
    private async reconnectToDevice(): Promise<boolean> {
        if (!this.device || !this.device.gatt) {
            return false;
        }

        try {
            return await this.connectToGATT();
        } catch (error) {
            console.error('Reconnection failed:', error);
            return false;
        }
    }

    // Connect to GATT server and find writable characteristic
    private async connectToGATT(): Promise<boolean> {
        if (!this.device || !this.device.gatt) {
            return false;
        }

        try {
            this.server = await this.device.gatt.connect();

            if (!this.server) {
                throw new Error('Failed to get GATT server');
            }

            // Get primary services
            const services = await this.server.getPrimaryServices();

            if (services.length === 0) {
                throw new Error('No services found');
            }

            // Find writable characteristic
            for (const service of services) {
                const characteristics = await service.getCharacteristics();

                for (const char of characteristics) {
                    if (char.properties.write || char.properties.writeWithoutResponse) {
                        this.characteristic = char;
                        console.log('Found writable characteristic');
                        return true;
                    }
                }
            }

            throw new Error('No writable characteristic found');

        } catch (error) {
            console.error('GATT connection error:', error);
            return false;
        }
    }

    // Handle disconnect event
    private handleDisconnect(): void {
        this.server = null;
        this.characteristic = null;
        this.setState('disconnected');

        // Attempt auto-reconnect if we have queued prints
        if (this.printQueue.length > 0 && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.attemptAutoReconnect();
        }
    }

    // Auto-reconnect with exponential backoff
    private async attemptAutoReconnect(): Promise<void> {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('Max reconnect attempts reached');
            return;
        }

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

        console.log(`Auto-reconnect attempt ${this.reconnectAttempts} in ${delay}ms...`);

        await new Promise(resolve => setTimeout(resolve, delay));

        if (this.device && this.connectionState !== 'connected') {
            const success = await this.reconnectToDevice();
            if (success) {
                this.setState('connected');
                this.reconnectAttempts = 0;
                this.processQueue();
            } else if (this.reconnectAttempts < this.maxReconnectAttempts) {
                this.attemptAutoReconnect();
            }
        }
    }

    // Disconnect from printer
    public disconnect(): void {
        if (this.server && this.server.connected) {
            this.server.disconnect();
        }
        this.device = null;
        this.server = null;
        this.characteristic = null;
        this.deviceName = '';
        this.setState('disconnected');
        console.log('Printer disconnected manually');
    }

    // Print receipt - uses cached connection
    public async print(data: PrintData): Promise<boolean> {
        // If not connected, try to connect first
        if (!this.isConnected()) {
            console.log('Not connected, attempting to connect...');
            const connected = await this.connect();

            if (!connected) {
                // Queue the print for later if connection fails
                console.log('Connection failed, queueing print job');
                this.printQueue.push(data);
                return false;
            }
        }

        // Now we should be connected
        if (!this.characteristic) {
            console.error('No characteristic available');
            this.printQueue.push(data);
            return false;
        }

        try {
            const receiptBytes = await generateReceiptBytes(data);

            // Send in chunks (max 512 bytes per write for stability)
            const chunkSize = 512;
            for (let i = 0; i < receiptBytes.length; i += chunkSize) {
                const chunk = receiptBytes.slice(i, Math.min(i + chunkSize, receiptBytes.length));

                if (this.characteristic.properties.writeWithoutResponse) {
                    await this.characteristic.writeValueWithoutResponse(chunk);
                } else {
                    await this.characteristic.writeValue(chunk);
                }

                // Small delay between chunks for printer buffer
                await new Promise(resolve => setTimeout(resolve, 30));
            }

            console.log('Print successful!');
            return true;

        } catch (error: any) {
            console.error('Print error:', error);

            // If it's a connection error, try to reconnect and retry once
            if (error.message?.includes('GATT') || error.name === 'NetworkError') {
                console.log('Connection lost during print, attempting reconnect...');
                this.handleDisconnect();

                // Queue the job and try to reconnect
                this.printQueue.push(data);
                this.attemptAutoReconnect();
            }

            return false;
        }
    }

    // Process queued print jobs
    private async processQueue(): Promise<void> {
        if (this.isProcessingQueue || this.printQueue.length === 0) {
            return;
        }

        this.isProcessingQueue = true;
        console.log(`Processing ${this.printQueue.length} queued print jobs...`);

        while (this.printQueue.length > 0 && this.isConnected()) {
            const job = this.printQueue.shift();
            if (job) {
                await this.print(job);
                // Small delay between prints
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        this.isProcessingQueue = false;
    }

    // Get queue size
    public getQueueSize(): number {
        return this.printQueue.length;
    }

    // Clear print queue
    public clearQueue(): void {
        this.printQueue = [];
    }
}

// Export singleton instance
export const printerManager = PrinterManager.getInstance();

// Export the class for type usage
export { PrinterManager };
