import { cn, labels } from "@/lib/utils";
export function Badge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap",
        ["PAID", "ACCEPTED", "CONVERTED", "Activo"].includes(status)
          ? "bg-emerald-50 text-emerald-700"
          : ["OVERDUE", "REJECTED", "VOID", "EXPIRED", "Inactivo"].includes(
                status,
              )
            ? "bg-red-50 text-red-700"
            : status === "DRAFT"
              ? "bg-slate-100 text-slate-600"
              : "bg-amber-50 text-amber-800",
      )}
    >
      {labels[status] || status}
    </span>
  );
}
