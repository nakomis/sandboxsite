/// <reference types="web-bluetooth" />

import {
    Credentials as AWSCredentials,
} from "@aws-sdk/client-cognito-identity";
import "./Bluetooth.css";
import Page, { PageProps } from "./Page";
import { useState, useCallback, useEffect } from "react";

// BootBoots BLE Service UUIDs (lowercase as required by Web Bluetooth API)
const BOOTBOOTS_SERVICE_UUID = "bb00b007-5af3-41c3-9689-2fc7175c1ba8";
const STATUS_CHARACTERISTIC_UUID = "bb00b007-e90f-49fa-89c5-31e705b74d85";
const LOGS_CHARACTERISTIC_UUID = "bb00b007-f1a2-49fa-89c5-31e705b74d86";
const COMMAND_CHARACTERISTIC_UUID = "bb00b007-c0de-49fa-89c5-31e705b74d87";

type BluetoothProps = PageProps & {
    creds: AWSCredentials | null;
};

interface BootBootsSystemStatus {
    device: string;
    timestamp: number;
    uptime_seconds: number;
    system: {
        initialized: boolean;
        camera_ready: boolean;
        wifi_connected: boolean;
        sd_card_ready: boolean;
        i2c_ready: boolean;
        atomizer_enabled: boolean;
    };
    statistics: {
        total_detections: number;
        boots_detections: number;
        atomizer_activations: number;
        false_positives_avoided: number;
    };
    timing: {
        last_detection: number;
        last_status_report: number;
    };
}

interface BluetoothConnection {
    device: BluetoothDevice | null;
    server: BluetoothRemoteGATTServer | null;
    service: BluetoothRemoteGATTService | null;
    statusCharacteristic: BluetoothRemoteGATTCharacteristic | null;
    logsCharacteristic: BluetoothRemoteGATTCharacteristic | null;
    commandCharacteristic: BluetoothRemoteGATTCharacteristic | null;
}

const BluetoothPage = (props: BluetoothProps) => {
    const { children, tabId, index } = props;

    // Connection state
    const [connection, setConnection] = useState<BluetoothConnection>({
        device: null,
        server: null,
        service: null,
        statusCharacteristic: null,
        logsCharacteristic: null,
        commandCharacteristic: null
    });

    // Data state
    const [systemStatus, setSystemStatus] = useState<BootBootsSystemStatus | null>(null);
    const [logData, setLogData] = useState<string>("");
    const [connectionStatus, setConnectionStatus] = useState<string>("Disconnected");
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoadingLogs, setIsLoadingLogs] = useState<boolean>(false);
    const [logChunks, setLogChunks] = useState<string[]>([]);

    // Debug: Log when logData changes
    useEffect(() => {
        console.log('logData state changed:', logData);
    }, [logData]);

    // Handle status characteristic notifications
    const handleStatusUpdate = useCallback(async (event: Event) => {
        try {
            const characteristic = event.target as BluetoothRemoteGATTCharacteristic;
            const value = await characteristic.readValue();
            const statusJson = new TextDecoder().decode(value);
            const status = JSON.parse(statusJson) as BootBootsSystemStatus;

            setSystemStatus(status);
            setLastUpdate(new Date());
            setError(null);
        } catch (err) {
            console.error('Error parsing status update:', err);
            setError('Failed to parse status update');
        }
    }, []);

    // Connect to BootBoots device
    const connectToBootBoots = useCallback(async () => {
        try {
            setConnectionStatus("Connecting...");
            setError(null);

            // Request device - filter by name instead of service UUID for better compatibility
            const device = await navigator.bluetooth.requestDevice({
                filters: [
                    { name: 'BootBoots-CatCam' },
                    { namePrefix: 'BootBoots' }
                ],
                optionalServices: [BOOTBOOTS_SERVICE_UUID]
            });

            console.log('Found BootBoots device:', device.name);

            // Connect to GATT server
            const server = await device.gatt!.connect();
            console.log('Connected to GATT Server');

            // Get primary service
            const service = await server.getPrimaryService(BOOTBOOTS_SERVICE_UUID);
            console.log('Got BootBoots service');

            // Get characteristics
            const statusChar = await service.getCharacteristic(STATUS_CHARACTERISTIC_UUID);
            const logsChar = await service.getCharacteristic(LOGS_CHARACTERISTIC_UUID);
            const commandChar = await service.getCharacteristic(COMMAND_CHARACTERISTIC_UUID);

            // Start notifications for status updates
            await statusChar.startNotifications();
            statusChar.addEventListener('characteristicvaluechanged', handleStatusUpdate);

            // Start notifications for command responses (ping, logs, etc.)
            await commandChar.startNotifications();
            commandChar.addEventListener('characteristicvaluechanged', async (event) => {
                try {
                    const characteristic = event.target as BluetoothRemoteGATTCharacteristic;
                    const value = characteristic.value;
                    if (value) {
                        const responseText = new TextDecoder().decode(value);
                        console.log('Command response received:', responseText);

                        // Try to parse as JSON
                        try {
                            const responseJson = JSON.parse(responseText);

                            // Handle chunked log data
                            if (responseJson.type === 'log_chunk') {
                                console.log(`Received log chunk ${responseJson.chunk}/${responseJson.total}`);
                                setLogChunks(prev => [...prev, responseJson.data]);
                            }
                            // Handle log transfer completion
                            else if (responseJson.type === 'logs_complete') {
                                console.log(`Log transfer complete: ${responseJson.total_chunks} chunks, ${responseJson.total_bytes} bytes`);
                                // Reassemble all chunks into complete log data
                                setLogChunks(chunks => {
                                    const fullLogData = chunks.join('');
                                    setLogData(fullLogData);
                                    console.log('Log data reassembled and set:', fullLogData.substring(0, 100) + '...');
                                    return []; // Clear chunks
                                });
                                setIsLoadingLogs(false);
                            }
                            // Check if it's an array (legacy single-notification log data)
                            else if (Array.isArray(responseJson)) {
                                console.log('Log data received via notification (array - legacy mode)');
                                console.log('Setting log data:', responseText);
                                setLogData(responseText);
                                setIsLoadingLogs(false);
                                console.log('Log data state updated');
                            }
                            // Handle ping response (object with response property)
                            else if (responseJson.response === 'pong') {
                                console.log('Ping response:', responseJson);
                                setError(null);
                            }
                        } catch {
                            // Not valid JSON - shouldn't happen
                            console.error('Received non-JSON response:', responseText);
                        }
                    }
                } catch (err) {
                    console.error('Error handling command response:', err);
                }
            });

            // Update connection state
            setConnection({
                device,
                server,
                service,
                statusCharacteristic: statusChar,
                logsCharacteristic: logsChar,
                commandCharacteristic: commandChar
            });

            setConnectionStatus("Connected");

            // // Request initial status after a delay to avoid GATT operation conflicts
            // setTimeout(async () => {
            //     try {
            //         const value = await statusChar.readValue();
            //         const statusJson = new TextDecoder().decode(value);
            //         const status = JSON.parse(statusJson) as BootBootsSystemStatus;
            //         setSystemStatus(status);
            //         setLastUpdate(new Date());
            //     } catch (err) {
            //         console.error('Error reading initial status:', err);
            //         // Don't set error - status will come via notifications
            //     }
            // }, 1000);

        } catch (err) {
            console.error('Error connecting to BootBoots:', err);
            setError(`Connection failed: ${err}`);
            setConnectionStatus("Disconnected");
        }
    }, [handleStatusUpdate]);

    // Disconnect from device
    const disconnect = useCallback(() => {
        if (connection.server) {
            connection.server.disconnect();
        }
        setConnection({
            device: null,
            server: null,
            service: null,
            statusCharacteristic: null,
            logsCharacteristic: null,
            commandCharacteristic: null
        });
        setConnectionStatus("Disconnected");
        setSystemStatus(null);
        setLogData("");
        setLastUpdate(null);
    }, [connection.server]);

    // Request current status
    const requestStatus = useCallback(async () => {
        if (!connection.statusCharacteristic) return;

        try {
            const value = await connection.statusCharacteristic.readValue();
            const statusJson = new TextDecoder().decode(value);
            const status = JSON.parse(statusJson) as BootBootsSystemStatus;
            setSystemStatus(status);
            setLastUpdate(new Date());
        } catch (err) {
            console.error('Error reading status:', err);
            setError('Failed to read status');
        }
    }, [connection.statusCharacteristic]);

    // Request logs - sends command and waits for notification response
    const requestLogs = useCallback(async () => {
        if (!connection.commandCharacteristic) {
            console.log('No command characteristic available');
            return;
        }

        setIsLoadingLogs(true);
        setError(null);

        try {
            console.log('Sending request_logs command...');
            const command = JSON.stringify({ command: "request_logs" });
            const encoder = new TextEncoder();
            await connection.commandCharacteristic.writeValue(encoder.encode(command));
            console.log('Command sent, waiting for notification response...');

            // Set a timeout to reset loading state if no response comes
            setTimeout(() => {
                console.log('Timeout waiting for log response');
                setIsLoadingLogs(false);
            }, 5000);
        } catch (err) {
            console.error('Error sending request_logs:', err);
            setError(`Failed to request logs: ${err}`);
            setIsLoadingLogs(false);
        }
    }, [connection.commandCharacteristic]);

    // Send ping command
    const sendPing = useCallback(async () => {
        if (!connection.commandCharacteristic) return;

        try {
            const command = JSON.stringify({ command: "ping" });
            const encoder = new TextEncoder();
            await connection.commandCharacteristic.writeValue(encoder.encode(command));
        } catch (err) {
            console.error('Error sending ping:', err);
            setError('Failed to send ping');
        }
    }, [connection.commandCharacteristic]);

    // Format uptime
    const formatUptime = (seconds: number): string => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${hours}h ${minutes}m ${secs}s`;
    };

    return (
        <Page tabId={tabId} index={index}>
            <div className="page">
                <h1>BootBoots Cat Territory Management</h1>
                <h3>Bluetooth Remote Monitoring</h3>
                {children}

                {/* Connection Controls */}
                <div className="connection-controls">
                    <p><strong>Status:</strong> {connectionStatus}</p>
                    {connection.device && (
                        <p><strong>Device:</strong> {connection.device.name} ({connection.device.id})</p>
                    )}

                    {!connection.device ? (
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={connectToBootBoots}
                            disabled={connectionStatus === "Connecting..."}
                        >
                            {connectionStatus === "Connecting..." ? "Connecting..." : "Connect to BootBoots"}
                        </button>
                    ) : (
                        <div>
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={disconnect}
                            >
                                Disconnect
                            </button>
                            <button
                                type="button"
                                className="btn btn-info"
                                onClick={requestStatus}
                                style={{ marginLeft: '10px' }}
                            >
                                Refresh Status
                            </button>
                            <button
                                type="button"
                                className="btn btn-info"
                                onClick={requestLogs}
                                disabled={isLoadingLogs}
                                style={{ marginLeft: '10px' }}
                            >
                                {isLoadingLogs ? 'Loading...' : 'Get Logs'}
                            </button>
                            <button
                                type="button"
                                className="btn btn-success"
                                onClick={sendPing}
                                style={{ marginLeft: '10px' }}
                            >
                                Ping
                            </button>
                        </div>
                    )}
                </div>

                {/* Error Display */}
                {error && (
                    <div className="alert alert-danger" style={{ marginTop: '20px' }}>
                        <strong>Error:</strong> {error}
                    </div>
                )}

                {/* Log Data Display */}
                {logData && (
                    <div className="log-data" style={{ marginTop: '20px' }}>
                        <h2>Recent Log Entries</h2>
                        <pre style={{
                            background: '#2a2a2a',
                            color: '#e0e0e0',
                            padding: '10px',
                            borderRadius: '5px',
                            overflow: 'auto',
                            maxHeight: '300px',
                            whiteSpace: 'pre-wrap',
                            fontFamily: 'monospace',
                            fontSize: '12px',
                            textAlign: 'left'
                        }}>
                            {(() => {
                                try {
                                    const logs = JSON.parse(logData);
                                    return logs.join('\n');
                                } catch {
                                    return logData;
                                }
                            })()}
                        </pre>
                    </div>
                )}

                {/* System Status Display */}
                {systemStatus && (
                    <div className="system-status" style={{ marginTop: '20px' }}>
                        <h2>System Status</h2>
                        {lastUpdate && (
                            <p><em>Last updated: {lastUpdate.toLocaleTimeString()}</em></p>
                        )}

                        <div className="status-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                            <div className="system-info">
                                <h3>System Information</h3>
                                <p><strong>Device:</strong> {systemStatus.device}</p>
                                <p><strong>Uptime:</strong> {formatUptime(systemStatus.uptime_seconds)}</p>
                                <p><strong>Camera Ready:</strong> {systemStatus.system.camera_ready ? '✅' : '❌'}</p>
                                <p><strong>WiFi Connected:</strong> {systemStatus.system.wifi_connected ? '✅' : '❌'}</p>
                                <p><strong>SD Card Ready:</strong> {systemStatus.system.sd_card_ready ? '✅' : '❌'}</p>
                                <p><strong>I2C Ready:</strong> {systemStatus.system.i2c_ready ? '✅' : '❌'}</p>
                                <p><strong>Atomizer Enabled:</strong> {systemStatus.system.atomizer_enabled ? '✅' : '❌'}</p>
                            </div>

                            <div className="statistics">
                                <h3>Detection Statistics</h3>
                                <p><strong>Total Detections:</strong> {systemStatus.statistics.total_detections}</p>
                                <p><strong>Boots Detections:</strong> {systemStatus.statistics.boots_detections}</p>
                                <p><strong>Atomizer Activations:</strong> {systemStatus.statistics.atomizer_activations}</p>
                                <p><strong>False Positives Avoided:</strong> {systemStatus.statistics.false_positives_avoided}</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </Page>
    );
};

export default BluetoothPage;