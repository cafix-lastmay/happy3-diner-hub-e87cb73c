import { createFileRoute } from "@tanstack/react-router";
import { CafePricing } from "./cafeteria.pricing";
export const Route = createFileRoute("/manager/pricing")({ component: () => <CafePricing mode="manager" /> });
