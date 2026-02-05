import { useEffect, useState } from "react";
import { CatadataRecord } from "../../dto/CatadataRecord";
import mu from '../../images/mu.png';
import tau from '../../images/tau.png';
import chi from '../../images/chi.png';
import kappa from '../../images/kappa.png';
import boots from '../../images/boots.png';
import wolf from '../../images/Wolf.jpeg';
import KeyPressComponent from "../KeyPress";
import Page, { PageProps } from "./Page";
import {
    Credentials as AWSCredentials,
} from "@aws-sdk/client-cognito-identity";
import { claimRecord, getCatadataRecords, getCatPicture, setCatadataRecord } from "../../services/CatadataService";

type BootBootProps = PageProps & {
    creds: AWSCredentials | null,
    username: string | null;
};

const BootBootsPage = (props: BootBootProps) => {
    const [catadataRecords, setCatadataRecords] = useState<CatadataRecord[]>([]);
    var [currentRecord, setCurrentRecord] = useState<CatadataRecord | null>(null);
    const [catPicture, setCatPicture] = useState<string | null>(null);

    function getCatReviewer() {
        if (!catPicture) {
            if (catadataRecords.length === 0) {
                return (
                    <div style={{
                        backgroundColor: '#1f2329',
                        height: 'calc(100vh - 120px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '100%',
                        color: 'white'
                    }}>
                        <p>We're all out of Kitties!</p>
                    </div>
                );
            } else {
                return (
                    <div style={{
                        backgroundColor: '#1f2329',
                        height: 'calc(100vh - 120px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '100%',
                        color: 'white'
                    }}>
                        <p>Loading the next Kitty...</p>
                    </div>
                );
            }
        }

        const imgdiv = (
            <div style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 0,
                overflow: 'hidden'
            }}>
                <img className="img-fluid"
                    id="cat-image"
                    src={`${catPicture}`}
                    alt="Cat"
                    style={{
                        maxWidth: "100%",
                        maxHeight: "100%",
                        objectFit: "contain"
                    }}
                    onLoad={() => {
                        setTimeout(function () {
                            document.getElementById("outerdiv")!.style.width = "99%";
                            setTimeout(function () {
                                document.getElementById("outerdiv")!.style.width = "100%";
                            }, 50);
                        }, 50);
                    }}
                />
            </div>
        )
        return (
            <div style={{ height: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column' }}>
                <KeyPressComponent {...{ onKeyUp: handleKeyUp }} />
                <h3 style={{ marginTop: 7, flexShrink: 0 }}>Giving Boots the boot. {catadataRecords ? catadataRecords.length === 1 ? "Only 1 image " : `Only ${catadataRecords.length} images ` : 0} left to go!</h3>
                <div id="outerdiv" style={{
                    backgroundColor: '#1f2329',
                    padding: '20px',
                    width: '100%',
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    minHeight: 0
                }}>
                    {imgdiv}
                    <div style={{ flexShrink: 0, paddingTop: '10px' }}>
                        <button
                            className="btn btn-primary"
                            title="Mu (M)"
                            onClick={() => {
                                clickCat("Mu")
                            }}
                            style={{ width: '100px', height: '100px', backgroundColor: '#3b4048ff', border: 'none', padding: 0, margin: 5 }}
                        >
                            <img src={mu} alt="Mu" style={{ width: '100%', height: '100%' }} />
                        </button>
                        <button
                            className="btn btn-primary"
                            title="Tau (T)"
                            onClick={() => {
                                clickCat("Tau");
                            }}
                            style={{ width: '100px', height: '100px', backgroundColor: '#3b4048ff', border: 'none', padding: 0, margin: 5 }}
                        >
                            <img src={tau} alt="Tau" style={{ width: '100%', height: '100%' }} />
                        </button>
                        <button
                            className="btn btn-primary"
                            title="Chi (C)"
                            onClick={() => {
                                clickCat("Chi");
                            }}
                            style={{ width: '100px', height: '100px', backgroundColor: '#3b4048ff', border: 'none', padding: 0, margin: 5 }}
                        >
                            <img src={chi} alt="Chi" style={{ width: '100%', height: '100%' }} />
                        </button>
                        <button
                            className="btn btn-primary"
                            title="Kappa (K)"
                            onClick={() => {
                                clickCat("Kappa");
                            }}
                            style={{ width: '100px', height: '100px', backgroundColor: '#3b4048ff', border: 'none', padding: 0, margin: 5 }}
                        >
                            <img src={kappa} alt="Kappa" style={{ width: '100%', height: '100%' }} />
                        </button>
                        <button
                            className="btn btn-primary"
                            title="Boots (B)"
                            onClick={() => {
                                clickCat("Boots");
                            }}
                            style={{ width: '100px', height: '100px', backgroundColor: '#3b4048ff', border: 'none', padding: 0, margin: 5 }}
                        >
                            <img src={boots} alt="Boots" style={{ width: '100%', height: '100%' }} />
                        </button>
                        <button
                            className="btn btn-primary"
                            title="Wolf (W)"
                            onClick={() => {
                                clickCat("Wolf");
                            }}
                            style={{ width: '100px', height: '100px', backgroundColor: '#3b4048ff', border: 'none', padding: 0, margin: 5 }}
                        >
                            <img src={wolf} alt="Wolf" style={{ width: '100%', height: '100%' }} />
                        </button>
                        <button
                            className="btn btn-primary"
                            title="No Cat (N)"
                            onClick={() => {
                                clickCat("NoCat");
                            }}
                            style={{ width: '200px', height: '100px', backgroundColor: '#3b4048ff', border: 'none', padding: 0, margin: 5 }}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" fill="currentColor" className="bi bi-trash-fill" viewBox="0 0 16 16">
                                <path d="M2.5 1a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1H3v9a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V4h.5a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H10a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1zm3 4a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-1 0v-7a.5.5 0 0 1 .5-.5M8 5a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-1 0v-7A.5.5 0 0 1 8 5m3 .5v7a.5.5 0 0 1-1 0v-7a.5.5 0 0 1 1 0" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    useEffect(() => {
        if (props.creds) {
            (async () => {
                const records = await getCatadataRecords(props.creds!);
                setCatadataRecords(records);
            })();
        }
    }, [props.creds]);
    // Track if we're currently claiming to prevent duplicate claims
    const [isClaiming, setIsClaiming] = useState(false);

    useEffect(() => {
        if (catadataRecords.length > 0 && currentRecord === null && !isClaiming && props.creds) {
            setIsClaiming(true);
            (async () => {
                try {
                    const record = await claimRecord(catadataRecords, props.creds!, props.username || '');
                    if (!record) {
                        console.error("No record claimed.");
                        return;
                    }
                    setCurrentRecord(record);
                } finally {
                    setIsClaiming(false);
                }
            })();
        }
    }, [catadataRecords, currentRecord, isClaiming, props.creds, props.username]);
    useEffect(() => {
        if (currentRecord) {
            setCatPicture(null); // Clear the previous picture first
            (async () => {
                const pic = await getCatPicture(props.creds!, currentRecord);
                const url = await (new Response(pic)).blob().then(blob => {
                    return URL.createObjectURL(blob);
                });
                setCatPicture(url!);
            })();
        }
    }, [currentRecord]);

    function handleKeyUp(event: KeyboardEvent) {
        switch (event.key) {
            case "m":
                clickCat("Mu");
                break;
            case "t":
                clickCat("Tau");
                break;
            case "c":
                clickCat("Chi");
                break;
            case "k":
                clickCat("Kappa");
                break;
            case "b":
                clickCat("Boots");
                break;
            case "n":
                clickCat("NoCat");
                break;
            case "w":
                clickCat("Wolf");
                break;
            default:
                console.log("Unhandled key:", event.key);
                break;
        }
        event.preventDefault();
        event.stopPropagation();
        return false;
    };

    async function clickCat(cat: string) {
        if (!currentRecord) {
            console.error("No current record to update.");
            return;
        }
        currentRecord.cat = cat;
        currentRecord.reviewedAt = new Date().toISOString();

        // Clear UI state first
        setCatPicture(null);

        // Wait for the record to be saved before refetching
        await setCatadataRecord(props.creds!, currentRecord);

        // Now refetch records and clear currentRecord
        const records = await getCatadataRecords(props.creds!);
        setCatadataRecords(records);
        setCurrentRecord(null);
    }

    const { children, tabId, index } = props;

    if (index === tabId) {
        return (
            <div className="page" style={{ width: '100%', height: '100%' }}>
                {getCatReviewer()}
            </div>
        )
    } else {
        return (
            <Page tabId={tabId} index={index}>
                {children}
            </Page>
        )
    }
}
export default BootBootsPage;
