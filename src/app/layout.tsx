import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import { Providers } from "@/components/providers";
import { ThemeInit } from "@/components/theme-init";
import "./globals.css";

const GA_MEASUREMENT_ID = "G-E9HZE16HDH";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Paperhuman - The Watcher for Your Business",
  description:
    "Paperhuman watches your channels and systems, catches what needs attention before your customers do, and escalates to a real human for action.",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="h-full" suppressHydrationWarning>
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_MEASUREMENT_ID}');
          `}
        </Script>
        <Providers>
          <ThemeInit />
          {children}
        </Providers>
      </body>
    </html>
  );
}
