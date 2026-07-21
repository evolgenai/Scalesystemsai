import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/navigation/Sidebar";
import TopAuthHeader from "@/components/navigation/TopAuthHeader";
import { NavDrawerProvider } from "@/components/navigation/NavDrawerContext";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { WorkspaceModeProvider } from "@/components/dashboard/ModeWrapper";
import ReleaseSummaryHost from "@/components/v2/ReleaseSummaryHost";

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
  "ScaleSystems delivers cloud-hosted agentic workflows and multi-agent orchestration. Deploy AI swarm employees for lead generation, autonomous system operations, and 24/7 technical support.";

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
    "agentic workflows",
    "AI swarm",
    "multi-agent orchestration",
    "AI Employees",
    "Agentic Automation",
    "ScaleSystems",
    "Corporate Workflow AI",
    "Custom Autonomous Agents",
    "Gemini agents",
    "enterprise AI automation",
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
    "agentic workflows",
    "AI swarm",
    "multi-agent orchestration",
    "AI Employees",
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
        <AuthProvider>
          <NavDrawerProvider>
            <WorkspaceModeProvider>
              <div className="flex min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-obsidian text-white">
                <Sidebar />
                <div className="flex min-w-0 w-full flex-1 flex-col">
                  <TopAuthHeader />
                  <main className="w-full min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-3 py-4 sm:px-4 md:p-6 lg:p-8">
                    {children}
                  </main>
                </div>
              </div>
              <Suspense fallback={null}>
                <ReleaseSummaryHost />
              </Suspense>
            </WorkspaceModeProvider>
          </NavDrawerProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
