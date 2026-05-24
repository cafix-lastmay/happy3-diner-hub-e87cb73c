import { createFileRoute } from "@tanstack/react-router";
import { TakeawayDeliveryMenu } from "@/components/customer/TakeawayDeliveryMenu";

export const Route = createFileRoute("/m/takeaway/$token")({ component: TakeawayPage });

function TakeawayPage() {
  const { token } = Route.useParams();
  return <TakeawayDeliveryMenu token={token} mode="take_away" />;
}
