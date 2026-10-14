"use client";

import { btn } from "@/components/ui";

export function PrintButton({ label = "Imprimir" }: { label?: string }) {
  return (
    <button type="button" className={`${btn.secondary} print:hidden`} onClick={() => window.print()}>
      {label}
    </button>
  );
}
