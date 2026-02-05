import {
    Credentials as AWSCredentials,
} from "@aws-sdk/client-cognito-identity";
import Config from "../config/config";
import { ConditionalCheckFailedException, DynamoDBClient, ScanCommand, ScanCommandOutput } from "@aws-sdk/client-dynamodb";
import { CatadataRecord } from "../dto/CatadataRecord";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import {
    GetObjectCommand,
    S3Client,
} from "@aws-sdk/client-s3";

export type CatadataProps = {
    creds: AWSCredentials;
}

const getCatPicture = async (creds: AWSCredentials, record: CatadataRecord): Promise<ReadableStream> => {
    const s3Client = new S3Client({
        region: Config.aws.region,
        credentials: {
            accessKeyId: creds.AccessKeyId!,
            secretAccessKey: creds.SecretKey!,
            sessionToken: creds.SessionToken!,
        },
    });

    // Images are stored in the bootboots images bucket under the catcam-training/ prefix
    const key = record.imageName.startsWith('catcam-training/')
        ? record.imageName
        : `catcam-training/${record.imageName}`;

    const response = await s3Client.send(
        new GetObjectCommand({
            Bucket: Config.bootboots.imagesBucket,
            Key: key,
        }),
    );

    return response.Body as ReadableStream;
}

const getCatadataRecords = async (creds: AWSCredentials): Promise<CatadataRecord[]> => {
    if (!creds) {
        throw new Error("Credentials are required to fetch catadata records.");
    }
    const client = new DynamoDBClient({
        region: Config.aws.region,
        credentials: {
            accessKeyId: creds.AccessKeyId!,
            secretAccessKey: creds.SecretKey!,
            sessionToken: creds.SessionToken,
        },
    });

    const command = new ScanCommand({
        FilterExpression: "attribute_not_exists(#cat) OR #cat = :emptyString",
        TableName: "catadata",
        ExpressionAttributeNames: {
            "#cat": "cat"
        },
        ExpressionAttributeValues: {
            ":emptyString": { S: "" }
        }
    });
    let records: CatadataRecord[] = [];
    try {
        var result: ScanCommandOutput = await client.send(command);
        result.Items?.forEach(item => {
            if (item.imageName && item.uuid) {
                records.push({
                    imageName: item.imageName.S!,
                    uuid: item.uuid.S!,
                    user: item.user?.S,
                    cat: item.cat?.S,
                    reviewedAt: item.reviewedAt?.S,
                });
            }
        });
        while (result.LastEvaluatedKey) {
            command.input.ExclusiveStartKey = result.LastEvaluatedKey;
            const nextResult: ScanCommandOutput = await client.send(command);
            nextResult.Items?.forEach(item => {
                if (item.imageName && item.uuid) {
                    records.push({
                        imageName: item.imageName.S!,
                        uuid: item.uuid.S!,
                        user: item.user?.S,
                        cat: item.cat?.S,
                        reviewedAt: item.reviewedAt?.S,
                    });
                }
            });
            result = nextResult;
        }
    } catch (err) {
        console.error("DynamoDB scan error:", err);
    }

    return records;
}

const claimRecord = async (records: CatadataRecord[], creds: AWSCredentials, user: string): Promise<CatadataRecord | null> => {
    if (!creds) {
        throw new Error("Credentials are required to claim a record.");
    }
    const client = new DynamoDBClient({
        region: Config.aws.region,
        credentials: {
            accessKeyId: creds.AccessKeyId!,
            secretAccessKey: creds.SecretKey!,
            sessionToken: creds.SessionToken,
        },
    });

    var recordToClaim: CatadataRecord | null = null;;

    while (!recordToClaim) {
        var testRecord = records.pop();
        if (!testRecord) {
            break;
        }

        testRecord.user = user;
        testRecord.claimedAt = new Date().toISOString();

        const command = new UpdateCommand({
            TableName: "catadata",
            Key: {
                imageName: testRecord.imageName,
                uuid: testRecord.uuid,
            },
            UpdateExpression: "SET #user = :user, #claimedAt = :claimedAt",
            ConditionExpression: "attribute_not_exists(#cat) OR #cat = :emptyString",
            ExpressionAttributeNames: {
                "#user": "user",
                "#claimedAt": "claimedAt",
                "#cat": "cat",
            },
            ExpressionAttributeValues: {
                ":user": testRecord.user,
                ":claimedAt": testRecord.claimedAt,
                ":emptyString": ""
            },
            ReturnValues: "ALL_NEW",
        });

        try {
            await client.send(command);
        } catch (err) {
            if (err instanceof ConditionalCheckFailedException) {
                continue;
            }
            console.error("Error claiming record:", err);
            throw err;
        }

        recordToClaim = testRecord;
    }

    return recordToClaim;
};

const setCatadataRecord = async (creds: AWSCredentials, record: CatadataRecord): Promise<void> => {
    if (!creds) {
        throw new Error("Credentials are required to set a catadata record.");
    }
    const client = new DynamoDBClient({
        region: Config.aws.region,
        credentials: {
            accessKeyId: creds.AccessKeyId!,
            secretAccessKey: creds.SecretKey!,
            sessionToken: creds.SessionToken,
        },
    });
    const command = new UpdateCommand({
        TableName: "catadata",
        Key: {
            imageName: record.imageName,
            uuid: record.uuid,
        },
        UpdateExpression: "SET #cat = :cat, #reviewedAt = :reviewedAt, #claimedAt = :claimedAt, #user = :user",
        ExpressionAttributeNames: {
            "#cat": "cat",
            "#user": "user",
            "#claimedAt": "claimedAt",
            "#reviewedAt": "reviewedAt",
        },
        ExpressionAttributeValues: {
            ":cat": record.cat,
            ":user": record.user,
            ":claimedAt": record.claimedAt,
            ":reviewedAt": new Date().toISOString(),
        },
        ReturnValues: "ALL_NEW",
    });
    try {
        await client.send(command);
    } catch (err) {
        if (err instanceof ConditionalCheckFailedException) {
            return;
        }
        console.error("Error claiming record:", err);
        throw err;
    }
};

export { getCatadataRecords, getCatPicture, claimRecord, setCatadataRecord };
