import { createFileRoute, Outlet } from "@tanstack/react-router";
import { CampaignProvider } from "@/lib/CampaignProvider";
import { BackNavTrap } from "@/components/app/BackNavTrap";

export const Route = createFileRoute("/campaign")({
  component: () => (
    <CampaignProvider>
      <BackNavTrap />
      <Outlet />
    </CampaignProvider>
  ),
});
