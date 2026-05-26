// /waiter → redirects to /staff/orders
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/waiter")({
  beforeLoad: () => {
    throw redirect({ to: "/staff/orders" });
  },
});
