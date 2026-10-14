import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { CognitoStack } from '../lib/cognito-stack';
import { PcbPrinterStack } from '../lib/pcbprinter-stack';

const env = { account: '123456789012', region: 'eu-west-2' };
const app = new cdk.App();
const pcb = new PcbPrinterStack(app, 'Pcb', { env });
const template = Template.fromStack(new CognitoStack(app, 'Cognito', {
    env,
    pcbPrinterBucket: pcb.bucket,
    pcbPrinterTable: pcb.table,
}));

test('has no user pool of its own: the shell signs in with the shared pool', () => {
    template.resourceCountIs('AWS::Cognito::UserPool', 0);
    template.resourceCountIs('AWS::Cognito::UserPoolDomain', 0);
});

test('identity pool trusts only the shell client', () => {
    template.hasResourceProperties('AWS::Cognito::IdentityPool', {
        AllowUnauthenticatedIdentities: false,
        CognitoIdentityProviders: [Match.objectLike({ ClientId: Match.anyValue() })],
    });
});

test('role grants only the PCB printer store', () => {
    const policies = template.findResources('AWS::IAM::Policy');
    const actions = Object.values(policies).flatMap((p: any) =>
        p.Properties.PolicyDocument.Statement.flatMap((s: any) => ([] as string[]).concat(s.Action)));
    expect(new Set(actions)).toEqual(new Set([
        's3:PutObject', 's3:GetObject', 's3:HeadObject', 'dynamodb:PutItem', 'dynamodb:Scan', 'dynamodb:Query',
    ]));
});
