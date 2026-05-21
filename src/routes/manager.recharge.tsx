import { createFileRoute } from "@tanstack/react-router";
import { CafeRecharge } from "./cafeteria.recharge";
export const Route = createFileRoute("/manager/recharge")({ component: () => <CafeRecharge mode="manager" /> });
