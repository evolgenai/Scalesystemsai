import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const siteUrl = "https://scalesystems.ai";

export const viewport: Viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "ScaleSystems | Agentic AI Employees & Business Automation Studio",
    template: "%s | ScaleSystems",
  },
  description:
    "ScaleSystems builds autonomous AI employees that eliminate administrative overhead, automate CRM workflows, and scale operations 24/7. Agentic AI automation agency for enterprise teams.",
  keywords: [
    "AI Automation Agency",
    "Agentic AI Employees",
    "ScaleSystems Business Automation",
    "AI employee",
    "multi-agent frameworks",
    "SaaS automation",
    "enterprise workflow optimization",
  ],
  authors: [{ name: "ScaleSystems" }],
  creator: "ScaleSystems",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "ScaleSystems",
    title: "ScaleSystems | Hire an AI Employee for $0/Hour",
    description:
      "Deploy autonomous AI agents that qualify leads, sync data across legacy tools, and run customer operations around the clock.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "ScaleSystems — Agentic AI Employee & Automation Studio",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ScaleSystems | Agentic AI Employees",
    description:
      "Custom multi-agent frameworks and enterprise automation. Hire an AI employee that never sleeps.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "ProfessionalService",
  name: "ScaleSystems",
  url: siteUrl,
  description:
    "Agentic AI Employee & Automation Studio specializing in custom multi-agent frameworks and enterprise workflow optimization.",
  serviceType: [
    "AI Automation Agency",
    "Agentic AI Employees",
    "Business Process Automation",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body className="min-h-screen font-sans">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationJsonLd),
          }}
        />
        <Navbar />
        {children}
        <Footer />
      </body>
    </html>
  );
}
