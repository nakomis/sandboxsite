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
    bootboots: {
        imagesBucket: string;
    };
    pcbPrinter: {
        bucket: string;
        table: string;
    };
    sam: {
        serverUrl: string;  // e.g. http://192.168.1.x:7861 or http://localhost:7861
    };
}

let Config: SandboxConfig = require('./config.json');

export default Config;
