import React, { useState, useEffect } from 'react';
import { CameraSettings as CameraSettingsType } from '../../services/deviceTransport/types';
import { CameraSettingsPanel } from './CameraSettings';

interface BootBootsControlsProps {
    trainingMode: boolean;
    onToggleTrainingMode: () => void;
    dryRun: boolean;
    onToggleDryRun: () => void;
    triggerThresh: number;
    onSetTriggerThresh: (value: number) => void;
    claudeInfer: boolean;
    onToggleClaudeInfer: () => void;
    isUpdatingSetting: boolean;
    settingsExpanded: boolean;
    onSettingsExpandToggle: () => void;
    cameraSettings: CameraSettingsType;
    cameraSettingsExpanded: boolean;
    onCameraSettingsExpandToggle: () => void;
    onCameraSettingChange: (setting: string, value: number | boolean) => void;
}

const Toggle: React.FC<{
    checked: boolean;
    onChange: () => void;
    disabled: boolean;
}> = ({ checked, onChange, disabled }) => (
    <label style={{
        position: 'relative',
        display: 'inline-block',
        width: '60px',
        height: '34px',
        flexShrink: 0,
        marginLeft: '20px'
    }}>
        <input
            type="checkbox"
            checked={checked}
            onChange={onChange}
            disabled={disabled}
            style={{ opacity: 0, width: 0, height: 0 }}
        />
        <span style={{
            position: 'absolute',
            cursor: disabled ? 'wait' : 'pointer',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: checked ? '#4CAF50' : '#ccc',
            transition: '0.4s',
            borderRadius: '34px',
            opacity: disabled ? 0.6 : 1
        }}>
            <span style={{
                position: 'absolute',
                height: '26px',
                width: '26px',
                left: checked ? '30px' : '4px',
                bottom: '4px',
                backgroundColor: 'white',
                transition: '0.4s',
                borderRadius: '50%'
            }} />
        </span>
    </label>
);

const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '10px',
};

export const BootBootsControls: React.FC<BootBootsControlsProps> = ({
    trainingMode,
    onToggleTrainingMode,
    dryRun,
    onToggleDryRun,
    triggerThresh,
    onSetTriggerThresh,
    claudeInfer,
    onToggleClaudeInfer,
    isUpdatingSetting,
    settingsExpanded,
    onSettingsExpandToggle,
    cameraSettings,
    cameraSettingsExpanded,
    onCameraSettingsExpandToggle,
    onCameraSettingChange
}) => {
    // Local slider state — commits to device on mouse/touch release
    const [localThresh, setLocalThresh] = useState(triggerThresh);
    useEffect(() => { setLocalThresh(triggerThresh); }, [triggerThresh]);

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
                    {/* Training Mode */}
                    <div style={rowStyle}>
                        <div>
                            <strong>Training Mode</strong>
                            <p style={{ margin: '5px 0 0 0', fontSize: '12px', color: '#888' }}>
                                Captures photos without AI inference or deterrent activation.
                                Photos are uploaded to S3 training/ prefix for model training.
                            </p>
                        </div>
                        <Toggle checked={trainingMode} onChange={onToggleTrainingMode} disabled={isUpdatingSetting} />
                    </div>
                    {trainingMode && (
                        <div style={{
                            backgroundColor: '#3d4450',
                            padding: '8px 12px',
                            borderRadius: '4px',
                            fontSize: '13px',
                            color: '#ffc107',
                            marginBottom: '10px'
                        }}>
                            Training mode is active. Motion-triggered photos will be captured without inference.
                        </div>
                    )}

                    {/* Dry Run */}
                    <div style={rowStyle}>
                        <div>
                            <strong>Dry Run</strong>
                            <p style={{ margin: '5px 0 0 0', fontSize: '12px', color: '#888' }}>
                                Runs the full deterrent sequence (LEDs, video, notifications) but skips the water mist.
                            </p>
                        </div>
                        <Toggle checked={dryRun} onChange={onToggleDryRun} disabled={isUpdatingSetting} />
                    </div>

                    {/* Trigger Threshold */}
                    <div style={{ marginBottom: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div>
                                <strong>Trigger Threshold</strong>
                                <p style={{ margin: '5px 0 0 0', fontSize: '12px', color: '#888' }}>
                                    Minimum Boots confidence required to activate the deterrent.
                                </p>
                            </div>
                            <span style={{ marginLeft: '20px', flexShrink: 0, fontWeight: 'bold', fontSize: '14px' }}>
                                {Math.round(localThresh * 100)}%
                            </span>
                        </div>
                        <input
                            type="range"
                            min={0.50} max={1.00} step={0.05}
                            value={localThresh}
                            disabled={isUpdatingSetting}
                            onChange={e => setLocalThresh(parseFloat(e.target.value))}
                            onMouseUp={e => onSetTriggerThresh(parseFloat((e.target as HTMLInputElement).value))}
                            onTouchEnd={e => onSetTriggerThresh(parseFloat((e.target as HTMLInputElement).value))}
                            style={{ width: '100%', marginTop: '8px', opacity: isUpdatingSetting ? 0.6 : 1 }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#888', marginTop: '2px' }}>
                            <span>50%</span>
                            <span>100%</span>
                        </div>
                    </div>

                    {/* Claude Vision */}
                    <div style={rowStyle}>
                        <div>
                            <strong>Claude Vision</strong>
                            <p style={{ margin: '5px 0 0 0', fontSize: '12px', color: '#888' }}>
                                Sends each image to Claude for cat identification. Results are informational only
                                and do not affect the deterrent trigger.
                            </p>
                        </div>
                        <Toggle checked={claudeInfer} onChange={onToggleClaudeInfer} disabled={isUpdatingSetting} />
                    </div>

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
