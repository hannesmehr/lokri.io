import { requireSessionWithAccount } from "@/lib/api/session";
import { DangerZone } from "../profile/_danger-zone";

export default async function SettingsGeneralPage() {
  const { session } = await requireSessionWithAccount();
  return (
    <div className="space-y-6">
      <DangerZone userEmail={session.user.email} />
    </div>
  );
}
