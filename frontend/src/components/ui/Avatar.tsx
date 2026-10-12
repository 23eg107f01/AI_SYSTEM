import { type HTMLAttributes } from "react";
import { cn } from "./cn";

export interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
  name?: string;
  src?: string;
  size?: "sm" | "md" | "lg";
}

const sizes = { sm: "h-7 w-7 text-xs", md: "h-9 w-9 text-sm", lg: "h-12 w-12 text-base" };

export function Avatar({ name = "User", src, size = "md", className, ...props }: AvatarProps) {
  const initials = name.trim().split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div
      className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-100 font-semibold text-brand-700", sizes[size], className)}
      {...props}
    >
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : initials}
    </div>
  );
}
