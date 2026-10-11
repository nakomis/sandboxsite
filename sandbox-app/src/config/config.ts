// The sandbox remote only ever runs in the sandbox account (there is no prod sandbox, by design).
export interface SandboxConfig {
    aws: { region: string };
    /** SandboxIdentityPool: trusts the shared pool's nakomis-shell client as well as the old sandbox pool. */
    identityPoolId: string;
    pcbPrinter: { bucket: string; table: string };
}

const Config: SandboxConfig = {
    aws: { region: 'eu-west-2' },
    identityPoolId: 'eu-west-2:f7fcd995-522d-4034-89d4-3ffff91da0bb',
    pcbPrinter: { bucket: 'nakomis-pcbprinter-saves', table: 'pcbprinter-saves' },
};

export default Config;
