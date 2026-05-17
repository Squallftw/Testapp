export function LoadingScreen({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center bg-bati-bg"
      role="status"
      aria-live="polite"
    >
      <span className="text-sm text-bati-muted">{label}</span>
    </div>
  );
}
