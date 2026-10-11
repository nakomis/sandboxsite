import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

/**
 * CI role for sandboxsite: publishes the Sandbox panel into nakomis-shell's sandbox bucket.
 * Sandbox only, by design: there is no prod role, so there is nowhere for sandbox code to go in prod.
 */
export class GithubCiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const providerArn = `arn:aws:iam::${this.account}:oidc-provider/token.actions.githubusercontent.com`;
    const role = new iam.Role(this, 'SandboxsiteCiRole', {
      roleName: 'nakomis-sandboxsite-github-ci-sandbox',
      description: 'Assumed by sandboxsite GitHub Actions CI (sandbox only)',
      assumedBy: new iam.WebIdentityPrincipal(providerArn, {
        StringEquals: { 'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com' },
        StringLike: {
          'token.actions.githubusercontent.com:sub': [
            'repo:nakomis@1488244/sandboxsite@1022630933:*',
            'repo:nakomis/sandboxsite:*',
          ],
        },
      }),
      managedPolicies: [
        iam.ManagedPolicy.fromManagedPolicyArn(
          this,
          'ShellRemoteDeployer',
          ssm.StringParameter.valueForStringParameter(this, '/nakomis-shell/sandbox/remote-deployer-policy-arn'),
        ),
      ],
    });

    new cdk.CfnOutput(this, 'CiRoleArn', { value: role.roleArn });
  }
}
