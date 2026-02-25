import * as cdk from 'aws-cdk-lib';
import * as cm from 'aws-cdk-lib/aws-certificatemanager';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import { ITable, Table } from 'aws-cdk-lib/aws-dynamodb';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { FIRMWARE_BUCKET_NAME } from './firmware-bucket-stack';

export interface CognitoStackProps extends cdk.StackProps {
    authDomainName: string;
    domainName: string;
    authCertificateArn: cm.Certificate;
    pcbPrinterBucket?: s3.IBucket;
    pcbPrinterTable?: dynamodb.ITable;
}

export class CognitoStack extends cdk.Stack {
    readonly userPool: cognito.UserPool;
    readonly userPoolClient: cognito.UserPoolClient;
    readonly userRole: cdk.aws_iam.Role;

    constructor(scope: Construct, id: string, props: CognitoStackProps) {
        super(scope, id, props);

        this.userPool = new cognito.UserPool(this, 'SandboxUserPool', {
            userPoolName: 'SandboxUserPool',
            signInAliases: {
                username: true,
                email: true,
            },
            selfSignUpEnabled: false,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });

        const callbackUrls: string[] = [`https://${props.domainName}/loggedin`];
        const logoutUrls: string[] = [`https://${props.domainName}/logout`];
        callbackUrls.push('http://localhost:3000/loggedin');
        logoutUrls.push('http://localhost:3000/logout');

        this.userPoolClient = new cognito.UserPoolClient(this, 'SandboxUserPoolClient', {
            userPoolClientName: 'SandboxUserPoolClient',
            userPool: this.userPool,
            authFlows: {
                userPassword: true,
                userSrp: true,
            },
            generateSecret: false,
            oAuth: {
                callbackUrls: callbackUrls,
                logoutUrls: logoutUrls,
            },
        });

        const userPoolDomain: cognito.UserPoolDomain = new cognito.UserPoolDomain(this, 'SandboxUserPoolCustomDomain', {
            customDomain: {
                domainName: props.authDomainName,
                certificate: props.authCertificateArn,
            },
            userPool: this.userPool,
            managedLoginVersion: cognito.ManagedLoginVersion.NEWER_MANAGED_LOGIN,
        });

        const user: cognito.CfnUserPoolUser = new cognito.CfnUserPoolUser(this, 'SandboxNakomisUser', {
            userPoolId: this.userPool.userPoolId,
            username: 'nakomis',
            userAttributes: [
                { name: 'email', value: 'sandbox@nakomis.com' },
                { name: 'email_verified', value: 'true' },
            ],
        });

        const identityPool = new cognito.CfnIdentityPool(this, 'SandboxIdentityPool', {
            identityPoolName: 'SandboxIdentityPool',
            allowUnauthenticatedIdentities: false,
            cognitoIdentityProviders: [{
                clientId: this.userPoolClient.userPoolClientId,
                providerName: this.userPool.userPoolProviderName,
            }],
        });

        this.userRole = new cdk.aws_iam.Role(this, 'SandboxUserRole', {
            assumedBy: new cdk.aws_iam.FederatedPrincipal(
                'cognito-identity.amazonaws.com',
                {
                    'StringEquals': { 'cognito-identity.amazonaws.com:aud': identityPool.ref },
                    'ForAnyValue:StringLike': { 'cognito-identity.amazonaws.com:amr': 'authenticated' }
                },
                'sts:AssumeRoleWithWebIdentity'
            ),
        });

        // Grant access to catadata table and bucket for cat labeling page
        const catadataTable: ITable = Table.fromTableName(this, 'CatadataTable', 'catadata');
        const catBucket = Bucket.fromBucketName(this, 'CatadataBucket', `bootboots-images-${this.account}-${this.region}`);

        catadataTable.grantReadWriteData(this.userRole);
        catBucket.grantRead(this.userRole);

        // Grant access to firmware bucket for OTA updates
        const firmwareBucketArn = `arn:aws:s3:::${FIRMWARE_BUCKET_NAME}`;
        this.userRole.addToPolicy(new iam.PolicyStatement({
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
            resources: [firmwareBucketArn, `${firmwareBucketArn}/*`]
        }));

        // Grant IoT permissions for MQTT tab device discovery
        this.userRole.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'iot:ListThings',
                'iot:DescribeThing',
            ],
            resources: ['*'],
        }));

        // Grant execute-api permissions for Sandbox API (list-devices endpoint)
        this.userRole.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['execute-api:Invoke'],
            resources: [`arn:aws:execute-api:${this.region}:${this.account}:*/*/GET/devices`],
        }));

        // Grant PCB Printer save/load permissions (optional)
        if (props.pcbPrinterBucket) {
            this.userRole.addToPolicy(new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: ['s3:PutObject', 's3:GetObject', 's3:HeadObject'],
                resources: [`${props.pcbPrinterBucket.bucketArn}/*`],
            }));
        }
        if (props.pcbPrinterTable) {
            this.userRole.addToPolicy(new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: ['dynamodb:PutItem', 'dynamodb:Scan', 'dynamodb:Query'],
                resources: [
                    props.pcbPrinterTable.tableArn,
                    `${props.pcbPrinterTable.tableArn}/index/*`,
                ],
            }));
        }

        new cognito.CfnIdentityPoolRoleAttachment(this, 'SandboxIdentityPoolRoleAttachment', {
            identityPoolId: identityPool.ref,
            roles: {
                authenticated: this.userRole.roleArn,
            },
        });

        new cognito.CfnManagedLoginBranding(this, 'SandboxManagedLoginBranding', {
            userPoolId: this.userPool.userPoolId,
            clientId: this.userPoolClient.userPoolClientId,
            useCognitoProvidedValues: false,
            settings: {
                components: {
                    pageBackground: {
                        image: { enabled: false },
                        lightMode: { color: '1e1e1eff' },
                        darkMode:  { color: '1e1e1eff' },
                    },
                    pageHeader: {
                        backgroundImage: { enabled: false },
                        logo: { location: 'START', enabled: false },
                        lightMode: { background: { color: '181a1eff' }, borderColor: '333333ff' },
                        darkMode:  { background: { color: '181a1eff' }, borderColor: '333333ff' },
                    },
                    pageFooter: {
                        backgroundImage: { enabled: false },
                        logo: { location: 'START', enabled: false },
                        lightMode: { background: { color: '181a1eff' }, borderColor: '333333ff' },
                        darkMode:  { background: { color: '181a1eff' }, borderColor: '333333ff' },
                    },
                    form: {
                        borderRadius: 8,
                        backgroundImage: { enabled: false },
                        logo: { location: 'CENTER', position: 'TOP', enabled: false, formInclusion: 'IN' },
                        lightMode: { backgroundColor: '2a2d35ff', borderColor: '444444ff' },
                        darkMode:  { backgroundColor: '2a2d35ff', borderColor: '444444ff' },
                    },
                    pageText: {
                        lightMode: { bodyColor: 'ccccccff', headingColor: 'ffffffff', descriptionColor: '888888ff' },
                        darkMode:  { bodyColor: 'ccccccff', headingColor: 'ffffffff', descriptionColor: '888888ff' },
                    },
                    primaryButton: {
                        lightMode: {
                            defaults: { backgroundColor: '03a550ff', textColor: 'ffffffff' },
                            hover:    { backgroundColor: '029040ff', textColor: 'ffffffff' },
                            active:   { backgroundColor: '027530ff', textColor: 'ffffffff' },
                            disabled: { backgroundColor: '2a2d35ff', borderColor: '555555ff' },
                        },
                        darkMode: {
                            defaults: { backgroundColor: '03a550ff', textColor: 'ffffffff' },
                            hover:    { backgroundColor: '029040ff', textColor: 'ffffffff' },
                            active:   { backgroundColor: '027530ff', textColor: 'ffffffff' },
                            disabled: { backgroundColor: '2a2d35ff', borderColor: '555555ff' },
                        },
                    },
                    secondaryButton: {
                        lightMode: {
                            defaults: { backgroundColor: '2a2d35ff', borderColor: '444444ff', textColor: 'ccccccff' },
                            hover:    { backgroundColor: '333740ff', borderColor: '666666ff', textColor: 'ffffffff' },
                            active:   { backgroundColor: '1e2028ff', borderColor: '444444ff', textColor: 'ffffffff' },
                        },
                        darkMode: {
                            defaults: { backgroundColor: '2a2d35ff', borderColor: '444444ff', textColor: 'ccccccff' },
                            hover:    { backgroundColor: '333740ff', borderColor: '666666ff', textColor: 'ffffffff' },
                            active:   { backgroundColor: '1e2028ff', borderColor: '444444ff', textColor: 'ffffffff' },
                        },
                    },
                    alert: {
                        borderRadius: 4,
                        lightMode: { error: { backgroundColor: '3a1515ff', borderColor: 'f44444ff' } },
                        darkMode:  { error: { backgroundColor: '3a1515ff', borderColor: 'f44444ff' } },
                    },
                    idpButton: {
                        standard: {
                            lightMode: {
                                defaults: { backgroundColor: '2a2d35ff', borderColor: '444444ff', textColor: 'ccccccff' },
                                hover:    { backgroundColor: '333740ff', borderColor: '666666ff', textColor: 'ffffffff' },
                                active:   { backgroundColor: '1e2028ff', borderColor: '444444ff', textColor: 'ffffffff' },
                            },
                            darkMode: {
                                defaults: { backgroundColor: '2a2d35ff', borderColor: '444444ff', textColor: 'ccccccff' },
                                hover:    { backgroundColor: '333740ff', borderColor: '666666ff', textColor: 'ffffffff' },
                                active:   { backgroundColor: '1e2028ff', borderColor: '444444ff', textColor: 'ffffffff' },
                            },
                        },
                        custom: {},
                    },
                    phoneNumberSelector: { displayType: 'TEXT' },
                    favicon: { enabledTypes: ['ICO', 'SVG'] },
                },
                componentClasses: {
                    input: {
                        borderRadius: 6,
                        lightMode: {
                            defaults: { backgroundColor: '1e2028ff', borderColor: '555555ff' },
                            placeholderColor: '666666ff',
                        },
                        darkMode: {
                            defaults: { backgroundColor: '1e2028ff', borderColor: '555555ff' },
                            placeholderColor: '666666ff',
                        },
                    },
                    inputLabel: {
                        lightMode: { textColor: 'ccccccff' },
                        darkMode:  { textColor: 'ccccccff' },
                    },
                    inputDescription: {
                        lightMode: { textColor: '888888ff' },
                        darkMode:  { textColor: '888888ff' },
                    },
                    link: {
                        lightMode: { defaults: { textColor: '03a550ff' }, hover: { textColor: '029040ff' } },
                        darkMode:  { defaults: { textColor: '03a550ff' }, hover: { textColor: '029040ff' } },
                    },
                    optionControls: {
                        lightMode: {
                            defaults: { backgroundColor: '1e2028ff', borderColor: '555555ff' },
                            selected: { backgroundColor: '03a550ff', foregroundColor: 'ffffffff' },
                        },
                        darkMode: {
                            defaults: { backgroundColor: '1e2028ff', borderColor: '555555ff' },
                            selected: { backgroundColor: '03a550ff', foregroundColor: 'ffffffff' },
                        },
                    },
                    focusState: {
                        lightMode: { borderColor: '03a550ff' },
                        darkMode:  { borderColor: '03a550ff' },
                    },
                },
            },
        });

        const hostedZone = route53.HostedZone.fromLookup(this, 'SandboxHostedZoneLookup', {
            domainName: props.domainName
        });

        new route53.ARecord(this, `SandboxUserPool-${hostedZone.zoneName}AAliasRecord`, {
            recordName: props.authDomainName,
            zone: hostedZone,
            target: route53.RecordTarget.fromAlias(new targets.UserPoolDomainTarget(userPoolDomain))
        });

        new route53.AaaaRecord(this, `SandboxUserPool-${hostedZone.zoneName}AaaaAliasRecord`, {
            recordName: props.authDomainName,
            zone: hostedZone,
            target: route53.RecordTarget.fromAlias(new targets.UserPoolDomainTarget(userPoolDomain))
        });
    }
}