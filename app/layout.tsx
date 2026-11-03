import type { Metadata, Viewport } from "next";
import { DM_Sans, Fraunces, UnifrakturMaguntia } from "next/font/google";
import "./globals.css";

const ui = DM_Sans({ variable: "--font-ui", subsets: ["latin"] });
const display = Fraunces({ variable: "--font-display", subsets: ["latin"] });
const blackletter = UnifrakturMaguntia({ variable: "--font-mast", weight: "400", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Loophole City",
  description: "You write the laws. Six AI citizens find the loophole. How long can your administration last?",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f4ecdb",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${ui.variable} ${display.variable} ${blackletter.variable}`}>
      {/* Browser extensions such as ColorZilla add attributes to body before React loads. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
