import { createFileRoute } from "@tanstack/react-router";
import { CafeHistory } from "./cafeteria.history";
export const Route = createFileRoute("/manager/history")({ component: () => <CafeHistory mode="manager" /> });
