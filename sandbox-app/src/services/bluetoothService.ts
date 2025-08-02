interface OTACommand {
    action: 'ota_update' | 'get_status' | 'cancel_update';
    firmware_url?: string;
    version?: string;
}

interface OTAResponse {
    status: 'success' | 'error' | 'progress';
    message: string;
    progress?: number;
    version?: string;
}

export class BluetoothService {
    private device: BluetoothDevice | null = null;
    private server: BluetoothRemoteGATTServer | null = null;
    private otaService: BluetoothRemoteGATTService | null = null;
    private commandCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
    private statusCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;

    // UUIDs for BootBoots OTA service
    private readonly OTA_SERVICE_UUID = '12345678-1234-1234-1234-123456789abc';
    private readonly OTA_COMMAND_CHAR_UUID = '87654321-4321-4321-4321-cba987654321';
    private readonly OTA_STATUS_CHAR_UUID = '11111111-2222-3333-4444-555555555555';

    /**
     * Connect to BootBoots device via Bluetooth
     */
    async connect(): Promise<void> {
        try {
            // Request device
            this.device = await navigator.bluetooth.requestDevice({
                filters: [
                    { name: 'BootBoots-CatCam' },
                    { namePrefix: 'BootBoots' }
                ],
                optionalServices: [this.OTA_SERVICE_UUID]
            });

            if (!this.device.gatt) {
                throw new Error('GATT not available');
            }

            // Connect to GATT server
            this.server = await this.device.gatt.connect();
            
            // Get OTA service
            this.otaService = await this.server.getPrimaryService(this.OTA_SERVICE_UUID);
            
            // Get characteristics
            this.commandCharacteristic = await this.otaService.getCharacteristic(this.OTA_COMMAND_CHAR_UUID);
            this.statusCharacteristic = await this.otaService.getCharacteristic(this.OTA_STATUS_CHAR_UUID);

            // Set up disconnect handler
            this.device.addEventListener('gattserverdisconnected', this.onDisconnected.bind(this));

            console.log('Connected to BootBoots device:', this.device.name);
        } catch (error) {
            console.error('Bluetooth connection failed:', error);
            throw new Error(`Failed to connect to BootBoots device: ${error}`);
        }
    }

    /**
     * Disconnect from device
     */
    async disconnect(): Promise<void> {
        if (this.server?.connected) {
            this.server.disconnect();
        }
        this.cleanup();
    }

    /**
     * Check if connected to device
     */
    isConnected(): boolean {
        return this.server?.connected || false;
    }

    /**
     * Get connected device info
     */
    getDeviceInfo(): { id: string; name: string } | null {
        if (!this.device) return null;
        
        return {
            id: this.device.id,
            name: this.device.name || 'Unknown Device'
        };
    }

    /**
     * Send OTA update command to ESP32
     */
    async sendOTACommand(firmwareUrl: string, version: string): Promise<void> {
        if (!this.commandCharacteristic) {
            throw new Error('Not connected to device');
        }

        const command: OTACommand = {
            action: 'ota_update',
            firmware_url: firmwareUrl,
            version: version
        };

        try {
            const commandString = JSON.stringify(command);
            const encoder = new TextEncoder();
            const data = encoder.encode(commandString);

            await this.commandCharacteristic.writeValue(data);
            console.log('OTA command sent:', command);
        } catch (error) {
            console.error('Failed to send OTA command:', error);
            throw new Error(`Failed to send OTA command: ${error}`);
        }
    }

    /**
     * Get current status from ESP32
     */
    async getStatus(): Promise<OTAResponse> {
        if (!this.commandCharacteristic) {
            throw new Error('Not connected to device');
        }

        const command: OTACommand = {
            action: 'get_status'
        };

        try {
            const commandString = JSON.stringify(command);
            const encoder = new TextEncoder();
            const data = encoder.encode(commandString);

            await this.commandCharacteristic.writeValue(data);

            // Read status response
            if (this.statusCharacteristic) {
                const response = await this.statusCharacteristic.readValue();
                const decoder = new TextDecoder();
                const responseString = decoder.decode(response);
                
                return JSON.parse(responseString) as OTAResponse;
            }

            throw new Error('Status characteristic not available');
        } catch (error) {
            console.error('Failed to get status:', error);
            throw new Error(`Failed to get device status: ${error}`);
        }
    }

    /**
     * Cancel ongoing OTA update
     */
    async cancelUpdate(): Promise<void> {
        if (!this.commandCharacteristic) {
            throw new Error('Not connected to device');
        }

        const command: OTACommand = {
            action: 'cancel_update'
        };

        try {
            const commandString = JSON.stringify(command);
            const encoder = new TextEncoder();
            const data = encoder.encode(commandString);

            await this.commandCharacteristic.writeValue(data);
            console.log('OTA cancel command sent');
        } catch (error) {
            console.error('Failed to cancel update:', error);
            throw new Error(`Failed to cancel update: ${error}`);
        }
    }

    /**
     * Start monitoring OTA progress
     */
    async startProgressMonitoring(callback: (response: OTAResponse) => void): Promise<void> {
        if (!this.statusCharacteristic) {
            throw new Error('Status characteristic not available');
        }

        try {
            // Enable notifications
            await this.statusCharacteristic.startNotifications();
            
            // Add event listener for notifications
            this.statusCharacteristic.addEventListener('characteristicvaluechanged', (event) => {
                const target = event.target as BluetoothRemoteGATTCharacteristic;
                const decoder = new TextDecoder();
                const responseString = decoder.decode(target.value!);
                
                try {
                    const response: OTAResponse = JSON.parse(responseString);
                    callback(response);
                } catch (error) {
                    console.error('Failed to parse status response:', error);
                }
            });

            console.log('Started OTA progress monitoring');
        } catch (error) {
            console.error('Failed to start progress monitoring:', error);
            throw new Error(`Failed to start progress monitoring: ${error}`);
        }
    }

    /**
     * Stop monitoring OTA progress
     */
    async stopProgressMonitoring(): Promise<void> {
        if (this.statusCharacteristic) {
            try {
                await this.statusCharacteristic.stopNotifications();
                console.log('Stopped OTA progress monitoring');
            } catch (error) {
                console.error('Failed to stop progress monitoring:', error);
            }
        }
    }

    /**
     * Handle device disconnection
     */
    private onDisconnected(): void {
        console.log('BootBoots device disconnected');
        this.cleanup();
    }

    /**
     * Clean up resources
     */
    private cleanup(): void {
        this.device = null;
        this.server = null;
        this.otaService = null;
        this.commandCharacteristic = null;
        this.statusCharacteristic = null;
    }
}

// Singleton instance
export const bluetoothService = new BluetoothService();
