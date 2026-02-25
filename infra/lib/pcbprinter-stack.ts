import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export const PCB_PRINTER_BUCKET_NAME = 'nakomis-pcbprinter-saves';
export const PCB_PRINTER_TABLE_NAME = 'pcbprinter-saves';

export class PcbPrinterStack extends cdk.Stack {
    readonly bucket: s3.Bucket;
    readonly table: dynamodb.Table;

    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        this.bucket = new s3.Bucket(this, 'PcbPrinterSavesBucket', {
            bucketName: PCB_PRINTER_BUCKET_NAME,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            encryption: s3.BucketEncryption.S3_MANAGED,
            enforceSSL: true,
            cors: [
                {
                    allowedHeaders: ['*'],
                    allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT, s3.HttpMethods.HEAD],
                    allowedOrigins: [
                        'https://sandbox.nakomis.com',
                        'http://localhost:3000',
                    ],
                },
            ],
            lifecycleRules: [
                {
                    id: 'ExpireAfter30Days',
                    enabled: true,
                    expiration: cdk.Duration.days(30),
                },
            ],
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });

        this.table = new dynamodb.Table(this, 'PcbPrinterSavesTable', {
            tableName: PCB_PRINTER_TABLE_NAME,
            partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            timeToLiveAttribute: 'ttl',
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });

        this.table.addGlobalSecondaryIndex({
            indexName: 'filename-index',
            partitionKey: { name: 'filename', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
            projectionType: dynamodb.ProjectionType.ALL,
        });

        new cdk.CfnOutput(this, 'PcbPrinterBucketName', {
            value: this.bucket.bucketName,
            exportName: 'PcbPrinterBucketName',
        });

        new cdk.CfnOutput(this, 'PcbPrinterTableName', {
            value: this.table.tableName,
            exportName: 'PcbPrinterTableName',
        });
    }
}
