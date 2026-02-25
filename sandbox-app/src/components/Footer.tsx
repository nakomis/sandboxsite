import './Footer.css';
import versionData from '../version.json';
import { VERSION as pcbprinterVersion } from 'pcbprinter';

function Footer(props: any) {
    return (
        <div className='app-footer'>
            {props.children}
            <span>v{versionData.version} · pcbprinter v{pcbprinterVersion}</span>
            {' · '}
            Designed and built by Nakomis. Wolf icons created by{' '}
            <a href='https://www.flaticon.com/free-icons/wolf' title='wolf icons' target='_blank' rel="noreferrer">Icongeek26 - Flaticon</a>
        </div>
    );
}

export default Footer;
