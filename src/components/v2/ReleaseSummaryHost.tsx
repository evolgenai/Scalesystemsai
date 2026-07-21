"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import ReleaseSummaryModal, {
  OPEN_RELEASE_EVENT,
  isReleaseV2Seen,
} from "@/components/v2/ReleaseSummaryModal";
import { isOnboardingComplete } from "@/components/onboarding/OnboardingWizard";

export default function ReleaseSummaryHost() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_RELEASE_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_RELEASE_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (isReleaseV2Seen()) return;
    if (searchParams.get("onboard") === "1") return;
    if (!isOnboardingComplete()) return;

    const timer = window.setTimeout(() => setOpen(true), 900);
    return () => window.clearTimeout(timer);
  }, [ready, pathname, searchParams]);

  const close = useCallback(() => setOpen(false), []);

  return <ReleaseSummaryModal open={open} onClose={close} />;
}
