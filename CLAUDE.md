# Claude Code Context - Sandboxsite

## Project Overview

Monorepo containing the BootBoots web platform:
- **sandbox-app/** - React web application for firmware management, device control, and PCB printing
- **infra/** - AWS CDK infrastructure (CloudFront, Cognito, S3, API Gateway, certificates)

**Live URL:** https://sandbox.nakomis.com

## Related Projects

- **Embedded Firmware**: `/Users/martinmu_1/repos/nakomis/bootboots/embedded/catcam/cpp` - ESP32 firmware for CatCam devices (see CLAUDE.md in that repo)
- **pcbprinter**: `/Users/martinmu_1/repos/nakomis/pcbprinter` - Library that converts Fritzing SVG exports to 3D-printable STLs. Used as a local `file:` path dep.

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
              ┌───────────────────────────────┼───────────────────────────┐
              ▼                               ▼                           ▼
  ┌───────────────────┐           ┌───────────────────┐       ┌───────────────────┐
  │  Firmware Bucket  │           │  PCB Printer      │       │  API Gateway      │
  │  nakomis-firmware │           │  S3 + DynamoDB    │       │  api.sandbox...   │
  │  -updates         │           │  (saves/loads)    │       │  /devices GET     │
  └───────────────────┘           └───────────────────┘       └───────────────────┘
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
│   │   │       ├── Bluetooth.tsx          # Device scanning + OTA
│   │   │       ├── MQTT.tsx               # MQTT device control
│   │   │       ├── BootBootsPage.tsx      # Cat labeling
│   │   │       └── PCBPrinterPage.tsx     # PCB → STL conversion + save/load
│   │   ├── dto/
│   │   │   └── PcbSaveRecord.ts           # DynamoDB record type for PCB saves
│   │   ├── services/
│   │   │   ├── bluetoothService.ts        # Web Bluetooth API
│   │   │   ├── firmwareService.ts         # S3 firmware access
│   │   │   ├── CatadataService.ts         # Cat labeling DynamoDB
│   │   │   └── pcbPrinterSaveService.ts   # PCB save/load (S3 + DynamoDB)
│   │   └── config/
│   │       ├── config.json                # Active config (gitignored)
│   │       ├── config.json.template       # Template for set-config.sh
│   │       └── config.ts                  # Config TypeScript type
│   └── scripts/
│       ├── deploy.sh      # Build + S3 sync + CloudFront invalidation + version bump
│       └── set-config.sh  # Populate config.json from CloudFormation outputs
│
└── infra/                 # AWS CDK infrastructure
    ├── bin/
    │   └── infra.ts       # CDK app entry point
    ├── lambda/
    │   └── list-devices/  # IoT device listing Lambda
    └── lib/
        ├── certificate-stack.ts      # ACM certificates (us-east-1)
        ├── cloudfront-stack.ts       # CloudFront + S3 web hosting
        ├── cognito-stack.ts          # User Pool + Identity Pool + branding
        ├── firmware-bucket-stack.ts  # S3 bucket for firmware + processor Lambda
        ├── pcbprinter-stack.ts       # S3 bucket + DynamoDB for PCB saves
        ├── api-stack.ts              # API Gateway + list-devices Lambda
        └── websocket-stack.ts        # WebSocket API for device commands
```

---

## sandbox-app (React Web App)

### Tech Stack

- **Framework**: React 19 with TypeScript
- **Auth**: AWS Cognito via `react-oidc-context`
- **AWS SDK**: S3 client, DynamoDB, Cognito Identity
- **Bluetooth**: Web Bluetooth API
- **PCB**: `pcbprinter` local library (manifold-3d based STL generation)

### Key Services

#### BluetoothService (`src/services/bluetoothService.ts`)

Web Bluetooth communication with ESP32 devices.

**BLE UUIDs:**
```
OTA Service:    99db6ea6-27e4-434d-aafd-795cf95feb06
Command Char:   1ac886a6-5fff-41ea-9b11-25a7dcb93a7e
Status Char:    5f5979f3-f1a6-4ce7-8360-e249c2e9333d
```

#### FirmwareService (`src/services/firmwareService.ts`)

S3 access for firmware manifest and downloads. Uses Cognito Identity Pool credentials.

#### pcbPrinterSaveService (`src/services/pcbPrinterSaveService.ts`)

Save/load PCB printer outputs to S3 + DynamoDB:
- SHA-256 deduplication: files uploaded only if not already present (HeadObject before Put)
- **Note:** S3 returns 403 (not 404) for HeadObject when `s3:ListBucket` is absent — treated as "not found"
- `getVersionNumbers`: queries GSI `filename-index` to determine major/minor version
- Major increments when SVG content hash changes; minor = count of saves with same major

### PCB Printer (`PCBPrinterPage.tsx`)

Loads a Fritzing SVG → generates PCB and Press STLs via `pcbprinter` library.

**`{version}` placeholder**: The SVG can contain `<text id="label">{version}</text>` — during Generate it renders literally; during Save the version is resolved to `{major}.{minor}` and STLs are re-generated with the stamped version in the geometry.

### Authentication Flow

1. User signs in via Cognito Hosted UI (OIDC) at `auth0.sandbox.nakomis.com`
2. `react-oidc-context` handles token management
3. ID token exchanged for Cognito Identity credentials
4. Identity credentials used for S3, DynamoDB, API Gateway access

### Build & Deploy

```bash
cd sandbox-app

# Development
npm start

# Deploy (patch bump by default)
AWS_PROFILE=nakom.is-sandbox bash scripts/deploy.sh
AWS_PROFILE=nakom.is-sandbox bash scripts/deploy.sh --minor
AWS_PROFILE=nakom.is-sandbox bash scripts/deploy.sh --major
```

The deploy script aborts if `node_modules/pcbprinter` is a `-SNAPSHOT`. After releasing pcbprinter, run `npm install` first.

---

## infra (AWS CDK)

### CDK Stacks

| Stack | Region | Resources |
|-------|--------|-----------|
| `SandboxCertificateStack` | us-east-1 | ACM certificates for CloudFront + Cognito |
| `SandboxCloudfrontStack` | eu-west-2 | CloudFront distribution, S3 web bucket, Route53 |
| `SandboxCognitoStack` | eu-west-2 | User Pool, Identity Pool, custom domain, managed login branding |
| `SandboxFirmwareBucketStack` | eu-west-2 | S3 firmware bucket, processor Lambda |
| `SandboxPcbPrinterStack` | eu-west-2 | S3 bucket `nakomis-pcbprinter-saves`, DynamoDB `pcbprinter-saves` (30-day TTL) |
| `SandboxApiStack` | eu-west-2 | API Gateway + `SandboxListDevices` Lambda, custom domain `api.sandbox.nakomis.com` |
| `SandboxWebSocketStack` | eu-west-2 | WebSocket API for real-time device commands |

### Key Resources

**Domains:**
- `sandbox.nakomis.com` - Web app (CloudFront)
- `auth0.sandbox.nakomis.com` - Cognito hosted UI
- `api.sandbox.nakomis.com` - REST API

**S3 Buckets:**
- Web hosting bucket (CloudFront stack output)
- `nakomis-firmware-updates` - Firmware storage
- `nakomis-pcbprinter-saves` - PCB STL/SVG saves (30-day lifecycle expiry)

**DynamoDB:**
- `pcbprinter-saves` - PCB save metadata; GSI `filename-index` (partition: `filename`, sort: `timestamp`); TTL attr: `ttl`

**Cognito:**
- User Pool: `SandboxUserPool`
- Identity Pool: `SandboxIdentityPool`
- Managed Login Branding: dark One Dark theme (`colorSchemeMode: DARK`) set via `CfnManagedLoginBranding`

### CDK Commands

**Always use `cdk` directly, never `npx cdk`** — `npx cdk` loses the AWS SSO auth context.

```bash
cd infra

AWS_PROFILE=nakom.is-sandbox cdk synth
AWS_PROFILE=nakom.is-sandbox cdk deploy SandboxCognitoStack
AWS_PROFILE=nakom.is-sandbox cdk deploy --all
AWS_PROFILE=nakom.is-sandbox cdk diff
```

### Stack Dependencies

```
CertificateStack (us-east-1)
       │
       └──► CloudfrontStack
       └──► CognitoStack
                   │
                   └──► FirmwareBucketStack
                   └──► PcbPrinterStack
ApiStack (independent)
WebSocketStack (independent)
```

---

## Common Issues

### S3 HeadObject returns 403 instead of 404
S3 omits 404 detail when `s3:ListBucket` is absent — treat 403 as "not found" in HeadObject catch blocks.

### Cognito login branding resets on CDK deploy
Branding is now fully encoded in `CfnManagedLoginBranding` with `useCognitoProvidedValues: false` and `categories.global.colorSchemeMode: DARK`. Never set `useCognitoProvidedValues: true` — it overwrites custom settings on every deploy.

### Firmware manifest shows stale version
Service worker caching. Check `sw.js` uses network-first for S3 requests.

### Bluetooth connection fails
- Requires HTTPS (secure context)
- Device must advertise as "BootBoots-CatCam" or "BootBoots*"
- Only works in Chrome/Edge (not Safari/Firefox)

### CDK deploy fails with cross-region reference
Ensure `crossRegionReferences: true` is set in stack props. Certificate stack must be in us-east-1 for CloudFront.

---

## Environment Config

### sandbox-app config (`src/config/config.json`)

```json
{
    "env": "sandbox",
    "aws": { "region": "eu-west-2" },
    "cognito": {
        "authority": "https://cognito-idp.eu-west-2.amazonaws.com/eu-west-2_FdqHeJ7ca",
        "userPoolId": "eu-west-2_FdqHeJ7ca",
        "userPoolClientId": "436c65t8ikkl631fmeo5s6pmjf",
        "cognitoDomain": "auth0.sandbox.nakomis.com",
        "redirectUri": "https://sandbox.nakomis.com/loggedin",
        "logoutUri": "https://sandbox.nakomis.com/logout",
        "identityPoolId": "eu-west-2:f7fcd995-522d-4034-89d4-3ffff91da0bb"
    },
    "imagesBucket": "bootboots-images-975050268859-eu-west-2",
    "pcbPrinter": {
        "bucket": "nakomis-pcbprinter-saves",
        "table": "pcbprinter-saves"
    }
}
```

### AWS Profile

All deploy and CDK commands use `AWS_PROFILE=nakom.is-sandbox`.
