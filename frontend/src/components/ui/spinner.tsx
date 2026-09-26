import { LoaderCircle } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

function Spinner({ className, ...props }: React.ComponentProps<typeof LoaderCircle>) {
  return <LoaderCircle aria-hidden className={cn("size-4 animate-spin", className)} {...props} />;
}

export { Spinner };
