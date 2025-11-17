export function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`inline-flex items-center ${className}`}>
      <span className="text-foreground font-bold tracking-tight" style={{ fontFamily: 'Orbitron, monospace' }}>
        Zero
      </span>
      <span className="text-primary font-bold tracking-tight" style={{ fontFamily: 'Orbitron, monospace' }}>
        100
      </span>
    </div>
  );
}
