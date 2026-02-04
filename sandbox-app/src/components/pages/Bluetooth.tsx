/// <reference types="web-bluetooth" />

import {
    Credentials as AWSCredentials,
} from "@aws-sdk/client-cognito-identity";
import "./Bluetooth.css";
import Page, { PageProps } from "./Page";
import { useState, useCallback, useEffect, useRef } from "react";
import { LRUCache } from "typescript-lru-cache";

// Cached image data with AI inference result
interface ImageAndResult {
    imageData: string;      // base64 data URL
    metadata: string | null; // .txt file contents (AI inference JSON)
}

// Camera sensor settings synced with device
interface CameraSettings {
    frame_size: number;       // framesize_t enum value
    jpeg_quality: number;     // 0-63 (lower = better)
    fb_count: number;         // 1-3
    brightness: number;       // -2 to 2
    contrast: number;         // -2 to 2
    saturation: number;       // -2 to 2
    special_effect: number;   // 0-6
    white_balance: boolean;
    awb_gain: boolean;
    wb_mode: number;          // 0-4
    exposure_ctrl: boolean;
    aec2: boolean;
    ae_level: number;         // -2 to 2
    aec_value: number;        // 0 to 1200
    gain_ctrl: boolean;
    agc_gain: number;         // 0 to 30
    gain_ceiling: number;     // 0 to 6
    bpc: boolean;
    wpc: boolean;
    raw_gma: boolean;
    lenc: boolean;
    hmirror: boolean;
    vflip: boolean;
    dcw: boolean;
    colorbar: boolean;
    led_delay_millis: number;
}

const DEFAULT_CAMERA_SETTINGS: CameraSettings = {
    frame_size: 13, jpeg_quality: 10, fb_count: 2,
    brightness: 0, contrast: 0, saturation: 0, special_effect: 0,
    white_balance: true, awb_gain: true, wb_mode: 0,
    exposure_ctrl: true, aec2: false, ae_level: -2, aec_value: 300,
    gain_ctrl: true, agc_gain: 15, gain_ceiling: 0,
    bpc: false, wpc: true, raw_gma: true, lenc: true,
    hmirror: false, vflip: false, dcw: true, colorbar: false,
    led_delay_millis: 100
};

const SPECIAL_EFFECT_NAMES = ['None', 'Negative', 'Grayscale', 'Red Tint', 'Green Tint', 'Blue Tint', 'Sepia'];
const WB_MODE_NAMES = ['Auto', 'Sunny', 'Cloudy', 'Office', 'Home'];
const FRAME_SIZE_OPTIONS: { value: number; label: string }[] = [
    { value: 5, label: 'QVGA (320x240)' },
    { value: 6, label: 'CIF (400x296)' },
    { value: 8, label: 'VGA (640x480)' },
    { value: 9, label: 'SVGA (800x600)' },
    { value: 10, label: 'XGA (1024x768)' },
    { value: 11, label: 'HD (1280x720)' },
    { value: 12, label: 'SXGA (1280x1024)' },
    { value: 13, label: 'UXGA (1600x1200)' },
];

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
        training_mode: boolean;
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

// Kappa-Warmer status interface
interface KappaWarmerStatus {
    device: string;
    state: string;
    auto_mode: boolean;
    pressure: number;
    threshold: number;
    cat_present: boolean;
    relay_on: boolean;
    uptime_ms: number;
    wifi_connected: boolean;
    sd_card_ready: boolean;
}

// Device type enum
type DeviceType = 'bootboots' | 'kappa-warmer' | 'unknown';

interface BluetoothConnection {
    device: BluetoothDevice | null;
    server: BluetoothRemoteGATTServer | null;
    service: BluetoothRemoteGATTService | null;
    statusCharacteristic: BluetoothRemoteGATTCharacteristic | null;
    logsCharacteristic: BluetoothRemoteGATTCharacteristic | null;
    commandCharacteristic: BluetoothRemoteGATTCharacteristic | null;
}

// Reusable camera setting components
const CameraSlider = ({ label, value, min, max, setting, onChange, disabled }: {
    label: string; value: number; min: number; max: number; setting: string;
    onChange: (setting: string, value: number) => void; disabled: boolean;
}) => {
    const [inputValue, setInputValue] = useState(value.toString());

    // Update input when external value changes
    useEffect(() => {
        setInputValue(value.toString());
    }, [value]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setInputValue(e.target.value);
    };

    const handleInputBlur = () => {
        const parsed = parseInt(inputValue);
        if (!isNaN(parsed)) {
            const clamped = Math.max(min, Math.min(max, parsed));
            setInputValue(clamped.toString());
            if (clamped !== value) {
                onChange(setting, clamped);
            }
        } else {
            setInputValue(value.toString());
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            (e.target as HTMLInputElement).blur();
        }
    };

    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <label style={{ fontSize: '13px', color: '#e0e0e0', minWidth: '120px' }}>{label}</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '11px', color: '#888', minWidth: '20px', textAlign: 'right' }}>{min}</span>
                <input
                    type="range"
                    min={min}
                    max={max}
                    value={value}
                    onChange={(e) => onChange(setting, parseInt(e.target.value))}
                    disabled={disabled}
                    style={{ width: '120px', cursor: disabled ? 'wait' : 'pointer' }}
                />
                <span style={{ fontSize: '11px', color: '#888', minWidth: '20px' }}>{max}</span>
                <input
                    type="text"
                    value={inputValue}
                    onChange={handleInputChange}
                    onBlur={handleInputBlur}
                    onKeyDown={handleKeyDown}
                    disabled={disabled}
                    style={{
                        width: '45px',
                        fontSize: '13px',
                        color: '#4CAF50',
                        fontWeight: 'bold',
                        textAlign: 'right',
                        backgroundColor: '#2a2a2a',
                        border: '1px solid #444',
                        borderRadius: '4px',
                        padding: '2px 4px',
                        cursor: disabled ? 'wait' : 'text'
                    }}
                />
            </div>
        </div>
    );
};

const CameraToggle = ({ label, value, setting, onChange, disabled }: {
    label: string; value: boolean; setting: string;
    onChange: (setting: string, value: boolean) => void; disabled: boolean;
}) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <label style={{ fontSize: '13px', color: '#e0e0e0' }}>{label}</label>
        <label style={{ position: 'relative', display: 'inline-block', width: '44px', height: '24px', flexShrink: 0 }}>
            <input
                type="checkbox"
                checked={value}
                onChange={() => onChange(setting, !value)}
                disabled={disabled}
                style={{ opacity: 0, width: 0, height: 0 }}
            />
            <span style={{
                position: 'absolute', cursor: disabled ? 'wait' : 'pointer',
                top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: value ? '#4CAF50' : '#555',
                transition: '0.3s', borderRadius: '24px',
                opacity: disabled ? 0.6 : 1
            }}>
                <span style={{
                    position: 'absolute', height: '18px', width: '18px',
                    left: value ? '23px' : '3px', bottom: '3px',
                    backgroundColor: 'white', transition: '0.3s', borderRadius: '50%'
                }}></span>
            </span>
        </label>
    </div>
);

const CameraSelect = ({ label, value, options, setting, onChange, disabled }: {
    label: string; value: number; options: string[]; setting: string;
    onChange: (setting: string, value: number) => void; disabled: boolean;
}) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <label style={{ fontSize: '13px', color: '#e0e0e0' }}>{label}</label>
        <select
            value={value}
            onChange={(e) => onChange(setting, parseInt(e.target.value))}
            disabled={disabled}
            style={{
                padding: '4px 8px', borderRadius: '4px', border: '1px solid #444',
                backgroundColor: '#1a1a2e', color: '#e0e0e0', fontSize: '13px',
                cursor: disabled ? 'wait' : 'pointer'
            }}
        >
            {options.map((name, i) => (
                <option key={i} value={i}>{name}</option>
            ))}
        </select>
    </div>
);

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
    const [logsDropdownOpen, setLogsDropdownOpen] = useState<boolean>(false);
    const logsDropdownRef = useRef<HTMLDivElement>(null);

    // Previous log files state
    const [previousLogList, setPreviousLogList] = useState<string[]>([]);
    const [selectedPreviousLog, setSelectedPreviousLog] = useState<string>("");
    const [isLoadingPreviousLogs, setIsLoadingPreviousLogs] = useState<boolean>(false);
    const [previousLogChunks, setPreviousLogChunks] = useState<string[]>([]);

    // Image state
    const [imageList, setImageList] = useState<string[]>([]);
    const [selectedImage, setSelectedImage] = useState<string>("");
    const [isLoadingImages, setIsLoadingImages] = useState<boolean>(false);
    const [isLoadingImage, setIsLoadingImage] = useState<boolean>(false);
    const [currentImage, setCurrentImage] = useState<string | null>(null);
    const [currentMetadata, setCurrentMetadata] = useState<string | null>(null);
    const [imageChunks, setImageChunks] = useState<string[]>([]);
    const [imageProgress, setImageProgress] = useState<{ current: number; total: number } | null>(null);
    const [imageListChunks, setImageListChunks] = useState<string[]>([]);
    const [imageListProgress, setImageListProgress] = useState<{ current: number; total: number } | null>(null);

    // LRU Cache for images and metadata (persists across renders)
    const imageCacheRef = useRef<LRUCache<string, ImageAndResult>>(
        new LRUCache<string, ImageAndResult>({ maxSize: 20 })
    );

    // Pending metadata request (to pair with image once both are loaded)
    const pendingImageDataRef = useRef<{ filename: string; imageData: string } | null>(null);

    // Track filename from take_photo for auto-fetch
    const pendingNewPhotoRef = useRef<string | null>(null);

    // Photo capture state
    const [isTakingPhoto, setIsTakingPhoto] = useState<boolean>(false);

    // Training mode settings state
    const [trainingMode, setTrainingMode] = useState<boolean>(false);
    const [isUpdatingSetting, setIsUpdatingSetting] = useState<boolean>(false);
    const [settingsExpanded, setSettingsExpanded] = useState<boolean>(false);

    // Camera settings state
    const [cameraSettings, setCameraSettings] = useState<CameraSettings>(DEFAULT_CAMERA_SETTINGS);
    const [cameraSettingsExpanded, setCameraSettingsExpanded] = useState<boolean>(false);

    // Reboot state
    const [isRebooting, setIsRebooting] = useState<boolean>(false);

    // Previously paired devices state
    const [pairedDevices, setPairedDevices] = useState<BluetoothDevice[]>([]);
    const [isReconnecting, setIsReconnecting] = useState<boolean>(false);

    // Device type detection
    const [deviceType, setDeviceType] = useState<DeviceType>('unknown');

    // Kappa-Warmer specific state
    const [kappaStatus, setKappaStatus] = useState<KappaWarmerStatus | null>(null);
    const [kappaExpanded, setKappaExpanded] = useState<boolean>(true);

    // // Debug: Log when logData changes
    // useEffect(() => {
    //     console.log('logData state changed:', logData);
    // }, [logData]);

    // Check for previously paired devices on mount
    useEffect(() => {
        const checkPairedDevices = async () => {
            // Check if getDevices is supported (Chrome 85+, experimental)
            if ('bluetooth' in navigator && 'getDevices' in navigator.bluetooth) {
                try {
                    const devices = await navigator.bluetooth.getDevices();
                    const bootbootsDevices = devices.filter(d =>
                        d.name?.startsWith('BootBoots') || d.name?.startsWith('Kappa-Warmer')
                    );
                    setPairedDevices(bootbootsDevices);
                    console.log('Found previously paired devices:', bootbootsDevices.map(d => d.name));
                } catch (err) {
                    console.log('Could not get paired devices:', err);
                }
            }
        };
        checkPairedDevices();
    }, []);

    // Close logs dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (logsDropdownRef.current && !logsDropdownRef.current.contains(event.target as Node)) {
                setLogsDropdownOpen(false);
            }
        };

        if (logsDropdownOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [logsDropdownOpen]);

    // Handle status characteristic notifications
    const handleStatusUpdate = useCallback(async (event: Event) => {
        try {
            const characteristic = event.target as BluetoothRemoteGATTCharacteristic;
            const value = await characteristic.readValue();
            const statusJson = new TextDecoder().decode(value);
            if (statusJson) {
                const status = JSON.parse(statusJson) as BootBootsSystemStatus;

                setSystemStatus(status);
                setLastUpdate(new Date());
                setError(null);
            }
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

            // Request device - filter by service UUID for reliable discovery of Nakomis ESP32 devices
            const device = await navigator.bluetooth.requestDevice({
                filters: [
                    { services: [BOOTBOOTS_SERVICE_UUID] }
                ],
                optionalServices: [BOOTBOOTS_SERVICE_UUID]
            });

            console.log('Found device:', device.name);

            // Detect device type based on name
            const detectedType: DeviceType = device.name?.startsWith('Kappa-Warmer')
                ? 'kappa-warmer'
                : device.name?.startsWith('BootBoots')
                    ? 'bootboots'
                    : 'unknown';
            setDeviceType(detectedType);
            console.log('Device type:', detectedType);

            // Connect to GATT server
            const server = await device.gatt!.connect();
            console.log('Connected to GATT Server');

            // Get primary service
            const service = await server.getPrimaryService(BOOTBOOTS_SERVICE_UUID);
            console.log('Got service');

            // Get characteristics (logs is optional - Kappa-Warmer doesn't have it)
            const statusChar = await service.getCharacteristic(STATUS_CHARACTERISTIC_UUID);
            const commandChar = await service.getCharacteristic(COMMAND_CHARACTERISTIC_UUID);

            // Try to get logs characteristic (optional)
            let logsChar: BluetoothRemoteGATTCharacteristic | null = null;
            try {
                logsChar = await service.getCharacteristic(LOGS_CHARACTERISTIC_UUID);
            } catch {
                console.log('Logs characteristic not available (expected for Kappa-Warmer)');
            }

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

                        // Try to parse as JSON
                        try {
                            const responseJson = JSON.parse(responseText);

                            // Handle chunked log data
                            if (responseJson.type === 'log_chunk') {
                                console.log(`Received log chunk ${responseJson.chunk}/${responseJson.total}`);
                                // Use functional update to avoid stale closure issue
                                setLogChunks(prevChunks => {
                                    const newChunks = [...prevChunks, responseJson.data];
                                    setLogData(newChunks.join('\n'));
                                    return newChunks;
                                });
                            }
                            // Handle log transfer completion
                            else if (responseJson.type === 'logs_complete') {
                                console.log(`Log transfer complete: ${responseJson.total_chunks} chunks, ${responseJson.total_bytes} bytes`);
                                // Reassemble all chunks into complete log data
                                setLogChunks(chunks => {
                                    const fullLogData = chunks.join('\n');
                                    setLogData(fullLogData);
                                    console.log('Log data reassembled and set:', fullLogData.substring(0, 100) + '...');
                                    return []; // Clear chunks
                                });
                                setIsLoadingLogs(false);
                            }
                            // Handle log list debug info
                            else if (responseJson.type === 'log_list_debug') {
                                console.warn(`Log list debug: ${responseJson.message}`);
                            }
                            // Handle log list chunk (previous log files)
                            else if (responseJson.type === 'log_list_chunk') {
                                console.log(`Received log list chunk ${responseJson.chunk + 1}/${responseJson.total}: ${responseJson.filename}`);
                                setPreviousLogList(prev => [...prev, responseJson.filename]);
                            }
                            // Handle log list complete
                            else if (responseJson.type === 'log_list_complete') {
                                console.log(`Log list complete: ${responseJson.count} files`);
                                setIsLoadingPreviousLogs(false);
                            }
                            // Handle previous log file chunk
                            else if (responseJson.type === 'log_file_chunk') {
                                console.log(`Received log file chunk ${responseJson.chunk}`);
                                setPreviousLogChunks(prevChunks => {
                                    const newChunks = [...prevChunks, responseJson.data];
                                    setLogData(newChunks.join('\n'));
                                    return newChunks;
                                });
                            }
                            // Handle previous log file complete
                            else if (responseJson.type === 'log_file_complete') {
                                console.log(`Log file transfer complete: ${responseJson.filename} (${responseJson.total_chunks} lines)`);
                                setPreviousLogChunks(chunks => {
                                    const fullLogData = chunks.join('\n');
                                    setLogData(fullLogData);
                                    return [];
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
                            // Handle image list response (legacy single message)
                            else if (responseJson.type === 'image_list') {
                                console.log('Image list received:', responseJson.images);
                                setImageList(responseJson.images || []);
                                setIsLoadingImages(false);
                            }
                            // Handle chunked image list
                            else if (responseJson.type === 'image_list_chunk') {
                                setImageListChunks(prev => [...prev, responseJson.filename]);
                                setImageListProgress({ current: responseJson.chunk + 1, total: responseJson.total });
                            }
                            // Handle image list complete
                            else if (responseJson.type === 'image_list_complete') {
                                console.log(`Image list complete: ${responseJson.count} images`);
                                setImageListChunks(chunks => {
                                    setImageList(chunks);
                                    setIsLoadingImages(false);
                                    setImageListProgress(null);
                                    // Check if we have a pending new photo to auto-select
                                    const pendingFilename = pendingNewPhotoRef.current;
                                    if (pendingFilename && chunks.includes(pendingFilename)) {
                                        console.log(`Auto-selecting new photo: ${pendingFilename}`);
                                        setSelectedImage(pendingFilename);
                                        pendingNewPhotoRef.current = null;
                                        // Request the new image
                                        setIsLoadingImage(true);
                                        setCurrentImage(null);
                                        setCurrentMetadata(null);
                                        const imageCommand = JSON.stringify({ command: "get_image", filename: pendingFilename });
                                        const encoder = new TextEncoder();
                                        commandChar.writeValue(encoder.encode(imageCommand));
                                        console.log(`Sent get_image command for new photo: ${pendingFilename}`);
                                    }
                                    return [];
                                });
                            }
                            // Handle image transfer start
                            else if (responseJson.type === 'image_start') {
                                console.log(`Image transfer starting: ${responseJson.filename} (${responseJson.size} bytes)`);
                                setImageChunks([]);
                                setImageProgress({ current: 0, total: 0 });
                            }
                            // Handle image chunk
                            else if (responseJson.type === 'image_chunk') {
                                setImageChunks(prev => [...prev, responseJson.data]);
                                setImageProgress({ current: responseJson.chunk + 1, total: responseJson.total });
                            }
                            // Handle image transfer complete
                            else if (responseJson.type === 'image_complete') {
                                console.log(`Image transfer complete: ${responseJson.chunks} chunks`);
                                const filename = responseJson.filename;
                                // Reassemble image from base64 chunks
                                setImageChunks(chunks => {
                                    const base64Data = chunks.join('');
                                    const imageDataUrl = `data:image/jpeg;base64,${base64Data}`;
                                    setCurrentImage(imageDataUrl);
                                    setImageProgress(null);
                                    // Store pending image data while we wait for metadata
                                    pendingImageDataRef.current = { filename, imageData: imageDataUrl };
                                    return [];
                                });
                                // Request metadata for this image
                                if (commandChar) {
                                    const metaCommand = JSON.stringify({ command: "get_image_metadata", filename });
                                    const encoder = new TextEncoder();
                                    commandChar.writeValue(encoder.encode(metaCommand));
                                    console.log(`Sent get_image_metadata command for: ${filename}`);
                                }
                            }
                            // Handle metadata result
                            else if (responseJson.type === 'metadata_result') {
                                console.log(`Metadata result for: ${responseJson.filename}, found: ${responseJson.found}`);
                                const metadata = responseJson.found ? responseJson.content : null;
                                setCurrentMetadata(metadata);
                                setIsLoadingImage(false);
                                // Cache the image with its metadata
                                if (pendingImageDataRef.current && pendingImageDataRef.current.filename === responseJson.filename) {
                                    imageCacheRef.current.set(responseJson.filename, {
                                        imageData: pendingImageDataRef.current.imageData,
                                        metadata: metadata
                                    });
                                    console.log(`Cached image and metadata for: ${responseJson.filename}`);
                                    pendingImageDataRef.current = null;
                                }
                            }
                            // Handle error response
                            else if (responseJson.type === 'error') {
                                console.error('Error from device:', responseJson.message);
                                setError(responseJson.message);
                                setIsLoadingImage(false);
                                setIsLoadingImages(false);
                                setIsTakingPhoto(false);
                            }
                            // Handle photo capture responses
                            else if (responseJson.type === 'photo_started') {
                                console.log('Photo capture started');
                                setIsTakingPhoto(true);
                            }
                            else if (responseJson.type === 'photo_complete') {
                                console.log('Photo capture complete, new filename:', responseJson.filename);
                                setIsTakingPhoto(false);
                                // Store the new filename for auto-fetch after list refreshes
                                if (responseJson.filename) {
                                    pendingNewPhotoRef.current = responseJson.filename;
                                    // Auto-refresh the image list
                                    setIsLoadingImages(true);
                                    setImageListChunks([]);
                                    setImageListProgress(null);
                                    const listCommand = JSON.stringify({ command: "list_images" });
                                    const encoder = new TextEncoder();
                                    commandChar.writeValue(encoder.encode(listCommand));
                                    console.log('Auto-refreshing image list after photo capture');
                                }
                            }
                            // Handle settings response
                            else if (responseJson.type === 'settings') {
                                console.log('Settings received:', responseJson);
                                setTrainingMode(responseJson.training_mode || false);
                                if (responseJson.camera) {
                                    setCameraSettings(prev => ({ ...prev, ...responseJson.camera }));
                                }
                            }
                            // Handle setting updated confirmation
                            else if (responseJson.type === 'setting_updated') {
                                console.log('Setting updated:', responseJson);
                                if (responseJson.setting === 'training_mode') {
                                    setTrainingMode(responseJson.value);
                                } else if (typeof responseJson.setting === 'string' && responseJson.setting.startsWith('camera_')) {
                                    const camKey = responseJson.setting.substring(7);
                                    setCameraSettings(prev => ({ ...prev, [camKey]: responseJson.value }));
                                }
                                setIsUpdatingSetting(false);
                            }
                            // Handle reboot acknowledgment
                            else if (responseJson.type === 'reboot_ack') {
                                console.log('Device is rebooting...');
                                setIsRebooting(false);
                                setConnectionStatus("Disconnected");
                                setConnection({
                                    device: null, server: null, service: null,
                                    statusCharacteristic: null, logsCharacteristic: null, commandCharacteristic: null
                                });
                                setSystemStatus(null);
                                setLogData("");
                                setLastUpdate(null);
                            }
                            // Handle Kappa-Warmer status response
                            else if (responseJson.type === 'status' && responseJson.device === 'Kappa-Warmer') {
                                console.log('Kappa-Warmer status received:', responseJson);
                                setKappaStatus(responseJson as KappaWarmerStatus);
                                setLastUpdate(new Date());
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

    // Reconnect to a previously paired device
    const reconnectToDevice = useCallback(async (device: BluetoothDevice) => {
        try {
            setIsReconnecting(true);
            setConnectionStatus("Reconnecting...");
            setError(null);

            console.log('Attempting to reconnect to:', device.name);

            // Detect device type based on name
            const detectedType: DeviceType = device.name?.startsWith('Kappa-Warmer')
                ? 'kappa-warmer'
                : device.name?.startsWith('BootBoots')
                    ? 'bootboots'
                    : 'unknown';
            setDeviceType(detectedType);
            console.log('Device type:', detectedType);

            // Connect to GATT server
            const server = await device.gatt!.connect();
            console.log('Reconnected to GATT Server');

            // Get primary service
            const service = await server.getPrimaryService(BOOTBOOTS_SERVICE_UUID);
            console.log('Got service');

            // Get characteristics (logs is optional - Kappa-Warmer doesn't have it)
            const statusChar = await service.getCharacteristic(STATUS_CHARACTERISTIC_UUID);
            const commandChar = await service.getCharacteristic(COMMAND_CHARACTERISTIC_UUID);

            // Try to get logs characteristic (optional)
            let logsChar: BluetoothRemoteGATTCharacteristic | null = null;
            try {
                logsChar = await service.getCharacteristic(LOGS_CHARACTERISTIC_UUID);
            } catch {
                console.log('Logs characteristic not available (expected for Kappa-Warmer)');
            }

            // Start notifications for status updates
            await statusChar.startNotifications();
            statusChar.addEventListener('characteristicvaluechanged', handleStatusUpdate);

            // Start notifications for command responses
            await commandChar.startNotifications();
            commandChar.addEventListener('characteristicvaluechanged', async (event) => {
                try {
                    const characteristic = event.target as BluetoothRemoteGATTCharacteristic;
                    const value = characteristic.value;
                    if (value) {
                        const responseText = new TextDecoder().decode(value);

                        try {
                            const responseJson = JSON.parse(responseText);

                            if (responseJson.type === 'log_chunk') {
                                setLogChunks(prevChunks => {
                                    const newChunks = [...prevChunks, responseJson.data];
                                    setLogData(newChunks.join('\n'));
                                    return newChunks;
                                });
                            } else if (responseJson.type === 'logs_complete') {
                                setLogChunks(chunks => {
                                    const fullLogData = chunks.join('\n');
                                    setLogData(fullLogData);
                                    return [];
                                });
                                setIsLoadingLogs(false);
                            } else if (responseJson.type === 'log_list_debug') {
                                console.warn(`Log list debug: ${responseJson.message}`);
                            } else if (responseJson.type === 'log_list_chunk') {
                                setPreviousLogList(prev => [...prev, responseJson.filename]);
                            } else if (responseJson.type === 'log_list_complete') {
                                setIsLoadingPreviousLogs(false);
                            } else if (responseJson.type === 'log_file_chunk') {
                                setPreviousLogChunks(prevChunks => {
                                    const newChunks = [...prevChunks, responseJson.data];
                                    setLogData(newChunks.join('\n'));
                                    return newChunks;
                                });
                            } else if (responseJson.type === 'log_file_complete') {
                                setPreviousLogChunks(chunks => {
                                    const fullLogData = chunks.join('\n');
                                    setLogData(fullLogData);
                                    return [];
                                });
                                setIsLoadingLogs(false);
                            } else if (Array.isArray(responseJson)) {
                                setLogData(responseText);
                                setIsLoadingLogs(false);
                            } else if (responseJson.response === 'pong') {
                                setError(null);
                            } else if (responseJson.type === 'image_list') {
                                setImageList(responseJson.images || []);
                                setIsLoadingImages(false);
                            } else if (responseJson.type === 'image_list_chunk') {
                                setImageListChunks(prev => [...prev, responseJson.filename]);
                                setImageListProgress({ current: responseJson.chunk + 1, total: responseJson.total });
                            } else if (responseJson.type === 'image_list_complete') {
                                setImageListChunks(chunks => {
                                    setImageList(chunks);
                                    setIsLoadingImages(false);
                                    setImageListProgress(null);
                                    // Check if we have a pending new photo to auto-select
                                    const pendingFilename = pendingNewPhotoRef.current;
                                    if (pendingFilename && chunks.includes(pendingFilename)) {
                                        console.log(`Auto-selecting new photo: ${pendingFilename}`);
                                        setSelectedImage(pendingFilename);
                                        pendingNewPhotoRef.current = null;
                                        // Request the new image
                                        setIsLoadingImage(true);
                                        setCurrentImage(null);
                                        setCurrentMetadata(null);
                                        const imageCommand = JSON.stringify({ command: "get_image", filename: pendingFilename });
                                        const encoder = new TextEncoder();
                                        commandChar.writeValue(encoder.encode(imageCommand));
                                    }
                                    return [];
                                });
                            } else if (responseJson.type === 'image_start') {
                                setImageChunks([]);
                                setImageProgress({ current: 0, total: 0 });
                            } else if (responseJson.type === 'image_chunk') {
                                setImageChunks(prev => [...prev, responseJson.data]);
                                setImageProgress({ current: responseJson.chunk + 1, total: responseJson.total });
                            } else if (responseJson.type === 'image_complete') {
                                const filename = responseJson.filename;
                                setImageChunks(chunks => {
                                    const base64Data = chunks.join('');
                                    const imageDataUrl = `data:image/jpeg;base64,${base64Data}`;
                                    setCurrentImage(imageDataUrl);
                                    setImageProgress(null);
                                    // Store pending image data while we wait for metadata
                                    pendingImageDataRef.current = { filename, imageData: imageDataUrl };
                                    return [];
                                });
                                // Request metadata for this image
                                if (commandChar) {
                                    const metaCommand = JSON.stringify({ command: "get_image_metadata", filename });
                                    const encoder = new TextEncoder();
                                    commandChar.writeValue(encoder.encode(metaCommand));
                                }
                            } else if (responseJson.type === 'metadata_result') {
                                const metadata = responseJson.found ? responseJson.content : null;
                                setCurrentMetadata(metadata);
                                setIsLoadingImage(false);
                                // Cache the image with its metadata
                                if (pendingImageDataRef.current && pendingImageDataRef.current.filename === responseJson.filename) {
                                    imageCacheRef.current.set(responseJson.filename, {
                                        imageData: pendingImageDataRef.current.imageData,
                                        metadata: metadata
                                    });
                                    pendingImageDataRef.current = null;
                                }
                            } else if (responseJson.type === 'error') {
                                setError(responseJson.message);
                                setIsLoadingImage(false);
                                setIsLoadingImages(false);
                                setIsTakingPhoto(false);
                            } else if (responseJson.type === 'photo_started') {
                                console.log('Photo capture started');
                                setIsTakingPhoto(true);
                            } else if (responseJson.type === 'photo_complete') {
                                console.log('Photo capture complete, new filename:', responseJson.filename);
                                setIsTakingPhoto(false);
                                // Store the new filename for auto-fetch after list refreshes
                                if (responseJson.filename) {
                                    pendingNewPhotoRef.current = responseJson.filename;
                                    // Auto-refresh the image list
                                    setIsLoadingImages(true);
                                    setImageListChunks([]);
                                    setImageListProgress(null);
                                    const listCommand = JSON.stringify({ command: "list_images" });
                                    const encoder = new TextEncoder();
                                    commandChar.writeValue(encoder.encode(listCommand));
                                }
                            }
                            // Handle settings response
                            else if (responseJson.type === 'settings') {
                                console.log('Settings received:', responseJson);
                                setTrainingMode(responseJson.training_mode || false);
                                if (responseJson.camera) {
                                    setCameraSettings(prev => ({ ...prev, ...responseJson.camera }));
                                }
                            }
                            // Handle setting updated confirmation
                            else if (responseJson.type === 'setting_updated') {
                                console.log('Setting updated:', responseJson);
                                if (responseJson.setting === 'training_mode') {
                                    setTrainingMode(responseJson.value);
                                } else if (typeof responseJson.setting === 'string' && responseJson.setting.startsWith('camera_')) {
                                    const camKey = responseJson.setting.substring(7);
                                    setCameraSettings(prev => ({ ...prev, [camKey]: responseJson.value }));
                                }
                                setIsUpdatingSetting(false);
                            }
                            // Handle reboot acknowledgment
                            else if (responseJson.type === 'reboot_ack') {
                                console.log('Device is rebooting...');
                                setIsRebooting(false);
                                setConnectionStatus("Disconnected");
                                setConnection({
                                    device: null, server: null, service: null,
                                    statusCharacteristic: null, logsCharacteristic: null, commandCharacteristic: null
                                });
                                setSystemStatus(null);
                                setLogData("");
                                setLastUpdate(null);
                            }
                            // Handle Kappa-Warmer status response
                            else if (responseJson.type === 'status' && responseJson.device === 'Kappa-Warmer') {
                                console.log('Kappa-Warmer status received:', responseJson);
                                setKappaStatus(responseJson as KappaWarmerStatus);
                                setLastUpdate(new Date());
                            }
                        } catch {
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
            setIsReconnecting(false);

        } catch (err) {
            console.error('Error reconnecting:', err);
            setError(`Reconnection failed: ${err}`);
            setConnectionStatus("Disconnected");
            setIsReconnecting(false);
        }
    }, [handleStatusUpdate]);

    // Request current status
    const requestStatus = useCallback(async () => {
        if (!connection.statusCharacteristic) return;

        try {
            const value = await connection.statusCharacteristic.readValue();
            const statusJson = new TextDecoder().decode(value);
            if (statusJson) {
                const status = JSON.parse(statusJson) as BootBootsSystemStatus;
                setSystemStatus(status);
                setLastUpdate(new Date());
            }
        } catch (err) {
            console.error('Error reading status:', err);
            setError('Failed to read status');
        }
    }, [connection.statusCharacteristic]);

    // Request logs - sends command and waits for notification response
    // entries: number of log entries to fetch, or null/undefined for all
    const requestLogs = useCallback(async (entries?: number | null) => {
        if (!connection.commandCharacteristic) {
            console.log('No command characteristic available');
            return;
        }

        setIsLoadingLogs(true);
        setError(null);
        setLogChunks([]);

        try {
            console.log('Sending request_logs command...');
            const commandObj: { command: string; entries?: number } = { command: "request_logs" };
            if (entries !== null && entries !== undefined) {
                commandObj.entries = entries;
            }
            const command = JSON.stringify(commandObj);
            const encoder = new TextEncoder();
            await connection.commandCharacteristic.writeValue(encoder.encode(command));
            console.log(`Command sent: ${command}, waiting for notification response...`);

            // // Set a timeout to reset loading state if no response comes
            // setTimeout(() => {
            //     console.log('Timeout waiting for log response');
            //     setIsLoadingLogs(false);
            // }, 5000);
        } catch (err) {
            console.error('Error sending request_logs:', err);
            setError(`Failed to request logs: ${err}`);
            setIsLoadingLogs(false);
        }
    }, [connection.commandCharacteristic]);

    // Request list of previous log files
    const requestPreviousLogList = useCallback(async () => {
        if (!connection.commandCharacteristic) {
            console.log('No command characteristic available');
            return;
        }

        setIsLoadingPreviousLogs(true);
        setPreviousLogList([]);
        setError(null);

        try {
            console.log('Sending list_logs command...');
            const command = JSON.stringify({ command: "list_logs" });
            const encoder = new TextEncoder();
            await connection.commandCharacteristic.writeValue(encoder.encode(command));
            console.log('Command sent, waiting for log list...');
        } catch (err) {
            console.error('Error sending list_logs:', err);
            setError(`Failed to request log list: ${err}`);
            setIsLoadingPreviousLogs(false);
        }
    }, [connection.commandCharacteristic]);

    // Request a specific previous log file
    const requestPreviousLogFile = useCallback(async (filename: string, entries?: number | null) => {
        if (!connection.commandCharacteristic) {
            console.log('No command characteristic available');
            return;
        }

        setIsLoadingLogs(true);
        setError(null);
        setPreviousLogChunks([]);
        setLogData('');

        try {
            console.log(`Sending get_log_file command for: ${filename}`);
            const commandObj: { command: string; filename: string; entries?: number } = {
                command: "get_log_file",
                filename: filename
            };
            if (entries !== null && entries !== undefined) {
                commandObj.entries = entries;
            }
            const command = JSON.stringify(commandObj);
            const encoder = new TextEncoder();
            await connection.commandCharacteristic.writeValue(encoder.encode(command));
            console.log(`Command sent: ${command}, waiting for log file...`);
        } catch (err) {
            console.error('Error sending get_log_file:', err);
            setError(`Failed to request log file: ${err}`);
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

    // Request image list from device
    const requestImageList = useCallback(async () => {
        if (!connection.commandCharacteristic) return;

        setIsLoadingImages(true);
        setImageListChunks([]);
        setImageListProgress(null);
        setError(null);

        try {
            const command = JSON.stringify({ command: "list_images" });
            const encoder = new TextEncoder();
            await connection.commandCharacteristic.writeValue(encoder.encode(command));
            console.log('Sent list_images command');
        } catch (err) {
            console.error('Error requesting image list:', err);
            setError(`Failed to request image list: ${err}`);
            setIsLoadingImages(false);
        }
    }, [connection.commandCharacteristic]);

    // Take a photo on the device
    const takePhoto = useCallback(async () => {
        if (!connection.commandCharacteristic) return;

        setIsTakingPhoto(true);
        setError(null);

        try {
            const command = JSON.stringify({ command: "take_photo" });
            const encoder = new TextEncoder();
            await connection.commandCharacteristic.writeValue(encoder.encode(command));
            console.log('Sent take_photo command');
        } catch (err) {
            console.error('Error taking photo:', err);
            setError(`Failed to take photo: ${err}`);
            setIsTakingPhoto(false);
        }
    }, [connection.commandCharacteristic]);

    // Request settings from device
    const requestSettings = useCallback(async () => {
        if (!connection.commandCharacteristic) return;

        try {
            const command = JSON.stringify({ command: "get_settings" });
            const encoder = new TextEncoder();
            await connection.commandCharacteristic.writeValue(encoder.encode(command));
            console.log('Sent get_settings command');
        } catch (err) {
            console.error('Error requesting settings:', err);
            setError(`Failed to request settings: ${err}`);
        }
    }, [connection.commandCharacteristic]);

    // Toggle training mode
    const toggleTrainingMode = useCallback(async () => {
        if (!connection.commandCharacteristic) return;

        setIsUpdatingSetting(true);
        const newValue = !trainingMode;

        try {
            const command = JSON.stringify({
                command: "set_setting",
                setting: "training_mode",
                value: newValue
            });
            const encoder = new TextEncoder();
            await connection.commandCharacteristic.writeValue(encoder.encode(command));
            console.log(`Sent set_setting command: training_mode=${newValue}`);
        } catch (err) {
            console.error('Error toggling training mode:', err);
            setError(`Failed to toggle training mode: ${err}`);
            setIsUpdatingSetting(false);
        }
    }, [connection.commandCharacteristic, trainingMode]);

    // Update a camera setting on the device
    const updateCameraSetting = useCallback(async (settingName: string, value: number | boolean) => {
        if (!connection.commandCharacteristic) return;

        setIsUpdatingSetting(true);

        try {
            const command = JSON.stringify({
                command: "set_setting",
                setting: `camera_${settingName}`,
                value: value
            });
            const encoder = new TextEncoder();
            await connection.commandCharacteristic.writeValue(encoder.encode(command));
            console.log(`Sent set_setting command: camera_${settingName}=${value}`);
        } catch (err) {
            console.error('Error updating camera setting:', err);
            setError(`Failed to update camera setting: ${err}`);
            setIsUpdatingSetting(false);
        }
    }, [connection.commandCharacteristic]);

    // Reboot the device
    const rebootDevice = useCallback(async () => {
        if (!connection.commandCharacteristic) return;

        if (!window.confirm('Are you sure you want to reboot the device?')) return;

        setIsRebooting(true);
        setError(null);

        try {
            const command = JSON.stringify({ command: "reboot" });
            const encoder = new TextEncoder();
            await connection.commandCharacteristic.writeValue(encoder.encode(command));
            console.log('Sent reboot command');
        } catch (err) {
            console.error('Error sending reboot command:', err);
            setError(`Failed to reboot device: ${err}`);
            setIsRebooting(false);
        }
    }, [connection.commandCharacteristic]);

    // Request specific image from device
    const requestImage = useCallback(async (filename: string) => {
        if (!connection.commandCharacteristic || !filename) return;

        setIsLoadingImage(true);
        setCurrentImage(null);
        setError(null);

        try {
            const command = JSON.stringify({ command: "get_image", filename });
            const encoder = new TextEncoder();
            await connection.commandCharacteristic.writeValue(encoder.encode(command));
            console.log(`Sent get_image command for: ${filename}`);
        } catch (err) {
            console.error('Error requesting image:', err);
            setError(`Failed to request image: ${err}`);
            setIsLoadingImage(false);
        }
    }, [connection.commandCharacteristic]);

    // Auto-fetch settings when connected
    useEffect(() => {
        if (connectionStatus === "Connected" && connection.commandCharacteristic) {
            // Small delay to ensure connection is stable
            const timer = setTimeout(() => {
                requestSettings();
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [connectionStatus, connection.commandCharacteristic, requestSettings]);

    // Handle image selection change
    const handleImageSelect = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
        const filename = event.target.value;
        setSelectedImage(filename);
        if (filename) {
            // Check cache first
            const cached = imageCacheRef.current.get(filename);
            if (cached) {
                console.log(`Using cached image: ${filename}`);
                setCurrentImage(cached.imageData);
                setCurrentMetadata(cached.metadata);
                setIsLoadingImage(false);
            } else {
                // Clear metadata when loading new image from device
                setCurrentMetadata(null);
                requestImage(filename);
            }
        } else {
            setCurrentImage(null);
            setCurrentMetadata(null);
        }
    }, [requestImage]);

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
                        <div>
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={connectToBootBoots}
                                disabled={connectionStatus === "Connecting..." || isReconnecting}
                            >
                                {connectionStatus === "Connecting..." ? "Connecting..." : "Connect to BootBoots"}
                            </button>

                            {/* Show reconnect options for previously paired devices */}
                            {pairedDevices.length > 0 && (
                                <div style={{ marginTop: '15px' }}>
                                    <p style={{ marginBottom: '8px', color: '#888' }}>
                                        <strong>Previously paired devices:</strong>
                                    </p>
                                    {pairedDevices.map((device) => (
                                        <button
                                            key={device.id}
                                            type="button"
                                            className="btn btn-outline-primary"
                                            onClick={() => reconnectToDevice(device)}
                                            disabled={isReconnecting}
                                            style={{ marginRight: '10px', marginBottom: '5px' }}
                                        >
                                            {isReconnecting ? "Reconnecting..." : `Reconnect to ${device.name}`}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
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
                            <div className="btn-group" style={{ marginLeft: '10px' }} ref={logsDropdownRef}>
                                <button
                                    type="button"
                                    className="btn btn-info"
                                    onClick={() => requestLogs(150)}
                                    disabled={isLoadingLogs}
                                >
                                    {isLoadingLogs ? 'Loading...' : 'Get Logs'}
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-info dropdown-toggle dropdown-toggle-split"
                                    onClick={() => setLogsDropdownOpen(!logsDropdownOpen)}
                                    disabled={isLoadingLogs}
                                    aria-expanded={logsDropdownOpen}
                                >
                                    <span className="visually-hidden">Toggle Dropdown</span>
                                </button>
                                {logsDropdownOpen && (
                                    <ul className="dropdown-menu show" style={{ position: 'absolute', top: '100%', right: 0 }}>
                                        <li>
                                            <button
                                                className="dropdown-item"
                                                onClick={() => { requestLogs(50); setLogsDropdownOpen(false); }}
                                            >
                                                Last 50 entries
                                            </button>
                                        </li>
                                        <li>
                                            <button
                                                className="dropdown-item"
                                                onClick={() => { requestLogs(150); setLogsDropdownOpen(false); }}
                                            >
                                                Last 150 entries
                                            </button>
                                        </li>
                                        <li>
                                            <button
                                                className="dropdown-item"
                                                onClick={() => { requestLogs(null); setLogsDropdownOpen(false); }}
                                            >
                                                Entire log file
                                            </button>
                                        </li>
                                        <li><hr className="dropdown-divider" /></li>
                                        <li>
                                            <button
                                                className="dropdown-item"
                                                onClick={() => { requestPreviousLogList(); setLogsDropdownOpen(false); }}
                                                disabled={isLoadingPreviousLogs}
                                            >
                                                {isLoadingPreviousLogs ? 'Loading...' : 'Previous logs...'}
                                            </button>
                                        </li>
                                    </ul>
                                )}
                            </div>
                            {previousLogList.length > 0 && (
                                <select
                                    className="form-select"
                                    style={{ marginLeft: '10px', width: 'auto', display: 'inline-block' }}
                                    value={selectedPreviousLog}
                                    onChange={(e) => {
                                        const filename = e.target.value;
                                        setSelectedPreviousLog(filename);
                                        if (filename) {
                                            requestPreviousLogFile(filename);
                                        }
                                    }}
                                    disabled={isLoadingLogs}
                                >
                                    <option value="">-- Select previous log --</option>
                                    {[...previousLogList].reverse().map((logFile) => (
                                        <option key={logFile} value={logFile}>
                                            {logFile}
                                        </option>
                                    ))}
                                </select>
                            )}
                            <button
                                type="button"
                                className="btn btn-success"
                                onClick={sendPing}
                                style={{ marginLeft: '10px' }}
                            >
                                Ping
                            </button>
                            <button
                                type="button"
                                className="btn btn-warning"
                                onClick={requestImageList}
                                disabled={isLoadingImages}
                                style={{ marginLeft: '10px' }}
                            >
                                {isLoadingImages ? 'Loading...' : 'Get Images'}
                            </button>
                            <button
                                type="button"
                                className="btn btn-danger"
                                onClick={takePhoto}
                                disabled={isTakingPhoto}
                                style={{ marginLeft: '10px' }}
                            >
                                {isTakingPhoto ? 'Capturing...' : 'Take Photo'}
                            </button>
                            <button
                                type="button"
                                className="btn btn-outline-danger"
                                onClick={rebootDevice}
                                disabled={isRebooting}
                                style={{ marginLeft: '10px' }}
                            >
                                {isRebooting ? 'Rebooting...' : 'Reboot'}
                            </button>
                        </div>
                    )}
                </div>

                {/* Kappa-Warmer Controls */}
                {connection.device && deviceType === 'kappa-warmer' && (
                    <div className="kappa-controls" style={{ marginTop: '20px' }}>
                        <div
                            onClick={() => setKappaExpanded(!kappaExpanded)}
                            style={{
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                marginBottom: '10px'
                            }}
                        >
                            <span style={{
                                transform: kappaExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                transition: 'transform 0.2s',
                                marginRight: '8px',
                                fontSize: '14px'
                            }}>▶</span>
                            <h3 style={{ margin: 0 }}>Kappa-Warmer Controls</h3>
                        </div>

                        {kappaExpanded && (
                            <div style={{
                                border: '1px solid #444',
                                borderRadius: '8px',
                                padding: '15px',
                                backgroundColor: '#282c34'
                            }}>
                                {/* Status Display */}
                                {kappaStatus ? (
                                    <div style={{ marginBottom: '20px' }}>
                                        <div style={{
                                            display: 'grid',
                                            gridTemplateColumns: 'repeat(2, 1fr)',
                                            gap: '12px',
                                            marginBottom: '15px'
                                        }}>
                                            <div style={{
                                                padding: '12px',
                                                backgroundColor: '#1a1a2e',
                                                borderRadius: '6px',
                                                textAlign: 'center'
                                            }}>
                                                <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', marginBottom: '4px' }}>State</div>
                                                <div style={{
                                                    fontSize: '16px',
                                                    fontWeight: 'bold',
                                                    color: kappaStatus.state === 'ON' ? '#4CAF50' : kappaStatus.state === 'WARMING_UP' ? '#ff9800' : '#e0e0e0'
                                                }}>
                                                    {kappaStatus.state}
                                                </div>
                                            </div>
                                            <div style={{
                                                padding: '12px',
                                                backgroundColor: '#1a1a2e',
                                                borderRadius: '6px',
                                                textAlign: 'center'
                                            }}>
                                                <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', marginBottom: '4px' }}>Cat Present</div>
                                                <div style={{
                                                    fontSize: '16px',
                                                    fontWeight: 'bold',
                                                    color: kappaStatus.cat_present ? '#4CAF50' : '#888'
                                                }}>
                                                    {kappaStatus.cat_present ? 'YES' : 'NO'}
                                                </div>
                                            </div>
                                            <div style={{
                                                padding: '12px',
                                                backgroundColor: '#1a1a2e',
                                                borderRadius: '6px',
                                                textAlign: 'center'
                                            }}>
                                                <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', marginBottom: '4px' }}>Pressure</div>
                                                <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#e0e0e0' }}>
                                                    {kappaStatus.pressure}
                                                </div>
                                                <div style={{ fontSize: '10px', color: '#666' }}>threshold: {kappaStatus.threshold}</div>
                                            </div>
                                            <div style={{
                                                padding: '12px',
                                                backgroundColor: '#1a1a2e',
                                                borderRadius: '6px',
                                                textAlign: 'center'
                                            }}>
                                                <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', marginBottom: '4px' }}>Relay</div>
                                                <div style={{
                                                    fontSize: '16px',
                                                    fontWeight: 'bold',
                                                    color: kappaStatus.relay_on ? '#4CAF50' : '#888'
                                                }}>
                                                    {kappaStatus.relay_on ? 'ON' : 'OFF'}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Mode Toggle */}
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '12px',
                                            backgroundColor: '#1a1a2e',
                                            borderRadius: '6px',
                                            marginBottom: '12px'
                                        }}>
                                            <div>
                                                <div style={{ fontWeight: 'bold', color: '#e0e0e0' }}>Auto Mode</div>
                                                <div style={{ fontSize: '12px', color: '#888' }}>
                                                    Automatically control heater based on cat presence
                                                </div>
                                            </div>
                                            <label style={{ position: 'relative', display: 'inline-block', width: '50px', height: '26px', flexShrink: 0, marginLeft: '15px' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={kappaStatus.auto_mode}
                                                    onChange={async () => {
                                                        if (connection.commandCharacteristic) {
                                                            const cmd = JSON.stringify({ command: 'set_auto', enabled: !kappaStatus.auto_mode });
                                                            await connection.commandCharacteristic.writeValue(new TextEncoder().encode(cmd));
                                                        }
                                                    }}
                                                    style={{ opacity: 0, width: 0, height: 0 }}
                                                />
                                                <span style={{
                                                    position: 'absolute', cursor: 'pointer',
                                                    top: 0, left: 0, right: 0, bottom: 0,
                                                    backgroundColor: kappaStatus.auto_mode ? '#4CAF50' : '#555',
                                                    transition: '0.3s', borderRadius: '26px'
                                                }}>
                                                    <span style={{
                                                        position: 'absolute', height: '20px', width: '20px',
                                                        left: kappaStatus.auto_mode ? '27px' : '3px', bottom: '3px',
                                                        backgroundColor: 'white', transition: '0.3s', borderRadius: '50%'
                                                    }}></span>
                                                </span>
                                            </label>
                                        </div>

                                        {/* Manual Heater Control (only when not in auto mode) */}
                                        {!kappaStatus.auto_mode && (
                                            <div style={{
                                                display: 'flex',
                                                gap: '10px',
                                                marginBottom: '12px'
                                            }}>
                                                <button
                                                    type="button"
                                                    onClick={async () => {
                                                        if (connection.commandCharacteristic) {
                                                            const cmd = JSON.stringify({ command: 'set_heater', on: true });
                                                            await connection.commandCharacteristic.writeValue(new TextEncoder().encode(cmd));
                                                        }
                                                    }}
                                                    style={{
                                                        flex: 1,
                                                        padding: '10px',
                                                        backgroundColor: kappaStatus.relay_on ? '#4CAF50' : '#333',
                                                        color: 'white',
                                                        border: 'none',
                                                        borderRadius: '6px',
                                                        cursor: 'pointer',
                                                        fontWeight: 'bold'
                                                    }}
                                                >
                                                    Heater ON
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={async () => {
                                                        if (connection.commandCharacteristic) {
                                                            const cmd = JSON.stringify({ command: 'set_heater', on: false });
                                                            await connection.commandCharacteristic.writeValue(new TextEncoder().encode(cmd));
                                                        }
                                                    }}
                                                    style={{
                                                        flex: 1,
                                                        padding: '10px',
                                                        backgroundColor: !kappaStatus.relay_on ? '#f44336' : '#333',
                                                        color: 'white',
                                                        border: 'none',
                                                        borderRadius: '6px',
                                                        cursor: 'pointer',
                                                        fontWeight: 'bold'
                                                    }}
                                                >
                                                    Heater OFF
                                                </button>
                                            </div>
                                        )}

                                        {/* Status info */}
                                        <div style={{ fontSize: '12px', color: '#666', display: 'flex', gap: '15px' }}>
                                            <span>WiFi: {kappaStatus.wifi_connected ? '✓' : '✗'}</span>
                                            <span>SD Card: {kappaStatus.sd_card_ready ? '✓' : '✗'}</span>
                                            <span>Uptime: {Math.floor(kappaStatus.uptime_ms / 1000 / 60)}m</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ color: '#888', textAlign: 'center', padding: '20px' }}>
                                        <p>No status received yet.</p>
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                if (connection.commandCharacteristic) {
                                                    const cmd = JSON.stringify({ command: 'get_status' });
                                                    await connection.commandCharacteristic.writeValue(new TextEncoder().encode(cmd));
                                                }
                                            }}
                                            style={{
                                                padding: '8px 16px',
                                                backgroundColor: '#4CAF50',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '4px',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Request Status
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* BootBoots Settings */}
                {connection.device && deviceType === 'bootboots' && (
                    <div className="device-settings" style={{ marginTop: '20px' }}>
                        <div
                            onClick={() => setSettingsExpanded(!settingsExpanded)}
                            style={{
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                marginBottom: '10px'
                            }}
                        >
                            <span style={{
                                transform: settingsExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                transition: 'transform 0.2s',
                                marginRight: '8px',
                                fontSize: '14px'
                            }}>▶</span>
                            <h3 style={{ margin: 0 }}>BootBoots Settings</h3>
                        </div>

                        {settingsExpanded && (
                            <div style={{
                                border: '1px solid #444',
                                borderRadius: '8px',
                                padding: '15px',
                                backgroundColor: '#282c34'
                            }}>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    marginBottom: '10px'
                                }}>
                                    <div>
                                        <strong>Training Mode</strong>
                                        <p style={{ margin: '5px 0 0 0', fontSize: '12px', color: '#888' }}>
                                            Captures photos without AI inference or deterrent activation.
                                            Photos are uploaded to S3 training/ prefix for model training.
                                        </p>
                                    </div>
                                    <label className="switch" style={{
                                        position: 'relative',
                                        display: 'inline-block',
                                        width: '60px',
                                        height: '34px',
                                        flexShrink: 0,
                                        marginLeft: '20px'
                                    }}>
                                        <input
                                            type="checkbox"
                                            checked={trainingMode}
                                            onChange={toggleTrainingMode}
                                            disabled={isUpdatingSetting}
                                            style={{
                                                opacity: 0,
                                                width: 0,
                                                height: 0
                                            }}
                                        />
                                        <span style={{
                                            position: 'absolute',
                                            cursor: isUpdatingSetting ? 'wait' : 'pointer',
                                            top: 0,
                                            left: 0,
                                            right: 0,
                                            bottom: 0,
                                            backgroundColor: trainingMode ? '#4CAF50' : '#ccc',
                                            transition: '0.4s',
                                            borderRadius: '34px',
                                            opacity: isUpdatingSetting ? 0.6 : 1
                                        }}>
                                            <span style={{
                                                position: 'absolute',
                                                content: '',
                                                height: '26px',
                                                width: '26px',
                                                left: trainingMode ? '30px' : '4px',
                                                bottom: '4px',
                                                backgroundColor: 'white',
                                                transition: '0.4s',
                                                borderRadius: '50%'
                                            }}></span>
                                        </span>
                                    </label>
                                </div>
                                {trainingMode && (
                                    <div style={{
                                        backgroundColor: '#3d4450',
                                        padding: '8px 12px',
                                        borderRadius: '4px',
                                        fontSize: '13px',
                                        color: '#ffc107'
                                    }}>
                                        Training mode is active. Motion-triggered photos will be captured without inference.
                                    </div>
                                )}

                                {/* Camera Settings */}
                                <div style={{ marginTop: '20px' }}>
                                    <div
                                        onClick={() => setCameraSettingsExpanded(!cameraSettingsExpanded)}
                                        style={{
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            marginBottom: '10px'
                                        }}
                                    >
                                        <span style={{
                                            transform: cameraSettingsExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                            transition: 'transform 0.2s',
                                            marginRight: '8px',
                                            fontSize: '14px'
                                        }}>▶</span>
                                        <strong>Camera Settings</strong>
                                    </div>

                                    {cameraSettingsExpanded && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '500px' }}>
                                            {/* Resolution & Quality */}
                                            <div style={{ borderBottom: '1px solid #444', paddingBottom: '12px' }}>
                                                <h4 style={{ margin: '0 0 10px 0', color: '#aaa', fontSize: '13px', textTransform: 'uppercase' }}>Resolution & Quality</h4>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                    <label style={{ fontSize: '13px', color: '#e0e0e0' }}>Frame Size</label>
                                                    <select
                                                        value={cameraSettings.frame_size}
                                                        onChange={(e) => updateCameraSetting('frame_size', parseInt(e.target.value))}
                                                        disabled={isUpdatingSetting}
                                                        style={{
                                                            padding: '4px 8px', borderRadius: '4px', border: '1px solid #444',
                                                            backgroundColor: '#1a1a2e', color: '#e0e0e0', fontSize: '13px',
                                                            cursor: isUpdatingSetting ? 'wait' : 'pointer'
                                                        }}
                                                    >
                                                        {FRAME_SIZE_OPTIONS.map((opt) => (
                                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <CameraSlider label="JPEG Quality" value={cameraSettings.jpeg_quality} min={0} max={63} setting="jpeg_quality" onChange={updateCameraSetting} disabled={isUpdatingSetting} />
                                                <CameraSlider label="Frame Buffers" value={cameraSettings.fb_count} min={1} max={3} setting="fb_count" onChange={updateCameraSetting} disabled={isUpdatingSetting} />
                                                <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#666' }}>
                                                    JPEG Quality: lower = better quality. Frame Buffers: changes take effect on reboot.
                                                </p>
                                            </div>

                                            {/* Image Quality */}
                                            <div style={{ borderBottom: '1px solid #444', paddingBottom: '12px' }}>
                                                <h4 style={{ margin: '0 0 10px 0', color: '#aaa', fontSize: '13px', textTransform: 'uppercase' }}>Image Quality</h4>
                                                <CameraSlider label="Brightness" value={cameraSettings.brightness} min={-2} max={2} setting="brightness" onChange={updateCameraSetting} disabled={isUpdatingSetting} />
                                                <CameraSlider label="Contrast" value={cameraSettings.contrast} min={-2} max={2} setting="contrast" onChange={updateCameraSetting} disabled={isUpdatingSetting} />
                                                <CameraSlider label="Saturation" value={cameraSettings.saturation} min={-2} max={2} setting="saturation" onChange={updateCameraSetting} disabled={isUpdatingSetting} />
                                                <CameraSelect label="Special Effect" value={cameraSettings.special_effect} options={SPECIAL_EFFECT_NAMES} setting="special_effect" onChange={updateCameraSetting} disabled={isUpdatingSetting} />
                                            </div>

                                            {/* White Balance */}
                                            <div style={{ borderBottom: '1px solid #444', paddingBottom: '12px' }}>
                                                <h4 style={{ margin: '0 0 10px 0', color: '#aaa', fontSize: '13px', textTransform: 'uppercase' }}>White Balance</h4>
                                                <CameraToggle label="White Balance" value={cameraSettings.white_balance} setting="white_balance" onChange={updateCameraSetting} disabled={isUpdatingSetting} />
                                                <CameraToggle label="AWB Gain" value={cameraSettings.awb_gain} setting="awb_gain" onChange={updateCameraSetting} disabled={isUpdatingSetting} />
                                                <CameraSelect label="WB Mode" value={cameraSettings.wb_mode} options={WB_MODE_NAMES} setting="wb_mode" onChange={updateCameraSetting} disabled={isUpdatingSetting} />
                                            </div>

                                            {/* Exposure */}
                                            <div style={{ borderBottom: '1px solid #444', paddingBottom: '12px' }}>
                                                <h4 style={{ margin: '0 0 10px 0', color: '#aaa', fontSize: '13px', textTransform: 'uppercase' }}>Exposure</h4>
                                                <CameraToggle label="Auto Exposure" value={cameraSettings.exposure_ctrl} setting="exposure_ctrl" onChange={updateCameraSetting} disabled={isUpdatingSetting} />
                                                <CameraToggle label="AEC DSP" value={cameraSettings.aec2} setting="aec2" onChange={updateCameraSetting} disabled={isUpdatingSetting} />
                                                <CameraSlider label="AE Level" value={cameraSettings.ae_level} min={-2} max={2} setting="ae_level" onChange={updateCameraSetting} disabled={isUpdatingSetting} />
                                                <CameraSlider label="AEC Value" value={cameraSettings.aec_value} min={0} max={1200} setting="aec_value" onChange={updateCameraSetting} disabled={isUpdatingSetting} />
                                            </div>

                                            {/* Gain */}
                                            <div style={{ borderBottom: '1px solid #444', paddingBottom: '12px' }}>
                                                <h4 style={{ margin: '0 0 10px 0', color: '#aaa', fontSize: '13px', textTransform: 'uppercase' }}>Gain</h4>
                                                <CameraToggle label="Auto Gain" value={cameraSettings.gain_ctrl} setting="gain_ctrl" onChange={updateCameraSetting} disabled={isUpdatingSetting} />
                                                <CameraSlider label="AGC Gain" value={cameraSettings.agc_gain} min={0} max={30} setting="agc_gain" onChange={updateCameraSetting} disabled={isUpdatingSetting} />
                                                <CameraSlider label="Gain Ceiling" value={cameraSettings.gain_ceiling} min={0} max={6} setting="gain_ceiling" onChange={updateCameraSetting} disabled={isUpdatingSetting} />
                                            </div>

                                            {/* Corrections */}
                                            <div style={{ borderBottom: '1px solid #444', paddingBottom: '12px' }}>
                                                <h4 style={{ margin: '0 0 10px 0', color: '#aaa', fontSize: '13px', textTransform: 'uppercase' }}>Corrections</h4>
                                                <CameraToggle label="Bad Pixel Correction" value={cameraSettings.bpc} setting="bpc" onChange={updateCameraSetting} disabled={isUpdatingSetting} />
                                                <CameraToggle label="White Pixel Correction" value={cameraSettings.wpc} setting="wpc" onChange={updateCameraSetting} disabled={isUpdatingSetting} />
                                                <CameraToggle label="Gamma Correction" value={cameraSettings.raw_gma} setting="raw_gma" onChange={updateCameraSetting} disabled={isUpdatingSetting} />
                                                <CameraToggle label="Lens Correction" value={cameraSettings.lenc} setting="lenc" onChange={updateCameraSetting} disabled={isUpdatingSetting} />
                                                <CameraToggle label="Downsize Enable" value={cameraSettings.dcw} setting="dcw" onChange={updateCameraSetting} disabled={isUpdatingSetting} />
                                            </div>

                                            {/* Orientation */}
                                            <div style={{ borderBottom: '1px solid #444', paddingBottom: '12px' }}>
                                                <h4 style={{ margin: '0 0 10px 0', color: '#aaa', fontSize: '13px', textTransform: 'uppercase' }}>Orientation</h4>
                                                <CameraToggle label="Horizontal Mirror" value={cameraSettings.hmirror} setting="hmirror" onChange={updateCameraSetting} disabled={isUpdatingSetting} />
                                                <CameraToggle label="Vertical Flip" value={cameraSettings.vflip} setting="vflip" onChange={updateCameraSetting} disabled={isUpdatingSetting} />
                                            </div>

                                            {/* Test */}
                                            <div>
                                                <h4 style={{ margin: '0 0 10px 0', color: '#aaa', fontSize: '13px', textTransform: 'uppercase' }}>Test</h4>
                                                <CameraToggle label="Color Bar" value={cameraSettings.colorbar} setting="colorbar" onChange={updateCameraSetting} disabled={isUpdatingSetting} />
                                            </div>

                                            {/* Flash */}
                                            <div style={{ borderBottom: '1px solid #444', paddingBottom: '12px' }}>
                                                <h4 style={{ margin: '0 0 10px 0', color: '#aaa', fontSize: '13px', textTransform: 'uppercase' }}>Flash</h4>
                                                <CameraSlider label="LED Delay (millis)" value={cameraSettings.led_delay_millis} min={0} max={1000} setting="led_delay_millis" onChange={updateCameraSetting} disabled={isUpdatingSetting} />
                                            </div>

                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Error Display */}
                {error && (
                    <div className="alert alert-danger" style={{ marginTop: '20px' }}>
                        <strong>Error:</strong> {error}
                    </div>
                )}

                {/* Image Selection and Display */}
                {imageList.length > 0 && (
                    <div className="image-section" style={{ marginTop: '20px' }}>
                        <h2>Device Images</h2>
                        <div style={{ marginBottom: '15px' }}>
                            <label htmlFor="image-select" style={{ marginRight: '10px' }}>
                                <strong>Select Image:</strong>
                            </label>
                            <select
                                id="image-select"
                                value={selectedImage}
                                onChange={handleImageSelect}
                                disabled={isLoadingImage}
                                style={{
                                    padding: '8px 12px',
                                    borderRadius: '4px',
                                    border: '1px solid #444',
                                    minWidth: '300px',
                                    backgroundColor: '#282c34',
                                    color: '#ffffff'
                                }}
                            >
                                <option value="">-- Select an image --</option>
                                {[...imageList].reverse().map((img) => (
                                    <option key={img} value={img}>
                                        {img}
                                    </option>
                                ))}
                            </select>
                            <span style={{ marginLeft: '10px', color: '#666' }}>
                                ({imageList.length} images available)
                            </span>
                        </div>

                        {/* Loading indicator */}
                        {isLoadingImage && imageProgress && (
                            <div style={{ marginBottom: '15px' }}>
                                <p>Loading image... ({imageProgress.current}/{imageProgress.total} chunks)</p>
                                <div style={{
                                    width: '100%',
                                    height: '20px',
                                    backgroundColor: '#e0e0e0',
                                    borderRadius: '10px',
                                    overflow: 'hidden'
                                }}>
                                    <div style={{
                                        width: `${imageProgress.total > 0 ? (imageProgress.current / imageProgress.total) * 100 : 0}%`,
                                        height: '100%',
                                        backgroundColor: '#4CAF50',
                                        transition: 'width 0.2s'
                                    }} />
                                </div>
                            </div>
                        )}

                        {/* Image and metadata display */}
                        {currentImage && (
                            <div style={{
                                display: 'flex',
                                gap: '20px',
                                alignItems: 'flex-start'
                            }}>
                                {/* Image panel */}
                                <div style={{
                                    flex: '1',
                                    border: '1px solid #444',
                                    borderRadius: '8px',
                                    padding: '10px',
                                    backgroundColor: '#282c34'
                                }}>
                                    <img
                                        src={currentImage}
                                        alt={selectedImage}
                                        style={{
                                            maxWidth: '100%',
                                            maxHeight: '500px',
                                            display: 'block',
                                            margin: '0 auto',
                                            borderRadius: '4px'
                                        }}
                                    />
                                    <p style={{
                                        textAlign: 'center',
                                        marginTop: '10px',
                                        color: '#e0e0e0',
                                        fontSize: '14px'
                                    }}>
                                        {selectedImage}
                                    </p>
                                </div>

                                {/* Metadata panel */}
                                <div style={{
                                    flex: '0 0 300px',
                                    border: '1px solid #444',
                                    borderRadius: '8px',
                                    padding: '15px',
                                    backgroundColor: '#282c34'
                                }}>
                                    <h4 style={{ marginTop: 0, marginBottom: '15px', color: '#e0e0e0' }}>
                                        AI Inference Result
                                    </h4>
                                    {currentMetadata ? (
                                        (() => {
                                            try {
                                                const data = JSON.parse(currentMetadata);
                                                const catNames = ['Boots', 'Chi', 'Kappa', 'Mu', 'Tau', 'NoCat'];
                                                return (
                                                    <div>
                                                        {data.mostLikelyCat && (
                                                            <div style={{
                                                                marginBottom: '15px',
                                                                padding: '10px',
                                                                backgroundColor: '#1a1a2e',
                                                                borderRadius: '6px'
                                                            }}>
                                                                <p style={{ margin: '0 0 5px 0', color: '#4CAF50', fontWeight: 'bold', fontSize: '18px' }}>
                                                                    {data.mostLikelyCat.name}
                                                                </p>
                                                                <p style={{ margin: 0, color: '#aaa', fontSize: '14px' }}>
                                                                    Confidence: {(data.mostLikelyCat.confidence * 100).toFixed(1)}%
                                                                </p>
                                                            </div>
                                                        )}
                                                        {data.data?.probabilities && (
                                                            <div>
                                                                <p style={{ color: '#888', fontSize: '12px', marginBottom: '8px' }}>
                                                                    All Probabilities:
                                                                </p>
                                                                {data.data.probabilities.map((prob: number, i: number) => (
                                                                    <div key={catNames[i]} style={{
                                                                        display: 'flex',
                                                                        justifyContent: 'space-between',
                                                                        marginBottom: '4px',
                                                                        padding: '4px 8px',
                                                                        backgroundColor: i === data.mostLikelyCat?.index ? '#2d3748' : 'transparent',
                                                                        borderRadius: '4px'
                                                                    }}>
                                                                        <span style={{ color: '#e0e0e0', fontSize: '13px' }}>
                                                                            {catNames[i]}
                                                                        </span>
                                                                        <span style={{ color: '#aaa', fontSize: '13px' }}>
                                                                            {(prob * 100).toFixed(1)}%
                                                                        </span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            } catch {
                                                return (
                                                    <pre style={{
                                                        color: '#e0e0e0',
                                                        fontSize: '12px',
                                                        whiteSpace: 'pre-wrap',
                                                        wordBreak: 'break-word',
                                                        margin: 0
                                                    }}>
                                                        {currentMetadata}
                                                    </pre>
                                                );
                                            }
                                        })()
                                    ) : (
                                        <p style={{ color: '#666', fontStyle: 'italic', margin: 0 }}>
                                            {isLoadingImage ? 'Loading...' : 'No metadata available'}
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}
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
                                <p><strong>Training Mode:</strong> {systemStatus.system.training_mode ? '🎯 ON' : '❌ OFF'}</p>
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