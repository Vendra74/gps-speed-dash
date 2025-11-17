import logoImage from "@/assets/zero100-logo.png";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <img 
      src={logoImage} 
      alt="Zero100 Logo" 
      className={`h-12 md:h-16 w-auto ${className}`}
    />
  );
}
