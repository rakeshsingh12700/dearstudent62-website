import Link from "next/link";

const INSTAGRAM_PROFILE_URL = "https://www.instagram.com/dearstudent62/";
const FACEBOOK_PROFILE_URL = "https://www.facebook.com/";

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <rect x="4" y="4" width="16" height="16" rx="5" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="3.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="17" cy="7" r="1.2" fill="currentColor" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M14.2 8.2h2.6V4.4h-2.6c-2.7 0-4.5 1.8-4.5 4.5v2.4H7v3.7h2.7v5h3.8v-5h3l.6-3.7h-3.6V9.3c0-.7.5-1.1 1.2-1.1z"
      />
    </svg>
  );
}

export default function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="container site-footer__inner">
        <div className="site-footer__top">
          <div className="site-footer__brand">
            <strong>Dear Student</strong>
            <p>Playful printable worksheets for early learners.</p>
          </div>

          <nav className="site-footer__links" aria-label="Footer">
            <div className="site-footer__col">
              <Link href="/about-us">About Us</Link>
            </div>
            <div className="site-footer__col">
              <Link href="/contact-us">Contact Us</Link>
            </div>
            <div className="site-footer__col">
              <Link href="/privacy-policy">Privacy Policy</Link>
            </div>
            <div className="site-footer__col">
              <Link href="/data-deletion">Data Deletion</Link>
            </div>
            <div className="site-footer__social" aria-label="Social links">
              <a
                href={INSTAGRAM_PROFILE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="site-footer__social-icon--instagram"
                aria-label="Instagram"
              >
                <InstagramIcon />
              </a>
              <a
                href={FACEBOOK_PROFILE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="site-footer__social-icon--facebook"
                aria-label="Facebook"
              >
                <FacebookIcon />
              </a>
            </div>
          </nav>
        </div>

        <div className="site-footer__bottom">
          <p>© {year} Dear Student. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
