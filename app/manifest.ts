import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dra. Mariaraúl · Clínica",
    short_name: "Mariaraúl",
    description: "Facturación, tratamientos y citas de la clínica",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f7faf8",
    theme_color: "#506c60",
    icons: [
      { src: "/brand/app-icon.png", sizes: "192x192", type: "image/png" },
    ],
  };
}
