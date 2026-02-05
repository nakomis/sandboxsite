import React, { useState, useEffect, useCallback } from 'react';
import { Credentials } from '@aws-sdk/client-cognito-identity';
import { firmwareService, FirmwareProject } from '../../services/firmwareService';

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

export interface FirmwareUpdatePanelProps {
    deviceProject: string;           // e.g., 'bootboots' - auto-selects this project
    currentVersion: string | null;   // from device status
    expanded: boolean;
    onExpandToggle: () => void;
    onStartUpdate: (url: string, version: string) => void;
    onCancelUpdate: () => void;
    updateProgress: number | null;   // 0-100 or null if not updating
    updateStatus: string | null;     // status message
    isUpdating: boolean;
    isConnected: boolean;            // must be connected to update
    creds: Credentials | null;
}

export const FirmwareUpdatePanel: React.FC<FirmwareUpdatePanelProps> = ({
    deviceProject,
    currentVersion,
    expanded,
    onExpandToggle,
    onStartUpdate,
    onCancelUpdate,
    updateProgress,
    updateStatus,
    isUpdating,
    isConnected,
    creds,
}) => {
    const [projects, setProjects] = useState<FirmwareProject[]>([]);
    const [selectedProject, setSelectedProject] = useState<string>('');
    const [manifest, setManifest] = useState<FirmwareManifest | null>(null);
    const [selectedVersion, setSelectedVersion] = useState<string>('');
    const [loadingProjects, setLoadingProjects] = useState<boolean>(false);
    const [loadingVersions, setLoadingVersions] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    // Load available projects on mount
    useEffect(() => {
        const loadProjects = async () => {
            if (!creds) {
                return;
            }

            setLoadingProjects(true);
            try {
                const projectList = await firmwareService.listProjects(creds);
                setProjects(projectList);

                // Auto-select the device's project if available
                const matchingProject = projectList.find(
                    p => p.name.toLowerCase() === deviceProject.toLowerCase()
                );
                if (matchingProject) {
                    setSelectedProject(matchingProject.name);
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

        if (expanded) {
            loadProjects();
        }
    }, [creds, deviceProject, expanded]);

    // Load firmware versions when project is selected
    const loadVersions = useCallback(async () => {
        if (!selectedProject || !creds) {
            setManifest(null);
            setSelectedVersion('');
            return;
        }

        setLoadingVersions(true);
        setError(null);
        try {
            const manifestData = await firmwareService.loadFirmwareManifest(selectedProject, creds);
            setManifest(manifestData);

            if (manifestData.versions.length > 0) {
                setSelectedVersion(manifestData.versions[0].version);
            }
        } catch (err) {
            console.error('Error loading firmware versions:', err);
            setError(`Failed to load versions: ${err}`);
            setManifest(null);
            setSelectedVersion('');
        } finally {
            setLoadingVersions(false);
        }
    }, [selectedProject, creds]);

    useEffect(() => {
        if (expanded && selectedProject) {
            loadVersions();
        }
    }, [expanded, selectedProject, loadVersions]);

    const handleProjectChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        setSelectedProject(event.target.value);
        setSelectedVersion('');
    };

    const handleVersionChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        setSelectedVersion(event.target.value);
    };

    const handleStartUpdate = async () => {
        if (!selectedProject || !selectedVersion || !creds) {
            setError('Please select a project and version');
            return;
        }

        setError(null);
        try {
            // Get signed download URL for selected firmware
            const downloadUrl = await firmwareService.getFirmwareDownloadUrl(
                selectedProject,
                selectedVersion,
                creds
            );
            onStartUpdate(downloadUrl, selectedVersion);
        } catch (err) {
            console.error('Error getting firmware URL:', err);
            setError(`Failed to get firmware URL: ${err}`);
        }
    };

    // Check if update is available
    const latestVersion = manifest?.versions[0]?.version;
    const updateAvailable = currentVersion && latestVersion && currentVersion !== latestVersion;

    return (
        <div className="device-settings" style={{ marginTop: '20px' }}>
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
                <h3 style={{ margin: 0 }}>Firmware Update</h3>
                {updateAvailable && !expanded && (
                    <span style={{
                        marginLeft: '10px',
                        backgroundColor: '#ff9800',
                        color: '#000',
                        padding: '2px 8px',
                        borderRadius: '10px',
                        fontSize: '11px',
                        fontWeight: 'bold'
                    }}>
                        Update Available
                    </span>
                )}
            </div>

            {expanded && (
                <div style={{
                    border: '1px solid #444',
                    borderRadius: '8px',
                    padding: '15px',
                    backgroundColor: '#282c34'
                }}>
                    {error && (
                        <div style={{
                            backgroundColor: '#f44336',
                            color: 'white',
                            padding: '10px',
                            borderRadius: '4px',
                            marginBottom: '15px',
                            fontSize: '13px'
                        }}>
                            {error}
                        </div>
                    )}

                    {!creds ? (
                        <div style={{ color: '#888', fontSize: '13px' }}>
                            Please sign in to manage firmware updates.
                        </div>
                    ) : (
                        <>
                            {/* Current Version Display */}
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                marginBottom: '15px',
                                padding: '10px',
                                backgroundColor: '#1a1a2e',
                                borderRadius: '6px'
                            }}>
                                <div>
                                    <strong style={{ fontSize: '12px', color: '#888' }}>Current Version</strong>
                                    <div style={{ fontSize: '16px', color: '#4CAF50', fontWeight: 'bold' }}>
                                        {currentVersion || 'Unknown'}
                                    </div>
                                </div>
                                {latestVersion && (
                                    <div style={{ textAlign: 'right' }}>
                                        <strong style={{ fontSize: '12px', color: '#888' }}>Latest Available</strong>
                                        <div style={{ fontSize: '16px', color: updateAvailable ? '#ff9800' : '#4CAF50', fontWeight: 'bold' }}>
                                            {latestVersion}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {updateAvailable && (
                                <div style={{
                                    backgroundColor: '#3d4450',
                                    padding: '8px 12px',
                                    borderRadius: '4px',
                                    fontSize: '13px',
                                    color: '#ff9800',
                                    marginBottom: '15px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px'
                                }}>
                                    <span>⚡</span>
                                    A newer firmware version is available!
                                </div>
                            )}

                            {/* Project Selection */}
                            <div style={{ marginBottom: '15px' }}>
                                <label style={{ display: 'block', fontSize: '12px', color: '#888', marginBottom: '5px' }}>
                                    Project
                                </label>
                                {loadingProjects ? (
                                    <div style={{ color: '#888', fontSize: '13px' }}>Loading projects...</div>
                                ) : (
                                    <select
                                        value={selectedProject}
                                        onChange={handleProjectChange}
                                        disabled={isUpdating || projects.length === 0}
                                        style={{
                                            width: '100%',
                                            padding: '8px',
                                            borderRadius: '4px',
                                            border: '1px solid #444',
                                            backgroundColor: '#1a1a2e',
                                            color: '#e0e0e0',
                                            fontSize: '14px',
                                            cursor: isUpdating ? 'not-allowed' : 'pointer'
                                        }}
                                    >
                                        <option value="">Select a project...</option>
                                        {projects.map(project => (
                                            <option key={project.name} value={project.name}>
                                                {project.displayName}
                                            </option>
                                        ))}
                                    </select>
                                )}
                            </div>

                            {/* Version Selection */}
                            {selectedProject && (
                                <div style={{ marginBottom: '15px' }}>
                                    <label style={{ display: 'block', fontSize: '12px', color: '#888', marginBottom: '5px' }}>
                                        Version
                                    </label>
                                    {loadingVersions ? (
                                        <div style={{ color: '#888', fontSize: '13px' }}>Loading versions...</div>
                                    ) : manifest && manifest.versions.length > 0 ? (
                                        <div style={{ display: 'flex', gap: '10px' }}>
                                            <select
                                                value={selectedVersion}
                                                onChange={handleVersionChange}
                                                disabled={isUpdating}
                                                style={{
                                                    flex: 1,
                                                    padding: '8px',
                                                    borderRadius: '4px',
                                                    border: '1px solid #444',
                                                    backgroundColor: '#1a1a2e',
                                                    color: '#e0e0e0',
                                                    fontSize: '14px',
                                                    cursor: isUpdating ? 'not-allowed' : 'pointer'
                                                }}
                                            >
                                                {manifest.versions.map(version => (
                                                    <option key={version.version} value={version.version}>
                                                        v{version.version} ({new Date(version.timestamp).toLocaleDateString()})
                                                    </option>
                                                ))}
                                            </select>
                                            <button
                                                onClick={loadVersions}
                                                disabled={loadingVersions || isUpdating}
                                                title="Refresh versions"
                                                style={{
                                                    padding: '8px 12px',
                                                    borderRadius: '4px',
                                                    border: '1px solid #444',
                                                    backgroundColor: '#1a1a2e',
                                                    color: '#e0e0e0',
                                                    cursor: loadingVersions || isUpdating ? 'not-allowed' : 'pointer'
                                                }}
                                            >
                                                {loadingVersions ? '...' : '↻'}
                                            </button>
                                        </div>
                                    ) : (
                                        <div style={{ color: '#888', fontSize: '13px' }}>
                                            No versions available for {selectedProject}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Update Progress */}
                            {isUpdating && (
                                <div style={{ marginBottom: '15px' }}>
                                    <div style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        marginBottom: '5px',
                                        fontSize: '13px'
                                    }}>
                                        <span>{updateStatus || 'Updating...'}</span>
                                        <span>{updateProgress !== null ? `${updateProgress}%` : ''}</span>
                                    </div>
                                    <div style={{
                                        height: '8px',
                                        backgroundColor: '#1a1a2e',
                                        borderRadius: '4px',
                                        overflow: 'hidden'
                                    }}>
                                        <div style={{
                                            width: `${updateProgress || 0}%`,
                                            height: '100%',
                                            backgroundColor: '#4CAF50',
                                            transition: 'width 0.3s ease-in-out'
                                        }} />
                                    </div>
                                </div>
                            )}

                            {/* Action Buttons */}
                            <div style={{ display: 'flex', gap: '10px' }}>
                                {isUpdating ? (
                                    <button
                                        onClick={onCancelUpdate}
                                        style={{
                                            flex: 1,
                                            padding: '10px',
                                            borderRadius: '4px',
                                            border: 'none',
                                            backgroundColor: '#f44336',
                                            color: 'white',
                                            fontSize: '14px',
                                            fontWeight: 'bold',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Cancel Update
                                    </button>
                                ) : (
                                    <button
                                        onClick={handleStartUpdate}
                                        disabled={!selectedVersion || !isConnected}
                                        style={{
                                            flex: 1,
                                            padding: '10px',
                                            borderRadius: '4px',
                                            border: 'none',
                                            backgroundColor: !selectedVersion || !isConnected ? '#555' : '#4CAF50',
                                            color: 'white',
                                            fontSize: '14px',
                                            fontWeight: 'bold',
                                            cursor: !selectedVersion || !isConnected ? 'not-allowed' : 'pointer'
                                        }}
                                    >
                                        {!isConnected
                                            ? 'Connect to Update'
                                            : selectedVersion
                                                ? `Update to v${selectedVersion}`
                                                : 'Select Version'}
                                    </button>
                                )}
                            </div>

                            {/* Update Instructions */}
                            {!isUpdating && (
                                <div style={{
                                    marginTop: '15px',
                                    padding: '10px',
                                    backgroundColor: '#1a1a2e',
                                    borderRadius: '6px',
                                    fontSize: '12px',
                                    color: '#888'
                                }}>
                                    <strong style={{ color: '#e0e0e0' }}>Update Instructions:</strong>
                                    <ol style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
                                        <li>Ensure device is connected</li>
                                        <li>Select firmware version</li>
                                        <li>Click "Update" to begin</li>
                                        <li>Do not disconnect during update</li>
                                    </ol>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
};
