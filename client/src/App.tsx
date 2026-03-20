import { lazy, Suspense, useEffect } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { IOSInstallPrompt } from "@/components/ios-install-prompt";
import { ScreenReaderAnnounce } from "@/components/sr-announce";
import { PageLoader } from "@/components/page-loader";

const AdminPage = lazy(() => import("@/pages/admin"));
const AdminProductsPage = lazy(() => import("@/pages/admin-products"));
const CustomerPage = lazy(() => import("@/pages/customer"));
const LoginPage = lazy(() => import("@/pages/login"));
const NotFound = lazy(() => import("@/pages/not-found"));

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/login" component={LoginPage} />
        <Route path="/" component={AdminPage} />
        <Route path="/admin" component={AdminPage} />
        <Route path="/admin/products" component={AdminProductsPage} />
        <Route path="/order/:id" component={CustomerPage} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  // Register service worker for PWA/push notifications
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.warn("[SW] Registration failed:", err);
      });
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <a 
          href="#main-content" 
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded"
        >
          Skip to main content
        </a>
        <Toaster />
        <Router />
        <IOSInstallPrompt />
        <ScreenReaderAnnounce />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
