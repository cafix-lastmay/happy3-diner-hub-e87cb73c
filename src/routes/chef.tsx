// /chef → redirects to /staff/orders
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/chef")({
  beforeLoad: () => {
    throw redirect({ to: "/staff/orders" });
  },
});
