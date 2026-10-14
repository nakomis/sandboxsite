#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import * as fs from 'fs';
import { CognitoStack } from '../lib/cognito-stack';
import { PcbPrinterStack } from '../lib/pcbprinter-stack';
import { GithubOidcStack } from '../lib/github-oidc-stack';
import { GithubCiStack } from '../lib/github-ci-stack';

// Sandbox account only: the Sandbox panel of nakomis-shell (app.sandbox.nakomis.com/sandbox). The standalone
// sandbox.nakomis.com (CloudFront, its API, WebSocket, certificates and firmware bucket) was decommissioned under FLEET-4.
const londonEnv = { env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION } };

const app = new cdk.App();

const pcbPrinterStack = new PcbPrinterStack(app, 'SandboxPcbPrinterStack', londonEnv);

new CognitoStack(app, 'SandboxCognitoStack', {
    ...londonEnv,
    pcbPrinterBucket: pcbPrinterStack.bucket,
    pcbPrinterTable: pcbPrinterStack.table,
});

new GithubOidcStack(app, 'SandboxGithubOidcStack', {
    ...londonEnv,
    description: 'GitHub Actions OIDC identity provider for the sandbox account',
});

cdk.Tags.of(app).add("MH-Project", "sandbox.nakomis.com");
const { version: infraVersion } = JSON.parse(fs.readFileSync('./version.json', 'utf-8'));
cdk.Tags.of(app).add("MH-Version", infraVersion);

new GithubCiStack(app, 'SandboxGithubCiStack', londonEnv);
