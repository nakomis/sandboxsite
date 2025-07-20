import { ReactNode } from "react";
import logo from '../images/wolf-white.png';
import './Page.css';
export type PageProps = {
    children?: ReactNode;
    index: any;
    tabId: any;
};

const Page = (props: PageProps) => {
    const { children, tabId, index, ...other } = props;
    return (
        <div className="Page" hidden={tabId !== index} aria-labelledby={`vertical-tab-0`}>
            <div>
                
                <img src={logo} className="Page-logo" alt="logo" />
                {children}
            </div>
        </div>
    );
}

export default Page;