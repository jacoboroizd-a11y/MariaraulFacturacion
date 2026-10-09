"use client";
import { useHydrated } from "@/hooks/use-hydrated";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
export function LoginForm() {
  const hydrated = useHydrated();
  const router = useRouter();
  const [error, setError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<{ email: string; password: string }>();
  return (
    <form
      method="post"
      action="/api/auth/login"
      className="space-y-5"
      onSubmit={handleSubmit(async (values) => {
        setError("");
        try {
          const res = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(values),
          });
          const data = await res.json();
          if (!res.ok) {
            setError(data.error);
            return;
          }
          router.push("/");
          router.refresh();
        } catch {
          setError("No se pudo conectar. Inténtalo de nuevo.");
        }
      })}
    >
      <div>
        <label htmlFor="email">Usuario o correo</label>
        <Input
          id="email"
          type="text"
          autoComplete="username"
          placeholder="Tu usuario"
          required
          {...register("email")}
        />
      </div>
      <div>
        <label htmlFor="password">PIN o contraseña</label>
        <Input
          id="password"
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          required
          {...register("password")}
        />
      </div>
      {error && (
        <p role="alert" className="text-red-600 text-sm">
          {error}
        </p>
      )}
      <Button className="w-full" disabled={isSubmitting || !hydrated}>
        {isSubmitting ? "Ingresando…" : "Iniciar sesión"}
      </Button>
    </form>
  );
}
