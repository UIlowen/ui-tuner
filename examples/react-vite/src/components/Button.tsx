import type { ReactNode } from "react";

interface ButtonProps {
  children: ReactNode;
  variant?: "primary" | "ghost";
}

export default function Button({ children, variant = "primary" }: ButtonProps) {
  return <button className={`btn btn-${variant}`}>{children}</button>;
}
