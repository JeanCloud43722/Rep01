import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { IOSInstallPrompt } from "@/components/ios-install-prompt";
import NotFound from "@/pages/not-found";
import AdminPage from "@/pages/admin";
import CustomerPage from "@/pages/customer";
import LoginPage from "@/pages/login";

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/" component={AdminPage} />
      <Route path="/admin" component={AdminPage} />
      <Route path="/order/:id" component={CustomerPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
        <IOSInstallPrompt />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
