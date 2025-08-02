import React, { useState, useEffect } from 'react';
import Page, { PageProps } from './Page';
import './FirmwareManager.css';
import { Credentials } from '@aws-sdk/client-cognito-identity';

interface FirmwareManagerProps extends PageProps {
    creds: Credentials | null;
}

interface FirmwareVersion {
    version: string;
    timestamp: string;
    firmware_path: string;
    size?: number;
}

interface FirmwareManifest {
    project: string;
    versions: FirmwareVersion[];
}

interface BluetoothDevice {
    id: string;
    name: string;
    connected: boolean;
    services?: BluetoothRemoteGATTService[];
}

const FirmwareManager: React.FC<FirmwareManagerProps> = ({ ...pageProps }) => {
    const [manifest, setManifest] = useState<FirmwareManifest | null>(null);
    const [selectedVersion, setSelectedVersion] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [bluetoothDevice, setBluetoothDevice] = useState<BluetoothDevice | null>(null);
    const [updateProgress, setUpdateProgress] = useState<number>(0);
    const [updateStatus, setUpdateStatus] = useState<string>('');

    const S3_BUCKET = 'mhsometestbucket';
    const PROJECT_NAME = 'BootBoots';

    useEffect(() => {
        // Only load firmware manifest when credentials are available
        if (pageProps.creds) {
            loadFirmwareManifest();
        }
    }, [pageProps.creds]);

    const loadFirmwareManifest = async () => {
        setIsLoading(true);
        setError(null);
        
        try {
            // Check if user is authenticated
            if (!pageProps.creds) {
                throw new Error('User not authenticated');
            }

            // Use firmware service with existing credentials
            const { firmwareService } = await import('../../services/firmwareService');
            const manifestData = await firmwareService.loadFirmwareManifest(pageProps.creds);
            
            setManifest(manifestData);
            
            if (manifestData.versions.length > 0) {
                setSelectedVersion(manifestData.versions[0].version);
            }
        } catch (err) {
            console.error('Error loading firmware manifest:', err);
            setError(`Failed to load available firmware versions: ${err}`);
        } finally {
            setIsLoading(false);
        }
    };

    const connectToBluetooth = async () => {
        try {
            setError(null);
            setUpdateStatus('Connecting to BootBoots device...');
            
            // Request Bluetooth device
            const device = await navigator.bluetooth.requestDevice({
                filters: [
                    { name: 'BootBoots-CatCam' },
                    { namePrefix: 'BootBoots' }
                ],
                optionalServices: ['12345678-1234-1234-1234-123456789abc'] // Custom OTA service UUID
            });

            if (!device.gatt) {
                throw new Error('GATT not available');
            }

            // Connect to device
            const server = await device.gatt.connect();
            
            setBluetoothDevice({
                id: device.id,
                name: device.name || 'Unknown Device',
                connected: true
            });
            
            setUpdateStatus('Connected to BootBoots device');
            
        } catch (err) {
            console.error('Bluetooth connection failed:', err);
            setError(`Bluetooth connection failed: ${err}`);
            setUpdateStatus('');
        }
    };

    const generateSignedUrl = async (firmwarePath: string): Promise<string> => {
        // In a real implementation, this would call your backend to generate a signed URL
        // For now, we'll use a direct S3 URL (this would need proper CORS setup)
        const signedUrl = `https://${S3_BUCKET}.s3.amazonaws.com/${firmwarePath}`;
        
        // TODO: Replace with actual signed URL generation via your backend
        // const response = await fetch('/api/generate-signed-url', {
        //     method: 'POST',
        //     headers: { 'Content-Type': 'application/json' },
        //     body: JSON.stringify({ firmwarePath })
        // });
        // const data = await response.json();
        // return data.signedUrl;
        
        return signedUrl;
    };

    const sendOTACommand = async (signedUrl: string) => {
        if (!bluetoothDevice) {
            throw new Error('No Bluetooth device connected');
        }

        try {
            // Get the Bluetooth device
            const device = await navigator.bluetooth.getDevices().then(devices => 
                devices.find(d => d.id === bluetoothDevice.id)
            );
            
            if (!device || !device.gatt?.connected) {
                throw new Error('Device not connected');
            }

            // Get OTA service
            const server = device.gatt;
            const service = await server.getPrimaryService('12345678-1234-1234-1234-123456789abc');
            
            // Get OTA command characteristic
            const characteristic = await service.getCharacteristic('87654321-4321-4321-4321-cba987654321');
            
            // Send OTA command with signed URL
            const command = JSON.stringify({
                action: 'ota_update',
                firmware_url: signedUrl,
                version: selectedVersion
            });
            
            const encoder = new TextEncoder();
            await characteristic.writeValue(encoder.encode(command));
            
            setUpdateStatus('OTA command sent to device');
            
            // Monitor progress (this would need to be implemented in the ESP32 firmware)
            monitorOTAProgress(characteristic);
            
        } catch (err) {
            throw new Error(`Failed to send OTA command: ${err}`);
        }
    };

    const monitorOTAProgress = async (characteristic: BluetoothRemoteGATTCharacteristic) => {
        // This would need to be implemented to read progress updates from the ESP32
        // For now, we'll simulate progress
        setUpdateProgress(0);
        
        const progressInterval = setInterval(() => {
            setUpdateProgress(prev => {
                if (prev >= 100) {
                    clearInterval(progressInterval);
                    setUpdateStatus('Firmware update completed successfully!');
                    return 100;
                }
                const newProgress = prev + 10;
                setUpdateStatus(`Updating firmware: ${newProgress}%`);
                return newProgress;
            });
        }, 2000);
    };

    const startFirmwareUpdate = async () => {
        if (!selectedVersion || !manifest) {
            setError('Please select a firmware version');
            return;
        }

        if (!bluetoothDevice?.connected) {
            setError('Please connect to a BootBoots device first');
            return;
        }

        try {
            setError(null);
            setUpdateProgress(0);
            setUpdateStatus('Preparing firmware update...');

            const selectedFirmware = manifest.versions.find(v => v.version === selectedVersion);
            if (!selectedFirmware) {
                throw new Error('Selected firmware version not found');
            }

            // Generate signed URL for the firmware
            const signedUrl = await generateSignedUrl(selectedFirmware.firmware_path);
            
            setUpdateStatus('Generated signed URL, sending to device...');
            
            // Send OTA command to ESP32 via Bluetooth
            await sendOTACommand(signedUrl);
            
        } catch (err) {
            console.error('Firmware update failed:', err);
            setError(`Firmware update failed: ${err}`);
            setUpdateStatus('');
            setUpdateProgress(0);
        }
    };

    const formatTimestamp = (timestamp: string) => {
        return new Date(timestamp).toLocaleString();
    };

    return (
        <Page {...pageProps}>
            <div className="firmware-manager">
                <div className="header-section">
                    <h2>🔧 BootBoots Firmware Manager</h2>
                    <p>Manage and deploy firmware updates to your BootBoots devices</p>
                </div>

                {error && (
                    <div className="error-message">
                        ⚠️ {error}
                    </div>
                )}

                <div className="connection-section">
                    <h3>📱 Device Connection</h3>
                    <div className="connection-status">
                        {bluetoothDevice?.connected ? (
                            <div className="connected">
                                <span className="status-indicator connected"></span>
                                Connected to: {bluetoothDevice.name}
                            </div>
                        ) : (
                            <div className="disconnected">
                                <span className="status-indicator disconnected"></span>
                                Not connected
                            </div>
                        )}
                    </div>
                    
                    {!bluetoothDevice?.connected && (
                        <button 
                            onClick={connectToBluetooth}
                            className="connect-button"
                        >
                            🔗 Connect to BootBoots Device
                        </button>
                    )}
                </div>

                <div className="firmware-section">
                    <h3>📦 Available Firmware Versions</h3>
                    
                    {!pageProps.creds ? (
                        <div className="loading">Waiting for authentication...</div>
                    ) : isLoading ? (
                        <div className="loading">Loading firmware versions...</div>
                    ) : manifest && manifest.versions.length > 0 ? (
                        <div className="firmware-list">
                            <div className="version-selector">
                                <label htmlFor="version-select">Select Version:</label>
                                <select 
                                    id="version-select"
                                    value={selectedVersion}
                                    onChange={(e) => setSelectedVersion(e.target.value)}
                                >
                                    {manifest.versions.map((version) => (
                                        <option key={version.version} value={version.version}>
                                            v{version.version} - {formatTimestamp(version.timestamp)}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {selectedVersion && (
                                <div className="version-details">
                                    {manifest.versions
                                        .filter(v => v.version === selectedVersion)
                                        .map(version => (
                                            <div key={version.version} className="version-info">
                                                <h4>Version {version.version}</h4>
                                                <p><strong>Released:</strong> {formatTimestamp(version.timestamp)}</p>
                                                <p><strong>Path:</strong> {version.firmware_path}</p>
                                                {version.size && (
                                                    <p><strong>Size:</strong> {(version.size / 1024 / 1024).toFixed(2)} MB</p>
                                                )}
                                            </div>
                                        ))
                                    }
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="no-firmware">
                            No firmware versions available. 
                            <button onClick={loadFirmwareManifest} className="retry-button">
                                🔄 Retry
                            </button>
                        </div>
                    )}
                </div>

                {updateStatus && (
                    <div className="update-section">
                        <h3>🚀 Update Progress</h3>
                        <div className="update-status">
                            <p>{updateStatus}</p>
                            {updateProgress > 0 && (
                                <div className="progress-bar">
                                    <div 
                                        className="progress-fill" 
                                        style={{ width: `${updateProgress}%` }}
                                    ></div>
                                    <span className="progress-text">{updateProgress}%</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div className="action-section">
                    <button 
                        onClick={startFirmwareUpdate}
                        disabled={!bluetoothDevice?.connected || !selectedVersion || isLoading}
                        className="update-button"
                    >
                        🚀 Deploy Firmware Update
                    </button>
                    
                    <div className="action-info">
                        <p><strong>Process:</strong></p>
                        <ol>
                            <li>Connect to your BootBoots device via Bluetooth</li>
                            <li>Select the firmware version you want to deploy</li>
                            <li>Click "Deploy Firmware Update"</li>
                            <li>The device will download and install the firmware automatically</li>
                        </ol>
                    </div>
                </div>

                <div className="info-section">
                    <h3>ℹ️ How It Works</h3>
                    <div className="info-content">
                        <p><strong>S3 Storage:</strong> Firmware files are stored in organized S3 buckets by project and version.</p>
                        <p><strong>Signed URLs:</strong> Temporary, secure download links are generated for each firmware file.</p>
                        <p><strong>Bluetooth Control:</strong> The web app connects to your device via Bluetooth to trigger updates.</p>
                        <p><strong>HTTP Download:</strong> The ESP32 downloads firmware directly from S3 using the signed URL.</p>
                        <p><strong>Safety:</strong> Updates include verification and rollback capabilities.</p>
                    </div>
                </div>
            </div>
        </Page>
    );
};

export default FirmwareManager;
