"use strict";
exports.__esModule = true;
var react_1 = require("react");
var client_1 = require("react-dom/client");
require("./index.css");
var App_1 = require("./components/App");
var reportWebVitals_1 = require("./reportWebVitals");
var config_1 = require("./config/config");
var react_oidc_context_1 = require("react-oidc-context");
var react_router_1 = require("react-router");
var LoggedIn_1 = require("./components/LoggedIn");
var Logout_1 = require("./components/Logout");
var Outline_1 = require("./Outline");
/*
    Looking for something interesting in the code?
    Get the full source code at https://nakom.is/mushroom-code
    It's an open-source project, so feel free to contribute or use it as you like!
*/
var cognitoAuthConfig = {
    authority: config_1["default"].cognito.authority,
    client_id: config_1["default"].cognito.userPoolClientId,
    redirect_uri: config_1["default"].cognito.redirectUri,
    // I'm happy for these values to be hardcoded for now, but they can be configured later
    response_type: "code",
    scope: "email openid phone profile"
};
var root = client_1["default"].createRoot(document.getElementById('root'));
root.render(<react_1["default"].StrictMode>
        <Outline_1["default"]>
            <div className="main-content">
                <react_oidc_context_1.AuthProvider {...cognitoAuthConfig}>
                    <react_router_1.BrowserRouter>
                        <react_router_1.Routes>
                            <react_router_1.Route path="/" element={<App_1["default"] />}/>
                            <react_router_1.Route path="/loggedin" element={<LoggedIn_1["default"] />}/>
                            <react_router_1.Route path="/logout" element={<Logout_1["default"] />}/>
                            {/* Add more routes as needed */}
                        </react_router_1.Routes>
                    </react_router_1.BrowserRouter>
                </react_oidc_context_1.AuthProvider>
            </div>
        </Outline_1["default"]>
    </react_1["default"].StrictMode>);
// Register service worker for OTA updates
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
        navigator.serviceWorker.register('/sw.js')
            .then(function (registration) {
            console.log('SW registered: ', registration);
            // Check for updates every 30 minutes
            setInterval(function () {
                registration.update();
            }, 30 * 60 * 1000);
        })["catch"](function (registrationError) {
            console.log('SW registration failed: ', registrationError);
        });
    });
}
// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
(0, reportWebVitals_1["default"])();
