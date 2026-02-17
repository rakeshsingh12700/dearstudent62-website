import Link from "next/link";

const INSTAGRAM_PROFILE_URL = "https://www.instagram.com/dearstudent62/";
const FACEBOOK_PROFILE_URL = "https://www.facebook.com/";
const YOUTUBE_CHANNEL_URL = "https://www.youtube.com/";

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

function YouTubeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M21.6 8.3c-.2-1-1-1.7-2-1.9C17.8 6 12 6 12 6s-5.8 0-7.6.4c-1 .2-1.8.9-2 1.9C2 10 2 12 2 12s0 2 .4 3.7c.2 1 .9 1.7 2 1.9C6.2 18 12 18 12 18s5.8 0 7.6-.4c1-.2 1.8-.9 2-1.9.4-1.7.4-3.7.4-3.7s0-2-.4-3.7zM10 14.7V9.3L15 12l-5 2.7z"
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
              <a
                href={YOUTUBE_CHANNEL_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="site-footer__social-icon--youtube"
                aria-label="YouTube"
              >
                <YouTubeIcon />
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
