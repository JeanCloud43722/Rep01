import { useState } from "react";
import { audioManager } from "@/lib/audio-manager";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Volume2, Smartphone, Bell, AlertTriangle } from "lucide-react";

interface AudioUnlockOverlayProps {
  onUnlock: () => void;
}

export function AudioUnlockOverlay({ onUnlock }: AudioUnlockOverlayProps) {
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUnlock = async () => {
    setIsUnlocking(true);
    setError(null);
    
    try {
      const success = await audioManager.unlock();
      
      if (success) {
        audioManager.play('message');
        onUnlock();
      } else {
        setError("Audio activation failed. Please try again.");
      }
    } catch (e) {
      console.error('Audio unlock error:', e);
      setError("An error occurred. Please tap again.");
    } finally {
      setIsUnlocking(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4"
      data-testid="overlay-audio-unlock"
    >
      <Card className="max-w-md w-full">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Volume2 className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-xl">Enable Sound Notifications</CardTitle>
          <CardDescription className="text-base">
            Tap the button below to activate sound alerts so you never miss when your order is ready.
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6">
          <Button 
            onClick={handleUnlock}
            disabled={isUnlocking}
            className="w-full h-14 text-lg"
            data-testid="button-unlock-audio"
          >
            {isUnlocking ? (
              <>
                <Volume2 className="mr-2 h-5 w-5 animate-pulse" />
                Activating...
              </>
            ) : (
              <>
                <Bell className="mr-2 h-5 w-5" />
                Activate Sound & Continue
              </>
            )}
          </Button>
          
          {error && (
            <div className="text-sm text-destructive text-center" data-testid="text-unlock-error">
              {error}
            </div>
          )}
          
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4 space-y-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-2">
                <p className="font-medium text-amber-800 dark:text-amber-200 text-sm">
                  iOS Users: Important Tips
                </p>
                <ul className="text-xs text-amber-700 dark:text-amber-300 space-y-1.5">
                  <li className="flex items-start gap-2">
                    <Smartphone className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>Make sure the physical <strong>mute switch</strong> on your iPhone is OFF (no orange visible)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Bell className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>Disable <strong>Do Not Disturb</strong> and <strong>Focus</strong> modes in Control Center</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Volume2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>Turn your <strong>volume up</strong> using the side buttons</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
          
          <p className="text-xs text-muted-foreground text-center">
            For the best experience, add this page to your Home Screen.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
