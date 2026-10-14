import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

export interface CognitoStackProps extends cdk.StackProps {
    pcbPrinterBucket: s3.IBucket;
    pcbPrinterTable: dynamodb.ITable;
}

/**
 * AWS credentials for the Sandbox panel of nakomis-shell. Users sign in to the shell with the shared nakomis-infra
 * pool; this identity pool trusts the shell's app client and hands out a role scoped to the PCB printer's store.
 * (The standalone sandbox.nakomis.com and its own user pool were decommissioned under FLEET-4.)
 */
export class CognitoStack extends cdk.Stack {
    readonly userRole: iam.Role;

    constructor(scope: Construct, id: string, props: CognitoStackProps) {
        super(scope, id, props);

        const identityPool = new cognito.CfnIdentityPool(this, 'SandboxIdentityPool', {
            identityPoolName: 'SandboxIdentityPool',
            allowUnauthenticatedIdentities: false,
            cognitoIdentityProviders: [
                {
                    clientId: ssm.StringParameter.valueForStringParameter(this, '/nakomis-shell/sandbox/cognito/client-id'),
                    providerName: `cognito-idp.${this.region}.amazonaws.com/${ssm.StringParameter.valueForStringParameter(this, '/nakomis-infra/sandbox/cognito/user-pool-id')}`,
                },
            ],
        });

        this.userRole = new iam.Role(this, 'SandboxUserRole', {
            assumedBy: new iam.FederatedPrincipal(
                'cognito-identity.amazonaws.com',
                {
                    'StringEquals': { 'cognito-identity.amazonaws.com:aud': identityPool.ref },
                    'ForAnyValue:StringLike': { 'cognito-identity.amazonaws.com:amr': 'authenticated' }
                },
                'sts:AssumeRoleWithWebIdentity'
            ),
        });

        // PCB printer save/load
        this.userRole.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['s3:PutObject', 's3:GetObject', 's3:HeadObject'],
            resources: [`${props.pcbPrinterBucket.bucketArn}/*`],
        }));
        this.userRole.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['dynamodb:PutItem', 'dynamodb:Scan', 'dynamodb:Query'],
            resources: [
                props.pcbPrinterTable.tableArn,
                `${props.pcbPrinterTable.tableArn}/index/*`,
            ],
        }));

        new cognito.CfnIdentityPoolRoleAttachment(this, 'SandboxIdentityPoolRoleAttachment', {
            identityPoolId: identityPool.ref,
            roles: {
                authenticated: this.userRole.roleArn,
            },
        });
    }
}
