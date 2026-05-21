import { createFileRoute } from "@tanstack/react-router";
import { CafeMenu } from "./cafeteria.menu";

export const Route = createFileRoute("/manager/menu")({ component: () => <CafeMenu mode="manager" /> });
