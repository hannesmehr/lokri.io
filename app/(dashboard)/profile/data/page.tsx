import { ArrowLeftRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DataPortability } from "../_data-portability";

export default function ProfileDataPage() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-sky-500/15 to-emerald-500/15 text-sky-700 dark:text-sky-400">
            <ArrowLeftRight className="h-4 w-4" />
          </div>
          <div>
            <CardTitle>Daten-Portabilität</CardTitle>
            <CardDescription>
              Export als ZIP (DSGVO Art. 20) oder Import aus einem
              lokri-Export / Obsidian-Vault.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <DataPortability />
      </CardContent>
    </Card>
  );
}
