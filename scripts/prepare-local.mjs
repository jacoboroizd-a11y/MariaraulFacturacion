import { existsSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
if (!existsSync(".env")) {
  const password = randomBytes(24).toString("hex");
  const values = {
    DATABASE_URL: `postgresql://mariaraul:${password}@127.0.0.1:5432/mariaraul?schema=public`,
    POSTGRES_PASSWORD: password,
    AUTH_SECRET: randomBytes(32).toString("hex"),
    APP_URL: "http://localhost:3000",
    SEED_ADMIN_PASSWORD: randomBytes(24).toString("base64url"),
    SEED_BILLING_PASSWORD: randomBytes(24).toString("base64url"),
  };
  writeFileSync(
    ".env",
    Object.entries(values)
      .map(([name, value]) => `${name}="${value}"`)
      .join("\n") + "\n",
    { mode: 0o600 },
  );
  console.log(
    ".env local creado con valores aleatorios. Las credenciales no se imprimen.",
  );
} else console.log(".env existente preservado.");
