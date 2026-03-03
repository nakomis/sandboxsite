import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { CloudfrontStack } from '../lib/cloudfront-stack';
import * as cm from 'aws-cdk-lib/aws-certificatemanager';

function buildTemplate(): Template {
    const app = new cdk.App({
        context: {
            'hosted-zone:account=123456789012:domainName=sandbox.nakomis.com:region=eu-west-2': {
                Id: '/hostedzone/ZXXXXXXXXXXXXX',
                Name: 'sandbox.nakomis.com.',
            },
        },
    });
    const certStub = new cdk.Stack(app, 'CertStub', {
        env: { account: '123456789012', region: 'us-east-1' },
    });
    const certificate = cm.Certificate.fromCertificateArn(
        certStub, 'StubCert',
        'arn:aws:acm:us-east-1:123456789012:certificate/stub'
    ) as unknown as cm.Certificate;

    const stack = new CloudfrontStack(app, 'TestCloudfrontStack', {
        env: { account: '123456789012', region: 'eu-west-2' },
        crossRegionReferences: true,
        certificate,
        domainName: 'sandbox.nakomis.com',
        allowedIp: 'TEST_ALLOWED_IP',
    });
    return Template.fromStack(stack);
}

let template: Template;

beforeAll(() => {
    template = buildTemplate();
});

test('SQS Queue Created', () => {
    // placeholder
});

test('CloudFront Function exists with JS_2_0 runtime', () => {
    template.hasResourceProperties('AWS::CloudFront::Function', {
        FunctionConfig: {
            Runtime: 'cloudfront-js-2.0',
        },
    });
});

test('Distribution default behaviour has VIEWER_REQUEST function association', () => {
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
            DefaultCacheBehavior: {
                FunctionAssociations: [
                    {
                        EventType: 'viewer-request',
                    },
                ],
            },
        },
    });
});
