#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { CloudfrontStack } from '../lib/cloudfront-stack';
import { CertificateStack } from '../lib/certificate-stack';
import { CognitoStack } from '../lib/cognito-stack';
import { S3 } from 'aws-cdk-lib/aws-ses-actions';

const londonEnv = { env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION } };
const nvirginiaEnv = { env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'us-east-1' } };
const domainName = `sandbox.nakomis.com`
const apiDomain = `api.sandbox.nakomis.com`;
const authDomain = `auth0.${domainName}`;

const app = new cdk.App();
const certificateStack = new CertificateStack(app, 'SandboxCertificateStack', {
    ...nvirginiaEnv,
    domainName: domainName,
    authDomain: authDomain,
    apiDomain: apiDomain,
});
const cloudfrontStack = new CloudfrontStack(app, 'SandboxCloudfrontStack', {
    ...londonEnv,
    certificate: certificateStack.certificate,
    domainName: domainName,
    crossRegionReferences: true
});
const cognitoStack = new CognitoStack(app, 'SandboxCognitoStack', {
    ...londonEnv,
    authDomainName: authDomain,
    domainName: domainName,
    authCertificateArn: certificateStack.authCertificate,
    crossRegionReferences: true
});
