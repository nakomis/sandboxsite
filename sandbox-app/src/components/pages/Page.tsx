import { ReactNode } from "react";
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
                {children}
            </div>
        </div>
    );
}

export default Page;