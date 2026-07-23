import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/navigation/Sidebar";
import TopAuthHeader from "@/components/navigation/TopAuthHeader";
import { NavDrawerProvider } from "@/components/navigation/NavDrawerContext";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { WorkspaceModeProvider } from "@/components/dashboard/ModeWrapper";
import { StreamEngineProvider } from "@/components/spatial/StreamEngineContext";
import LaunchBanner from "@/components/public/LaunchBanner";
import DevToolsMount from "@/components/dev/DevToolsMount";
import BioMetallicThemeServer from "@/components/theme/BioMetallicThemeServer";
import { TEXTURE_COLORS } from "@/lib/theme/textureMatrix";

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
  themeColor: TEXTURE_COLORS.baseVoid,
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  colorScheme: "dark",
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
  other: {
    "x-scale-theme": "bio-metallic",
    "x-scale-void": TEXTURE_COLORS.baseVoid,
    "x-scale-accent": TEXTURE_COLORS.accentGlow,
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
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable}`}
      data-theme="bio-metallic"
    >
      <body className="bio-grain-surface min-h-screen font-sans">
        <BioMetallicThemeServer />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationJsonLd),
          }}
        />
        <AuthProvider>
          <NavDrawerProvider>
            <WorkspaceModeProvider>
              <StreamEngineProvider>
                <div className="bio-vignette flex min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-gradient-to-b from-[var(--theme-base-void)] via-[var(--theme-surface-grain)] to-[var(--theme-bio-sheen)] text-[var(--bio-text)]">
                  <Sidebar />
                  <div className="flex min-w-0 w-full flex-1 flex-col">
                    <LaunchBanner />
                    <TopAuthHeader />
                    <main className="w-full min-w-0 max-w-full flex-1 overflow-x-hidden overflow-y-auto px-3 py-4 sm:px-4 md:p-6 lg:p-8">
                      {children}
                    </main>
                  </div>
                </div>
                <DevToolsMount />
              </StreamEngineProvider>
            </WorkspaceModeProvider>
          </NavDrawerProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
