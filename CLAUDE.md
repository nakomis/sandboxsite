# Claude Code Context - Sandboxsite

## Project Overview

Monorepo containing the BootBoots web platform:
- **sandbox-app/** - React web application for firmware management and device control
- **infra/** - AWS CDK infrastructure (CloudFront, Cognito, S3, certificates)

**Live URL:** https://sandbox.nakomis.com

## Related Projects

- **Embedded Firmware**: `/Users/martinmu_1/repos/nakomis/bootboots/embedded/catcam/cpp` - ESP32 firmware for CatCam devices (see CLAUDE.md in that repo)

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        sandbox.nakomis.com                       │
│                         (CloudFront CDN)                         │
└─────────────────────────────────────────────────────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    ▼                           ▼
        ┌───────────────────┐       ┌───────────────────┐
        │   S3 Web Bucket   │       │  Cognito Auth     │
        │   (React App)     │       │  auth0.sandbox... │
        └───────────────────┘       └───────────────────┘
                                              │
                                              ▼
                                    ┌───────────────────┐
                                    │  Identity Pool    │
                                    │  (AWS Creds)      │
                                    └───────────────────┘
                                              │
                    ┌─────────────────────────┴─────────────┐
                    ▼                                       ▼
        ┌───────────────────┐                   ┌───────────────────┐
        │  Firmware Bucket  │                   │  Web Bluetooth    │
        │  bootboots-       │                   │  (ESP32 OTA)      │
        │  firmware-updates │                   │                   │
        └───────────────────┘                   └───────────────────┘
```

## Project Structure

```
sandboxsite/
├── CLAUDE.md              # This file
├── sandbox-app/           # React web application
│   ├── public/
│   │   ├── sw.js          # Service worker (caching strategy)
│   │   └── manifest.json  # PWA manifest
│   ├── src/
│   │   ├── components/
│   │   │   ├── App.tsx    # Main app with auth + tab navigation
│   │   │   └── pages/
│   │   │       ├── HomePage.tsx
│   │   │       ├── Bluetooth.tsx      # Device scanning
│   │   │       ├── OTAUpdate.tsx      # Web app self-update
│   │   │       └── FirmwareManager.tsx # Firmware OTA to ESP32
│   │   ├── services/
│   │   │   ├── bluetoothService.ts    # Web Bluetooth API
│   │   │   └── firmwareService.ts     # S3 firmware access
│   │   └── config/
│   │       └── config.json            # Cognito/AWS config
│   └── scripts/
│       └── deploy.sh      # Build + S3 sync + CloudFront invalidation
│
└── infra/                 # AWS CDK infrastructure
    ├── bin/
    │   └── infra.ts       # CDK app entry point
    └── lib/
        ├── certificate-stack.ts      # ACM certificates (us-east-1)
        ├── cloudfront-stack.ts       # CloudFront + S3 web hosting
        ├── cognito-stack.ts          # User Pool + Identity Pool
        └── firmware-bucket-stack.ts  # S3 bucket for firmware
```

---

## sandbox-app (React Web App)

### Tech Stack

- **Framework**: React 19 with TypeScript
- **UI**: Material-UI (MUI) 7 + Bootstrap 5
- **Auth**: AWS Cognito via `react-oidc-context`
- **AWS SDK**: S3 client, Cognito Identity
- **Bluetooth**: Web Bluetooth API

### Key Services

#### BluetoothService (`src/services/bluetoothService.ts`)

Web Bluetooth communication with ESP32 devices.

**BLE UUIDs:**
```
OTA Service:    12345678-1234-1234-1234-123456789abc
Command Char:   87654321-4321-4321-4321-cba987654321
Status Char:    11111111-2222-3333-4444-555555555555
```

**OTA Commands:**
- `ota_update` - Start firmware update with signed S3 URL
- `get_status` - Get current device status/version
- `cancel_update` - Cancel in-progress update
- `url_chunk` - Send long URLs in chunks (BLE packet size limits)

#### FirmwareService (`src/services/firmwareService.ts`)

S3 access for firmware manifest and downloads.
- Lists firmware projects/versions from S3
- Generates pre-signed URLs for secure downloads
- Uses Cognito Identity Pool credentials

### Authentication Flow

1. User signs in via Cognito Hosted UI (OIDC)
2. `react-oidc-context` handles token management
3. ID token exchanged for Cognito Identity credentials
4. Identity credentials used for S3 access

### Service Worker Caching

The service worker (`public/sw.js`) uses:
- **Network-first** for S3/API requests (firmware manifests)
- **Cache-first** for static assets (JS, CSS)

**Important:** When adding new API Gateway endpoints, ensure the URL pattern is excluded from cache-first in `sw.js`. Add hostname/path patterns to the network-first condition to avoid stale data issues.

### Build & Deploy

```bash
cd sandbox-app

# Development
npm start

# Production build
npm run build

# Deploy to S3 + CloudFront
npm run deploy

# Deploy with version bump
npm run deploy:patch   # 0.0.X
npm run deploy:minor   # 0.X.0
npm run deploy:major   # X.0.0
```

---

## infra (AWS CDK)

### CDK Stacks

| Stack | Region | Resources |
|-------|--------|-----------|
| `SandboxCertificateStack` | us-east-1 | ACM certificates for CloudFront |
| `SandboxCloudfrontStack` | eu-west-2 | CloudFront distribution, S3 web bucket, Route53 records |
| `SandboxCognitoStack` | eu-west-2 | User Pool, Identity Pool, custom auth domain |
| `SandboxFirmwareBucketStack` | eu-west-2 | S3 bucket for firmware, IAM policies |

### Key Resources

**Domains:**
- `sandbox.nakomis.com` - Web app (CloudFront)
- `auth0.sandbox.nakomis.com` - Cognito hosted UI

**S3 Buckets:**
- Web hosting bucket (via CloudFront stack output)
- `bootboots-firmware-updates` - Firmware storage (public read for ESP32)

**Cognito:**
- User Pool: `SandboxUserPool`
- Identity Pool: `SandboxIdentityPool` (provides AWS credentials to authenticated users)

### CDK Commands

```bash
cd infra

# Install dependencies
npm install

# Build TypeScript
npm run build

# Synthesize CloudFormation
npx cdk synth

# Deploy all stacks
npx cdk deploy --all

# Deploy specific stack
npx cdk deploy SandboxCloudfrontStack

# Diff changes
npx cdk diff
```

### Stack Dependencies

```
CertificateStack (us-east-1)
       │
       ├──► CloudfrontStack (eu-west-2)
       │
       └──► CognitoStack (eu-west-2)
                   │
                   └──► FirmwareBucketStack (eu-west-2)
```

---

## Common Issues

### Firmware manifest shows stale version
Service worker caching. Check `sw.js` uses network-first for S3 requests. May need to clear browser cache once after deploying fix.

### Bluetooth connection fails
- Requires HTTPS (secure context)
- Device must advertise as "BootBoots-CatCam" or "BootBoots*"
- Only works in Chrome/Edge (not Safari/Firefox)

### CDK deploy fails with cross-region reference
Ensure `crossRegionReferences: true` is set in stack props. Certificate stack must be in us-east-1 for CloudFront.

### CloudFront 403 errors
The distribution returns `index.html` for 403s (SPA routing). If seeing unexpected 403s, check S3 bucket policy and OAC configuration.

---

## Environment Config

### sandbox-app config (`src/config/config.json`)

```json
{
    "env": "localhost",
    "aws": {
        "region": "eu-west-2"
    },
    "cognito": {
        "authority": "https://cognito-idp.eu-west-2.amazonaws.com/POOL_ID",
        "userPoolId": "POOL_ID",
        "userPoolClientId": "CLIENT_ID",
        "cognitoDomain": "auth0.sandbox.nakomis.com",
        "redirectUri": "http://localhost:3000/loggedin",
        "logoutUri": "http://localhost:3000/logout",
        "identityPoolId": "IDENTITY_POOL_ID"
    }
}
```

### AWS CLI Profile

Deploy scripts expect AWS credentials configured. Use:
```bash
export AWS_PROFILE=your-profile
# or
aws configure
```
