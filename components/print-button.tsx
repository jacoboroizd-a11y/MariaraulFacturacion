"use client";
import { Printer } from "lucide-react";
import { Button } from "./ui/button";
export function PrintButton() {
  return (
    <Button size="sm" variant="outline" onClick={() => window.print()}>
      <Printer size={14} />
      Imprimir
    </Button>
  );
}
