import logoImage from "@/assets/zero100-logo.png";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <img 
      src={logoImage} 
      alt="Zero100 Logo" 
      className={`h-40 md:h-44 w-auto ${className}`}
    />
  );
}
