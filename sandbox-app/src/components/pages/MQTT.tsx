import { Credentials } from '@aws-sdk/client-cognito-identity';
import Page, { PageProps } from './Page';
import { useState, useCallback, useEffect, useRef } from 'react';
import { LRUCache } from 'typescript-lru-cache';
import {
    Device,
    DeviceResponse,
    ConnectionState,
    CameraSettings,
    DEFAULT_CAMERA_SETTINGS,
    BootBootsSystemStatus,
    KappaWarmerStatus,
    ImageAndResult,
} from '../../services/deviceTransport/types';
import { listDevicesSigned } from '../../services/mqttService';
import { getMqttTransport, MqttTransport } from '../../services/deviceTransport/mqttTransport';
import {
    DeviceSelector,
    DeviceList,
    LogViewer,
    ImageGallery,
    BootBootsControls,
    KappaWarmerControls,
    DeviceStatusPanel,
    FirmwareUpdatePanel,
} from '../device';
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
    const [responseLog, setResponseLog] = useState<string[]>([]);
    const transportRef = useRef<MqttTransport | null>(null);

    // Log state
    const [logData, setLogData] = useState<string>('');
    const [logChunks, setLogChunks] = useState<string[]>([]);
    const [isLoadingLogs, setIsLoadingLogs] = useState<boolean>(false);

    // Image state
    const [imageList, setImageList] = useState<string[]>([]);
    const [selectedImage, setSelectedImage] = useState<string>('');
    const [isLoadingImages, setIsLoadingImages] = useState<boolean>(false);
    const [isLoadingImage, setIsLoadingImage] = useState<boolean>(false);
    const [currentImage, setCurrentImage] = useState<string | null>(null);
    const [currentMetadata, setCurrentMetadata] = useState<string | null>(null);
    const [imageChunks, setImageChunks] = useState<string[]>([]);
    const [imageProgress, setImageProgress] = useState<{ current: number; total: number } | null>(null);
    const [imageListChunks, setImageListChunks] = useState<string[]>([]);

    // LRU Cache for images and metadata
    const imageCacheRef = useRef<LRUCache<string, ImageAndResult>>(
        new LRUCache<string, ImageAndResult>({ maxSize: 20 })
    );

    // Pending image data for caching
    const pendingImageDataRef = useRef<{ filename: string; imageData: string } | null>(null);
    const pendingNewPhotoRef = useRef<string | null>(null);

    // Photo capture state
    const [isTakingPhoto, setIsTakingPhoto] = useState<boolean>(false);

    // Settings state
    const [trainingMode, setTrainingMode] = useState<boolean>(false);
    const [dryRun, setDryRun] = useState<boolean>(false);
    const [triggerThresh, setTriggerThresh] = useState<number>(0.80);
    const [claudeInfer, setClaudeInfer] = useState<boolean>(false);
    const [isUpdatingSetting, setIsUpdatingSetting] = useState<boolean>(false);
    const [settingsExpanded, setSettingsExpanded] = useState<boolean>(false);
    const [cameraSettings, setCameraSettings] = useState<CameraSettings>(DEFAULT_CAMERA_SETTINGS);
    const [cameraSettingsExpanded, setCameraSettingsExpanded] = useState<boolean>(false);

    // System status state
    const [systemStatus, setSystemStatus] = useState<BootBootsSystemStatus | null>(null);
    const [kappaStatus, setKappaStatus] = useState<KappaWarmerStatus | null>(null);
    const [kappaExpanded, setKappaExpanded] = useState<boolean>(true);
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

    // Reboot state
    const [isRebooting, setIsRebooting] = useState<boolean>(false);

    // Firmware update state
    const [firmwareExpanded, setFirmwareExpanded] = useState<boolean>(false);
    const [firmwareUpdateProgress, setFirmwareUpdateProgress] = useState<number | null>(null);
    const [firmwareUpdateStatus, setFirmwareUpdateStatus] = useState<string | null>(null);
    const [isFirmwareUpdating, setIsFirmwareUpdating] = useState<boolean>(false);
    const [currentFirmwareVersion, setCurrentFirmwareVersion] = useState<string | null>(null);

    // Handle device responses
    const handleResponse = useCallback((response: DeviceResponse) => {
        console.log('Received response:', response);

        // Add to response log
        setResponseLog(prev => [
            `[${new Date().toLocaleTimeString()}] ${response.type}: ${JSON.stringify(response).substring(0, 100)}...`,
            ...prev.slice(0, 49)
        ]);

        // Handle different response types
        switch (response.type) {
            case 'pong':
                console.log('Pong received');
                break;

            case 'log_chunk':
                console.log(`Received log chunk ${response.chunk}/${response.total}`);
                setLogChunks(prevChunks => {
                    const newChunks = [...prevChunks, response.data as string];
                    setLogData(newChunks.join('\n'));
                    return newChunks;
                });
                break;

            case 'logs_complete':
                console.log(`Log transfer complete: ${response.total_chunks} chunks`);
                setLogChunks(chunks => {
                    setLogData(chunks.join('\n'));
                    return [];
                });
                setIsLoadingLogs(false);
                break;

            case 'image_list':
                console.log('Image list received:', response.images);
                setImageList((response.images as string[]) || []);
                setIsLoadingImages(false);
                break;

            case 'image_list_chunk':
                setImageListChunks(prev => [...prev, response.filename as string]);
                break;

            case 'image_list_complete':
                console.log(`Image list complete: ${response.count} images`);
                setImageListChunks(chunks => {
                    setImageList(chunks);
                    setIsLoadingImages(false);
                    // Check for pending new photo
                    const pendingFilename = pendingNewPhotoRef.current;
                    if (pendingFilename && chunks.includes(pendingFilename)) {
                        console.log(`Auto-selecting new photo: ${pendingFilename}`);
                        setSelectedImage(pendingFilename);
                        pendingNewPhotoRef.current = null;
                        // Request the new image
                        handleGetImage(pendingFilename);
                    }
                    return [];
                });
                break;

            case 'image_start':
                console.log(`Image transfer starting: ${response.filename}`);
                setImageChunks([]);
                setImageProgress({ current: 0, total: 0 });
                break;

            case 'image_chunk':
                setImageChunks(prev => [...prev, response.data as string]);
                setImageProgress({
                    current: (response.chunk as number) + 1,
                    total: response.total as number
                });
                break;

            case 'image_complete':
                console.log(`Image transfer complete: ${response.chunks} chunks`);
                const filename = response.filename as string;
                setImageChunks(chunks => {
                    const base64Data = chunks.join('');
                    const imageDataUrl = `data:image/jpeg;base64,${base64Data}`;
                    setCurrentImage(imageDataUrl);
                    setImageProgress(null);
                    pendingImageDataRef.current = { filename, imageData: imageDataUrl };
                    return [];
                });
                // Request metadata
                if (transportRef.current && connectionState === 'connected') {
                    transportRef.current.sendCommand({
                        command: 'get_image_metadata',
                        filename
                    });
                }
                break;

            case 'metadata_result':
                console.log(`Metadata result for: ${response.filename}`);
                const metadata = response.found ? (response.content as string) : null;
                setCurrentMetadata(metadata);
                setIsLoadingImage(false);
                // Cache the image with metadata
                if (pendingImageDataRef.current && pendingImageDataRef.current.filename === response.filename) {
                    imageCacheRef.current.set(response.filename as string, {
                        imageData: pendingImageDataRef.current.imageData,
                        metadata
                    });
                    pendingImageDataRef.current = null;
                }
                break;

            case 'error':
                console.error('Error from device:', response.message);
                setError(response.message as string);
                setIsLoadingImage(false);
                setIsLoadingImages(false);
                setIsLoadingLogs(false);
                setIsTakingPhoto(false);
                break;

            case 'photo_started':
                console.log('Photo capture started');
                setIsTakingPhoto(true);
                break;

            case 'photo_complete':
                console.log('Photo capture complete:', response.filename);
                setIsTakingPhoto(false);
                if (response.filename) {
                    pendingNewPhotoRef.current = response.filename as string;
                    handleListImages();
                }
                break;

            case 'settings':
                console.log('Settings received:', response);
                setTrainingMode((response.training_mode as boolean) || false);
                setDryRun((response.dry_run as boolean) || false);
                setTriggerThresh((response.trigger_threshold as number) ?? 0.80);
                setClaudeInfer((response.claude_infer as boolean) || false);
                if (response.camera) {
                    setCameraSettings(prev => ({ ...prev, ...(response.camera as Partial<CameraSettings>) }));
                }
                break;

            case 'setting_updated':
                console.log('Setting updated:', response);
                if (response.setting === 'training_mode') {
                    setTrainingMode(response.value as boolean);
                } else if (response.setting === 'dry_run') {
                    setDryRun(response.value as boolean);
                } else if (response.setting === 'trigger_threshold') {
                    setTriggerThresh(response.value as number);
                } else if (response.setting === 'claude_infer') {
                    setClaudeInfer(response.value as boolean);
                } else if (typeof response.setting === 'string' && response.setting.startsWith('camera_')) {
                    const camKey = response.setting.substring(7);
                    setCameraSettings(prev => ({ ...prev, [camKey]: response.value }));
                }
                setIsUpdatingSetting(false);
                break;

            case 'reboot_ack':
                console.log('Device is rebooting...');
                setIsRebooting(false);
                break;

            case 'status':
                if ((response.device as string) === 'Kappa-Warmer') {
                    console.log('Kappa-Warmer status received:', response);
                    setKappaStatus(response as unknown as KappaWarmerStatus);
                } else {
                    console.log('BootBoots status received:', response);
                    setSystemStatus(response as unknown as BootBootsSystemStatus);
                }
                setLastUpdate(new Date());
                break;

            case 'version':
                console.log('Firmware version received:', response.version);
                setCurrentFirmwareVersion(response.version as string);
                break;

            case 'ota_progress':
                console.log('OTA progress:', response.progress, response.status);
                setFirmwareUpdateProgress(response.progress as number);
                setFirmwareUpdateStatus(response.status as string);
                break;

            case 'ota_complete':
                console.log('OTA complete:', response.version);
                setFirmwareUpdateStatus('Update complete! Device will reboot...');
                setFirmwareUpdateProgress(100);
                setTimeout(() => {
                    setIsFirmwareUpdating(false);
                    setFirmwareUpdateProgress(null);
                    setFirmwareUpdateStatus(null);
                }, 3000);
                break;

            case 'ota_error':
                console.error('OTA error:', response.message);
                setError(`Firmware update failed: ${response.message}`);
                setIsFirmwareUpdating(false);
                setFirmwareUpdateProgress(null);
                setFirmwareUpdateStatus(null);
                break;
        }
    }, [connectionState]);

    // Initialize transport and set up handlers
    useEffect(() => {
        transportRef.current = getMqttTransport(WEBSOCKET_ENDPOINT);

        const handleConnectionStateChange = (state: ConnectionState) => {
            setConnectionState(state);
            if (state === 'disconnected') {
                // Clear device-specific state on disconnect
                setSystemStatus(null);
                setKappaStatus(null);
                setLogData('');
                setImageList([]);
                setCurrentImage(null);
                setCurrentMetadata(null);
            }
        };

        transportRef.current.onConnectionStateChange(handleConnectionStateChange);
        transportRef.current.onResponse(handleResponse);

        return () => {
            if (transportRef.current) {
                transportRef.current.offConnectionStateChange(handleConnectionStateChange);
                transportRef.current.offResponse(handleResponse);
            }
        };
    }, [handleResponse]);

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
        // Disconnect from previous device if connected
        if (connectionState !== 'disconnected' && transportRef.current) {
            transportRef.current.disconnect();
        }

        setSelectedDevice(device);
        // Reset device-specific state
        setSystemStatus(null);
        setKappaStatus(null);
        setLogData('');
        setImageList([]);
        setCurrentImage(null);
        setCurrentMetadata(null);
        setTrainingMode(false);
        setCameraSettings(DEFAULT_CAMERA_SETTINGS);

        if (device) {
            console.log('Selected device:', device);
        }
    }, [connectionState]);

    // Connect to WebSocket
    const handleConnect = useCallback(async () => {
        if (!selectedDevice || !transportRef.current) return;

        setError(null);
        try {
            await transportRef.current.connect(selectedDevice);
            // Request initial data after connection
            setTimeout(() => {
                if (transportRef.current && transportRef.current.getConnectionState() === 'connected') {
                    // Request settings
                    transportRef.current.sendCommand({ command: 'get_settings' });
                    // Request status
                    transportRef.current.sendCommand({ command: 'get_status' });
                    // Request image list if device supports photos
                    if (selectedDevice.capabilities.includes('photos')) {
                        handleListImages();
                    }
                }
            }, 500);
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

    // Request logs
    const handleRequestLogs = useCallback(async () => {
        if (!transportRef.current || connectionState !== 'connected') return;

        setIsLoadingLogs(true);
        setLogChunks([]);
        setLogData('');
        setError(null);

        try {
            await transportRef.current.sendCommand({ command: 'request_logs' });
            console.log('Logs requested');
        } catch (err) {
            console.error('Request logs error:', err);
            setError(`Failed to request logs: ${err instanceof Error ? err.message : 'Unknown error'}`);
            setIsLoadingLogs(false);
        }
    }, [connectionState]);

    // List images
    const handleListImages = useCallback(async () => {
        if (!transportRef.current || connectionState !== 'connected') return;

        setIsLoadingImages(true);
        setImageListChunks([]);
        setError(null);

        try {
            await transportRef.current.sendCommand({ command: 'list_images' });
            console.log('Image list requested');
        } catch (err) {
            console.error('List images error:', err);
            setError(`Failed to list images: ${err instanceof Error ? err.message : 'Unknown error'}`);
            setIsLoadingImages(false);
        }
    }, [connectionState]);

    // Get specific image
    const handleGetImage = useCallback(async (filename: string) => {
        if (!transportRef.current || connectionState !== 'connected') return;

        // Check cache first
        const cached = imageCacheRef.current.get(filename);
        if (cached) {
            console.log(`Using cached image: ${filename}`);
            setCurrentImage(cached.imageData);
            setCurrentMetadata(cached.metadata);
            setIsLoadingImage(false);
            return;
        }

        setIsLoadingImage(true);
        setCurrentImage(null);
        setCurrentMetadata(null);
        setImageChunks([]);
        setError(null);

        try {
            await transportRef.current.sendCommand({ command: 'get_image', filename });
            console.log('Image requested:', filename);
        } catch (err) {
            console.error('Get image error:', err);
            setError(`Failed to get image: ${err instanceof Error ? err.message : 'Unknown error'}`);
            setIsLoadingImage(false);
        }
    }, [connectionState]);

    // Handle image selection
    const handleImageSelect = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
        const filename = event.target.value;
        setSelectedImage(filename);
        if (filename) {
            handleGetImage(filename);
        }
    }, [handleGetImage]);

    // Take photo
    const handleTakePhoto = useCallback(async () => {
        if (!transportRef.current || connectionState !== 'connected') return;

        setIsTakingPhoto(true);
        setError(null);

        try {
            await transportRef.current.sendCommand({ command: 'take_photo' });
            console.log('Take photo command sent');
        } catch (err) {
            console.error('Take photo error:', err);
            setError(`Failed to take photo: ${err instanceof Error ? err.message : 'Unknown error'}`);
            setIsTakingPhoto(false);
        }
    }, [connectionState]);

    // Toggle training mode
    const handleToggleTrainingMode = useCallback(async () => {
        if (!transportRef.current || connectionState !== 'connected') return;

        setIsUpdatingSetting(true);
        setError(null);

        try {
            await transportRef.current.sendCommand({
                command: 'set_setting',
                setting: 'training_mode',
                value: !trainingMode
            });
            console.log('Training mode toggle sent');
        } catch (err) {
            console.error('Toggle training mode error:', err);
            setError(`Failed to toggle training mode: ${err instanceof Error ? err.message : 'Unknown error'}`);
            setIsUpdatingSetting(false);
        }
    }, [connectionState, trainingMode]);

    // Toggle dry run mode
    const handleToggleDryRun = useCallback(async () => {
        if (!transportRef.current || connectionState !== 'connected') return;

        setIsUpdatingSetting(true);
        setError(null);

        try {
            await transportRef.current.sendCommand({
                command: 'set_dry_run',
                enabled: !dryRun
            });
        } catch (err) {
            console.error('Toggle dry run error:', err);
            setError(`Failed to toggle dry run: ${err instanceof Error ? err.message : 'Unknown error'}`);
            setIsUpdatingSetting(false);
        }
    }, [connectionState, dryRun]);

    // Set trigger threshold
    const handleSetTriggerThresh = useCallback(async (value: number) => {
        if (!transportRef.current || connectionState !== 'connected') return;

        setIsUpdatingSetting(true);
        setError(null);

        try {
            await transportRef.current.sendCommand({
                command: 'set_trigger_threshold',
                value
            });
        } catch (err) {
            console.error('Set trigger threshold error:', err);
            setError(`Failed to set trigger threshold: ${err instanceof Error ? err.message : 'Unknown error'}`);
            setIsUpdatingSetting(false);
        }
    }, [connectionState]);

    // Toggle Claude vision inference
    const handleToggleClaudeInfer = useCallback(async () => {
        if (!transportRef.current || connectionState !== 'connected') return;

        setIsUpdatingSetting(true);
        setError(null);

        try {
            await transportRef.current.sendCommand({
                command: 'set_claude_infer',
                enabled: !claudeInfer
            });
        } catch (err) {
            console.error('Toggle Claude infer error:', err);
            setError(`Failed to toggle Claude inference: ${err instanceof Error ? err.message : 'Unknown error'}`);
            setIsUpdatingSetting(false);
        }
    }, [connectionState, claudeInfer]);

    // Change camera setting
    const handleCameraSettingChange = useCallback(async (setting: string, value: number | boolean) => {
        if (!transportRef.current || connectionState !== 'connected') return;

        setIsUpdatingSetting(true);
        setError(null);

        try {
            await transportRef.current.sendCommand({
                command: 'set_setting',
                setting: `camera_${setting}`,
                value
            });
            console.log(`Camera setting ${setting} change sent:`, value);
        } catch (err) {
            console.error('Camera setting change error:', err);
            setError(`Failed to change setting: ${err instanceof Error ? err.message : 'Unknown error'}`);
            setIsUpdatingSetting(false);
        }
    }, [connectionState]);

    // Reboot device
    const handleReboot = useCallback(async () => {
        if (!transportRef.current || connectionState !== 'connected') return;

        if (!window.confirm('Are you sure you want to reboot the device?')) {
            return;
        }

        setIsRebooting(true);
        setError(null);

        try {
            await transportRef.current.sendCommand({ command: 'reboot' });
            console.log('Reboot command sent');
        } catch (err) {
            console.error('Reboot error:', err);
            setError(`Failed to reboot: ${err instanceof Error ? err.message : 'Unknown error'}`);
            setIsRebooting(false);
        }
    }, [connectionState]);

    // Kappa-Warmer specific commands
    const handleSetAuto = useCallback(async (enabled: boolean) => {
        if (!transportRef.current || connectionState !== 'connected') return;

        try {
            await transportRef.current.sendCommand({ command: 'set_auto', enabled });
            console.log('Set auto mode:', enabled);
        } catch (err) {
            console.error('Set auto error:', err);
            setError(`Failed to set auto mode: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
    }, [connectionState]);

    const handleSetHeater = useCallback(async (on: boolean) => {
        if (!transportRef.current || connectionState !== 'connected') return;

        try {
            await transportRef.current.sendCommand({ command: 'set_heater', on });
            console.log('Set heater:', on);
        } catch (err) {
            console.error('Set heater error:', err);
            setError(`Failed to set heater: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
    }, [connectionState]);

    const handleRequestStatus = useCallback(async () => {
        if (!transportRef.current || connectionState !== 'connected') return;

        try {
            await transportRef.current.sendCommand({ command: 'get_status' });
            console.log('Status requested');
        } catch (err) {
            console.error('Request status error:', err);
            setError(`Failed to request status: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
    }, [connectionState]);

    // Firmware update handlers
    const handleStartFirmwareUpdate = useCallback(async (url: string, version: string) => {
        if (!transportRef.current || connectionState !== 'connected') {
            setError('Not connected to device');
            return;
        }

        try {
            setIsFirmwareUpdating(true);
            setFirmwareUpdateProgress(0);
            setFirmwareUpdateStatus('Sending OTA command to device...');

            // Send OTA update command via MQTT
            // Note: URL chunking may be needed for long URLs - the device firmware needs to support this
            await transportRef.current.sendCommand({
                command: 'ota_update',
                url,
                version
            });
            console.log('OTA command sent via MQTT');
            setFirmwareUpdateStatus('Update initiated - waiting for device...');

        } catch (err) {
            console.error('Error starting firmware update:', err);
            setError(`Failed to start update: ${err instanceof Error ? err.message : 'Unknown error'}`);
            setIsFirmwareUpdating(false);
            setFirmwareUpdateProgress(null);
            setFirmwareUpdateStatus(null);
        }
    }, [connectionState]);

    const handleCancelFirmwareUpdate = useCallback(async () => {
        if (!transportRef.current || connectionState !== 'connected') return;

        try {
            await transportRef.current.sendCommand({ command: 'ota_cancel' });
            setIsFirmwareUpdating(false);
            setFirmwareUpdateProgress(null);
            setFirmwareUpdateStatus(null);
        } catch (err) {
            console.error('Failed to cancel update:', err);
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

    const isConnected = connectionState === 'connected';
    const deviceType = selectedDevice?.deviceType || 'unknown';
    const hasPhotos = selectedDevice?.capabilities.includes('photos') ?? false;
    const hasLogs = selectedDevice?.capabilities.includes('logs') ?? false;

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
                        <button
                            type="button"
                            onClick={() => setError(null)}
                            style={{
                                float: 'right',
                                background: 'none',
                                border: 'none',
                                color: 'inherit',
                                cursor: 'pointer',
                                fontSize: '16px'
                            }}
                        >
                            ×
                        </button>
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
                                marginBottom: '20px',
                                flexWrap: 'wrap'
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
                                            disabled={!isConnected}
                                        >
                                            Ping
                                        </button>
                                        {hasLogs && (
                                            <button
                                                type="button"
                                                className="btn btn-info"
                                                onClick={handleRequestLogs}
                                                disabled={!isConnected || isLoadingLogs}
                                            >
                                                {isLoadingLogs ? 'Loading...' : 'Request Logs'}
                                            </button>
                                        )}
                                        {hasPhotos && (
                                            <>
                                                <button
                                                    type="button"
                                                    className="btn btn-info"
                                                    onClick={handleListImages}
                                                    disabled={!isConnected || isLoadingImages}
                                                >
                                                    {isLoadingImages ? 'Loading...' : 'List Images'}
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn btn-warning"
                                                    onClick={handleTakePhoto}
                                                    disabled={!isConnected || isTakingPhoto}
                                                >
                                                    {isTakingPhoto ? 'Capturing...' : 'Take Photo'}
                                                </button>
                                            </>
                                        )}
                                        <button
                                            type="button"
                                            className="btn btn-danger"
                                            onClick={handleReboot}
                                            disabled={!isConnected || isRebooting}
                                        >
                                            {isRebooting ? 'Rebooting...' : 'Reboot'}
                                        </button>
                                    </>
                                )}
                            </div>

                            {/* Device-specific controls */}
                            {isConnected && deviceType === 'bootboots' && (
                                <BootBootsControls
                                    trainingMode={trainingMode}
                                    onToggleTrainingMode={handleToggleTrainingMode}
                                    dryRun={dryRun}
                                    onToggleDryRun={handleToggleDryRun}
                                    triggerThresh={triggerThresh}
                                    onSetTriggerThresh={handleSetTriggerThresh}
                                    claudeInfer={claudeInfer}
                                    onToggleClaudeInfer={handleToggleClaudeInfer}
                                    isUpdatingSetting={isUpdatingSetting}
                                    settingsExpanded={settingsExpanded}
                                    onSettingsExpandToggle={() => setSettingsExpanded(!settingsExpanded)}
                                    cameraSettings={cameraSettings}
                                    cameraSettingsExpanded={cameraSettingsExpanded}
                                    onCameraSettingsExpandToggle={() => setCameraSettingsExpanded(!cameraSettingsExpanded)}
                                    onCameraSettingChange={handleCameraSettingChange}
                                />
                            )}

                            {isConnected && deviceType === 'kappa-warmer' && (
                                <KappaWarmerControls
                                    status={kappaStatus}
                                    expanded={kappaExpanded}
                                    onExpandToggle={() => setKappaExpanded(!kappaExpanded)}
                                    onSetAuto={handleSetAuto}
                                    onSetHeater={handleSetHeater}
                                    onRequestStatus={handleRequestStatus}
                                />
                            )}

                            {/* Firmware Update Panel (BootBoots only) */}
                            {isConnected && deviceType === 'bootboots' && (
                                <FirmwareUpdatePanel
                                    deviceProject="bootboots"
                                    currentVersion={currentFirmwareVersion}
                                    expanded={firmwareExpanded}
                                    onExpandToggle={() => setFirmwareExpanded(!firmwareExpanded)}
                                    onStartUpdate={handleStartFirmwareUpdate}
                                    onCancelUpdate={handleCancelFirmwareUpdate}
                                    updateProgress={firmwareUpdateProgress}
                                    updateStatus={firmwareUpdateStatus}
                                    isUpdating={isFirmwareUpdating}
                                    isConnected={isConnected}
                                    creds={creds}
                                />
                            )}

                            {/* Image Gallery */}
                            {isConnected && hasPhotos && (
                                <ImageGallery
                                    imageList={imageList}
                                    selectedImage={selectedImage}
                                    onImageSelect={handleImageSelect}
                                    isLoadingImage={isLoadingImage}
                                    imageProgress={imageProgress}
                                    currentImage={currentImage}
                                    currentMetadata={currentMetadata}
                                />
                            )}

                            {/* Log Viewer */}
                            {isConnected && hasLogs && (
                                <LogViewer logData={logData} />
                            )}

                            {/* System Status (BootBoots) */}
                            {isConnected && deviceType === 'bootboots' && systemStatus && (
                                <DeviceStatusPanel
                                    status={systemStatus}
                                    lastUpdate={lastUpdate}
                                />
                            )}

                            {/* Response Log */}
                            {responseLog.length > 0 && (
                                <div style={{ marginTop: '20px' }}>
                                    <strong>Response Log:</strong>
                                    <div style={{
                                        marginTop: '10px',
                                        padding: '10px',
                                        backgroundColor: '#1a1a2e',
                                        borderRadius: '6px',
                                        maxHeight: '150px',
                                        overflow: 'auto'
                                    }}>
                                        {responseLog.map((log, i) => (
                                            <div
                                                key={i}
                                                style={{
                                                    fontFamily: 'monospace',
                                                    fontSize: '11px',
                                                    color: '#888',
                                                    marginBottom: '2px'
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
