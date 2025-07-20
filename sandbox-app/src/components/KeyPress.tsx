import React, { ReactNode } from 'react';

export type KeyPressComponentProps = {
    children?: ReactNode;
    onKeyUp?: (event: KeyboardEvent) => void;
};

class KeyPressComponent extends React.Component {
    private onKeyUp: (event: KeyboardEvent) => void = (event) => {};

    constructor(props: KeyPressComponentProps) {
        super(props);
        if (props.onKeyUp) {
            this.onKeyUp = props.onKeyUp;
        }
    }

    handleKeyUp = (event: KeyboardEvent) => {
        if (this.onKeyUp) {
            this.onKeyUp.call(window, event);
        }
        console.log("Key released:", event.key);
    };

    componentDidMount() {
        window.addEventListener("keyup", this.handleKeyUp);
    }

    componentWillUnmount() {
        window.removeEventListener("keyup", this.handleKeyUp);
    }

    render() {
        return <div />;
    }
}

export default KeyPressComponent;