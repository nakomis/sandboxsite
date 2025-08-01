import React, { useEffect } from 'react';
import logo from '../images/wolf-white.png';
import { useAuth } from 'react-oidc-context';
import './App.css';
import 'bootstrap/dist/css/bootstrap.css';
import Box from '@mui/material/Box';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import { AppBar } from '@mui/material';
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { blue, green } from "@mui/material/colors";
import {
    CognitoIdentityClient,
    GetIdCommand,
    GetCredentialsForIdentityCommand,
    Credentials,
} from "@aws-sdk/client-cognito-identity";
import Config from '../config/config';
import HomePage from './pages/HomePage';
import BluetoothPage from './pages/Bluetooth';
import OTAUpdatePage from './pages/OTAUpdate';

const App: React.FC = () => {
    const auth = useAuth();
    const [creds, setCreds] = React.useState<Credentials | null>(null);
    const [tabId, setTabId] = React.useState(0);

    async function getAWSCredentialsFromIdToken(
        region: string,
        identityPoolId: string,
        idToken: string
    ): Promise<Credentials | undefined> {
        const client = new CognitoIdentityClient({ region });
        const providerName = `cognito-idp.eu-west-2.amazonaws.com/eu-west-2_FdqHeJ7ca`;

        // Step 1: Get the Cognito Identity ID
        const getIdCommand = new GetIdCommand({
            IdentityPoolId: identityPoolId,
            Logins: {
                [providerName]: idToken,
            },
        });
        const getIdResponse = await client.send(getIdCommand);

        if (!getIdResponse.IdentityId) return undefined;

        // Step 2: Get AWS Credentials for the Identity ID
        const getCredsCommand = new GetCredentialsForIdentityCommand({
            IdentityId: getIdResponse.IdentityId,
            Logins: {
                [providerName]: idToken,
            },
        });
        const getCredsResponse = await client.send(getCredsCommand);

        return getCredsResponse.Credentials;
    }

    useEffect(() => {
        if (!auth.user?.id_token) {
            return;
        }
        (async () => {
            const credentials = await getAWSCredentialsFromIdToken(
                'eu-west-2',
                'eu-west-2:f7fcd995-522d-4034-89d4-3ffff91da0bb',
                auth.user?.id_token || ''
            );
            setCreds(credentials ?? null);
        })();
    }, [auth.user?.id_token]);

    const signOutRedirect = () => {
        // TODO: Can I just call auth.signoutRedirect()?
        // auth.signoutRedirect();
        window.location.href = `https://${Config.cognito.cognitoDomain}/logout?client_id=${Config.cognito.userPoolClientId}&logout_uri=${encodeURIComponent(Config.cognito.logoutUri)}`;
    };

    const onTabChange = (event: React.ChangeEvent<{}>, newValue: number) => {
        setTabId(newValue);
    };

    const theme = createTheme({
        typography: {
            fontFamily: ['Roboto', 'Helvetica', 'Arial', 'sans-serif'].join(','),
            fontSize: 24,
        },
        palette: {
            text: {
                secondary: '#585c64',
            },
            primary: {
                main: blue["A700"],
            },
            secondary: {
                main: green[900],
            },
            background: {
                default: '#ffffff',
                paper: '#1e1e1e',
            },
        },
    });

    if (auth.isLoading) {
        return (
            <div className="App">
                <div className="App-header">
                    Loading...
                </div>
            </div>
        );
    }

    if (auth.error) {
        return (
            <div className="App">
                <div className="App-header">
                    Encountering error... {auth.error.message}
                </div>
            </div>
        );
    }

    if (auth.isAuthenticated) {
        return (
            <div className="App">
                <div >
                    <header className="App-header">
                        <ThemeProvider theme={theme}>
                            <AppBar position="static">
                                <Box sx={{ backgroundColor: '#1f2329' }}>
                                    <div style={{ display: 'flex' }}>
                                        <Tabs value={tabId} onChange={onTabChange} aria-label="nakomis tabs" sx={{
                                            marginLeft: "0",
                                            "&& .Mui-selected": { // && are used to increase the specificity
                                                color: "#d1d1d1",
                                            },
                                        }}>
                                            <Tab label="Home" />
                                            <Tab label="Bluetooth" />
                                            <Tab label="OTA Updates" />
                                        </Tabs>
                                        <div style={{ flexGrow: 1, display: 'flex', justifyContent: 'flex-end' }}>
                                            <button type="button" className="btn btn-primary" style={{ marginRight: 10, alignSelf: "anchor-center" }} onClick={() => {
                                                auth.removeUser();
                                                signOutRedirect()
                                            }}>Sign out</button>
                                        </div>
                                    </div>
                                </Box>
                            </AppBar>
                            <Box sx={{ width: '100%' }}>
                                <HomePage tabId={tabId} index={0} creds={creds}></HomePage>
                                <BluetoothPage tabId={tabId} index={1} creds={creds}></BluetoothPage>
                                <OTAUpdatePage tabId={tabId} index={2} creds={creds}></OTAUpdatePage>
                            </Box>
                        </ThemeProvider>
                        {
                            !auth.isAuthenticated ? (
                                <p>You are not authenticated.</p>
                            ) : ""
                        }
                    </header>
                </div >
            </div>
        );
    } else {
        return (
            <div className="App">
                <header className="App-header">
                    <img src={logo} className="App-logo" alt="logo" />
                    <p>Welcome to Nakomis Softworks</p>
                    <p>Login below to continue</p>
                    <div>
                        <button type="button" className="btn btn-primary" onClick={() => auth.signinRedirect()}>Sign in</button>
                    </div>
                </header>
            </div>
        );
    }
}

export default App;
