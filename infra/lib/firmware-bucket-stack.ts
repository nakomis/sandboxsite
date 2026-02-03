import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';

export const FIRMWARE_BUCKET_NAME = 'nakomis-firmware-updates';

export class FirmwareBucketStack extends cdk.Stack {
    readonly firmwareBucket: s3.Bucket;

    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        // Create the firmware bucket
        this.firmwareBucket = new s3.Bucket(this, 'FirmwareBucket', {
            bucketName: FIRMWARE_BUCKET_NAME,
            versioned: true,
            encryption: s3.BucketEncryption.S3_MANAGED,
            // Allow public read access for firmware downloads (ESP32 devices)
            blockPublicAccess: new s3.BlockPublicAccess({
                blockPublicAcls: true,
                blockPublicPolicy: false, // Allow bucket policy for public read
                ignorePublicAcls: true,
                restrictPublicBuckets: false
            }),
            publicReadAccess: false, // We'll control via bucket policy instead
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

        // Add bucket policy to allow public read access to firmware files
        // This allows ESP32 devices to download firmware without authentication
        this.firmwareBucket.addToResourcePolicy(new iam.PolicyStatement({
            sid: 'PublicReadFirmware',
            effect: iam.Effect.ALLOW,
            principals: [new iam.AnyPrincipal()],
            actions: ['s3:GetObject'],
            resources: [`${this.firmwareBucket.bucketArn}/*`]
        }));

        // Create CloudWatch Logs group for the Lambda
        const processorLambdaLogGroup = new logs.LogGroup(this, 'FirmwareProcessorLogGroup', {
            logGroupName: '/aws/lambda/FirmwareProcessorLambda',
            retention: logs.RetentionDays.SIX_MONTHS,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });

        // Create the Lambda function that processes firmware uploads
        // (generates manifests and cleans up old versions)
        const processorLambda = new NodejsFunction(this, 'FirmwareProcessorFunction', {
            functionName: 'FirmwareProcessorLambda',
            runtime: lambda.Runtime.NODEJS_22_X,
            entry: `${__dirname}/../lambda/firmware-processor/src/handler.ts`,
            handler: 'handler',
            logGroup: processorLambdaLogGroup,
            timeout: cdk.Duration.seconds(60),
            memorySize: 256,
            environment: {
                BUCKET_NAME: this.firmwareBucket.bucketName,
            },
            bundling: {
                minify: true,
                sourceMap: false,
                target: 'node22',
                externalModules: [
                    '@aws-sdk/client-s3', // Use AWS SDK v3 from Lambda runtime
                ],
            },
        });

        // Grant S3 permissions to the Lambda
        processorLambda.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                's3:ListBucket',
                's3:GetObject',
                's3:GetObjectMetadata',
                's3:DeleteObject',
                's3:PutObject',
            ],
            resources: [
                this.firmwareBucket.bucketArn,
                `${this.firmwareBucket.bucketArn}/*`,
            ],
        }));

        // Add S3 event notification to trigger Lambda on firmware uploads
        this.firmwareBucket.addEventNotification(
            s3.EventType.OBJECT_CREATED,
            new s3n.LambdaDestination(processorLambda),
            {
                suffix: 'firmware.bin',
            }
        );

        // Output the bucket name for reference
        new cdk.CfnOutput(this, 'FirmwareBucketName', {
            value: this.firmwareBucket.bucketName,
            description: 'Name of the Nakomis firmware updates bucket',
        });

        new cdk.CfnOutput(this, 'FirmwareBucketArn', {
            value: this.firmwareBucket.bucketArn,
            description: 'ARN of the Nakomis firmware updates bucket',
        });

        new cdk.CfnOutput(this, 'ProcessorLambdaName', {
            value: processorLambda.functionName,
            description: 'Name of the firmware processor Lambda function',
        });

        new cdk.CfnOutput(this, 'ProcessorLambdaArn', {
            value: processorLambda.functionArn,
            description: 'ARN of the firmware processor Lambda function',
        });
    }
}
