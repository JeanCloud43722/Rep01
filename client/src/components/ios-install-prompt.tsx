import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { X, Share, Plus } from "lucide-react";

function isIOSSafari(): boolean {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isWebkit = /WebKit/.test(ua);
  const isChrome = /CriOS/.test(ua);
  const isFirefox = /FxiOS/.test(ua);
  
  return isIOS && isWebkit && !isChrome && !isFirefox;
}

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true;
}

const DISMISSED_KEY = 'ios_install_prompt_dismissed';

export function IOSInstallPrompt() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isIOSSafari()) return;
    if (isStandalone()) return;
    
    const dismissed = localStorage.getItem(DISMISSED_KEY);
    if (dismissed) {
      const dismissedTime = parseInt(dismissed, 10);
      const daysSinceDismissed = (Date.now() - dismissedTime) / (1000 * 60 * 60 * 24);
      if (daysSinceDismissed < 7) {
        return;
      }
    }
    
    const timer = setTimeout(() => {
      setShow(true);
    }, 3000);
    
    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = () => {
    setShow(false);
    localStorage.setItem(DISMISSED_KEY, Date.now().toString());
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center p-4">
      <Card className="w-full max-w-md animate-slide-up">
        <CardContent className="pt-6 pb-4 relative">
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2"
            onClick={handleDismiss}
            data-testid="button-dismiss-ios-prompt"
          >
            <X className="h-4 w-4" />
          </Button>
          
          <div className="space-y-4">
            <div className="text-center">
              <h3 className="text-lg font-semibold mb-2">Add to Home Screen</h3>
              <p className="text-sm text-muted-foreground">
                For the best experience and reliable notifications, add this app to your home screen.
              </p>
            </div>
            
            <div className="bg-muted rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-primary font-bold">1</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span>Tap the</span>
                  <Share className="h-4 w-4 text-primary" />
                  <span className="font-medium">Share</span>
                  <span>button below</span>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-primary font-bold">2</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span>Scroll and tap</span>
                  <Plus className="h-4 w-4 text-primary" />
                  <span className="font-medium">"Add to Home Screen"</span>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-primary font-bold">3</span>
                </div>
                <p className="text-sm">
                  <span className="font-medium">Open from home screen</span> for full features
                </p>
              </div>
            </div>
            
            <Button 
              className="w-full" 
              onClick={handleDismiss}
              data-testid="button-close-ios-prompt"
            >
              Got it
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
