import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import Config from './config/config';
import { AuthProvider } from 'react-oidc-context';
import { BrowserRouter, Route, Routes } from 'react-router';
import LoggedIn from './LoggedIn';
import Logout from './Logout';

const cognitoAuthConfig = {
    authority: Config.cognito.authority,
    client_id: Config.cognito.userPoolClientId,
    redirect_uri: Config.cognito.redirectUri,
    // I'm happy for these values to be hardcoded for now, but they can be configured later
    response_type: "code",
    scope: "email openid phone profile",
};

const root = ReactDOM.createRoot(
    document.getElementById('root') as HTMLElement
);
root.render(
    <React.StrictMode>
        <AuthProvider {...cognitoAuthConfig}>
            <BrowserRouter>
                <Routes>
                    <Route path="/" element={<App />} />
                    <Route path="/loggedin" element={<LoggedIn />} />
                    <Route path="/logout" element={<Logout />} />
                    {/* Add more routes as needed */}
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    </React.StrictMode >
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
