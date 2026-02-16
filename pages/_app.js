import { AuthProvider } from "../context/AuthContext";
import { Baloo_2, Cormorant_Garamond, Nunito, Poppins } from "next/font/google";
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

export default function App({ Component, pageProps }) {
  return (
    <div
      className={`${bodyFont.variable} ${displayFont.variable} ${brandSerifFont.variable} ${brandSansFont.variable}`}
    >
      <AuthProvider>
        <Component {...pageProps} />
        <SiteFooter />
      </AuthProvider>
    </div>
  );
}
