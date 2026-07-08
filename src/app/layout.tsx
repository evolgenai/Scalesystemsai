import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import Header from "@/components/marketing/Header";
import Footer from "@/components/marketing/Footer";

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

const siteUrl = "https://scalesystemsai.vercel.app";

const siteTitle = "ScaleSystems | Enterprise Agentic AI Automation Agency";
const siteDescription =
  "Scale and automate your business workflows with custom, cloud-hosted autonomous AI employees. Deploy production-grade AI agents for lead generation, system operations, and 24/7 technical support.";

export const viewport: Viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteTitle,
    template: "%s | ScaleSystems",
  },
  description: siteDescription,
  keywords: [
    "AI Employees",
    "Agentic Automation",
    "ScaleSystems",
    "Corporate Workflow AI",
    "Custom Autonomous Agents",
  ],
  applicationName: "ScaleSystems",
  authors: [{ name: "ScaleSystems", url: siteUrl }],
  creator: "ScaleSystems",
  publisher: "ScaleSystems",
  category: "technology",
  alternates: {
    canonical: siteUrl,
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "ScaleSystems",
    title: siteTitle,
    description: siteDescription,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "ScaleSystems — Enterprise Agentic AI Automation Agency",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
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
  description: siteDescription,
  serviceType: [
    "AI Employees",
    "Agentic Automation",
    "Corporate Workflow AI",
    "Custom Autonomous Agents",
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
        <Header />
        {children}
        <Footer />
      </body>
    </html>
  );
}
