import type { Credentials } from '@aws-sdk/client-cognito-identity';
import Box from '@mui/material/Box';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import { useEffect, useState } from 'react';
import HomePage from './components/pages/HomePage';
import PCBPrinterPage from './components/pages/PCBPrinterPage';
import Config from './config/config';
import type { ShellContext } from './shell-contract';

const theme = createTheme({
    palette: {
        mode: 'dark',
        primary: { main: '#61afef' },
        background: { default: '#282c34', paper: '#21252b' },
    },
});

// Refresh well inside the credentials' one-hour lifetime.
const CREDS_REFRESH_MS = 10 * 60 * 1000;

/** Module Federation entry (`sandbox/App`): the sandbox-only scratch panel of nakomis-shell. */
export default function ShellApp(shell: ShellContext) {
    const [tabId, setTabId] = useState(0);
    const [creds, setCreds] = useState<Credentials | null>(null);

    useEffect(() => {
        let cancelled = false;
        const load = () =>
            shell.getAwsCredentials(Config.identityPoolId).then(
                (c) =>
                    !cancelled &&
                    setCreds({
                        AccessKeyId: c.accessKeyId,
                        SecretKey: c.secretAccessKey,
                        SessionToken: c.sessionToken,
                        Expiration: c.expiration,
                    }),
                (err: Error) => console.error('Could not get AWS credentials', err),
            );
        void load();
        const timer = setInterval(load, CREDS_REFRESH_MS);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [shell]);

    return (
        <ThemeProvider theme={theme}>
            <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                <Tabs value={tabId} onChange={(_, v) => setTabId(v)}>
                    <Tab label="Home" />
                    <Tab label="PCB Printer" />
                </Tabs>
            </Box>
            <HomePage tabId={tabId} index={0} creds={creds} />
            <PCBPrinterPage tabId={tabId} index={1} creds={creds} />
        </ThemeProvider>
    );
}
