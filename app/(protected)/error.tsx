"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="panel p-10 text-center">
      <h2 className="text-xl font-semibold">
        No se pudo cargar la información
      </h2>
      <p className="text-slate-500 my-4">
        Comprueba la conexión y vuelve a intentarlo.
      </p>
      <Button onClick={reset}>Reintentar</Button>
    </div>
  );
}
