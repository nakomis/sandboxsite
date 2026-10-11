// Dev harness only: `pnpm dev` renders the panel without the shell (no AWS credentials, so saving is off).
// In production nakomis-shell loads ShellApp from remoteEntry.js.
import { createRoot } from 'react-dom/client';
import ShellApp from './ShellApp';
import { CONTRACT_VERSION } from './shell-contract';

createRoot(document.getElementById('root') as HTMLElement).render(
    <ShellApp
        contractVersion={CONTRACT_VERSION}
        env="sandbox"
        basePath="/"
        region="eu-west-2"
        userPoolId=""
        user={{ sub: 'dev', username: 'dev' }}
        getAccessToken={async () => ''}
        getIdToken={async () => ''}
        getAwsCredentials={async () => {
            throw new Error('No AWS credentials in the dev harness');
        }}
        signOut={() => {}}
    />,
);
