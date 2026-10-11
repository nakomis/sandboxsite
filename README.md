# sandboxsite

The **Sandbox** panel of [nakomis-shell](https://github.com/nakomis/nakomis-shell) (`app.sandbox.nakomis.com/sandbox`): a scratch space for trying things out (currently the PCB printer). It is **sandbox-only by design**: CI has no prod job and there is no prod role, so nothing here can drift into production. React remote in `sandbox-app`, AWS CDK infrastructure in `infra`.

The BootBoots UI that used to live here moved to [nakomis-bootboots](https://github.com/nakomis/nakomis-bootboots), and firmware/device management to [nakomis-fleet](https://github.com/nakomis/nakomis-fleet).

## Support

If you find this useful, please consider buying me a coffee:

[![Donate with PayPal](https://www.paypalobjects.com/en_GB/i/btn/btn_donate_SM.gif)](https://www.paypal.com/donate?hosted_button_id=Q3BESC73EWVNN&custom=sandboxsite)

## Versioning

Both the app and infra are versioned independently using `version.json` files with `-SNAPSHOT` suffixes between releases. Versions are visible in the app footer alongside the pcbprinter library version.

### Publishing the Sandbox panel

`sandbox-app` is a Vite + Module Federation remote (`sandbox/App`). CI builds it on every PR and publishes it to
`s3://nakomis-shell-sandbox/remotes/sandbox/` on every merge to `main` (sandbox account only). Locally:

```bash
cd sandbox-app && pnpm install && pnpm test && pnpm build   # pnpm dev for a shell-less dev harness
```

AWS access comes from the shell (`getAwsCredentials` on `SandboxIdentityPool`, which trusts the shell's Cognito client).

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

pcbprinter is a local `file:` path dep (`../../pcbprinter`); CI checks it out alongside this repo and builds it.
After changing pcbprinter, run `pnpm install` in `sandbox-app`.

## AWS profile

Both deploy scripts use `AWS_PROFILE=nakom.is-sandbox`.
