import type { Metadata } from "next";
import ScaleSystemsCatalog from "@/components/catalog/ScaleSystemsCatalog";
import ErrorBoundary from "@/components/ui/ErrorBoundary";

export const metadata: Metadata = {
  title: "Catalog",
  description:
    "Scale Systems AI catalog — Agent Blueprints, MCP Tools, and Sandboxes. Deploy Meta-SRE Auto-Healing, connect Sentry Telemetry MCP, and spin up persistent Node/Python runtimes.",
};

export default function CatalogPage() {
  return (
    <ErrorBoundary label="Catalog">
      <ScaleSystemsCatalog />
    </ErrorBoundary>
  );
}
