import React from 'react';
import { BootBootsSystemStatus } from '../../services/deviceTransport/types';

interface DeviceStatusPanelProps {
    status: BootBootsSystemStatus;
    lastUpdate: Date | null;
}

// Format uptime helper
const formatUptime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours}h ${minutes}m ${secs}s`;
};

export const DeviceStatusPanel: React.FC<DeviceStatusPanelProps> = ({ status, lastUpdate }) => {
    return (
        <div className="system-status" style={{ marginTop: '20px' }}>
            <h2>System Status</h2>
            {lastUpdate && (
                <p><em>Last updated: {lastUpdate.toLocaleTimeString()}</em></p>
            )}

            <div className="status-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div className="system-info">
                    <h3>System Information</h3>
                    <p><strong>Device:</strong> {status.device}</p>
                    <p><strong>Uptime:</strong> {formatUptime(status.uptime_seconds)}</p>
                    <p><strong>Camera Ready:</strong> {status.system.camera_ready ? '✅' : '❌'}</p>
                    <p><strong>WiFi Connected:</strong> {status.system.wifi_connected ? '✅' : '❌'}</p>
                    <p><strong>SD Card Ready:</strong> {status.system.sd_card_ready ? '✅' : '❌'}</p>
                    <p><strong>I2C Ready:</strong> {status.system.i2c_ready ? '✅' : '❌'}</p>
                    <p><strong>Atomizer Enabled:</strong> {status.system.atomizer_enabled ? '✅' : '❌'}</p>
                    <p><strong>Training Mode:</strong> {status.system.training_mode ? '🎯 ON' : '❌ OFF'}</p>
                </div>

                <div className="statistics">
                    <h3>Detection Statistics</h3>
                    <p><strong>Total Detections:</strong> {status.statistics.total_detections}</p>
                    <p><strong>Boots Detections:</strong> {status.statistics.boots_detections}</p>
                    <p><strong>Atomizer Activations:</strong> {status.statistics.atomizer_activations}</p>
                    <p><strong>False Positives Avoided:</strong> {status.statistics.false_positives_avoided}</p>
                </div>
            </div>
        </div>
    );
};
