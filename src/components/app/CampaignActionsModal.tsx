import { useState } from "react";
import type { Campaign } from "@/lib/game";
import { CampaignMembersEditor } from "./CampaignMembersEditor";
import { DeleteCampaignButton } from "./DeleteCampaignButton";

type Props = {
  campaign: Campaign;
  currentUserId: string;
  role: "player" | "dm" | "spectator";
  onPlay: () => void;
  onClose: () => void;
  onDeleted?: () => void;
};

/**
 * Modal that opens when the user picks a campaign from their list.
 * Shows 3 actions: Play, Edit (members & flags), Delete (owner only).
 */
export function CampaignActionsModal({ campaign, currentUserId, role, onPlay, onClose, onDeleted }: Props) {
  const [view, setView] = useState<"menu" | "edit">("menu");
  const isOwner = (campaign as any).owner_user_id === currentUserId;

  return (
    <div className="fixed inset-0 z-[100] bg-black/85 flex items-center justify-center p-4" onClick={onClose}>
      <div className="ornate-card p-5 max-w-sm w-full space-y-3 max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {view === "menu" && (
          <>
            <h3 className="font-display text-lg text-center text-[var(--gold)]">{campaign.name}</h3>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground text-center">¿Qué deseas hacer?</p>

            <button className="btn-fantasy w-full" style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }}
              onClick={onPlay}>
              ▶️ Jugar campaña
            </button>

            {isOwner && (
              <button className="btn-fantasy w-full" onClick={() => setView("edit")}>
                ⚙️ Editar campaña
              </button>
            )}

            {isOwner && (
              <DeleteCampaignButton campaignId={campaign.id} campaignName={campaign.name} isOwner={isOwner} onDeleted={onDeleted} />
            )}

            <button className="text-xs underline text-muted-foreground w-full text-center mt-1" onClick={onClose}>Cancelar</button>

            {!isOwner && (
              <p className="text-[10px] text-muted-foreground text-center mt-2">
                Solo el creador original de la campaña puede editarla o eliminarla.
              </p>
            )}
          </>
        )}

        {view === "edit" && (
          <CampaignMembersEditor campaign={campaign} onBack={() => setView("menu")} />
        )}
      </div>
    </div>
  );
}
