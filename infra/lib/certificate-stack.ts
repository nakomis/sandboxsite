import * as cdk from 'aws-cdk-lib';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as cm from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';

export interface CertificateStackProps extends cdk.StackProps { 
    domainName: string,
    authDomain: string,
    apiDomain: string,
}

export class CertificateStack extends cdk.Stack {
    readonly certificate: cm.Certificate;
    readonly authCertificate: cm.Certificate;
    readonly apiCertificate: cm.Certificate;
    
    constructor(scope: Construct, id: string, props: CertificateStackProps) {
        super(scope, id, props);

        const hostedZone = route53.HostedZone.fromLookup(this, 'SandboxHostedZoneLookup', {
            domainName: props.domainName
        });

        this.certificate = new cm.Certificate(this, "SandboxCert", {
            domainName: props.domainName,
            validation: cm.CertificateValidation.fromDns(hostedZone)
        });

        this.authCertificate = new cm.Certificate(this, "SandboxAuthCert", {
            domainName: props.authDomain,
            validation: cm.CertificateValidation.fromDns(hostedZone)
        });

        this.apiCertificate = new cm.Certificate(this, "SandboxApiCert", {
            domainName: props.apiDomain,
            validation: cm.CertificateValidation.fromDns(hostedZone)
        });
    }
};