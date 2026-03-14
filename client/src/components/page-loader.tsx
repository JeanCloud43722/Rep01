export function PageLoader() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-3">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      <p className="text-sm text-muted-foreground">Loading...</p>
    </div>
  );
}
