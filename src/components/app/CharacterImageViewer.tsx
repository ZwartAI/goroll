import { useT } from "@/lib/i18n";
import { Pencil, X, User, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Fullscreen viewer for the character full-body image. Tapping a character's
 * square portrait opens this. If the character only has a face image but no
 * body image (legacy), we still show the face. If neither exists, we surface
 * a "Upload images" button that opens the editor directly.
 */
export function CharacterImageViewer({
  character,
  canEdit,
  canDelete = false,
  onClose,
  onEditFace,
  onEditBody,
}: {
  character: any;
  canEdit: boolean;
  canDelete?: boolean;
  onClose: () => void;
  onEditFace: () => void;
  onEditBody: () => void;
}) {
  const { t } = useT();
  const hasBody = !!character?.body_image_url;
  const bodyUrl: string =
    character?.body_image_url || character?.image_url || "";
  const faceUrl: string = character?.image_url || "";
  // If there's no dedicated body image and we fall back to the face image,
  // also use the face's framing (offset/scale/rotation) so the portrait
  // matches what the player configured. Otherwise use the body's framing.
  const ox = hasBody
    ? (character?.body_image_offset_x ?? 50)
    : (character?.image_offset_x ?? 50);
  const oy = hasBody
    ? (character?.body_image_offset_y ?? 50)
    : (character?.image_offset_y ?? 50);
  const scale = hasBody
    ? (character?.body_image_scale || 1)
    : (character?.image_scale || 1);
  const rot = hasBody
    ? (character?.body_image_rotation || 0)
    : (character?.image_rotation || 0);

  async function deleteImage(kind: "face" | "body") {
    if (!character?.id) return;
    if (!confirm(t("profile.imgDeleteConfirm"))) return;
    const patch: any = kind === "face"
      ? { image_url: "", image_offset_x: 50, image_offset_y: 50, image_scale: 1, image_rotation: 0 }
      : { body_image_url: "", body_image_offset_x: 50, body_image_offset_y: 50, body_image_scale: 1, body_image_rotation: 0 };
    const { error } = await supabase.from("characters").update(patch).eq("id", character.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("OK");
    onClose();
  }

  return (
    <div
      className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-3"
      onClick={onClose}
    >
      <button
        type="button"
        aria-label="close"
        onClick={onClose}
        className="absolute top-3 right-3 p-2 rounded-full bg-black/60 text-white"
      >
        <X size={18} />
      </button>

      <div
        className="relative w-full max-w-md aspect-[3/4] rounded-xl overflow-hidden bg-[var(--secondary)] ornate-card !p-0"
        onClick={(e) => e.stopPropagation()}
      >
        {bodyUrl ? (
          <img
            src={bodyUrl}
            alt={character?.name}
            className="absolute inset-0 w-full h-full object-cover"
            style={{
              transform: `translate(${ox - 50}%, ${oy - 50}%) scale(${scale}) rotate(${rot}deg)`,
              transformOrigin: "center center",
            }}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground p-6 text-center">
            <User size={48} />
            <p className="text-sm">{t("profile.imgViewerNone")}</p>
            {canEdit && (
              <button
                className="btn-fantasy"
                onClick={() => { onEditFace(); }}
              >
                {t("profile.imgUploadBoth")}
              </button>
            )}
          </div>
        )}

        {canEdit && bodyUrl && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2">
            <button
              type="button"
              className="btn-fantasy text-xs px-3 py-1.5 flex items-center gap-1"
              onClick={onEditFace}
            >
              <Pencil size={12} />
              {t("profile.imgEditFace")}
            </button>
            <button
              type="button"
              className="btn-fantasy text-xs px-3 py-1.5 flex items-center gap-1"
              onClick={onEditBody}
            >
              <Pencil size={12} />
              {t("profile.imgEditBody")}
            </button>
          </div>
        )}

        {canDelete && (bodyUrl || faceUrl) && (
          <div className="absolute top-3 left-3 flex flex-col gap-2">
            {faceUrl && (
              <button
                type="button"
                className="text-xs px-3 py-1.5 rounded-md bg-red-700/90 hover:bg-red-700 text-white flex items-center gap-1 shadow"
                onClick={() => deleteImage("face")}
              >
                <Trash2 size={12} />
                {t("profile.imgDeleteFace")}
              </button>
            )}
            {character?.body_image_url && (
              <button
                type="button"
                className="text-xs px-3 py-1.5 rounded-md bg-red-700/90 hover:bg-red-700 text-white flex items-center gap-1 shadow"
                onClick={() => deleteImage("body")}
              >
                <Trash2 size={12} />
                {t("profile.imgDeleteBody")}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
