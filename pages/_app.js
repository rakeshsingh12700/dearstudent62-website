import { AuthProvider } from "../context/AuthContext";
import { Baloo_2, Nunito } from "next/font/google";
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

export default function App({ Component, pageProps }) {
  return (
    <div className={`${bodyFont.variable} ${displayFont.variable}`}>
      <AuthProvider>
        <Component {...pageProps} />
      </AuthProvider>
    </div>
  );
}
