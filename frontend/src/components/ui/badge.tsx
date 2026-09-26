import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "label-mono inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 whitespace-nowrap",
  {
    variants: {
      variant: {
        outline: "border-border text-muted-foreground",
        signal: "border-transparent bg-signal text-signal-foreground",
        night: "border-night-line bg-night-raised text-night-muted",
      },
    },
    defaultVariants: { variant: "outline" },
  },
);

function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge };
