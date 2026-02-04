import React from 'react';
import { KappaWarmerStatus } from '../../services/deviceTransport/types';

interface KappaWarmerControlsProps {
    status: KappaWarmerStatus | null;
    expanded: boolean;
    onExpandToggle: () => void;
    onSetAuto: (enabled: boolean) => void;
    onSetHeater: (on: boolean) => void;
    onRequestStatus: () => void;
}

export const KappaWarmerControls: React.FC<KappaWarmerControlsProps> = ({
    status,
    expanded,
    onExpandToggle,
    onSetAuto,
    onSetHeater,
    onRequestStatus
}) => {
    return (
        <div className="kappa-controls" style={{ marginTop: '20px' }}>
            <div
                onClick={onExpandToggle}
                style={{
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    marginBottom: '10px'
                }}
            >
                <span style={{
                    transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s',
                    marginRight: '8px',
                    fontSize: '14px'
                }}>▶</span>
                <h3 style={{ margin: 0 }}>Kappa-Warmer Controls</h3>
            </div>

            {expanded && (
                <div style={{
                    border: '1px solid #444',
                    borderRadius: '8px',
                    padding: '15px',
                    backgroundColor: '#282c34'
                }}>
                    {status ? (
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
                                        color: status.state === 'ON' ? '#4CAF50' : status.state === 'WARMING_UP' ? '#ff9800' : '#e0e0e0'
                                    }}>
                                        {status.state}
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
                                        color: status.cat_present ? '#4CAF50' : '#888'
                                    }}>
                                        {status.cat_present ? 'YES' : 'NO'}
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
                                        {status.pressure}
                                    </div>
                                    <div style={{ fontSize: '10px', color: '#666' }}>threshold: {status.threshold}</div>
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
                                        color: status.relay_on ? '#4CAF50' : '#888'
                                    }}>
                                        {status.relay_on ? 'ON' : 'OFF'}
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
                                        checked={status.auto_mode}
                                        onChange={() => onSetAuto(!status.auto_mode)}
                                        style={{ opacity: 0, width: 0, height: 0 }}
                                    />
                                    <span style={{
                                        position: 'absolute', cursor: 'pointer',
                                        top: 0, left: 0, right: 0, bottom: 0,
                                        backgroundColor: status.auto_mode ? '#4CAF50' : '#555',
                                        transition: '0.3s', borderRadius: '26px'
                                    }}>
                                        <span style={{
                                            position: 'absolute', height: '20px', width: '20px',
                                            left: status.auto_mode ? '27px' : '3px', bottom: '3px',
                                            backgroundColor: 'white', transition: '0.3s', borderRadius: '50%'
                                        }}></span>
                                    </span>
                                </label>
                            </div>

                            {/* Manual Heater Control (only when not in auto mode) */}
                            {!status.auto_mode && (
                                <div style={{
                                    display: 'flex',
                                    gap: '10px',
                                    marginBottom: '12px'
                                }}>
                                    <button
                                        type="button"
                                        onClick={() => onSetHeater(true)}
                                        style={{
                                            flex: 1,
                                            padding: '10px',
                                            backgroundColor: status.relay_on ? '#4CAF50' : '#333',
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
                                        onClick={() => onSetHeater(false)}
                                        style={{
                                            flex: 1,
                                            padding: '10px',
                                            backgroundColor: !status.relay_on ? '#f44336' : '#333',
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
                                <span>WiFi: {status.wifi_connected ? '✓' : '✗'}</span>
                                <span>SD Card: {status.sd_card_ready ? '✓' : '✗'}</span>
                                <span>Uptime: {Math.floor(status.uptime_ms / 1000 / 60)}m</span>
                            </div>
                        </div>
                    ) : (
                        <div style={{ color: '#888', textAlign: 'center', padding: '20px' }}>
                            <p>No status received yet.</p>
                            <button
                                type="button"
                                onClick={onRequestStatus}
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
    );
};
