import "./brand-logo.css";

export function BrandLogo({ size = "nav" }: { size?: "nav" | "login" }) {
  return <img className={`wayloom-logo wayloom-logo-${size}`} src="/WayLoom.png" alt="WayLoom" />;
}
