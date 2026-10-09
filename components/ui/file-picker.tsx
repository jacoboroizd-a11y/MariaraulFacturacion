"use client";
import { useState, type ComponentProps } from "react";
import { useHydrated } from "@/hooks/use-hydrated";
import { Upload } from "lucide-react";
export function FilePicker({
  onChange,
  className,
  ...props
}: ComponentProps<"input">) {
  const hydrated = useHydrated();
  const [name, setName] = useState("");
  return (
    <label
      className={`relative flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white/70 p-3 cursor-pointer focus-within:ring-2 focus-within:ring-emerald-500 ${props.disabled ? "opacity-50 cursor-default" : "hover:border-emerald-300"} ${className || ""}`}
    >
      <input
        {...props}
        type="file"
        disabled={props.disabled || !hydrated}
        className="sr-only"
        onChange={(e) => {
          setName(e.target.files?.[0]?.name || "");
          onChange?.(e);
        }}
      />
      <span className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
        <Upload size={16} />
        Seleccionar archivo
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-normal text-slate-500">
        {name || "Ningún archivo seleccionado"}
      </span>
    </label>
  );
}
