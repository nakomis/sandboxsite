import React from 'react';
import { Device } from '../../services/deviceTransport/types';

interface DeviceSelectorProps {
    devices: Device[];
    selectedDevice: Device | null;
    onSelect: (device: Device | null) => void;
    isLoading: boolean;
    onRefresh: () => void;
}

export const DeviceSelector: React.FC<DeviceSelectorProps> = ({
    devices,
    selectedDevice,
    onSelect,
    isLoading,
    onRefresh
}) => {
    const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const deviceId = event.target.value;
        if (deviceId === '') {
            onSelect(null);
        } else {
            const device = devices.find(d => d.id === deviceId);
            onSelect(device || null);
        }
    };

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '15px',
            marginBottom: '20px',
            padding: '15px',
            backgroundColor: '#282c34',
            borderRadius: '8px',
            border: '1px solid #444'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <label htmlFor="device-select" style={{ fontWeight: 'bold', color: '#e0e0e0' }}>
                    Select Device:
                </label>
                <select
                    id="device-select"
                    value={selectedDevice?.id || ''}
                    onChange={handleChange}
                    disabled={isLoading}
                    style={{
                        padding: '8px 12px',
                        borderRadius: '4px',
                        border: '1px solid #444',
                        minWidth: '250px',
                        backgroundColor: '#1a1a2e',
                        color: '#ffffff',
                        cursor: isLoading ? 'wait' : 'pointer'
                    }}
                >
                    <option value="">-- Select a device --</option>
                    {devices.map((device) => (
                        <option key={device.id} value={device.id}>
                            {device.name} ({device.project})
                        </option>
                    ))}
                </select>
            </div>

            <button
                type="button"
                onClick={onRefresh}
                disabled={isLoading}
                style={{
                    padding: '8px 16px',
                    backgroundColor: '#4CAF50',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: isLoading ? 'wait' : 'pointer',
                    opacity: isLoading ? 0.6 : 1
                }}
            >
                {isLoading ? 'Loading...' : 'Refresh'}
            </button>

            <span style={{ color: '#888', fontSize: '14px' }}>
                ({devices.length} devices available)
            </span>
        </div>
    );
};

// Device card for list view
export const DeviceCard: React.FC<{
    device: Device;
    isSelected: boolean;
    onClick: () => void;
}> = ({ device, isSelected, onClick }) => {
    const getStatusColor = () => {
        if (device.connected) return '#4CAF50';
        return '#888';
    };

    const getDeviceIcon = () => {
        switch (device.deviceType) {
            case 'bootboots':
                return '🐱';
            case 'kappa-warmer':
                return '🔥';
            default:
                return '📱';
        }
    };

    return (
        <div
            onClick={onClick}
            style={{
                padding: '15px',
                backgroundColor: isSelected ? '#2d3748' : '#1a1a2e',
                borderRadius: '8px',
                border: `2px solid ${isSelected ? '#4CAF50' : '#444'}`,
                cursor: 'pointer',
                transition: 'all 0.2s',
                marginBottom: '10px'
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '24px' }}>{getDeviceIcon()}</span>
                <div style={{ flex: 1 }}>
                    <div style={{
                        fontWeight: 'bold',
                        color: '#e0e0e0',
                        fontSize: '16px',
                        marginBottom: '4px'
                    }}>
                        {device.name}
                    </div>
                    <div style={{ color: '#888', fontSize: '13px' }}>
                        Project: {device.project}
                    </div>
                </div>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                }}>
                    <div style={{
                        width: '10px',
                        height: '10px',
                        borderRadius: '50%',
                        backgroundColor: getStatusColor()
                    }} />
                    <span style={{ color: '#888', fontSize: '12px' }}>
                        {device.connected ? 'Connected' : 'Offline'}
                    </span>
                </div>
            </div>

            {device.capabilities.length > 0 && (
                <div style={{
                    marginTop: '10px',
                    display: 'flex',
                    gap: '8px',
                    flexWrap: 'wrap'
                }}>
                    {device.capabilities.map((cap) => (
                        <span
                            key={cap}
                            style={{
                                padding: '2px 8px',
                                backgroundColor: '#3d4450',
                                borderRadius: '12px',
                                fontSize: '11px',
                                color: '#aaa'
                            }}
                        >
                            {cap}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
};

// Device list component
export const DeviceList: React.FC<{
    devices: Device[];
    selectedDevice: Device | null;
    onSelect: (device: Device) => void;
    isLoading: boolean;
}> = ({ devices, selectedDevice, onSelect, isLoading }) => {
    if (isLoading) {
        return (
            <div style={{
                padding: '40px',
                textAlign: 'center',
                color: '#888'
            }}>
                Loading devices...
            </div>
        );
    }

    if (devices.length === 0) {
        return (
            <div style={{
                padding: '40px',
                textAlign: 'center',
                color: '#888',
                backgroundColor: '#1a1a2e',
                borderRadius: '8px'
            }}>
                <p>No devices found.</p>
                <p style={{ fontSize: '13px' }}>
                    Make sure IoT devices are registered in AWS IoT Core.
                </p>
            </div>
        );
    }

    return (
        <div>
            {devices.map((device) => (
                <DeviceCard
                    key={device.id}
                    device={device}
                    isSelected={selectedDevice?.id === device.id}
                    onClick={() => onSelect(device)}
                />
            ))}
        </div>
    );
};
