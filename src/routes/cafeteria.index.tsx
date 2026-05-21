// /cafeteria → redirects to /cafeteria/orders (dashboard removed by request).
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/cafeteria/")({
  beforeLoad: () => {
    throw redirect({ to: "/cafeteria/orders" });
  },
});
