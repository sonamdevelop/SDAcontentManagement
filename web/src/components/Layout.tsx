import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Icon } from './Icon';
import { safePhotoUrl } from '../domain/property';
const staySite = safePhotoUrl(
  import.meta.env.VITE_STAY_SITE_URL || 'https://stayindandeli.in',
  'https://stayindandeli.in',
);
export function Layout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.search]);
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="site-header">
        <div className="container header-inner">
          <Link to="/properties" className="brand" aria-label="Stay in Dandeli properties home">
            <img src="/brand/stay-logo.png" width="210" height="61" alt="Stay in Dandeli" />
            <span>PROPERTIES</span>
          </Link>
          <button
            className="menu-toggle"
            type="button"
            aria-label={open ? 'Close navigation' : 'Open navigation'}
            aria-expanded={open}
            aria-controls="main-nav"
            onClick={() => setOpen(!open)}
          >
            <Icon name={open ? 'close' : 'menu'} />
          </button>
          <nav
            id="main-nav"
            className={open ? 'main-nav is-open' : 'main-nav'}
            aria-label="Main navigation"
          >
            <Link to="/properties">All properties</Link>
            <Link to="/properties?purpose=sale">Buy</Link>
            <Link to="/properties?purpose=rent">Rent</Link>
            <Link to="/staff/login">Staff</Link>
            {staySite && (
              <a href={staySite} className="stay-link">
                Explore stays <Icon name="arrow" />
              </a>
            )}
          </nav>
        </div>
      </header>
      <main id="main-content">
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="container footer-inner">
          <div>
            <Link to="/properties" className="footer-brand">
              Stay in Dandeli
            </Link>
            <p>Find a place for your next chapter.</p>
          </div>
          <div className="footer-links">
            <Link to="/properties?purpose=sale">Properties for sale</Link>
            <Link to="/properties?purpose=rent">Properties for rent</Link>
            {staySite && <a href={staySite}>Stays in Dandeli</a>}
          </div>
          <p className="copyright">© {new Date().getFullYear()} Stay in Dandeli</p>
        </div>
      </footer>
    </>
  );
}
