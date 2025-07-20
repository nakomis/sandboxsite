import Page, { PageProps } from "./Page";
import {
    Credentials as AWSCredentials,
} from "@aws-sdk/client-cognito-identity";
import "./HomePage.css";

type SettingsProps = PageProps & {
    creds: AWSCredentials | null;
};

const SettingsPage = (props: SettingsProps) => {
    const { children, tabId, index, ...other } = props;

    return (
        <Page tabId={tabId} index={index}>
            <div className="page">
                <h1>Settings</h1>
                <h3>Yeah, the settings go here, or something like that</h3>
                {children}
            </div>
        </Page>
    )
}

export default SettingsPage;