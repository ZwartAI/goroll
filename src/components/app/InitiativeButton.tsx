import { useState } from "react";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";
import { Swords } from "lucide-react";
import type { Character } from "@/lib/game";
import {
  activeBlock,
  blockContainsCharacter,
  buildOrderedTurns,
  participantForCharacter,
  passTurn,
  type CombatEncounter,
  type CombatParticipant,
  type CombatTurnGroup,
  type CombatTurnPin,
} from "@/lib/combat";
import { InitiativeRollModal } from "@/components/app/InitiativeRollModal";

type Props = {
  character: Character;
  encounter: CombatEncounter | null;
  participants: CombatParticipant[];
  groups: CombatTurnGroup[];
  pins?: CombatTurnPin[];
  /** Online characters in the campaign — used to populate Enlace selector. */
  online: Character[];
};

export function InitiativeButton({ character, encounter, participants, groups, pins, online }: Props) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const status = encounter?.status ?? null;
  const myPart = participantForCharacter(participants, character.id);
  const blocks = buildOrderedTurns(participants, groups, pins || []);
  const active = activeBlock(encounter, blocks);
  const myTurn = active ? blockContainsCharacter(active, character.id) : false;

  const inLink = !!myPart?.turn_group_id;

  let label = t("combat.btnInitiative");
  let onClick: (() => void) | null = null;
  let style: React.CSSProperties = { opacity: 0.45, cursor: "not-allowed" };
  let disabled = true;

  if (status === "collecting") {
    if (myPart) {
      label = inLink ? t("combat.btnInLink") : t("combat.btnWaitingDm");
      disabled = true;
      style = { opacity: 0.6 };
    } else {
      label = t("combat.btnInitiative");
      onClick = () => setOpen(true);
      disabled = false;
      style = { background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" };
    }
  } else if (status === "active") {
    if (myTurn) {
      label = t("combat.btnPassTurn");
      disabled = false;
      style = { background: "linear-gradient(135deg, var(--gain), oklch(0.45 0.16 145))", color: "white" };
      onClick = async () => {
        const r = await passTurn(encounter!, blocks, character);
        if (!r.ok) toast.error(t("combat.passError"));
      };
    } else if (myPart) {
      label = t("combat.btnWaitingTurn");
      disabled = true;
      style = { opacity: 0.55 };
    } else {
      // Combat is active but this character is not registered — allow late join.
      label = t("combat.btnJoinLate");
      onClick = () => setOpen(true);
      disabled = false;
      style = { background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" };
    }
  }


  // Exclude self, non-players, and characters already in a link in this encounter.
  const linkedIds = new Set(
    participants.filter(p => p.turn_group_id && p.character_id).map(p => p.character_id as string),
  );
  const linkCandidates = online.filter(
    c => c.id !== character.id && c.role === "player" && !linkedIds.has(c.id),
  );

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onClick?.()}
        className="btn-fantasy w-full flex items-center justify-center gap-2 font-display tracking-wider"
        style={style}
      >
        <Swords size={14} />
        <span>{label}</span>
      </button>

      {open && encounter && (
        <InitiativeRollModal
          encounter={encounter}
          character={character}
          linkCandidates={linkCandidates}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
