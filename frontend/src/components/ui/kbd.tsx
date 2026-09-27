import * as React from "react";

import { cn } from "@/lib/utils";

function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border border-current/25 px-1 font-mono text-[10px] leading-none opacity-70",
        className,
      )}
      {...props}
    />
  );
}

export { Kbd };
