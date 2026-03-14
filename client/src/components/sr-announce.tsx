import { useState, useEffect } from "react";

declare global {
  interface Window {
    announceToScreenReader?: (message: string) => void;
  }
}

export function ScreenReaderAnnounce() {
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    window.announceToScreenReader = (message: string) => {
      setAnnouncement("");
      setTimeout(() => setAnnouncement(message), 100);
    };
  }, []);

  return (
    <div
      aria-live="assertive"
      aria-atomic="true"
      className="absolute w-px h-px overflow-hidden"
    >
      {announcement}
    </div>
  );
}
