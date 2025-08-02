import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface FirmwareBucketStackProps extends cdk.StackProps {
    userRole: iam.Role;
}

export class FirmwareBucketStack extends cdk.Stack {
    readonly firmwareBucket: s3.Bucket;

    constructor(scope: Construct, id: string, props: FirmwareBucketStackProps) {
        super(scope, id, props);

        // Create the firmware bucket
        this.firmwareBucket = new s3.Bucket(this, 'BootBootsFirmwareBucket', {
            bucketName: 'bootboots-firmware-updates',
            versioned: true,
            encryption: s3.BucketEncryption.S3_MANAGED,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
            cors: [
                {
                    allowedHeaders: ['*'],
                    allowedMethods: [
                        s3.HttpMethods.GET,
                        s3.HttpMethods.PUT,
                        s3.HttpMethods.POST,
                        s3.HttpMethods.DELETE,
                        s3.HttpMethods.HEAD
                    ],
                    allowedOrigins: [
                        'https://sandbox.nakomis.com',
                        'http://localhost:3000' // For local development
                    ],
                    exposedHeaders: [],
                    maxAge: 3600
                }
            ],
            lifecycleRules: [
                {
                    id: 'DeleteOldVersions',
                    enabled: true,
                    noncurrentVersionExpiration: cdk.Duration.days(90),
                },
                {
                    id: 'DeleteIncompleteUploads',
                    enabled: true,
                    abortIncompleteMultipartUploadAfter: cdk.Duration.days(1),
                }
            ]
        });

        // Create IAM policy for firmware bucket access
        const firmwareBucketPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                's3:GetObject',
                's3:GetObjectVersion',
                's3:ListBucket',
                's3:ListBucketVersions',
                's3:PutObject',
                's3:PutObjectAcl',
                's3:DeleteObject',
                's3:DeleteObjectVersion',
                's3:GetObjectAttributes'
            ],
            resources: [
                this.firmwareBucket.bucketArn,
                `${this.firmwareBucket.bucketArn}/*`
            ]
        });

        // Create policy for generating signed URLs
        const signedUrlPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                's3:GetObjectPresignedUrl',
                's3:PutObjectPresignedUrl'
            ],
            resources: [
                this.firmwareBucket.bucketArn,
                `${this.firmwareBucket.bucketArn}/*`
            ]
        });

        // Attach policies to the user role
        props.userRole.addToPolicy(firmwareBucketPolicy);
        props.userRole.addToPolicy(signedUrlPolicy);

        // Output the bucket name for reference
        new cdk.CfnOutput(this, 'FirmwareBucketName', {
            value: this.firmwareBucket.bucketName,
            description: 'Name of the BootBoots firmware updates bucket',
            exportName: 'BootBootsFirmwareBucketName'
        });

        new cdk.CfnOutput(this, 'FirmwareBucketArn', {
            value: this.firmwareBucket.bucketArn,
            description: 'ARN of the BootBoots firmware updates bucket',
            exportName: 'BootBootsFirmwareBucketArn'
        });
    }
}
