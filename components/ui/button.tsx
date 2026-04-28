import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import type { JSX } from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap select-none",
    "font-sans text-[12px] font-semibold tracking-[-0.005em]",
    "border border-rule rounded-none",
    "transition-[background-color,color,border-color] duration-100 ease-out",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-fg focus-visible:outline-offset-2",
    "disabled:pointer-events-none disabled:opacity-40",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "bg-fg text-bg border-fg hover:bg-fg-mute hover:border-fg-mute",
        outline: "bg-transparent text-fg border-rule-2 hover:bg-bg-2",
        ghost: "bg-transparent text-fg border-transparent hover:bg-bg-2",
        destructive:
          "bg-brand-accent text-fg border-brand-accent hover:brightness-110",
      },
      size: {
        default: "h-9 px-4",
        sm: "h-7 px-3 text-[11px]",
        lg: "h-11 px-5 text-[13px]",
        icon: "h-9 w-9 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type ButtonProps = ButtonPrimitive.Props & VariantProps<typeof buttonVariants>;

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonProps): JSX.Element {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
export type { ButtonProps };
