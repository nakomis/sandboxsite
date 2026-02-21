// Device Transport Abstraction Layer
// Provides a common interface for communicating with devices via different transports (Bluetooth, MQTT)

// Device capabilities as a union type
export type DeviceCapability = 'photos' | 'logs' | 'settings' | 'camera' | 'heater';

// Device type enum matching existing code
export type DeviceType = 'bootboots' | 'kappa-warmer' | 'unknown';

// Device info returned from discovery
export interface Device {
    id: string;                     // Unique device identifier (BLE device id or IoT thingName)
    name: string;                   // Human-readable device name
    project: string;                // Project name (e.g., 'bootboots', 'kappa-warmer')
    deviceType: DeviceType;         // Device type for UI rendering
    capabilities: DeviceCapability[]; // What the device can do
    connected?: boolean;            // Current connection state
}

// Camera sensor settings (from Bluetooth.tsx)
export interface CameraSettings {
    frame_size: number;
    jpeg_quality: number;
    fb_count: number;
    brightness: number;
    contrast: number;
    saturation: number;
    special_effect: number;
    white_balance: boolean;
    awb_gain: boolean;
    wb_mode: number;
    exposure_ctrl: boolean;
    aec2: boolean;
    ae_level: number;
    aec_value: number;
    gain_ctrl: boolean;
    agc_gain: number;
    gain_ceiling: number;
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

export const DEFAULT_CAMERA_SETTINGS: CameraSettings = {
    frame_size: 13, jpeg_quality: 10, fb_count: 2,
    brightness: 0, contrast: 0, saturation: 0, special_effect: 0,
    white_balance: true, awb_gain: true, wb_mode: 0,
    exposure_ctrl: true, aec2: false, ae_level: -2, aec_value: 300,
    gain_ctrl: true, agc_gain: 15, gain_ceiling: 0,
    bpc: false, wpc: true, raw_gma: true, lenc: true,
    hmirror: false, vflip: false, dcw: true, colorbar: false,
    led_delay_millis: 100
};

// BootBoots system status (from Bluetooth.tsx)
export interface BootBootsSystemStatus {
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

// Kappa-Warmer status (from Bluetooth.tsx)
export interface KappaWarmerStatus {
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

// Cached image data with AI inference result
export interface ImageAndResult {
    imageData: string;      // base64 data URL
    metadata: string | null; // .txt file contents (AI inference JSON)
}

// Command types that can be sent to devices
export type DeviceCommandType =
    | 'ping'
    | 'request_logs'
    | 'list_logs'
    | 'get_log_file'
    | 'list_images'
    | 'get_image'
    | 'get_image_metadata'
    | 'take_photo'
    | 'get_settings'
    | 'set_setting'
    | 'set_dry_run'
    | 'set_trigger_threshold'
    | 'set_claude_infer'
    | 'reboot'
    | 'get_status'
    | 'set_auto'
    | 'set_heater'
    | 'ota_update'
    | 'ota_cancel'
    | 'get_version';

// Generic device command
export interface DeviceCommand {
    command: DeviceCommandType;
    [key: string]: unknown;  // Additional command-specific parameters
}

// Response types from devices
export type DeviceResponseType =
    | 'pong'
    | 'log_chunk'
    | 'logs_complete'
    | 'log_list_debug'
    | 'log_list_chunk'
    | 'log_list_complete'
    | 'log_file_chunk'
    | 'log_file_complete'
    | 'image_list'
    | 'image_list_chunk'
    | 'image_list_complete'
    | 'image_start'
    | 'image_chunk'
    | 'image_complete'
    | 'metadata_result'
    | 'error'
    | 'photo_started'
    | 'photo_complete'
    | 'settings'
    | 'setting_updated'
    | 'reboot_ack'
    | 'status'
    | 'ota_progress'
    | 'ota_complete'
    | 'ota_error'
    | 'version';

// Generic device response
export interface DeviceResponse {
    type: DeviceResponseType;
    [key: string]: unknown;  // Additional response-specific data
}

// Connection state
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

// Response handler callback
export type ResponseHandler = (response: DeviceResponse) => void;

// Transport interface - implemented by BluetoothTransport and MqttTransport
export interface DeviceTransport {
    // Discovery
    listDevices(): Promise<Device[]>;

    // Connection management
    connect(device: Device): Promise<void>;
    disconnect(): void;
    getConnectionState(): ConnectionState;
    getConnectedDevice(): Device | null;

    // Command sending
    sendCommand(command: DeviceCommand): Promise<void>;

    // Response handling
    onResponse(handler: ResponseHandler): void;
    offResponse(handler: ResponseHandler): void;

    // Connection state change callback
    onConnectionStateChange(handler: (state: ConnectionState) => void): void;
    offConnectionStateChange(handler: (state: ConnectionState) => void): void;
}

// UI constants (moved from Bluetooth.tsx)
export const SPECIAL_EFFECT_NAMES = ['None', 'Negative', 'Grayscale', 'Red Tint', 'Green Tint', 'Blue Tint', 'Sepia'];
export const WB_MODE_NAMES = ['Auto', 'Sunny', 'Cloudy', 'Office', 'Home'];
export const FRAME_SIZE_OPTIONS: { value: number; label: string }[] = [
    { value: 5, label: 'QVGA (320x240)' },
    { value: 6, label: 'CIF (400x296)' },
    { value: 8, label: 'VGA (640x480)' },
    { value: 9, label: 'SVGA (800x600)' },
    { value: 10, label: 'XGA (1024x768)' },
    { value: 11, label: 'HD (1280x720)' },
    { value: 12, label: 'SXGA (1280x1024)' },
    { value: 13, label: 'UXGA (1600x1200)' },
];
