import {
    Credentials as AWSCredentials,
} from "@aws-sdk/client-cognito-identity";
import logo from '../../images/wolf-white.png';
import "./HomePage.css";
import Page, { PageProps } from "./Page";

type SettingsProps = PageProps & {
    creds: AWSCredentials | null;
};

const SettingsPage = (props: SettingsProps) => {
    const { children, tabId, index, ...other } = props;

    return (
        <Page tabId={tabId} index={index}>
            <div className="page">
                <img src={logo} className="Page-logo" alt="logo" />
                <h1>Home Page</h1>
                <h3>Welcome to the home page</h3>
                {children}
            </div>
        </Page>
    )
}

export default SettingsPage;