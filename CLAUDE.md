# Claude Code Context - Sandboxsite

## Project Overview

- **sandbox-app/** - the Sandbox panel of nakomis-shell (Vite + Module Federation remote; PCB printer). Sandbox-only: never add a prod deploy.
- **infra/** - AWS CDK for the panel's back end (sandbox account only).

**Live URL:** https://app.sandbox.nakomis.com/sandbox

The standalone sandbox.nakomis.com (CRA build, its own Cognito pool at `auth0.sandbox.nakomis.com`, `api.` and `ws.sandbox.nakomis.com`, and the `nakomis-firmware-updates` bucket) was decommissioned under FLEET-4. BootBoots UI → nakomis-bootboots; firmware and devices → nakomis-fleet.

## Related Projects

- **pcbprinter** (`../pcbprinter`) - converts Fritzing SVG exports to 3D-printable STLs. Used as a local `file:` dependency.
- **nakomis-shell** - the host app; `sandbox-app/src/shell-contract.ts` is a copy of its contract.

## sandbox-app

- `ShellApp.tsx` is the exposed `sandbox/App`; it takes `ShellContext` props from the shell.
- Users sign in to the shell (shared nakomis-infra pool). The panel exchanges the shell's ID token with `SandboxIdentityPool` for AWS credentials.
- `PCBPrinterPage.tsx` loads a Fritzing SVG and generates PCB and Press STLs. A `<text id="label">{version}</text>` in the SVG renders literally on Generate; on Save it becomes `{major}.{minor}` and the STLs are regenerated with it.
- `services/pcbPrinterSaveService.ts` saves to S3 + DynamoDB (`pcbprinter-saves`):
  - SHA-256 dedup: HeadObject before Put. S3 returns 403 (not 404) without `s3:ListBucket`, which is treated as "not found".
  - Major version increments when the SVG hash changes; minor counts saves within a major (GSI `filename-index`).

```bash
cd sandbox-app
npm run dev        # standalone dev server
npm test && npm run build
```

CI publishes the build to the sandbox shell's bucket under `remotes/sandbox/`.

## infra (AWS CDK)

| Stack | What |
|-------|------|
| `SandboxPcbPrinterStack` | PCB printer S3 bucket + DynamoDB table |
| `SandboxCognitoStack` | `SandboxIdentityPool` (trusts the shell's client) and the role scoped to the PCB printer store |
| `SandboxGithubOidcStack` | GitHub Actions OIDC provider for the sandbox account |
| `SandboxGithubCiStack` | CI role (publish to the sandbox shell only) |

```bash
cd infra
npm test
AWS_PROFILE=nakom.is-sandbox npx cdk diff
npm run deploy     # bumps version, deploys
```

All commands use `AWS_PROFILE=nakom.is-sandbox`.
