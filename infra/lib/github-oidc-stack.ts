import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

/**
 * Creates the GitHub Actions OIDC identity provider for this account.
 * There can only be one per account; this stack owns it for sandbox.
 * The prod account's provider was created separately.
 *
 * Consuming stacks (e.g. CodeArtifactGithubCiStack) import it by ARN via
 * iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn() rather than
 * taking a dependency on this stack directly.
 */
export class GithubOidcStack extends cdk.Stack {
  readonly provider: iam.OpenIdConnectProvider;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.provider = new iam.OpenIdConnectProvider(this, 'GithubOidcProvider', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
      // GitHub uses two root CAs; include both so the provider remains valid
      // if GitHub rotates certificates.
      thumbprints: [
        '6938fd4d98bab03faadb97b34396831e3780aea1',
        '1c58a3a8518e8759bf075b76b750d4f2df264fcd',
      ],
    });

    new cdk.CfnOutput(this, 'GithubOidcProviderArn', {
      value: this.provider.openIdConnectProviderArn,
      description: 'ARN of the GitHub Actions OIDC provider — used by CI stacks in this account',
    });
  }
}
