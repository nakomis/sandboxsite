import React from 'react';
import { CameraSettings as CameraSettingsType } from '../../services/deviceTransport/types';
import { CameraSettingsPanel } from './CameraSettings';

interface BootBootsControlsProps {
    trainingMode: boolean;
    onToggleTrainingMode: () => void;
    isUpdatingSetting: boolean;
    settingsExpanded: boolean;
    onSettingsExpandToggle: () => void;
    cameraSettings: CameraSettingsType;
    cameraSettingsExpanded: boolean;
    onCameraSettingsExpandToggle: () => void;
    onCameraSettingChange: (setting: string, value: number | boolean) => void;
}

export const BootBootsControls: React.FC<BootBootsControlsProps> = ({
    trainingMode,
    onToggleTrainingMode,
    isUpdatingSetting,
    settingsExpanded,
    onSettingsExpandToggle,
    cameraSettings,
    cameraSettingsExpanded,
    onCameraSettingsExpandToggle,
    onCameraSettingChange
}) => {
    return (
        <div className="device-settings" style={{ marginTop: '20px' }}>
            <div
                onClick={onSettingsExpandToggle}
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
                                onChange={onToggleTrainingMode}
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
                    <CameraSettingsPanel
                        settings={cameraSettings}
                        expanded={cameraSettingsExpanded}
                        onExpandToggle={onCameraSettingsExpandToggle}
                        onSettingChange={onCameraSettingChange}
                        disabled={isUpdatingSetting}
                    />
                </div>
            )}
        </div>
    );
};
