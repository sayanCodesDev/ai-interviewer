import * as React from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface FieldControlProps {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
}

interface FieldProps {
  label: string;
  htmlFor: string;
  hint?: React.ReactNode;
  error?: string | null;
  className?: string;
  /** Receives the id and aria props that wire the control to its label, hint and error. */
  children: (props: FieldControlProps) => React.ReactNode;
}

/** A label, a control and an optional hint or error, wired together for screen readers. */
function Field({ label, htmlFor, hint, error, className, children }: FieldProps) {
  const messageId = error ? `${htmlFor}-error` : hint ? `${htmlFor}-hint` : undefined;

  return (
    <div className={cn("grid gap-2", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children({
        id: htmlFor,
        "aria-describedby": messageId,
        "aria-invalid": error ? true : undefined,
      })}
      {error ? (
        <p id={messageId} role="alert" className="text-[13px] leading-snug text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="text-[13px] leading-snug text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export { Field };
