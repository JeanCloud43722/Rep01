import { useState, useRef, useEffect } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Camera, Upload, X, AlertCircle, Loader2 } from "lucide-react";

interface QRScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
}

export function QRScanner({ onScanSuccess, onClose }: QRScannerProps) {
  const [mode, setMode] = useState<'camera' | 'upload' | 'error'>('camera');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isScanning, setIsScanning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    startCameraScanning();
    
    return () => {
      stopScanning();
    };
  }, []);

  const startCameraScanning = async () => {
    try {
      setIsScanning(true);
      setErrorMessage('');
      
      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode("qr-reader");
      }

      await scannerRef.current.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0
        },
        (decodedText) => {
          stopScanning();
          onScanSuccess(decodedText);
        },
        () => {}
      );
      
      setMode('camera');
    } catch (err: any) {
      console.error("[QR Scanner] Camera error:", err);
      setIsScanning(false);
      
      if (err?.name === 'NotAllowedError' || err?.message?.includes('Permission')) {
        setErrorMessage('Camera access denied. Please use photo upload instead.');
      } else if (err?.name === 'NotFoundError') {
        setErrorMessage('No camera found. Please use photo upload instead.');
      } else {
        setErrorMessage('Camera not available. Please use photo upload instead.');
      }
      
      setMode('upload');
    }
  };

  const stopScanning = async () => {
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState();
        if (state === 2) {
          await scannerRef.current.stop();
        }
      } catch (err) {
        console.warn("[QR Scanner] Stop error:", err);
      }
    }
    setIsScanning(false);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setErrorMessage('');

    try {
      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode("qr-reader-hidden");
      }

      const result = await scannerRef.current.scanFile(file, true);
      onScanSuccess(result);
    } catch (err) {
      console.error("[QR Scanner] File scan error:", err);
      setErrorMessage('Could not read QR code from image. Please try a clearer photo.');
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const switchToUpload = () => {
    stopScanning();
    setMode('upload');
  };

  const switchToCamera = () => {
    setMode('camera');
    startCameraScanning();
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg">Scan QR Code</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose} data-testid="button-close-scanner">
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {mode === 'camera' && (
            <>
              <div 
                id="qr-reader" 
                className="w-full aspect-square rounded-lg overflow-hidden bg-muted"
              />
              <Button
                variant="outline"
                className="w-full"
                onClick={switchToUpload}
                data-testid="button-switch-to-upload"
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload Photo Instead
              </Button>
            </>
          )}

          {mode === 'upload' && (
            <>
              <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg bg-muted/50">
                {isProcessing ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Processing image...</p>
                  </div>
                ) : (
                  <>
                    <Upload className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-sm text-muted-foreground text-center mb-4">
                      Upload a photo of the QR code from your gallery
                    </p>
                    <Button
                      onClick={() => fileInputRef.current?.click()}
                      data-testid="button-upload-qr"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Choose Photo
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleFileUpload}
                      data-testid="input-qr-file"
                    />
                  </>
                )}
              </div>
              
              <Button
                variant="outline"
                className="w-full"
                onClick={switchToCamera}
                data-testid="button-switch-to-camera"
              >
                <Camera className="h-4 w-4 mr-2" />
                Use Camera Instead
              </Button>
            </>
          )}

          {errorMessage && (
            <div className="flex items-start gap-2 p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <p>{errorMessage}</p>
            </div>
          )}

          <div id="qr-reader-hidden" className="hidden" />
        </CardContent>
      </Card>
    </div>
  );
}
