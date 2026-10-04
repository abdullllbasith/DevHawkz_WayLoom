import Link from "next/link";

import { StatusBanner } from "../../status-banner";

export default function DriverStopsPage() {
  return (
    <StatusBanner
      tone="empty"
      title="No stop selected"
      body="Open a stop from My Routes to continue."
      action={<Link className="btn-primary driver-touch" href="/driver">Back to My Routes</Link>}
    />
  );
}
