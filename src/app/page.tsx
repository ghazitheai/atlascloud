import { redirect } from "next/navigation";
import { currentActor } from "@/lib/auth";
import Workspace from "@/components/Workspace";
export const dynamic = "force-dynamic";
export default async function Page() {
  const a = await currentActor();
  if (!a) redirect("/login");
  return <Workspace />;
}
