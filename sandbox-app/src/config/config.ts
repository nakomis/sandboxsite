export interface SandboxConfig {
    env: string;
    aws: {
        region: string;
    };
    cognito: {
        authority: string;
        userPoolId: string;
        userPoolClientId: string;
        cognitoDomain: string;
        redirectUri: string;
        logoutUri: string;
        identityPoolId: string;
    };
}

let Config: SandboxConfig = require('./config.json');

export default Config;
