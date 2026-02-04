import { Credentials } from '@aws-sdk/client-cognito-identity';
import Page, { PageProps } from './Page';
import { useState, useCallback, useEffect, useRef } from 'react';
import { Device, DeviceResponse, ConnectionState } from '../../services/deviceTransport/types';
import { listDevicesSigned } from '../../services/mqttService';
import { getMqttTransport, MqttTransport } from '../../services/deviceTransport/mqttTransport';
import { DeviceSelector, DeviceList } from '../device';
import './Bluetooth.css'; // Reuse Bluetooth styles for consistency

// WebSocket endpoint for MQTT command relay
const WEBSOCKET_ENDPOINT = 'wss://ws.sandbox.nakomis.com';

type MQTTProps = PageProps & {
    creds: Credentials | null;
};

const MQTTPage = (props: MQTTProps) => {
    const { children, tabId, index, creds } = props;

    // Device discovery state
    const [devices, setDevices] = useState<Device[]>([]);
    const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
    const [isLoadingDevices, setIsLoadingDevices] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    // WebSocket connection state
    const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
    const [lastResponse, setLastResponse] = useState<DeviceResponse | null>(null);
    const [responseLog, setResponseLog] = useState<string[]>([]);
    const transportRef = useRef<MqttTransport | null>(null);

    // Initialize transport
    useEffect(() => {
        transportRef.current = getMqttTransport(WEBSOCKET_ENDPOINT);

        const handleConnectionStateChange = (state: ConnectionState) => {
            setConnectionState(state);
        };

        const handleResponse = (response: DeviceResponse) => {
            console.log('Received response:', response);
            setLastResponse(response);
            setResponseLog(prev => [
                `[${new Date().toLocaleTimeString()}] ${JSON.stringify(response)}`,
                ...prev.slice(0, 49) // Keep last 50 entries
            ]);
        };

        transportRef.current.onConnectionStateChange(handleConnectionStateChange);
        transportRef.current.onResponse(handleResponse);

        return () => {
            if (transportRef.current) {
                transportRef.current.offConnectionStateChange(handleConnectionStateChange);
                transportRef.current.offResponse(handleResponse);
            }
        };
    }, []);

    // Load devices on mount and when credentials change
    const loadDevices = useCallback(async () => {
        if (!creds) {
            setError('No AWS credentials available. Please sign in.');
            return;
        }

        setIsLoadingDevices(true);
        setError(null);

        try {
            const deviceList = await listDevicesSigned(creds);
            setDevices(deviceList);
            console.log('Loaded devices:', deviceList);
        } catch (err) {
            console.error('Error loading devices:', err);
            setError(`Failed to load devices: ${err instanceof Error ? err.message : 'Unknown error'}`);
        } finally {
            setIsLoadingDevices(false);
        }
    }, [creds]);

    // Auto-load devices when tab is visible and credentials are available
    useEffect(() => {
        if (tabId === index && creds && devices.length === 0 && !isLoadingDevices) {
            loadDevices();
        }
    }, [tabId, index, creds, devices.length, isLoadingDevices, loadDevices]);

    const handleDeviceSelect = useCallback((device: Device | null) => {
        setSelectedDevice(device);
        if (device) {
            console.log('Selected device:', device);
        }
    }, []);

    // Connect to WebSocket
    const handleConnect = useCallback(async () => {
        if (!selectedDevice || !transportRef.current) return;

        setError(null);
        try {
            await transportRef.current.connect(selectedDevice);
        } catch (err) {
            console.error('Connection error:', err);
            setError(`Failed to connect: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
    }, [selectedDevice]);

    // Disconnect from WebSocket
    const handleDisconnect = useCallback(() => {
        if (transportRef.current) {
            transportRef.current.disconnect();
        }
    }, []);

    // Send ping command
    const handlePing = useCallback(async () => {
        if (!transportRef.current || connectionState !== 'connected') return;

        setError(null);
        try {
            await transportRef.current.sendCommand({ command: 'ping' });
            console.log('Ping sent');
        } catch (err) {
            console.error('Ping error:', err);
            setError(`Failed to send ping: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
    }, [connectionState]);

    // Get connection status color
    const getConnectionColor = () => {
        switch (connectionState) {
            case 'connected': return '#4CAF50';
            case 'connecting': return '#ff9800';
            case 'reconnecting': return '#ff9800';
            default: return '#888';
        }
    };

    // Get connection status text
    const getConnectionText = () => {
        switch (connectionState) {
            case 'connected': return 'Connected';
            case 'connecting': return 'Connecting...';
            case 'reconnecting': return 'Reconnecting...';
            default: return 'Disconnected';
        }
    };

    return (
        <Page tabId={tabId} index={index}>
            <div className="page">
                <h1>MQTT Remote Control</h1>
                <h3>Control IoT Devices via MQTT</h3>
                {children}

                {/* Error Display */}
                {error && (
                    <div className="alert alert-danger" style={{ marginTop: '20px' }}>
                        <strong>Error:</strong> {error}
                    </div>
                )}

                {/* Device Selector */}
                <DeviceSelector
                    devices={devices}
                    selectedDevice={selectedDevice}
                    onSelect={handleDeviceSelect}
                    isLoading={isLoadingDevices}
                    onRefresh={loadDevices}
                />

                {/* Device List (alternative view) */}
                {devices.length > 0 && !selectedDevice && (
                    <div style={{ marginTop: '20px' }}>
                        <h2>Available Devices</h2>
                        <DeviceList
                            devices={devices}
                            selectedDevice={selectedDevice}
                            onSelect={(device) => handleDeviceSelect(device)}
                            isLoading={isLoadingDevices}
                        />
                    </div>
                )}

                {/* Selected Device Controls */}
                {selectedDevice && (
                    <div style={{ marginTop: '20px' }}>
                        <div style={{
                            border: '1px solid #444',
                            borderRadius: '8px',
                            padding: '20px',
                            backgroundColor: '#282c34'
                        }}>
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: '20px'
                            }}>
                                <h2 style={{ margin: 0 }}>
                                    {selectedDevice.name}
                                </h2>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px'
                                }}>
                                    <div style={{
                                        width: '12px',
                                        height: '12px',
                                        borderRadius: '50%',
                                        backgroundColor: getConnectionColor()
                                    }} />
                                    <span style={{ color: getConnectionColor() }}>
                                        {getConnectionText()}
                                    </span>
                                </div>
                            </div>

                            {/* Device Info */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 1fr',
                                gap: '15px',
                                marginBottom: '20px'
                            }}>
                                <div>
                                    <strong>Device ID:</strong> {selectedDevice.id}
                                </div>
                                <div>
                                    <strong>Project:</strong> {selectedDevice.project}
                                </div>
                                <div>
                                    <strong>Type:</strong> {selectedDevice.deviceType}
                                </div>
                                <div>
                                    <strong>Capabilities:</strong>{' '}
                                    {selectedDevice.capabilities.join(', ') || 'None'}
                                </div>
                            </div>

                            {/* Connection Controls */}
                            <div style={{
                                display: 'flex',
                                gap: '10px',
                                marginBottom: '20px'
                            }}>
                                {connectionState === 'disconnected' ? (
                                    <button
                                        type="button"
                                        className="btn btn-primary"
                                        onClick={handleConnect}
                                    >
                                        Connect via MQTT
                                    </button>
                                ) : (
                                    <>
                                        <button
                                            type="button"
                                            className="btn btn-secondary"
                                            onClick={handleDisconnect}
                                        >
                                            Disconnect
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-success"
                                            onClick={handlePing}
                                            disabled={connectionState !== 'connected'}
                                        >
                                            Ping
                                        </button>
                                    </>
                                )}
                            </div>

                            {/* Last Response */}
                            {lastResponse && (
                                <div style={{
                                    marginBottom: '20px',
                                    padding: '15px',
                                    backgroundColor: '#1a1a2e',
                                    borderRadius: '6px'
                                }}>
                                    <strong style={{ color: '#4CAF50' }}>Last Response:</strong>
                                    <pre style={{
                                        margin: '10px 0 0 0',
                                        color: '#e0e0e0',
                                        fontSize: '13px',
                                        whiteSpace: 'pre-wrap',
                                        wordBreak: 'break-word'
                                    }}>
                                        {JSON.stringify(lastResponse, null, 2)}
                                    </pre>
                                </div>
                            )}

                            {/* Response Log */}
                            {responseLog.length > 0 && (
                                <div>
                                    <strong>Response Log:</strong>
                                    <div style={{
                                        marginTop: '10px',
                                        padding: '10px',
                                        backgroundColor: '#1a1a2e',
                                        borderRadius: '6px',
                                        maxHeight: '200px',
                                        overflow: 'auto'
                                    }}>
                                        {responseLog.map((log, i) => (
                                            <div
                                                key={i}
                                                style={{
                                                    fontFamily: 'monospace',
                                                    fontSize: '12px',
                                                    color: '#aaa',
                                                    marginBottom: '4px'
                                                }}
                                            >
                                                {log}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                        </div>
                    </div>
                )}

                {/* No credentials message */}
                {!creds && (
                    <div style={{
                        padding: '40px',
                        textAlign: 'center',
                        color: '#888',
                        backgroundColor: '#1a1a2e',
                        borderRadius: '8px',
                        marginTop: '20px'
                    }}>
                        <p>Please sign in to access IoT devices.</p>
                    </div>
                )}
            </div>
        </Page>
    );
};

export default MQTTPage;
