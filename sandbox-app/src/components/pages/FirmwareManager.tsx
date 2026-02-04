import React, { useState, useEffect } from 'react';
import Page, { PageProps } from './Page';
import { firmwareService, FirmwareProject } from '../../services/firmwareService';
import { bluetoothService } from '../../services/bluetoothService';
import './FirmwareManager.css';

interface FirmwareVersion {
    version: string;
    timestamp: string;
    firmware_path: string;
    size?: number;
}

interface FirmwareManifest {
    project: string;
    versions: FirmwareVersion[];
}

interface FirmwareManagerProps extends PageProps {
    creds: any;
}

const FirmwareManager: React.FC<FirmwareManagerProps> = ({ ...pageProps }) => {
    const [projects, setProjects] = useState<FirmwareProject[]>([]);
    const [selectedProject, setSelectedProject] = useState<string>('');
    const [manifest, setManifest] = useState<FirmwareManifest | null>(null);
    const [selectedVersion, setSelectedVersion] = useState<string>('');
    const [currentVersion, setCurrentVersion] = useState<string>('');
    const [isConnected, setIsConnected] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState('Disconnected');
    const [updateProgress, setUpdateProgress] = useState(0);
    const [updateStatus, setUpdateStatus] = useState<string>('');
    const [isUpdating, setIsUpdating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loadingProjects, setLoadingProjects] = useState(true);
    const [loadingVersions, setLoadingVersions] = useState(false);

    // Load available projects on component mount
    useEffect(() => {
        const loadProjects = async () => {
            if (!pageProps.creds) {
                setError('User not authenticated');
                setLoadingProjects(false);
                return;
            }

            try {
                setError(null);
                const projectList = await firmwareService.listProjects(pageProps.creds);
                setProjects(projectList);
                
                // Auto-select BootBoots project if available
                const bootbootsProject = projectList.find(p => p.name.toLowerCase() === 'bootboots');
                if (bootbootsProject) {
                    setSelectedProject(bootbootsProject.name);
                } else if (projectList.length > 0) {
                    setSelectedProject(projectList[0].name);
                }
            } catch (err) {
                console.error('Error loading projects:', err);
                setError(`Failed to load projects: ${err}`);
            } finally {
                setLoadingProjects(false);
            }
        };

        loadProjects();
    }, [pageProps.creds]);

    // Load firmware versions
    const loadVersions = async (preserveSelection: boolean = false) => {
        if (!selectedProject || !pageProps.creds) {
            setManifest(null);
            setSelectedVersion('');
            return;
        }

        try {
            setError(null);
            setLoadingVersions(true);
            const manifestData = await firmwareService.loadFirmwareManifest(selectedProject, pageProps.creds);
            setManifest(manifestData);

            if (manifestData.versions.length > 0) {
                setSelectedVersion(manifestData.versions[0].version);
            }
        } catch (err) {
            console.error('Error loading firmware versions:', err);
            setError(`Failed to load firmware versions for ${selectedProject}: ${err}`);
            setManifest(null);
            setSelectedVersion('');
        } finally {
            setLoadingVersions(false);
        }
    };

    // Load firmware versions when project is selected
    useEffect(() => {
        loadVersions();
    }, [selectedProject, pageProps.creds]);

    // Refresh versions list
    const refreshVersions = () => {
        loadVersions();
    };

    const handleProjectChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        setSelectedProject(event.target.value);
        setSelectedVersion(''); // Reset version selection
    };

    const handleVersionChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        setSelectedVersion(event.target.value);
    };

    const connectToBluetooth = async () => {
        try {
            setConnectionStatus('Connecting...');
            setError(null);

            await bluetoothService.connect();

            setIsConnected(true);
            setConnectionStatus('Connected');

            // Get current firmware version from device
            const version = bluetoothService.getCurrentVersion();
            setCurrentVersion(version);

        } catch (err) {
            console.error('Bluetooth connection failed:', err);
            setError(`Failed to connect: ${err}`);
            setConnectionStatus('Disconnected');
            setIsConnected(false);
        }
    };

    const disconnectBluetooth = async () => {
        try {
            await bluetoothService.disconnect();
            setIsConnected(false);
            setConnectionStatus('Disconnected');
            setCurrentVersion('');
        } catch (err) {
            console.error('Disconnect failed:', err);
        }
    };

    const startUpdate = async () => {
        if (!selectedProject || !selectedVersion) {
            setError('Please select a project and version');
            return;
        }

        if (!isConnected) {
            setError('Please connect to device first');
            return;
        }

        try {
            setError(null);
            setIsUpdating(true);
            setUpdateProgress(0);
            setUpdateStatus('Generating signed URL...');

            // Get signed download URL for selected firmware
            const downloadUrl = await firmwareService.getFirmwareDownloadUrl(
                selectedProject,
                selectedVersion,
                pageProps.creds
            );

            setUpdateStatus('Sending OTA command to device...');

            // Start monitoring progress updates
            await bluetoothService.startProgressMonitoring((response) => {
                console.log('OTA Status Update:', response);
                setUpdateStatus(response.message);

                if (response.progress !== undefined) {
                    setUpdateProgress(response.progress);
                }

                // Check if update completed or failed
                if (response.status === 'error') {
                    setError(`Update failed: ${response.message}`);
                    setIsUpdating(false);
                } else if (response.progress === 100) {
                    setUpdateStatus('Update complete! Device will reboot...');
                    setTimeout(() => {
                        setIsUpdating(false);
                        setUpdateProgress(0);
                        setUpdateStatus('');
                    }, 3000);
                }
            });

            // Send OTA update command to ESP32
            console.log('Sending OTA command to device with URL:', downloadUrl);
            await bluetoothService.sendOTACommand(downloadUrl, selectedVersion);

            setUpdateStatus('Update initiated - waiting for device...');

        } catch (err) {
            console.error('Error starting update:', err);
            setError(`Failed to start update: ${err}`);
            setIsUpdating(false);
            setUpdateProgress(0);
            setUpdateStatus('');
            await bluetoothService.stopProgressMonitoring();
        }
    };

    const cancelUpdate = async () => {
        try {
            await bluetoothService.cancelUpdate();
            await bluetoothService.stopProgressMonitoring();
            setIsUpdating(false);
            setUpdateProgress(0);
            setUpdateStatus('');
        } catch (err) {
            console.error('Failed to cancel update:', err);
        }
    };

    if (pageProps.tabId !== pageProps.index) {
        return null;
    }

    return (
        <Page {...pageProps}>
            <div className="firmware-manager">
                <div className="header-section">
                    <h2>Firmware Manager</h2>
                    <p>Manage and update firmware for your devices</p>
                </div>

                {error && (
                    <div className="error-message">
                        <span>⚠️</span>
                        <span>{error}</span>
                    </div>
                )}

                {/* Project Selection */}
                <div className="connection-section">
                    <h3>Select Project</h3>
                    {loadingProjects ? (
                        <div className="loading">Loading projects...</div>
                    ) : (
                        <div className="version-selector">
                            <label htmlFor="project-select">Project:</label>
                            <select
                                id="project-select"
                                value={selectedProject}
                                onChange={handleProjectChange}
                                disabled={projects.length === 0}
                            >
                                <option value="">Select a project...</option>
                                {projects.map(project => (
                                    <option key={project.name} value={project.name}>
                                        {project.displayName}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>

                {/* Firmware Version Selection */}
                {selectedProject && (
                    <div className="firmware-section">
                        <h3>Available Firmware Versions</h3>
                        {loadingVersions ? (
                            <div className="loading">Loading versions...</div>
                        ) : manifest && manifest.versions.length > 0 ? (
                            <div className="version-selector">
                                <label htmlFor="version-select">Version:</label>
                                <div className="version-select-row">
                                    <select
                                        id="version-select"
                                        value={selectedVersion}
                                        onChange={handleVersionChange}
                                    >
                                        {manifest.versions.map(version => (
                                            <option key={version.version} value={version.version}>
                                                v{version.version} ({new Date(version.timestamp).toLocaleDateString()})
                                            </option>
                                        ))}
                                    </select>
                                    <button
                                        className="refresh-button"
                                        onClick={refreshVersions}
                                        disabled={loadingVersions}
                                        title="Refresh version list"
                                    >
                                        {loadingVersions ? '...' : '↻'}
                                    </button>
                                </div>
                                
                                {selectedVersion && (
                                    <div className="version-details" style={{ marginTop: '20px' }}>
                                        {(() => {
                                            const version = manifest.versions.find(v => v.version === selectedVersion);
                                            return version ? (
                                                <div className="version-info">
                                                    <h4>Version Details</h4>
                                                    <p><strong>Version:</strong> {version.version}</p>
                                                    <p><strong>Released:</strong> {new Date(version.timestamp).toLocaleString()}</p>
                                                    <p><strong>Project:</strong> {manifest.project}</p>
                                                </div>
                                            ) : null;
                                        })()}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="no-firmware">
                                <span>📦</span>
                                <p>No firmware versions available for {selectedProject}</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Connection Section */}
                <div className="connection-section">
                    <h3>Device Connection</h3>
                    <div className="connection-status">
                        <div className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}></div>
                        <span className={isConnected ? 'connected' : 'disconnected'}>
                            {connectionStatus}
                        </span>
                    </div>

                    {!isConnected ? (
                        <button
                            className="connect-button"
                            onClick={connectToBluetooth}
                            disabled={connectionStatus === 'Connecting...'}
                        >
                            {connectionStatus === 'Connecting...' ? 'Connecting...' : 'Connect via Bluetooth'}
                        </button>
                    ) : (
                        <div className="connected-info">
                            <div className="version-info">
                                <h4>Current Device Version</h4>
                                <div className="version-badge current">{currentVersion}</div>
                            </div>
                            {manifest && manifest.versions.length > 0 && (
                                <div className="version-info">
                                    <h4>Latest Available Version</h4>
                                    <div className="version-badge latest">{manifest.versions[0].version}</div>
                                </div>
                            )}
                            {currentVersion && manifest && manifest.versions.length > 0 &&
                             currentVersion !== manifest.versions[0].version && (
                                <div className="update-available">
                                    ⚡ Update Available!
                                </div>
                            )}
                            <button
                                className="disconnect-button"
                                onClick={disconnectBluetooth}
                            >
                                Disconnect
                            </button>
                        </div>
                    )}
                </div>

                {/* Update Section */}
                {isConnected && selectedProject && selectedVersion && (
                    <div className="action-section">
                        <h3>Firmware Update</h3>
                        
                        {isUpdating && (
                            <div className="update-status">
                                <p>Updating firmware to version {selectedVersion}...</p>
                                <div className="progress-bar">
                                    <div
                                        className="progress-fill"
                                        style={{ width: `${updateProgress}%` }}
                                    ></div>
                                    <div className="progress-text">{updateProgress}%</div>
                                </div>
                                <div className="update-message">{updateStatus}</div>
                                <button
                                    className="cancel-button"
                                    onClick={cancelUpdate}
                                >
                                    Cancel Update
                                </button>
                            </div>
                        )}

                        {!isUpdating && (
                            <button
                                className="update-button"
                                onClick={startUpdate}
                                disabled={!selectedVersion || !isConnected}
                            >
                                Update to v{selectedVersion}
                            </button>
                        )}
                        
                        <div className="action-info">
                            <p>Update Instructions:</p>
                            <ol>
                                <li>Ensure your device is connected via Bluetooth</li>
                                <li>Select the desired firmware version</li>
                                <li>Click "Update" to begin the firmware update process</li>
                                <li>Do not disconnect during the update process</li>
                            </ol>
                        </div>
                    </div>
                )}
            </div>
        </Page>
    );
};

export default FirmwareManager;
