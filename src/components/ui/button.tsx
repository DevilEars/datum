import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blueprint",
  {
    variants: {
      variant: {
        primary: "bg-blueprint text-paper hover:bg-blueprint-deep",
        quiet: "bg-transparent text-ink hover:bg-rule",
        line: "border border-line bg-surface text-ink hover:border-blueprint",
      },
      size: {
        md: "min-h-11 px-3 text-sm",
        sm: "min-h-11 px-2.5 text-xs",
      },
    },
    defaultVariants: { variant: "line", size: "md" },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
