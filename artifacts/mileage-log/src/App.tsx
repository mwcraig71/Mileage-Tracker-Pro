import { useState } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import SettingsPage from "@/pages/settings";

const queryClient = new QueryClient();

const BANNER_KEY = "hideDriverAppBanner";

function DriverAppBanner() {
  const [hidden, setHidden] = useState(() => {
    if (typeof window === "undefined") return true;
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    if (!isMobile) return true;
    return localStorage.getItem(BANNER_KEY) === "1";
  });

  if (hidden) return null;

  const dismiss = () => {
    try { localStorage.setItem(BANNER_KEY, "1"); } catch { /* ignore */ }
    setHidden(true);
  };

  return (
    <div className="flex items-center gap-2 bg-amber-500/15 border-b border-amber-500/25 px-4 py-2 text-sm text-amber-200">
      <a href="/driver-app/" className="flex-1 font-medium hover:text-amber-100">
        Driving today? Open the Driver App →
      </a>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="text-amber-200/60 hover:text-amber-100 transition-colors shrink-0"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/settings" component={SettingsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <DriverAppBanner />
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
