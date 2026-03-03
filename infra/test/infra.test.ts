import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as cm from 'aws-cdk-lib/aws-certificatemanager';
import { CloudfrontStack } from '../lib/cloudfront-stack';

// example test. To run these tests, uncomment this file along with the
// example resource in lib/infra-stack.ts
test('SQS Queue Created', () => {
//   const app = new cdk.App();
//     // WHEN
//   const stack = new Infra.InfraStack(app, 'MyTestStack');
//     // THEN
//   const template = Template.fromStack(stack);

//   template.hasResourceProperties('AWS::SQS::Queue', {
//     VisibilityTimeout: 300
//   });
});

function buildTemplate(): Template {
    const app = new cdk.App({
        context: {
            // Provide the cached hosted zone lookup so that HostedZone.fromLookup
            // does not attempt a real AWS API call during synthesis.
            'hosted-zone:account=123456789012:domainName=sandbox.nakomis.com:region=eu-west-2': {
                Id: '/hostedzone/ZXXXXXXXXXXXXX',
                Name: 'sandbox.nakomis.com.',
            },
        },
    });

    const stubCert = cm.Certificate.fromCertificateArn(
        new cdk.Stack(app, 'CertStub', { env: { account: '123456789012', region: 'eu-west-2' } }),
        'StubCert',
        'arn:aws:acm:us-east-1:123456789012:certificate/00000000-0000-0000-0000-000000000000'
    );

    const stack = new CloudfrontStack(app, 'TestCloudfrontStack', {
        env: { account: '123456789012', region: 'eu-west-2' },
        certificate: stubCert as unknown as cm.Certificate,
        domainName: 'sandbox.nakomis.com',
    });

    return Template.fromStack(stack);
}

test('CloudFront Function exists with JS_2_0 runtime', () => {
    const template = buildTemplate();

    template.hasResourceProperties('AWS::CloudFront::Function', {
        FunctionConfig: {
            Runtime: 'cloudfront-js-2.0',
        },
    });
});

test('Distribution default behaviour has VIEWER_REQUEST function association', () => {
    const template = buildTemplate();

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
