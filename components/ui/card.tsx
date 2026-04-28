import type { ComponentProps, JSX } from "react";

import { cn } from "@/lib/utils";

type CardSize = "default" | "sm";
type CardProps = ComponentProps<"div"> & { size?: CardSize };

function Card({
  className,
  size = "default",
  ...props
}: CardProps): JSX.Element {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        "flex flex-col bg-bg-2 text-fg border border-rule rounded-none",
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({
  className,
  ...props
}: ComponentProps<"div">): JSX.Element {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "grid auto-rows-min items-start gap-1 px-5 pt-4 pb-3 border-b border-rule",
        "has-data-[slot=card-action]:grid-cols-[1fr_auto]",
        className,
      )}
      {...props}
    />
  );
}

function CardTitle({
  className,
  ...props
}: ComponentProps<"div">): JSX.Element {
  return (
    <div
      data-slot="card-title"
      className={cn("t-display text-fg", className)}
      {...props}
    />
  );
}

function CardDescription({
  className,
  ...props
}: ComponentProps<"div">): JSX.Element {
  return (
    <div
      data-slot="card-description"
      className={cn("t-body text-fg-mute", className)}
      {...props}
    />
  );
}

function CardAction({
  className,
  ...props
}: ComponentProps<"div">): JSX.Element {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className,
      )}
      {...props}
    />
  );
}

function CardContent({
  className,
  ...props
}: ComponentProps<"div">): JSX.Element {
  return (
    <div data-slot="card-content" className={cn("p-5", className)} {...props} />
  );
}

function CardFooter({
  className,
  ...props
}: ComponentProps<"div">): JSX.Element {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center gap-3 px-5 py-3 border-t border-rule",
        className,
      )}
      {...props}
    />
  );
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
};
export type { CardProps, CardSize };
