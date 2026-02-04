import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayv2_integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iot from 'aws-cdk-lib/aws-iot';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';

export interface WebSocketStackProps extends cdk.StackProps {
    domainName: string;
    wsDomainName: string;
}

export class WebSocketStack extends cdk.Stack {
    public readonly webSocketApi: apigatewayv2.WebSocketApi;
    public readonly webSocketStage: apigatewayv2.WebSocketStage;

    constructor(scope: Construct, id: string, props: WebSocketStackProps) {
        super(scope, id, props);

        // DynamoDB table for storing WebSocket connection IDs
        // Tracks which connectionId is subscribed to which device
        const connectionsTable = new dynamodb.Table(this, 'WebSocketConnections', {
            tableName: 'SandboxWebSocketConnections',
            partitionKey: { name: 'connectionId', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            timeToLiveAttribute: 'ttl',
        });

        // GSI to look up connections by device
        connectionsTable.addGlobalSecondaryIndex({
            indexName: 'deviceIndex',
            partitionKey: { name: 'deviceId', type: dynamodb.AttributeType.STRING },
            projectionType: dynamodb.ProjectionType.ALL,
        });

        // Log group for WebSocket Lambdas
        const wsLogGroup = new logs.LogGroup(this, 'WebSocketLambdaLogGroup', {
            logGroupName: '/aws/lambda/SandboxWebSocket',
            retention: logs.RetentionDays.ONE_MONTH,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });

        // Lambda for $connect route
        const connectHandler = new NodejsFunction(this, 'ConnectHandler', {
            functionName: 'SandboxWsConnect',
            runtime: lambda.Runtime.NODEJS_22_X,
            entry: `${__dirname}/../lambda/websocket/src/connect.ts`,
            logGroup: wsLogGroup,
            timeout: cdk.Duration.seconds(10),
            memorySize: 128,
            environment: {
                CONNECTIONS_TABLE: connectionsTable.tableName,
            },
            bundling: {
                minify: true,
                sourceMap: false,
                target: 'node22',
            },
        });
        connectionsTable.grantWriteData(connectHandler);

        // Lambda for $disconnect route
        const disconnectHandler = new NodejsFunction(this, 'DisconnectHandler', {
            functionName: 'SandboxWsDisconnect',
            runtime: lambda.Runtime.NODEJS_22_X,
            entry: `${__dirname}/../lambda/websocket/src/disconnect.ts`,
            logGroup: wsLogGroup,
            timeout: cdk.Duration.seconds(10),
            memorySize: 128,
            environment: {
                CONNECTIONS_TABLE: connectionsTable.tableName,
            },
            bundling: {
                minify: true,
                sourceMap: false,
                target: 'node22',
            },
        });
        connectionsTable.grantWriteData(disconnectHandler);

        // Lambda for sendCommand route - publishes to IoT MQTT
        const sendCommandHandler = new NodejsFunction(this, 'SendCommandHandler', {
            functionName: 'SandboxWsSendCommand',
            runtime: lambda.Runtime.NODEJS_22_X,
            entry: `${__dirname}/../lambda/websocket/src/sendCommand.ts`,
            logGroup: wsLogGroup,
            timeout: cdk.Duration.seconds(15),
            memorySize: 256,
            environment: {
                CONNECTIONS_TABLE: connectionsTable.tableName,
            },
            bundling: {
                minify: true,
                sourceMap: false,
                target: 'node22',
            },
        });
        connectionsTable.grantReadWriteData(sendCommandHandler);

        // Grant IoT publish permissions to all topics (any project)
        sendCommandHandler.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['iot:Publish'],
            resources: [`arn:aws:iot:${this.region}:${this.account}:topic/*`],
        }));

        // Grant permission to describe IoT endpoint
        sendCommandHandler.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['iot:DescribeEndpoint'],
            resources: ['*'],
        }));

        // Create WebSocket API
        this.webSocketApi = new apigatewayv2.WebSocketApi(this, 'SandboxWebSocketApi', {
            apiName: 'SandboxWebSocket',
            description: 'WebSocket API for Sandbox IoT device communication',
            connectRouteOptions: {
                integration: new apigatewayv2_integrations.WebSocketLambdaIntegration(
                    'ConnectIntegration',
                    connectHandler
                ),
            },
            disconnectRouteOptions: {
                integration: new apigatewayv2_integrations.WebSocketLambdaIntegration(
                    'DisconnectIntegration',
                    disconnectHandler
                ),
            },
        });

        // Add sendCommand route
        this.webSocketApi.addRoute('sendCommand', {
            integration: new apigatewayv2_integrations.WebSocketLambdaIntegration(
                'SendCommandIntegration',
                sendCommandHandler
            ),
        });

        // Create WebSocket stage
        this.webSocketStage = new apigatewayv2.WebSocketStage(this, 'SandboxWebSocketStage', {
            webSocketApi: this.webSocketApi,
            stageName: 'prod',
            autoDeploy: true,
        });

        // Custom domain for WebSocket API
        const hostedZone = route53.HostedZone.fromLookup(this, 'SandboxHostedZone', {
            domainName: props.domainName,
        });

        const wsCertificate = new acm.Certificate(this, 'WebSocketCertificate', {
            domainName: props.wsDomainName,
            validation: acm.CertificateValidation.fromDns(hostedZone),
        });

        const wsDomainName = new apigatewayv2.DomainName(this, 'WebSocketDomainName', {
            domainName: props.wsDomainName,
            certificate: wsCertificate,
        });

        new apigatewayv2.ApiMapping(this, 'WebSocketApiMapping', {
            api: this.webSocketApi,
            domainName: wsDomainName,
            stage: this.webSocketStage,
        });

        new route53.ARecord(this, 'WebSocketAliasRecord', {
            zone: hostedZone,
            recordName: 'ws',
            target: route53.RecordTarget.fromAlias(
                new targets.ApiGatewayv2DomainProperties(
                    wsDomainName.regionalDomainName,
                    wsDomainName.regionalHostedZoneId
                )
            ),
        });

        // Lambda for routing IoT responses back to WebSocket clients
        const responseRouterHandler = new NodejsFunction(this, 'ResponseRouterHandler', {
            functionName: 'SandboxWsResponseRouter',
            runtime: lambda.Runtime.NODEJS_22_X,
            entry: `${__dirname}/../lambda/websocket/src/responseRouter.ts`,
            logGroup: wsLogGroup,
            timeout: cdk.Duration.seconds(15),
            memorySize: 256,
            environment: {
                CONNECTIONS_TABLE: connectionsTable.tableName,
                WEBSOCKET_ENDPOINT: this.webSocketStage.callbackUrl,
            },
            bundling: {
                minify: true,
                sourceMap: false,
                target: 'node22',
            },
        });
        connectionsTable.grantReadData(responseRouterHandler);

        // Grant permission to post to WebSocket connections
        responseRouterHandler.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['execute-api:ManageConnections'],
            resources: [
                `arn:aws:execute-api:${this.region}:${this.account}:${this.webSocketApi.apiId}/${this.webSocketStage.stageName}/POST/@connections/*`,
            ],
        }));

        // IoT Rule to trigger Lambda when any device publishes responses
        // Topic pattern: {project}/{deviceId}/responses
        const iotRule = new iot.CfnTopicRule(this, 'DeviceResponseRule', {
            ruleName: 'SandboxDeviceResponseRule',
            topicRulePayload: {
                sql: "SELECT *, topic(1) as project, topic(2) as deviceId FROM '+/+/responses'",
                actions: [
                    {
                        lambda: {
                            functionArn: responseRouterHandler.functionArn,
                        },
                    },
                ],
                ruleDisabled: false,
            },
        });

        // Grant IoT permission to invoke the Lambda
        responseRouterHandler.addPermission('AllowIoTInvoke', {
            principal: new iam.ServicePrincipal('iot.amazonaws.com'),
            sourceArn: `arn:aws:iot:${this.region}:${this.account}:rule/${iotRule.ruleName}`,
        });

        // Outputs
        new cdk.CfnOutput(this, 'WebSocketApiEndpoint', {
            value: this.webSocketStage.url,
            description: 'WebSocket API endpoint URL (internal)',
        });

        new cdk.CfnOutput(this, 'WebSocketCustomDomainUrl', {
            value: `wss://${props.wsDomainName}`,
            description: 'WebSocket API custom domain URL',
        });

        new cdk.CfnOutput(this, 'WebSocketApiId', {
            value: this.webSocketApi.apiId,
            description: 'WebSocket API ID',
        });

        new cdk.CfnOutput(this, 'ConnectionsTableName', {
            value: connectionsTable.tableName,
            description: 'DynamoDB table for WebSocket connections',
        });
    }
}
