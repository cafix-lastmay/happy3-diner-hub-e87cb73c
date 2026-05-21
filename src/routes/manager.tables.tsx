import { createFileRoute } from "@tanstack/react-router";
import { CafeTables } from "./cafeteria.tables";

export const Route = createFileRoute("/manager/tables")({ component: () => <CafeTables mode="manager" /> });
