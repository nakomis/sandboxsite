import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';

export interface ApiStackProps extends cdk.StackProps {
    domainName: string;
    apiDomainName: string;
}

export class ApiStack extends cdk.Stack {
    public readonly api: apigateway.RestApi;

    constructor(scope: Construct, id: string, props: ApiStackProps) {
        super(scope, id, props);

        // Create log group for API Gateway access logs
        const apiGatewayLogGroup = new logs.LogGroup(this, 'SandboxApiLogGroup', {
            logGroupName: '/aws/apigateway/SandboxApi',
            retention: logs.RetentionDays.ONE_MONTH,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });

        // Create the API Gateway
        this.api = new apigateway.RestApi(this, 'SandboxApi', {
            restApiName: 'Sandbox API',
            description: 'Sandbox shared API for IoT device management',
            defaultCorsPreflightOptions: {
                allowOrigins: ['https://sandbox.nakomis.com', 'http://localhost:3000', 'http://localhost:3001'],
                allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
                allowHeaders: [
                    'Content-Type',
                    'Authorization',
                    'X-Amz-Date',
                    'X-Amz-Security-Token',
                    'X-Amz-Content-Sha256',
                ],
            },
            deployOptions: {
                accessLogDestination: new apigateway.LogGroupLogDestination(apiGatewayLogGroup),
                accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields({
                    caller: true,
                    httpMethod: true,
                    ip: true,
                    protocol: true,
                    requestTime: true,
                    resourcePath: true,
                    responseLength: true,
                    status: true,
                    user: true,
                }),
                loggingLevel: apigateway.MethodLoggingLevel.INFO,
                metricsEnabled: true,
            },
        });

        // Create log group for list-devices Lambda
        const listDevicesLogGroup = new logs.LogGroup(this, 'ListDevicesLogGroup', {
            logGroupName: '/aws/lambda/SandboxListDevices',
            retention: logs.RetentionDays.ONE_MONTH,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });

        // Create the list-devices Lambda
        const listDevicesLambda = new NodejsFunction(this, 'ListDevicesFunction', {
            functionName: 'SandboxListDevices',
            runtime: cdk.aws_lambda.Runtime.NODEJS_22_X,
            entry: `${__dirname}/../lambda/list-devices/src/handler.ts`,
            logGroup: listDevicesLogGroup,
            timeout: cdk.Duration.seconds(30),
            memorySize: 256,
            bundling: {
                minify: true,
                sourceMap: false,
                target: 'node22',
            },
        });

        // Grant IoT permissions to list and describe things
        listDevicesLambda.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['iot:ListThings', 'iot:DescribeThing'],
            resources: ['*'],
        }));

        // Create the /devices resource
        const devicesResource = this.api.root.addResource('devices');
        devicesResource.addMethod('GET', new apigateway.LambdaIntegration(listDevicesLambda), {
            authorizationType: apigateway.AuthorizationType.IAM,
            apiKeyRequired: false,
            methodResponses: [
                { statusCode: '200' },
                { statusCode: '400' },
                { statusCode: '500' },
            ],
        });

        // Look up the hosted zone
        const hostedZone = route53.HostedZone.fromLookup(this, 'SandboxHostedZone', {
            domainName: props.domainName,
        });

        // Create certificate in the same region as the API Gateway
        const apiCertificate = new cm.Certificate(this, 'SandboxApiCertificate', {
            domainName: props.apiDomainName,
            validation: cm.CertificateValidation.fromDns(hostedZone),
        });

        // Create custom domain for API Gateway
        const customDomain = new apigateway.DomainName(this, 'SandboxApiDomain', {
            domainName: props.apiDomainName,
            certificate: apiCertificate,
            endpointType: apigateway.EndpointType.REGIONAL,
        });

        // Map the custom domain to the API Gateway
        customDomain.addBasePathMapping(this.api, {
            pcbPath: '',
        });

        // Create Route53 A record
        new route53.ARecord(this, 'SandboxApiAliasRecord', {
            zone: hostedZone,
            recordName: 'api',
            target: route53.RecordTarget.fromAlias(new targets.ApiGatewayDomain(customDomain)),
        });

        // Outputs
        new cdk.CfnOutput(this, 'ApiUrl', {
            value: this.api.url,
            description: 'API Gateway URL',
        });

        new cdk.CfnOutput(this, 'CustomDomainUrl', {
            value: `https://${props.apiDomainName}`,
            description: 'Custom domain URL for the API',
        });

        new cdk.CfnOutput(this, 'DevicesEndpointUrl', {
            value: `https://${props.apiDomainName}/devices`,
            description: 'URL for the /devices GET endpoint',
        });
    }
}
