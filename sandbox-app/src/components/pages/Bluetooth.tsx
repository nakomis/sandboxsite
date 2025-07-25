/// <reference types="web-bluetooth" />

import {
    Credentials as AWSCredentials,
} from "@aws-sdk/client-cognito-identity";
import "./Bluetooth.css";
import Page, { PageProps } from "./Page";
import { useEffect, useState } from "react";

type BluetoothProps = PageProps & {
    creds: AWSCredentials | null;
};

const BluetoothPage = (props: BluetoothProps) => {
    const { children, tabId, index, ...other } = props;
    const [millis, setMillis] = useState<number | null>(null);
    const [device, setDevice] = useState<BluetoothDevice | null>(null);
    const [pressure, setPressure] = useState<number | null>(null);
    const [millisCharacteristic, setMillisCharacteristic] = useState<BluetoothRemoteGATTCharacteristic | null>(null);
    const [pressureCharacteristic, setPressureCharacteristic] = useState<BluetoothRemoteGATTCharacteristic | null>(null);

    useEffect(() => {
        if (!pressureCharacteristic) return;

        // async function handleCharacteristicChange() {
        //     let value = await millisCharacteristic!.readValue();
        //     setMillis(value.getUint8(0));
        // }

        async function oncharacteristicvaluechanged() {
            let value = await pressureCharacteristic!.readValue();
            // console.log(value.getBigUint64(0, true));
            setPressure(value.getUint32(0, true));
        }

        pressureCharacteristic.oncharacteristicvaluechanged = oncharacteristicvaluechanged;

        // setInterval(handleCharacteristicChange, 1000);

    }, [pressureCharacteristic]);

    return (
        <Page tabId={tabId} index={index}>
            <div className="page">
                <h1>Bluetooth Stuff</h1>
                <h3>Welcome to the Bluetooth page</h3>
                {children}
            </div>
            <div hidden={device == null}>
                <h2>Device Connected</h2>
                <p>Device Name: {device?.name}</p>
                <p>Device ID: {device?.id}</p>
                <p>Millis: {millis}</p>
                <p>Pressure: {pressure}</p>
            </div>
            <div><button type="button" className="btn btn-primary" onClick={() => {
                navigator.bluetooth.requestDevice({
                    filters: [{ services: ['3F37B7D1-5AF3-41C3-9689-2FC7175C1BA8'.toLowerCase()] }],
                })
                    .then(device => {
                        device.gatt?.connect()
                            .then(server => {
                                console.log('Connected to GATT Server:', server);
                                setDevice(device);
                                // You can now interact with the GATT server
                                return server.getPrimaryService('3F37B7D1-5AF3-41C3-9689-2FC7175C1BA8'.toLowerCase());
                            })
                            .then(service => {
                                // Get the characteristics you need from the service
                                service.getCharacteristics().then(characteristics => {
                                    console.log('Characteristics:', characteristics);
                                });
                                return service.getCharacteristic('E90F2B2F-905E-49FA-89C5-31E705B74D85'.toLowerCase());
                            })
                            .then(characteristic => {
                                // characteristic.addEventListener('characteristicvaluechanged', handleCharacteristicChange)
                                // characteristic.startNotifications()
                                //     .then(() => {
                                //         console.log('Notifications started for characteristic:', characteristic);
                                //         return characteristic.readValue();
                                //     })
                                //     .then(value => {
                                //         const newValueReceived = new TextDecoder().decode(value);
                                //         console.log("Characteristic value read: ", newValueReceived);
                                //         setMillis(parseInt(newValueReceived, 10));
                                //         setPressure(0);
                                //     })
                                //     .catch(error => {
                                //         console.error('Error starting notifications:', error);
                                //     });
                                // If you need to write to the characteristic, you can do so like this:
                                // characteristic.getDescriptor('00002902-0000-1000-8000-00805f9b34fb').then(descriptor => {
                                //     console.log('Descriptor:', descriptor);
                                //     return descriptor.writeValue(new Uint8Array([0x01, 0x00]));
                                // })
                                //     .then(() => {
                                //         console.log('Descriptor written successfully');
                                //         characteristic.startNotifications()
                                //             .then(() => {
                                //                 console.log('Notifications started for characteristic:', characteristic);
                                //                 return characteristic.readValue();
                                //             })
                                //             .catch(error => {
                                //                 console.error('Error starting notifications:', error);
                                //             });
                                //     })
                                //     .catch(error => {
                                //         console.error('Error writing descriptor:', error);
                                //     });
                                console.log('Notifications started for characteristic:', characteristic);
                                setPressureCharacteristic(characteristic);
                                return characteristic.readValue();
                            })
                            .then(value => {
                                const newValueReceived = new TextDecoder().decode(value);
                                console.log("Characteristic value read: ", newValueReceived);
                                setMillis(0);
                                setPressure(0);
                            })
                            .catch(error => {
                                console.error('Error connecting to GATT Server:', error);
                            });

                        console.log('Found device:', device.name);
                    })
                    .catch(error => {
                        console.error('Error:', error);
                    });
            }}>Connect to Bluetooth</button></div>
        </Page>
    )

}


export default BluetoothPage;