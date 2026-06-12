import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ToastProvider } from "@/components/ToastProvider";
import "./globals.css";

const iconVersion = "20260612";

export const metadata: Metadata = {
  title: "DeployIQ™ | Field Deployment Intelligence Platform",
  description: "Execute. Track. Verify.",
  applicationName: "DeployIQ",
  manifest: `/site.webmanifest?v=${iconVersion}`,
  icons: {
    icon: [
      { url: `/favicon.ico?v=${iconVersion}`, sizes: "any" },
      { url: `/favicon-16x16.png?v=${iconVersion}`, sizes: "16x16", type: "image/png" },
      { url: `/favicon-32x32.png?v=${iconVersion}`, sizes: "32x32", type: "image/png" },
      { url: `/icon.png?v=${iconVersion}`, sizes: "512x512", type: "image/png" },
      { url: `/icon-192x192.png?v=${iconVersion}`, sizes: "192x192", type: "image/png" },
      { url: `/icon-512x512.png?v=${iconVersion}`, sizes: "512x512", type: "image/png" }
    ],
    shortcut: [{ url: `/favicon.ico?v=${iconVersion}` }],
    apple: [
      { url: `/apple-icon.png?v=${iconVersion}`, sizes: "180x180", type: "image/png" },
      { url: `/apple-touch-icon.png?v=${iconVersion}`, sizes: "180x180", type: "image/png" }
    ]
  },
  openGraph: {
    title: "DeployIQ™",
    description: "Execute. Track. Verify.",
    siteName: "DeployIQ",
    images: [{ url: `/icon-512x512.png?v=${iconVersion}`, width: 512, height: 512, alt: "DeployIQ DQ logo" }]
  },
  appleWebApp: {
    capable: true,
    title: "DeployIQ",
    statusBarStyle: "black-translucent"
  }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
