import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ConvexClientProvider } from "./ConvexClientProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = "https://balsleague-mauve.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "발스리그",
  description: "발스리그 - 리그 및 내전 관리",
  icons: {
    icon: "/bals-logo.png",
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "발스리그",
    statusBarStyle: "default",
  },
  openGraph: {
    title: "발스리그",
    description: "발스리그 - 리그 및 내전 관리",
    url: SITE_URL,
    siteName: "발스리그",
    images: [{ url: "/bals-logo.png", width: 1280, height: 777 }],
    locale: "ko_KR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "발스리그",
    description: "발스리그 - 리그 및 내전 관리",
    images: ["/bals-logo.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#f97316",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
          <ConvexClientProvider>{children}</ConvexClientProvider>
        </body>
    </html>
  );
}
