import React, { useState, useEffect } from 'react';
import {
    CameraSettings as CameraSettingsType,
    SPECIAL_EFFECT_NAMES,
    WB_MODE_NAMES,
    FRAME_SIZE_OPTIONS
} from '../../services/deviceTransport/types';

// Reusable camera slider component
export const CameraSlider = ({ label, value, min, max, setting, onChange, disabled }: {
    label: string;
    value: number;
    min: number;
    max: number;
    setting: string;
    onChange: (setting: string, value: number) => void;
    disabled: boolean;
}) => {
    const [inputValue, setInputValue] = useState(value.toString());

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

// Reusable camera toggle component
export const CameraToggle = ({ label, value, setting, onChange, disabled }: {
    label: string;
    value: boolean;
    setting: string;
    onChange: (setting: string, value: boolean) => void;
    disabled: boolean;
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

// Reusable camera select component
export const CameraSelect = ({ label, value, options, setting, onChange, disabled }: {
    label: string;
    value: number;
    options: string[];
    setting: string;
    onChange: (setting: string, value: number) => void;
    disabled: boolean;
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

// Camera settings panel props
interface CameraSettingsPanelProps {
    settings: CameraSettingsType;
    expanded: boolean;
    onExpandToggle: () => void;
    onSettingChange: (setting: string, value: number | boolean) => void;
    disabled: boolean;
}

// Full camera settings panel
export const CameraSettingsPanel: React.FC<CameraSettingsPanelProps> = ({
    settings,
    expanded,
    onExpandToggle,
    onSettingChange,
    disabled
}) => {
    return (
        <div style={{ marginTop: '20px' }}>
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
                <strong>Camera Settings</strong>
            </div>

            {expanded && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '500px' }}>
                    {/* Resolution & Quality */}
                    <div style={{ borderBottom: '1px solid #444', paddingBottom: '12px' }}>
                        <h4 style={{ margin: '0 0 10px 0', color: '#aaa', fontSize: '13px', textTransform: 'uppercase' }}>Resolution & Quality</h4>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <label style={{ fontSize: '13px', color: '#e0e0e0' }}>Frame Size</label>
                            <select
                                value={settings.frame_size}
                                onChange={(e) => onSettingChange('frame_size', parseInt(e.target.value))}
                                disabled={disabled}
                                style={{
                                    padding: '4px 8px', borderRadius: '4px', border: '1px solid #444',
                                    backgroundColor: '#1a1a2e', color: '#e0e0e0', fontSize: '13px',
                                    cursor: disabled ? 'wait' : 'pointer'
                                }}
                            >
                                {FRAME_SIZE_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>
                        <CameraSlider label="JPEG Quality" value={settings.jpeg_quality} min={0} max={63} setting="jpeg_quality" onChange={onSettingChange} disabled={disabled} />
                        <CameraSlider label="Frame Buffers" value={settings.fb_count} min={1} max={3} setting="fb_count" onChange={onSettingChange} disabled={disabled} />
                        <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#666' }}>
                            JPEG Quality: lower = better quality. Frame Buffers: changes take effect on reboot.
                        </p>
                    </div>

                    {/* Image Quality */}
                    <div style={{ borderBottom: '1px solid #444', paddingBottom: '12px' }}>
                        <h4 style={{ margin: '0 0 10px 0', color: '#aaa', fontSize: '13px', textTransform: 'uppercase' }}>Image Quality</h4>
                        <CameraSlider label="Brightness" value={settings.brightness} min={-2} max={2} setting="brightness" onChange={onSettingChange} disabled={disabled} />
                        <CameraSlider label="Contrast" value={settings.contrast} min={-2} max={2} setting="contrast" onChange={onSettingChange} disabled={disabled} />
                        <CameraSlider label="Saturation" value={settings.saturation} min={-2} max={2} setting="saturation" onChange={onSettingChange} disabled={disabled} />
                        <CameraSelect label="Special Effect" value={settings.special_effect} options={SPECIAL_EFFECT_NAMES} setting="special_effect" onChange={onSettingChange} disabled={disabled} />
                    </div>

                    {/* White Balance */}
                    <div style={{ borderBottom: '1px solid #444', paddingBottom: '12px' }}>
                        <h4 style={{ margin: '0 0 10px 0', color: '#aaa', fontSize: '13px', textTransform: 'uppercase' }}>White Balance</h4>
                        <CameraToggle label="White Balance" value={settings.white_balance} setting="white_balance" onChange={onSettingChange} disabled={disabled} />
                        <CameraToggle label="AWB Gain" value={settings.awb_gain} setting="awb_gain" onChange={onSettingChange} disabled={disabled} />
                        <CameraSelect label="WB Mode" value={settings.wb_mode} options={WB_MODE_NAMES} setting="wb_mode" onChange={onSettingChange} disabled={disabled} />
                    </div>

                    {/* Exposure */}
                    <div style={{ borderBottom: '1px solid #444', paddingBottom: '12px' }}>
                        <h4 style={{ margin: '0 0 10px 0', color: '#aaa', fontSize: '13px', textTransform: 'uppercase' }}>Exposure</h4>
                        <CameraToggle label="Auto Exposure" value={settings.exposure_ctrl} setting="exposure_ctrl" onChange={onSettingChange} disabled={disabled} />
                        <CameraToggle label="AEC DSP" value={settings.aec2} setting="aec2" onChange={onSettingChange} disabled={disabled} />
                        <CameraSlider label="AE Level" value={settings.ae_level} min={-2} max={2} setting="ae_level" onChange={onSettingChange} disabled={disabled} />
                        <CameraSlider label="AEC Value" value={settings.aec_value} min={0} max={1200} setting="aec_value" onChange={onSettingChange} disabled={disabled} />
                    </div>

                    {/* Gain */}
                    <div style={{ borderBottom: '1px solid #444', paddingBottom: '12px' }}>
                        <h4 style={{ margin: '0 0 10px 0', color: '#aaa', fontSize: '13px', textTransform: 'uppercase' }}>Gain</h4>
                        <CameraToggle label="Auto Gain" value={settings.gain_ctrl} setting="gain_ctrl" onChange={onSettingChange} disabled={disabled} />
                        <CameraSlider label="AGC Gain" value={settings.agc_gain} min={0} max={30} setting="agc_gain" onChange={onSettingChange} disabled={disabled} />
                        <CameraSlider label="Gain Ceiling" value={settings.gain_ceiling} min={0} max={6} setting="gain_ceiling" onChange={onSettingChange} disabled={disabled} />
                    </div>

                    {/* Corrections */}
                    <div style={{ borderBottom: '1px solid #444', paddingBottom: '12px' }}>
                        <h4 style={{ margin: '0 0 10px 0', color: '#aaa', fontSize: '13px', textTransform: 'uppercase' }}>Corrections</h4>
                        <CameraToggle label="Bad Pixel Correction" value={settings.bpc} setting="bpc" onChange={onSettingChange} disabled={disabled} />
                        <CameraToggle label="White Pixel Correction" value={settings.wpc} setting="wpc" onChange={onSettingChange} disabled={disabled} />
                        <CameraToggle label="Gamma Correction" value={settings.raw_gma} setting="raw_gma" onChange={onSettingChange} disabled={disabled} />
                        <CameraToggle label="Lens Correction" value={settings.lenc} setting="lenc" onChange={onSettingChange} disabled={disabled} />
                        <CameraToggle label="Downsize Enable" value={settings.dcw} setting="dcw" onChange={onSettingChange} disabled={disabled} />
                    </div>

                    {/* Orientation */}
                    <div style={{ borderBottom: '1px solid #444', paddingBottom: '12px' }}>
                        <h4 style={{ margin: '0 0 10px 0', color: '#aaa', fontSize: '13px', textTransform: 'uppercase' }}>Orientation</h4>
                        <CameraToggle label="Horizontal Mirror" value={settings.hmirror} setting="hmirror" onChange={onSettingChange} disabled={disabled} />
                        <CameraToggle label="Vertical Flip" value={settings.vflip} setting="vflip" onChange={onSettingChange} disabled={disabled} />
                    </div>

                    {/* Test */}
                    <div style={{ borderBottom: '1px solid #444', paddingBottom: '12px' }}>
                        <h4 style={{ margin: '0 0 10px 0', color: '#aaa', fontSize: '13px', textTransform: 'uppercase' }}>Test</h4>
                        <CameraToggle label="Color Bar" value={settings.colorbar} setting="colorbar" onChange={onSettingChange} disabled={disabled} />
                    </div>

                    {/* Flash */}
                    <div>
                        <h4 style={{ margin: '0 0 10px 0', color: '#aaa', fontSize: '13px', textTransform: 'uppercase' }}>Flash</h4>
                        <CameraSlider label="LED Delay (millis)" value={settings.led_delay_millis} min={0} max={1000} setting="led_delay_millis" onChange={onSettingChange} disabled={disabled} />
                    </div>
                </div>
            )}
        </div>
    );
};
