import { Credentials as AWSCredentials } from "@aws-sdk/client-cognito-identity";
import {
    ConditionalCheckFailedException,
    DynamoDBClient,
    ScanCommand,
    ScanCommandOutput,
} from "@aws-sdk/client-dynamodb";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import Config from "../config/config";
import { BoundingBox, BoundingPoint, CatadataRecord } from "../dto/CatadataRecord";

const TABLE = "catadata";

const BOUNDABLE_CATS = ["Boots", "Chi", "Kappa", "Mu", "Tau", "NoCat"];

export type CatBoundingStats = {
    sorted: number;
    bounded: number;
};

function makeDdbClient(creds: AWSCredentials): DynamoDBClient {
    return new DynamoDBClient({
        region: Config.aws.region,
        credentials: {
            accessKeyId: creds.AccessKeyId!,
            secretAccessKey: creds.SecretKey!,
            sessionToken: creds.SessionToken,
        },
    });
}

// ---------------------------------------------------------------------------
// Stats: scan all labeled records and compute per-cat sorted / bounded counts
// ---------------------------------------------------------------------------

export async function getBoundingStats(
    creds: AWSCredentials
): Promise<Record<string, CatBoundingStats>> {
    const client = makeDdbClient(creds);
    const stats: Record<string, CatBoundingStats> = {};
    for (const cat of BOUNDABLE_CATS) {
        stats[cat] = { sorted: 0, bounded: 0 };
    }

    const command = new ScanCommand({
        TableName: TABLE,
        FilterExpression: "#cat IN (:boots,:chi,:kappa,:mu,:tau,:nocat)",
        ExpressionAttributeNames: { "#cat": "cat" },
        ExpressionAttributeValues: {
            ":boots": { S: "Boots" },
            ":chi":   { S: "Chi" },
            ":kappa": { S: "Kappa" },
            ":mu":    { S: "Mu" },
            ":tau":   { S: "Tau" },
            ":nocat": { S: "NoCat" },
        },
        ProjectionExpression: "#cat, boundingBox",
    });

    let result: ScanCommandOutput = await client.send(command);
    const processPage = (output: ScanCommandOutput) => {
        output.Items?.forEach(item => {
            const cat = item.cat?.S;
            if (cat && stats[cat]) {
                stats[cat].sorted++;
                if (item.boundingBox) stats[cat].bounded++;
            }
        });
    };

    processPage(result);
    while (result.LastEvaluatedKey) {
        command.input.ExclusiveStartKey = result.LastEvaluatedKey;
        result = await client.send(command);
        processPage(result);
    }

    return stats;
}

// ---------------------------------------------------------------------------
// Fetch image from S3 (same as CatadataService.getCatPicture)
// ---------------------------------------------------------------------------

export async function getBoundingImage(
    creds: AWSCredentials,
    record: CatadataRecord
): Promise<Blob> {
    const s3 = new S3Client({
        region: Config.aws.region,
        credentials: {
            accessKeyId: creds.AccessKeyId!,
            secretAccessKey: creds.SecretKey!,
            sessionToken: creds.SessionToken!,
        },
    });
    const key = record.imageName.startsWith("catcam-training/")
        ? record.imageName
        : `catcam-training/${record.imageName}`;

    const response = await s3.send(
        new GetObjectCommand({ Bucket: Config.bootboots.imagesBucket, Key: key })
    );
    const stream = response.Body as ReadableStream;
    return new Response(stream).blob();
}

// ---------------------------------------------------------------------------
// Claim the next unbounded image for a given cat
// ---------------------------------------------------------------------------

export async function claimNextUnbounded(
    creds: AWSCredentials,
    cat: string,
    user: string
): Promise<CatadataRecord | null> {
    const client = makeDdbClient(creds);

    // Scan for labeled records for this cat that have no bounding box yet
    const scan = new ScanCommand({
        TableName: TABLE,
        FilterExpression: "#cat = :cat AND attribute_not_exists(boundingBox)",
        ExpressionAttributeNames: { "#cat": "cat" },
        ExpressionAttributeValues: { ":cat": { S: cat } },
    });

    let candidates: CatadataRecord[] = [];
    let result: ScanCommandOutput = await client.send(scan);

    const extractRecords = (output: ScanCommandOutput) => {
        output.Items?.forEach(item => {
            if (item.imageName?.S && item.uuid?.S) {
                candidates.push({
                    imageName: item.imageName.S,
                    uuid: item.uuid.S,
                    cat: item.cat?.S,
                    user: item.user?.S,
                });
            }
        });
    };

    extractRecords(result);
    while (result.LastEvaluatedKey) {
        scan.input.ExclusiveStartKey = result.LastEvaluatedKey;
        result = await client.send(scan);
        extractRecords(result);
    }

    if (!candidates.length) return null;

    // Shuffle so multiple users don't always race for the same record
    candidates = candidates.sort(() => Math.random() - 0.5);

    for (const record of candidates) {
        try {
            await client.send(new UpdateCommand({
                TableName: TABLE,
                Key: { imageName: record.imageName, uuid: record.uuid },
                UpdateExpression: "SET #user = :user, #claimedAt = :claimedAt",
                ConditionExpression: "attribute_not_exists(boundingBox)",
                ExpressionAttributeNames: { "#user": "user", "#claimedAt": "claimedAt" },
                ExpressionAttributeValues: {
                    ":user": user,
                    ":claimedAt": new Date().toISOString(),
                },
            }));
            record.user = user;
            record.claimedAt = new Date().toISOString();
            return record;
        } catch (err) {
            if (err instanceof ConditionalCheckFailedException) continue;
            throw err;
        }
    }

    return null;
}

// ---------------------------------------------------------------------------
// Save bounding box + points to DynamoDB
// ---------------------------------------------------------------------------

export async function saveBoundingData(
    creds: AWSCredentials,
    record: CatadataRecord,
    boundingBox: BoundingBox,
    points: BoundingPoint[],
    user: string
): Promise<void> {
    const client = makeDdbClient(creds);
    await client.send(new UpdateCommand({
        TableName: TABLE,
        Key: { imageName: record.imageName, uuid: record.uuid },
        UpdateExpression:
            "SET boundingBox = :bbox, boundingPoints = :pts, boundedAt = :at, boundedBy = :by",
        ExpressionAttributeValues: {
            ":bbox": boundingBox,
            ":pts":  points,
            ":at":   new Date().toISOString(),
            ":by":   user,
        },
    }));
}

// ---------------------------------------------------------------------------
// Remove the cat label so the image re-enters the Cat Labeling queue
// ---------------------------------------------------------------------------

export async function unlabelRecord(
    creds: AWSCredentials,
    record: CatadataRecord
): Promise<void> {
    const client = makeDdbClient(creds);
    await client.send(new UpdateCommand({
        TableName: TABLE,
        Key: { imageName: record.imageName, uuid: record.uuid },
        UpdateExpression: "REMOVE #cat",
        ExpressionAttributeNames: { "#cat": "cat" },
    }));
}

export { BOUNDABLE_CATS };
