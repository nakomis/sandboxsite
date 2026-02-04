import {
    DeviceTransport,
    Device,
    DeviceCommand,
    DeviceResponse,
    ConnectionState,
    ResponseHandler,
} from './types';

// WebSocket endpoint for MQTT bridge
const WEBSOCKET_ENDPOINT = 'wss://YOUR_API_ID.execute-api.eu-west-2.amazonaws.com/prod';

// Message types sent to WebSocket
interface WebSocketMessage {
    action: 'sendCommand';
    deviceId: string;
    command: DeviceCommand;
}

// Message types received from WebSocket
interface WebSocketResponse {
    type: 'deviceResponse';
    deviceId: string;
    response: DeviceResponse;
}

export class MqttTransport implements DeviceTransport {
    private websocket: WebSocket | null = null;
    private connectionState: ConnectionState = 'disconnected';
    private connectedDevice: Device | null = null;
    private responseHandlers: Set<ResponseHandler> = new Set();
    private connectionStateHandlers: Set<(state: ConnectionState) => void> = new Set();
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private reconnectDelay = 1000;
    private websocketEndpoint: string;

    constructor(websocketEndpoint?: string) {
        this.websocketEndpoint = websocketEndpoint || WEBSOCKET_ENDPOINT;
    }

    // Set the WebSocket endpoint dynamically
    setEndpoint(endpoint: string): void {
        this.websocketEndpoint = endpoint;
    }

    async listDevices(): Promise<Device[]> {
        // Device listing is handled by mqttService.ts via REST API
        // This transport is only for WebSocket communication
        throw new Error('Use mqttService.listDevicesSigned() for device discovery');
    }

    async connect(device: Device): Promise<void> {
        if (this.connectionState === 'connected' || this.connectionState === 'connecting') {
            if (this.connectedDevice?.id === device.id) {
                return; // Already connected to this device
            }
            // Disconnect from current device first
            this.disconnect();
        }

        this.setConnectionState('connecting');
        this.connectedDevice = device;

        return new Promise((resolve, reject) => {
            try {
                console.log(`Connecting to WebSocket: ${this.websocketEndpoint}`);
                this.websocket = new WebSocket(this.websocketEndpoint);

                this.websocket.onopen = () => {
                    console.log('WebSocket connected');
                    this.reconnectAttempts = 0;
                    this.setConnectionState('connected');
                    resolve();
                };

                this.websocket.onclose = (event) => {
                    console.log(`WebSocket closed: ${event.code} ${event.reason}`);
                    this.handleDisconnect();
                };

                this.websocket.onerror = (error) => {
                    console.error('WebSocket error:', error);
                    if (this.connectionState === 'connecting') {
                        reject(new Error('Failed to connect to WebSocket'));
                    }
                };

                this.websocket.onmessage = (event) => {
                    this.handleMessage(event.data);
                };

            } catch (error) {
                console.error('Error creating WebSocket:', error);
                this.setConnectionState('disconnected');
                reject(error);
            }
        });
    }

    disconnect(): void {
        if (this.websocket) {
            this.websocket.close();
            this.websocket = null;
        }
        this.connectedDevice = null;
        this.setConnectionState('disconnected');
    }

    getConnectionState(): ConnectionState {
        return this.connectionState;
    }

    getConnectedDevice(): Device | null {
        return this.connectedDevice;
    }

    async sendCommand(command: DeviceCommand): Promise<void> {
        if (!this.websocket || this.connectionState !== 'connected') {
            throw new Error('Not connected');
        }

        if (!this.connectedDevice) {
            throw new Error('No device selected');
        }

        const message: WebSocketMessage = {
            action: 'sendCommand',
            deviceId: this.connectedDevice.id,
            command,
        };

        console.log('Sending command:', message);
        this.websocket.send(JSON.stringify(message));
    }

    onResponse(handler: ResponseHandler): void {
        this.responseHandlers.add(handler);
    }

    offResponse(handler: ResponseHandler): void {
        this.responseHandlers.delete(handler);
    }

    onConnectionStateChange(handler: (state: ConnectionState) => void): void {
        this.connectionStateHandlers.add(handler);
    }

    offConnectionStateChange(handler: (state: ConnectionState) => void): void {
        this.connectionStateHandlers.delete(handler);
    }

    private setConnectionState(state: ConnectionState): void {
        this.connectionState = state;
        this.connectionStateHandlers.forEach(handler => {
            try {
                handler(state);
            } catch (error) {
                console.error('Error in connection state handler:', error);
            }
        });
    }

    private handleMessage(data: string): void {
        try {
            const message = JSON.parse(data) as WebSocketResponse;
            console.log('Received WebSocket message:', message);

            if (message.type === 'deviceResponse' && message.response) {
                // Check if this response is for our connected device
                if (this.connectedDevice && message.deviceId === this.connectedDevice.id) {
                    this.responseHandlers.forEach(handler => {
                        try {
                            handler(message.response);
                        } catch (error) {
                            console.error('Error in response handler:', error);
                        }
                    });
                }
            }
        } catch (error) {
            console.error('Error parsing WebSocket message:', error, data);
        }
    }

    private handleDisconnect(): void {
        const wasConnected = this.connectionState === 'connected';
        this.setConnectionState('disconnected');

        // Attempt reconnection if we were previously connected
        if (wasConnected && this.connectedDevice && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
            console.log(`Attempting reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);

            setTimeout(() => {
                if (this.connectedDevice) {
                    this.setConnectionState('reconnecting');
                    this.connect(this.connectedDevice).catch(error => {
                        console.error('Reconnection failed:', error);
                    });
                }
            }, delay);
        }
    }
}

// Singleton instance
let mqttTransportInstance: MqttTransport | null = null;

export function getMqttTransport(websocketEndpoint?: string): MqttTransport {
    if (!mqttTransportInstance) {
        mqttTransportInstance = new MqttTransport(websocketEndpoint);
    } else if (websocketEndpoint) {
        mqttTransportInstance.setEndpoint(websocketEndpoint);
    }
    return mqttTransportInstance;
}
