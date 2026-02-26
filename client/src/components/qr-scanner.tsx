import { useState, useRef, useEffect } from "react";
import { BrowserQRCodeReader, IScannerControls } from "@zxing/browser";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Camera, Upload, X, AlertCircle, Loader2 } from "lucide-react";

interface QRScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
}

export function QRScanner({ onScanSuccess, onClose }: QRScannerProps) {
  const [mode, setMode] = useState<"camera" | "upload">("camera");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const readerRef = useRef<BrowserQRCodeReader | null>(null);

  const stopCamera = () => {
    if (controlsRef.current) {
      try { controlsRef.current.stop(); } catch {}
      controlsRef.current = null;
    }
  };

  const startCamera = async () => {
    if (!videoRef.current) return;
    setErrorMessage("");
    try {
      if (!readerRef.current) readerRef.current = new BrowserQRCodeReader();
      controlsRef.current = await readerRef.current.decodeFromVideoDevice(
        undefined,
        videoRef.current,
        (result, err) => {
          if (result) {
            stopCamera();
            onScanSuccess(result.getText());
          }
          if (err && !(err.message?.includes("No MultiFormat"))) {
            // suppress continuous "no QR found" noise
          }
        }
      );
    } catch (err: any) {
      stopCamera();
      if (err?.name === "NotAllowedError" || err?.message?.includes("Permission")) {
        setErrorMessage("Camera access denied. Please use photo upload instead.");
      } else if (err?.name === "NotFoundError") {
        setErrorMessage("No camera found. Please use photo upload instead.");
      } else {
        setErrorMessage("Camera not available. Please use photo upload instead.");
      }
      setMode("upload");
    }
  };

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []);

  const handleSwitchToUpload = () => {
    stopCamera();
    setMode("upload");
  };

  const handleSwitchToCamera = () => {
    setMode("camera");
    setTimeout(startCamera, 100);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessing(true);
    setErrorMessage("");
    try {
      const url = URL.createObjectURL(file);
      if (!readerRef.current) readerRef.current = new BrowserQRCodeReader();
      const result = await readerRef.current.decodeFromImageUrl(url);
      URL.revokeObjectURL(url);
      onScanSuccess(result.getText());
    } catch {
      setErrorMessage("Could not read QR code from image. Please try a clearer photo.");
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-lg">Scan QR Code</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose} data-testid="button-close-scanner">
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {mode === "camera" && (
            <>
              <div className="w-full aspect-square rounded-lg overflow-hidden bg-muted relative">
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  muted
                  playsInline
                  autoPlay
                />
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={handleSwitchToUpload}
                data-testid="button-switch-to-upload"
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload Photo Instead
              </Button>
            </>
          )}

          {mode === "upload" && (
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
                    <Button onClick={() => fileInputRef.current?.click()} data-testid="button-upload-qr">
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
                onClick={handleSwitchToCamera}
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
        </CardContent>
      </Card>
    </div>
  );
}
