# sandboxsite

BootBoots sandbox — React frontend (`sandbox-app`) + AWS CDK infrastructure (`infra`).

## Versioning

Both the app and infra are versioned independently using `version.json` files with `-SNAPSHOT` suffixes between releases. Versions are visible in the app footer alongside the pcbprinter library version.

### Releasing the React app

```bash
cd sandbox-app
bash scripts/deploy.sh           # patch bump
bash scripts/deploy.sh --minor   # minor bump
bash scripts/deploy.sh --major   # major bump
```

Or via npm:

```bash
cd sandbox-app && npm run deploy -- --minor
```

The deploy script:
1. Reads `sandbox-app/version.json`, strips `-SNAPSHOT` → release version
2. **Aborts if `node_modules/pcbprinter` is a `-SNAPSHOT`** — release pcbprinter first, then `npm install`
3. Builds the React app (after running `set-config.sh sandbox` for AWS config)
4. Commits and tags `sandbox/x.y.z`
5. Syncs to S3, invalidates CloudFront
6. Bumps `version.json` to next `-SNAPSHOT`, commits, pushes with tags

### Releasing the infra

```bash
cd infra && npm run deploy           # patch bump
cd infra && npm run deploy -- --minor
```

The deploy script:
1. Reads `infra/version.json`, strips `-SNAPSHOT` → release version
2. Runs `cdk synth` (validates before committing)
3. Commits and tags `sandbox-infra/x.y.z`
4. Runs `cdk deploy --all`
5. Bumps `version.json` to next `-SNAPSHOT`, commits, pushes with tags

### Updating the pcbprinter dependency

pcbprinter is a local `file:` path dep (`../../pcbprinter`). After releasing pcbprinter:

```bash
cd sandbox-app && npm install
```

This records the new release version in `package-lock.json`. The deploy script checks `node_modules/pcbprinter/package.json` (not the source `version.json`) — so `npm install` must be run before deploying if pcbprinter has been updated.

## AWS profile

Both deploy scripts use `AWS_PROFILE=nakom.is-sandbox`.
