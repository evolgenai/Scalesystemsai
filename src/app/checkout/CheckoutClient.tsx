"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import PaymentGatewayModal from "@/components/checkout/PaymentGatewayModal";
import {
  isCheckoutPlan,
  type CheckoutPlan,
} from "@/lib/billing/commercialPlans";
import { trackFunnelEvent } from "@/lib/analytics/funnel";

function CheckoutInner() {
  const searchParams = useSearchParams();
  const [plan, setPlan] = useState<CheckoutPlan>("STARTER");
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const fromQuery = searchParams.get("plan")?.toUpperCase() ?? "";
    if (isCheckoutPlan(fromQuery)) {
      setPlan(fromQuery);
      trackFunnelEvent({
        event: "checkout_proceed",
        plan: fromQuery,
        metadata: { source: "query" },
      });
    }
  }, [searchParams]);

  return (
    <div className="mx-auto max-w-3xl py-4 text-white">
      <PaymentGatewayModal
        open={open}
        embedded
        initialPlan={plan}
        onClose={() => setOpen(true)}
      />
    </div>
  );
}

export default function CheckoutClient() {
  return (
    <Suspense
      fallback={
        <div className="py-10 text-slate-dim">Loading checkout…</div>
      }
    >
      <CheckoutInner />
    </Suspense>
  );
}
