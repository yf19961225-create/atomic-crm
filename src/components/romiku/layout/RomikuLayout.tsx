import { type ReactNode, Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { Link } from "react-router";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Error } from "@/components/admin/error";
import { RomikuPrimaryNavigation } from "./RomikuPrimaryNavigation";

export const RomikuLayout = ({ children }: { children: ReactNode }) => (
  <SidebarProvider>
    <Sidebar variant="floating" collapsible="icon">
      <SidebarHeader>
        <Link
          to="/"
          className="px-3 py-2 text-base font-semibold text-sidebar-foreground no-underline"
        >
          <span className="group-data-[collapsible=icon]:hidden">
            ROMIKU CRM 2.0
          </span>
          <span className="hidden group-data-[collapsible=icon]:inline">R</span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <RomikuPrimaryNavigation />
      </SidebarContent>
    </Sidebar>
    <main className="min-h-svh flex-1 px-4 py-6 md:px-8" id="main-content">
      <header className="mb-4 flex md:hidden">
        <SidebarTrigger aria-label="Open primary navigation" />
      </header>
      <ErrorBoundary FallbackComponent={Error}>
        <Suspense fallback={<Skeleton className="h-12 w-12 rounded-full" />}>
          {children}
        </Suspense>
      </ErrorBoundary>
    </main>
  </SidebarProvider>
);
