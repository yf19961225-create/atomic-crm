import { useEffect, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { mobileMediaQuery } from "@/hooks/mobile-breakpoint";
import {
  hasAppDraft,
  subscribeAppDraft,
} from "@/components/romiku/updates/drafts";

function isDocumentEditor() {
  const path = window.location.hash.startsWith("#/")
    ? window.location.hash.slice(1)
    : window.location.pathname;
  return /^\/(quotes|pi|orders|production|packing-shipping)\/[^/?#]+\/?(?:[?#]|$)/.test(
    path,
  );
}

/** Switching Admin component types unmounts every editor beneath the router. */
export function useMobileAdmin() {
  const standardMobile = useIsMobile();
  const [mobile, setMobile] = useState(
    () =>
      typeof window !== "undefined" &&
      isDocumentEditor() &&
      window.matchMedia(mobileMediaQuery).matches,
  );
  useEffect(() => {
    const media = window.matchMedia(mobileMediaQuery);
    let deferred = false;
    let active = true;
    const sync = () => {
      if (!active) return;
      deferred = isDocumentEditor() && hasAppDraft();
      if (!deferred) setMobile(media.matches);
    };
    // Draft subscriptions may emit during both cleanup and setup of one React
    // commit. Read the complete set before deciding the editor is safe to unmount.
    const unsubscribe = subscribeAppDraft(() => {
      if (deferred) queueMicrotask(sync);
    });
    media.addEventListener("change", sync);
    sync();
    return () => {
      active = false;
      unsubscribe();
      media.removeEventListener("change", sync);
    };
  }, []);
  return typeof window !== "undefined" && isDocumentEditor()
    ? mobile
    : standardMobile;
}
