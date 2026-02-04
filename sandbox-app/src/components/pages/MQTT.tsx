import { Credentials } from '@aws-sdk/client-cognito-identity';
import Page, { PageProps } from './Page';
import { useState, useCallback, useEffect } from 'react';
import { Device } from '../../services/deviceTransport/types';
import { listDevicesSigned } from '../../services/mqttService';
import { DeviceSelector, DeviceList } from '../device';
import './Bluetooth.css'; // Reuse Bluetooth styles for consistency

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

                {/* Selected Device Info */}
                {selectedDevice && (
                    <div style={{ marginTop: '20px' }}>
                        <div style={{
                            border: '1px solid #444',
                            borderRadius: '8px',
                            padding: '20px',
                            backgroundColor: '#282c34'
                        }}>
                            <h2 style={{ marginTop: 0 }}>
                                {selectedDevice.name}
                            </h2>

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
                                    <strong>Status:</strong>{' '}
                                    <span style={{
                                        color: selectedDevice.connected ? '#4CAF50' : '#888'
                                    }}>
                                        {selectedDevice.connected ? 'Connected' : 'Offline'}
                                    </span>
                                </div>
                            </div>

                            {selectedDevice.capabilities.length > 0 && (
                                <div style={{ marginBottom: '20px' }}>
                                    <strong>Capabilities:</strong>
                                    <div style={{
                                        marginTop: '8px',
                                        display: 'flex',
                                        gap: '8px',
                                        flexWrap: 'wrap'
                                    }}>
                                        {selectedDevice.capabilities.map((cap) => (
                                            <span
                                                key={cap}
                                                style={{
                                                    padding: '4px 12px',
                                                    backgroundColor: '#3d4450',
                                                    borderRadius: '12px',
                                                    fontSize: '13px',
                                                    color: '#e0e0e0'
                                                }}
                                            >
                                                {cap}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Placeholder for future MQTT controls */}
                            <div style={{
                                padding: '30px',
                                backgroundColor: '#1a1a2e',
                                borderRadius: '6px',
                                textAlign: 'center',
                                color: '#888'
                            }}>
                                <p style={{ marginBottom: '10px' }}>
                                    MQTT controls will be implemented in Phase 2
                                </p>
                                <p style={{ fontSize: '13px' }}>
                                    This will include WebSocket connection for real-time communication,
                                    sending commands, and receiving device responses.
                                </p>
                            </div>
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
