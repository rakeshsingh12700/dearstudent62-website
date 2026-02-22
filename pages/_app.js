import { AuthProvider } from "../context/AuthContext";
import { Baloo_2, Cormorant_Garamond, Nunito, Poppins } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import Head from "next/head";
import Script from "next/script";
import { useRouter } from "next/router";
import SiteFooter from "../components/SiteFooter";
import "../styles/globals.css";

const bodyFont = Nunito({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600", "700", "800"],
});

const displayFont = Baloo_2({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["600", "700", "800"],
});

const brandSerifFont = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-brand-serif",
  weight: ["500", "600"],
});

const brandSansFont = Poppins({
  subsets: ["latin"],
  variable: "--font-brand-sans",
  weight: ["600"],
});

const SITE_URL = "https://dearstudent.in";

export default function App({ Component, pageProps }) {
  const router = useRouter();
  const path = String(router.asPath || "/").split("?")[0].split("#")[0] || "/";
  const canonicalUrl = `${SITE_URL}${path === "/" ? "" : path}`;

  return (
    <div
      className={`${bodyFont.variable} ${displayFont.variable} ${brandSerifFont.variable} ${brandSansFont.variable} ${
        router.pathname === "/" ? "page-home" : ""
      }`}
    >
      <Script
        src="https://www.googletagmanager.com/gtag/js?id=G-WJ8XC7J81S"
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-WJ8XC7J81S');
        `}
      </Script>
      <Head>
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:url" content={canonicalUrl} />
      </Head>
      <AuthProvider>
        <div className="app-shell">
          <div className="app-shell__main">
            <Component {...pageProps} />
          </div>
          <SiteFooter />
        </div>
      </AuthProvider>
      <Analytics />
    </div>
  );
}
