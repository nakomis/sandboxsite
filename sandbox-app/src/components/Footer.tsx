import './Footer.css';

function Footer(props: any) {
    return (
        <div className='Footer'>{props.children}
            <div>Designed and built by Nakomis. Wolf icons created by  <a href='https://www.flaticon.com/free-icons/wolf' title='wolf icons'  target='_blank' rel="noreferrer">Icongeek26 - Flaticon</a></div>
        </div>
    )
}

export default Footer;