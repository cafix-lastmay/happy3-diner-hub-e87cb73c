import { createFileRoute } from "@tanstack/react-router";
import { CafeSettings } from "./cafeteria.settings";
export const Route = createFileRoute("/manager/settings")({ component: () => <CafeSettings mode="manager" /> });
