import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, ScanCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { Sha256 } from '@aws-crypto/sha256-js';
import { Credentials as AWSCredentials } from '@aws-sdk/client-cognito-identity';
import Config from '../config/config';
import type { PcbSaveRecord } from '../dto/PcbSaveRecord';

const REGION = Config.aws.region;

function makeS3Client(creds: AWSCredentials): S3Client {
    return new S3Client({
        region: REGION,
        credentials: {
            accessKeyId: creds.AccessKeyId!,
            secretAccessKey: creds.SecretKey!,
            sessionToken: creds.SessionToken,
        },
    });
}

function makeDdbClient(creds: AWSCredentials): DynamoDBDocumentClient {
    const ddb = new DynamoDBClient({
        region: REGION,
        credentials: {
            accessKeyId: creds.AccessKeyId!,
            secretAccessKey: creds.SecretKey!,
            sessionToken: creds.SessionToken,
        },
    });
    return DynamoDBDocumentClient.from(ddb);
}

export async function hashBuffer(data: ArrayBuffer | string): Promise<string> {
    const hash = new Sha256();
    if (typeof data === 'string') {
        hash.update(new TextEncoder().encode(data));
    } else {
        hash.update(new Uint8Array(data));
    }
    const digest = await hash.digest();
    return Array.from(digest).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function headExists(bucket: string, key: string, creds: AWSCredentials): Promise<boolean> {
    const s3 = makeS3Client(creds);
    try {
        await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return true;
    } catch (err: unknown) {
        const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
        // 403 with no ListBucket: S3 can't confirm non-existence — treat as missing
        if (e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404 || e.$metadata?.httpStatusCode === 403) return false;
        throw err;
    }
}

export async function uploadIfAbsent(
    bucket: string,
    key: string,
    body: string | ArrayBuffer,
    contentType: string,
    creds: AWSCredentials,
): Promise<void> {
    if (await headExists(bucket, key, creds)) return;
    const s3 = makeS3Client(creds);
    const bodyBytes = typeof body === 'string' ? new TextEncoder().encode(body) : new Uint8Array(body);
    await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: bodyBytes,
        ContentType: contentType,
    }));
}

export async function getVersionNumbers(
    filename: string,
    svgHash: string,
    creds: AWSCredentials,
): Promise<{ major: number; minor: number }> {
    const ddb = makeDdbClient(creds);
    const result = await ddb.send(new QueryCommand({
        TableName: Config.pcbPrinter.table,
        IndexName: 'filename-index',
        KeyConditionExpression: '#fn = :fn',
        ExpressionAttributeNames: { '#fn': 'filename' },
        ExpressionAttributeValues: { ':fn': filename },
    }));

    const records = (result.Items ?? []) as PcbSaveRecord[];
    if (records.length === 0) {
        return { major: 1, minor: 0 };
    }

    // Find existing major for this SVG hash
    const matchingMajors = records.filter(r => r.svgHash === svgHash).map(r => r.majorVersion);
    let major: number;
    if (matchingMajors.length > 0) {
        major = matchingMajors[0];
    } else {
        const allMajors = records.map(r => r.majorVersion);
        major = Math.max(...allMajors) + 1;
    }

    const minor = records.filter(r => r.majorVersion === major).length;
    return { major, minor };
}

export async function saveRecord(record: PcbSaveRecord, creds: AWSCredentials): Promise<void> {
    const ddb = makeDdbClient(creds);
    await ddb.send(new PutCommand({
        TableName: Config.pcbPrinter.table,
        Item: record,
    }));
}

export async function loadRecords(creds: AWSCredentials): Promise<PcbSaveRecord[]> {
    const ddb = makeDdbClient(creds);
    const result = await ddb.send(new ScanCommand({
        TableName: Config.pcbPrinter.table,
    }));
    const records = (result.Items ?? []) as PcbSaveRecord[];
    return records.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export async function downloadFromS3(bucket: string, key: string, creds: AWSCredentials): Promise<ArrayBuffer> {
    const s3 = makeS3Client(creds);
    const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const bytes = await response.Body!.transformToByteArray();
    return bytes.buffer;
}
