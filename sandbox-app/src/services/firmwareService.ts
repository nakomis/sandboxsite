import { S3Client, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

interface FirmwareVersion {
    version: string;
    timestamp: string;
    firmware_path: string;
    size?: number;
}

interface FirmwareManifest {
    project: string;
    versions: FirmwareVersion[];
    internal?: boolean;  // If true, project is hidden from UI (e.g., bootloader)
}

export interface FirmwareProject {
    name: string;
    displayName: string;
    lastUpdated?: string;
}

export class FirmwareService {
    private s3Client: S3Client | null = null;
    private bucketName: string;
    private region: string;

    constructor(region: string = 'eu-west-2', bucketName: string = 'bootboots-firmware-updates') {
        this.region = region;
        this.bucketName = bucketName;
    }

    /**
     * Initialize S3 client with existing credentials
     */
    private initializeS3Client(creds: any): void {
        if (this.s3Client) {
            return; // Already initialized
        }

        this.s3Client = new S3Client({
            region: this.region,
            credentials: {
                accessKeyId: creds.AccessKeyId,
                secretAccessKey: creds.SecretKey,
                sessionToken: creds.SessionToken
            }
        });
    }

    /**
     * List available firmware projects (excludes internal projects like bootloader)
     */
    async listProjects(creds: any): Promise<FirmwareProject[]> {
        try {
            this.initializeS3Client(creds);

            if (!this.s3Client) {
                throw new Error('S3 client not initialized');
            }

            const command = new ListObjectsV2Command({
                Bucket: this.bucketName,
                Delimiter: '/',
                MaxKeys: 100
            });

            const response = await this.s3Client.send(command);
            const projects: FirmwareProject[] = [];

            if (response.CommonPrefixes) {
                // Check each project's manifest to filter out internal projects
                const projectChecks = response.CommonPrefixes.map(async (prefix) => {
                    if (!prefix.Prefix) return null;

                    const projectName = prefix.Prefix.replace('/', '');

                    // Try to load manifest to check if project is internal
                    try {
                        const manifest = await this.loadFirmwareManifest(projectName, creds);
                        if (manifest.internal === true) {
                            console.log(`Filtering out internal project: ${projectName}`);
                            return null;  // Skip internal projects
                        }
                    } catch (err) {
                        // If manifest doesn't exist or can't be loaded, include the project
                        console.warn(`Could not load manifest for ${projectName}, including in list`);
                    }

                    return {
                        name: projectName,
                        displayName: projectName.charAt(0).toUpperCase() + projectName.slice(1),
                        lastUpdated: undefined
                    } as FirmwareProject;
                });

                const results = await Promise.all(projectChecks);
                for (const project of results) {
                    if (project !== null) {
                        projects.push(project);
                    }
                }
            }

            return projects.sort((a, b) => a.displayName.localeCompare(b.displayName));
        } catch (error) {
            console.error('Error listing projects:', error);
            throw new Error(`Failed to list projects: ${error}`);
        }
    }

    /**
     * Load firmware manifest from S3 for a specific project
     */
    async loadFirmwareManifest(projectName: string, creds: any): Promise<FirmwareManifest> {
        try {
            this.initializeS3Client(creds);
            
            if (!this.s3Client) {
                throw new Error('S3 client not initialized');
            }

            const command = new GetObjectCommand({
                Bucket: this.bucketName,
                Key: `${projectName}/manifest.json`
            });

            const response = await this.s3Client.send(command);
            
            if (!response.Body) {
                throw new Error('Empty response body');
            }

            const manifestData = await response.Body.transformToString();
            const manifest: FirmwareManifest = JSON.parse(manifestData);
            return manifest;
        } catch (error) {
            console.error('Error loading firmware manifest:', error);
            throw new Error(`Failed to load firmware manifest: ${error}`);
        }
    }

    /**
     * Generate a signed URL for firmware download
     */
    async generateSignedUrl(firmwarePath: string, expiresIn: number = 3600): Promise<string> {
        try {
            if (!this.s3Client) {
                throw new Error('S3 client not initialized');
            }

            const command = new GetObjectCommand({
                Bucket: this.bucketName,
                Key: firmwarePath,
            });

            const signedUrl = await getSignedUrl(this.s3Client, command, { expiresIn });
            return signedUrl;
        } catch (error) {
            console.error('Error generating signed URL:', error);
            throw new Error(`Failed to generate signed URL: ${error}`);
        }
    }

    /**
     * Get firmware versions for a specific project, sorted by version (newest first)
     */
    async getAvailableFirmwareVersions(projectName: string, creds: any): Promise<FirmwareVersion[]> {
        const manifest = await this.loadFirmwareManifest(projectName, creds);
        
        // Sort versions by semantic version (newest first)
        return manifest.versions.sort((a, b) => {
            const versionA = a.version.split('.').map(Number);
            const versionB = b.version.split('.').map(Number);
            
            for (let i = 0; i < Math.max(versionA.length, versionB.length); i++) {
                const numA = versionA[i] || 0;
                const numB = versionB[i] || 0;
                
                if (numA !== numB) {
                    return numB - numA; // Descending order
                }
            }
            
            return 0;
        });
    }

    /**
     * Get firmware download URL (signed HTTPS URL for ESP32 access)
     * ESP32 will shutdown BLE to free memory for HTTPS/TLS
     */
    async getFirmwareDownloadUrl(projectName: string, version: string, creds: any, expiresIn: number = 3600): Promise<string> {
        this.initializeS3Client(creds);

        const versions = await this.getAvailableFirmwareVersions(projectName, creds);
        const firmware = versions.find(v => v.version === version);

        if (!firmware) {
            throw new Error(`Firmware version ${version} not found`);
        }

        // Generate signed HTTPS URL for secure firmware download
        // ESP32 will deinitialize BLE before download to free ~40KB for TLS
        return await this.generateSignedUrl(firmware.firmware_path, expiresIn);
    }
}

// Singleton instance for easy access
export const firmwareService = new FirmwareService();
