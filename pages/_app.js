import { AuthProvider } from "../context/AuthContext";
import { Baloo_2, Cormorant_Garamond, Nunito, Poppins } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
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
const DEFAULT_OG_IMAGE = "/social-preview.png";
const DEFAULT_TITLE = "Dear Student | Printable Worksheets for Kids";
const DEFAULT_DESCRIPTION =
  "Teacher-crafted printable worksheets for young learners. Instant access after secure checkout.";
const WEB_VITAL_EVENT = "web_vital";

function sendWebVitalToGoogleAnalytics(metric) {
  if (typeof window === "undefined") return;
  if (typeof window.gtag !== "function") return;

  window.gtag("event", WEB_VITAL_EVENT, {
    event_category: "Web Vitals",
    event_label: metric.name,
    metric_id: metric.id,
    metric_value: Math.round(metric.name === "CLS" ? metric.value * 1000 : metric.value),
    metric_delta: Math.round(metric.delta || 0),
    non_interaction: true,
  });
}

export function reportWebVitals(metric) {
  sendWebVitalToGoogleAnalytics(metric);
}

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
        <meta name="description" content={DEFAULT_DESCRIPTION} key="description" />
        <meta property="og:site_name" content="Dear Student" key="og:site_name" />
        <meta property="og:locale" content="en_IN" key="og:locale" />
        <meta property="og:type" content="website" key="og:type" />
        <meta property="og:title" content={DEFAULT_TITLE} key="og:title" />
        <meta property="og:description" content={DEFAULT_DESCRIPTION} key="og:description" />
        <meta property="og:image" content={`${SITE_URL}${DEFAULT_OG_IMAGE}`} key="og:image" />
        <meta property="og:image:secure_url" content={`${SITE_URL}${DEFAULT_OG_IMAGE}`} key="og:image:secure_url" />
        <meta property="og:image:width" content="1200" key="og:image:width" />
        <meta property="og:image:height" content="630" key="og:image:height" />
        <meta property="og:image:alt" content="Dear Student printable worksheets" key="og:image:alt" />
        <meta name="twitter:card" content="summary_large_image" key="twitter:card" />
        <meta name="twitter:title" content={DEFAULT_TITLE} key="twitter:title" />
        <meta name="twitter:description" content={DEFAULT_DESCRIPTION} key="twitter:description" />
        <meta name="twitter:image" content={`${SITE_URL}${DEFAULT_OG_IMAGE}`} key="twitter:image" />
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
      <SpeedInsights />
    </div>
  );
}
