import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cf from 'aws-cdk-lib/aws-cloudfront';
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import * as cm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { RemovalPolicy } from 'aws-cdk-lib';
import * as targets from 'aws-cdk-lib/aws-route53-targets';

export interface CloudfrontStackProps extends cdk.StackProps {
    certificate: cm.Certificate,
    domainName: string,
}

export class CloudfrontStack extends cdk.Stack {
    readonly distribution: cf.Distribution;
    readonly bucket: s3.Bucket;

    constructor(scope: Construct, id: string, props: CloudfrontStackProps) {
        super(scope, id, props);

        this.bucket = new s3.Bucket(this, 'SandboxBucket', {
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            encryption: s3.BucketEncryption.S3_MANAGED,
            enforceSSL: true,
            versioned: true,
            removalPolicy: RemovalPolicy.RETAIN,
        });

        this.distribution = new cf.Distribution(this, "SandboxDistribution", {
            comment: 'Nakomis Sandbox Distribution',
            defaultBehavior: {
                origin: S3BucketOrigin.withOriginAccessControl(this.bucket),
                viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            },
            domainNames: [props.domainName],
            certificate: props.certificate,
            defaultRootObject: '/index.html',
            errorResponses: [
                {
                    httpStatus: 403,
                    responseHttpStatus: 200,
                    responsePagePath: '/index.html',
                }
            ]
        });

        const hostedZone = route53.HostedZone.fromLookup(this, 'HostedZoneLookup', {
            domainName: props.domainName
        });

        new route53.ARecord(this, `Sandbox-${hostedZone.zoneName}AAliasRecord`, {
            recordName: props.domainName,
            zone: hostedZone,
            target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(this.distribution))
        });

        new route53.AaaaRecord(this, `Sandbox-${hostedZone.zoneName}AaaaAliasRecord`, {
            recordName: props.domainName,
            zone: hostedZone,
            target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(this.distribution))
        });

        new cdk.CfnOutput(this, 'SandboxSiteBucketName', {
            value: this.bucket.bucketName,
            description: 'Name of the Sandbox Site S3 bucket',
            exportName: 'SandboxSiteBucketName'
        });

        new cdk.CfnOutput(this, 'SandboxSiteDistributionId', {
            value: this.distribution.distributionId,
            description: 'ID of the Sandbox Site Cloudfront Distribution',
            exportName: 'SandboxSiteDistributionId'
        });
    }
}
