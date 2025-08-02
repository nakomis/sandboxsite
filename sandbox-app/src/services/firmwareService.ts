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
}

export class FirmwareService {
    private s3Client: S3Client | null = null;
    private bucketName: string;
    private projectName: string;
    private region: string;

    constructor(region: string = 'eu-west-2', bucketName: string = 'bootboots-firmware-updates', projectName: string = 'BootBoots') {
        this.region = region;
        this.bucketName = bucketName;
        this.projectName = projectName;
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
     * Load firmware manifest from S3
     */
    async loadFirmwareManifest(creds: any): Promise<FirmwareManifest> {
        try {
            this.initializeS3Client(creds);
            
            if (!this.s3Client) {
                throw new Error('S3 client not initialized');
            }

            const command = new GetObjectCommand({
                Bucket: this.bucketName,
                Key: `${this.projectName}/manifest.json`
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
     * Get firmware versions sorted by version (newest first)
     */
    async getAvailableFirmwareVersions(creds: any): Promise<FirmwareVersion[]> {
        const manifest = await this.loadFirmwareManifest(creds);
        
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
     * Get the latest firmware version
     */
    async getLatestFirmwareVersion(creds: any): Promise<FirmwareVersion | null> {
        const versions = await this.getAvailableFirmwareVersions(creds);
        return versions.length > 0 ? versions[0] : null;
    }

    /**
     * Check if a firmware version exists
     */
    async firmwareVersionExists(version: string, creds: any): Promise<boolean> {
        try {
            const versions = await this.getAvailableFirmwareVersions(creds);
            return versions.some(v => v.version === version);
        } catch (error) {
            console.error('Error checking firmware version:', error);
            return false;
        }
    }

    /**
     * Get firmware download URL (signed URL for secure access)
     */
    async getFirmwareDownloadUrl(version: string, creds: any): Promise<string> {
        const versions = await this.getAvailableFirmwareVersions(creds);
        const firmware = versions.find(v => v.version === version);
        
        if (!firmware) {
            throw new Error(`Firmware version ${version} not found`);
        }
        
        return await this.generateSignedUrl(firmware.firmware_path);
    }
}

// Singleton instance for easy access
export const firmwareService = new FirmwareService();
