import { Credentials } from '@aws-sdk/client-cognito-identity';
import { Device, DeviceType, DeviceCapability } from './deviceTransport/types';

// API endpoint for device discovery (sandbox shared API)
const SANDBOX_API_BASE = 'https://api.sandbox.nakomis.com';

interface ListDevicesResponse {
    devices: {
        thingName: string;
        thingArn?: string;
        project?: string;
        deviceType?: string;
        capabilities?: string[];
    }[];
    count: number;
}

// Helper to create signed fetch for API Gateway with IAM auth
export async function signedFetch(
    url: string,
    credentials: Credentials,
    options: RequestInit = {}
): Promise<Response> {
    const { SignatureV4 } = await import('@aws-sdk/signature-v4');
    const { Sha256 } = await import('@aws-crypto/sha256-js');

    const signer = new SignatureV4({
        credentials: {
            accessKeyId: credentials.AccessKeyId!,
            secretAccessKey: credentials.SecretKey!,
            sessionToken: credentials.SessionToken,
        },
        region: 'eu-west-2',
        service: 'execute-api',
        sha256: Sha256,
    });

    const urlObj = new URL(url);

    const request = {
        method: options.method || 'GET',
        protocol: urlObj.protocol,
        hostname: urlObj.hostname,
        port: urlObj.port ? parseInt(urlObj.port) : undefined,
        path: urlObj.pathname + urlObj.search,
        headers: {
            host: urlObj.host,
            ...(options.headers as Record<string, string> || {}),
        },
        body: options.body as string | undefined,
    };

    const signedRequest = await signer.sign(request);

    return fetch(url, {
        ...options,
        headers: signedRequest.headers as HeadersInit,
    });
}

// List devices with proper IAM signing
export async function listDevicesSigned(
    credentials: Credentials | null,
    project?: string
): Promise<Device[]> {
    if (!credentials) {
        throw new Error('AWS credentials required');
    }

    let url = `${SANDBOX_API_BASE}/devices`;
    if (project) {
        url += `?project=${encodeURIComponent(project)}`;
    }

    try {
        const response = await signedFetch(url, credentials, {
            method: 'GET',
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to list devices: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data: ListDevicesResponse = await response.json();

        return data.devices.map((d): Device => ({
            id: d.thingName,
            name: d.thingName,
            project: d.project || 'unknown',
            deviceType: (d.deviceType as DeviceType) || 'unknown',
            capabilities: (d.capabilities || []) as DeviceCapability[],
            connected: false,
        }));
    } catch (error) {
        console.error('Error listing devices:', error);
        throw error;
    }
}
