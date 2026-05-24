import { createFileRoute } from "@tanstack/react-router";
import { TakeawayDeliveryMenu } from "@/components/customer/TakeawayDeliveryMenu";

export const Route = createFileRoute("/m/delivery/$token")({ component: DeliveryPage });

function DeliveryPage() {
  const { token } = Route.useParams();
  return <TakeawayDeliveryMenu token={token} mode="delivery" />;
}
