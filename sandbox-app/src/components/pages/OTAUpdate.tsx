import React, { useState, useEffect } from 'react';
import Page, { PageProps } from './Page';
import './OTAUpdate.css';
import { Credentials } from '@aws-sdk/client-cognito-identity';

interface OTAUpdateProps extends PageProps {
    creds: Credentials | null;
}

interface UpdateStatus {
    available: boolean;
    version: string;
    downloading: boolean;
    progress: number;
    error: string | null;
}

const OTAUpdate: React.FC<OTAUpdateProps> = ({ ...pageProps }) => {
    const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({
        available: false,
        version: '',
        downloading: false,
        progress: 0,
        error: null
    });
    const [isChecking, setIsChecking] = useState(false);
    const [lastCheck, setLastCheck] = useState<Date | null>(null);

    // Check for updates on component mount
    useEffect(() => {
        checkForUpdates();
        
        // Set up periodic update checks (every 30 minutes)
        const interval = setInterval(checkForUpdates, 30 * 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    const checkForUpdates = async () => {
        setIsChecking(true);
        setUpdateStatus(prev => ({ ...prev, error: null }));
        
        try {
            // Check if service worker is available
            if ('serviceWorker' in navigator) {
                const registration = await navigator.serviceWorker.getRegistration();
                if (registration) {
                    // Check for updates
                    await registration.update();
                    
                    // Check if there's a waiting service worker (new version available)
                    if (registration.waiting) {
                        setUpdateStatus(prev => ({
                            ...prev,
                            available: true,
                            version: 'New version available'
                        }));
                    } else {
                        setUpdateStatus(prev => ({
                            ...prev,
                            available: false,
                            version: 'Up to date'
                        }));
                    }
                }
            } else {
                // Fallback: Check version from server
                const response = await fetch('/api/version');
                if (response.ok) {
                    const data = await response.json();
                    const currentVersion = process.env.REACT_APP_VERSION || '1.0.0';
                    
                    setUpdateStatus(prev => ({
                        ...prev,
                        available: data.version !== currentVersion,
                        version: data.version
                    }));
                }
            }
            
            setLastCheck(new Date());
        } catch (error) {
            console.error('Error checking for updates:', error);
            setUpdateStatus(prev => ({
                ...prev,
                error: `Failed to check for updates: ${error}`
            }));
        } finally {
            setIsChecking(false);
        }
    };

    const installUpdate = async () => {
        setUpdateStatus(prev => ({ ...prev, downloading: true, progress: 0, error: null }));
        
        try {
            if ('serviceWorker' in navigator) {
                const registration = await navigator.serviceWorker.getRegistration();
                if (registration && registration.waiting) {
                    // Tell the waiting service worker to skip waiting and become active
                    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                    
                    // Listen for the controlling service worker change
                    navigator.serviceWorker.addEventListener('controllerchange', () => {
                        // Reload the page to get the new version
                        window.location.reload();
                    });
                    
                    setUpdateStatus(prev => ({ ...prev, progress: 100 }));
                } else {
                    // Fallback: Force reload from server
                    window.location.reload();
                }
            } else {
                // Fallback: Force reload
                window.location.reload();
            }
        } catch (error) {
            console.error('Error installing update:', error);
            setUpdateStatus(prev => ({
                ...prev,
                downloading: false,
                error: `Failed to install update: ${error}`
            }));
        }
    };

    const formatLastCheck = (date: Date | null) => {
        if (!date) return 'Never';
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const minutes = Math.floor(diff / 60000);
        
        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes} minutes ago`;
        if (minutes < 1440) return `${Math.floor(minutes / 60)} hours ago`;
        return date.toLocaleDateString();
    };

    return (
        <Page {...pageProps}>
            <div className="ota-update-container">
                <h2>🔄 System Updates</h2>
                
                <div className="update-status-card">
                    <div className="status-header">
                        <h3>Update Status</h3>
                        <button 
                            onClick={checkForUpdates} 
                            disabled={isChecking}
                            className="check-button"
                        >
                            {isChecking ? '🔄 Checking...' : '🔍 Check for Updates'}
                        </button>
                    </div>
                    
                    <div className="status-info">
                        <div className="status-item">
                            <span className="label">Current Version:</span>
                            <span className="value">{process.env.REACT_APP_VERSION || '1.0.0'}</span>
                        </div>
                        
                        <div className="status-item">
                            <span className="label">Latest Version:</span>
                            <span className="value">{updateStatus.version || 'Unknown'}</span>
                        </div>
                        
                        <div className="status-item">
                            <span className="label">Last Check:</span>
                            <span className="value">{formatLastCheck(lastCheck)}</span>
                        </div>
                        
                        <div className="status-item">
                            <span className="label">Status:</span>
                            <span className={`value status-${updateStatus.available ? 'available' : 'current'}`}>
                                {updateStatus.available ? '🟡 Update Available' : '🟢 Up to Date'}
                            </span>
                        </div>
                    </div>
                    
                    {updateStatus.error && (
                        <div className="error-message">
                            ⚠️ {updateStatus.error}
                        </div>
                    )}
                    
                    {updateStatus.downloading && (
                        <div className="download-progress">
                            <div className="progress-bar">
                                <div 
                                    className="progress-fill" 
                                    style={{ width: `${updateStatus.progress}%` }}
                                ></div>
                            </div>
                            <span className="progress-text">Installing update... {updateStatus.progress}%</span>
                        </div>
                    )}
                    
                    {updateStatus.available && !updateStatus.downloading && (
                        <div className="update-actions">
                            <button 
                                onClick={installUpdate}
                                className="install-button"
                            >
                                🚀 Install Update
                            </button>
                            <p className="update-note">
                                The application will reload automatically after the update is installed.
                            </p>
                        </div>
                    )}
                </div>
                
                <div className="update-info-card">
                    <h3>📋 Update Information</h3>
                    <div className="info-content">
                        <p><strong>Automatic Updates:</strong> The system checks for updates every 30 minutes.</p>
                        <p><strong>Update Process:</strong> Updates are downloaded in the background and applied when you choose to install them.</p>
                        <p><strong>Safety:</strong> Updates are cached locally and can be installed offline.</p>
                        <p><strong>Rollback:</strong> If an update causes issues, refresh the page to revert to the previous version.</p>
                    </div>
                </div>
                
                <div className="esp32-ota-card">
                    <h3>🔧 ESP32 OTA Updates</h3>
                    <div className="esp32-info">
                        <p><strong>Device:</strong> BootBoots-CatCam.local</p>
                        <p><strong>Status:</strong> OTA updates available via Arduino IDE or PlatformIO</p>
                        <p><strong>Security:</strong> Password protected OTA updates</p>
                        <div className="esp32-instructions">
                            <h4>To update ESP32 firmware:</h4>
                            <ol>
                                <li>Ensure ESP32 is connected to WiFi</li>
                                <li>Open PlatformIO or Arduino IDE</li>
                                <li>Select "Upload via Network" option</li>
                                <li>Choose "BootBoots-CatCam" from available devices</li>
                                <li>Enter OTA password when prompted</li>
                                <li>Upload new firmware</li>
                            </ol>
                        </div>
                    </div>
                </div>
            </div>
        </Page>
    );
};

export default OTAUpdate;
