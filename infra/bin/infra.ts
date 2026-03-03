#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import * as fs from 'fs';
import * as path from 'path';
import { CloudfrontStack } from '../lib/cloudfront-stack';
import { CertificateStack } from '../lib/certificate-stack';
import { CognitoStack } from '../lib/cognito-stack';
import { FirmwareBucketStack } from '../lib/firmware-bucket-stack';
import { PcbPrinterStack } from '../lib/pcbprinter-stack';
import { ApiStack } from '../lib/api-stack';
import { WebSocketStack } from '../lib/websocket-stack';

const londonEnv = { env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION } };
const nvirginiaEnv = { env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'us-east-1' } };
const domainName = `sandbox.nakomis.com`
const apiDomain = `api.sandbox.nakomis.com`;
const wsDomain = `ws.sandbox.nakomis.com`;
const authDomain = `auth0.${domainName}`;

const app = new cdk.App();
const certificateStack = new CertificateStack(app, 'SandboxCertificateStack', {
    ...nvirginiaEnv,
    domainName: domainName,
    authDomain: authDomain,
    apiDomain: apiDomain,
});
const appConfig = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../../sandbox-app/src/config/config.json'), 'utf-8')
) as { allowedIp: string };

if (!appConfig.allowedIp) {
    throw new Error('allowedIp must be set in sandbox-app/src/config/config.json before deploying SandboxCloudfrontStack');
}

const cloudfrontStack = new CloudfrontStack(app, 'SandboxCloudfrontStack', {
    ...londonEnv,
    certificate: certificateStack.certificate,
    domainName: domainName,
    allowedIp: appConfig.allowedIp,
    crossRegionReferences: true
});

const firmwareBucketStack = new FirmwareBucketStack(app, 'SandboxFirmwareBucketStack', londonEnv);

const pcbPrinterStack = new PcbPrinterStack(app, 'SandboxPcbPrinterStack', londonEnv);

const cognitoStack = new CognitoStack(app, 'SandboxCognitoStack', {
    ...londonEnv,
    authDomainName: authDomain,
    domainName: domainName,
    authCertificateArn: certificateStack.authCertificate,
    crossRegionReferences: true,
    pcbPrinterBucket: pcbPrinterStack.bucket,
    pcbPrinterTable: pcbPrinterStack.table,
});

// API Stack for shared services (IoT device discovery, etc.)
const apiStack = new ApiStack(app, 'SandboxApiStack', {
    ...londonEnv,
    domainName: domainName,
    apiDomainName: apiDomain,
});

// WebSocket Stack for IoT device communication
const webSocketStack = new WebSocketStack(app, 'SandboxWebSocketStack', {
    ...londonEnv,
    domainName: domainName,
    wsDomainName: wsDomain,
});

cdk.Tags.of(app).add("MH-Project", "sandbox.nakomis.com");
const { version: infraVersion } = JSON.parse(fs.readFileSync('./version.json', 'utf-8'));
cdk.Tags.of(app).add("MH-Version", infraVersion);
