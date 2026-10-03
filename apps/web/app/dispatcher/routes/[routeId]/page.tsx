import { DispatcherScreen } from "../../screen";

export default async function DispatcherRouteDetailsPage({ params }: { params: Promise<{ routeId: string }> }) {
  const { routeId } = await params;
  return <DispatcherScreen title={routeId.length > 0 ? "Route Details" : "Routes"} />;
}
