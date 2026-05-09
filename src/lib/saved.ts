import { toast } from "sonner";

/** Show a 1-second confirmation toast after a successful save. */
export function toastSaved(msg = "Cambios confirmados") {
  toast.success(msg, { duration: 1000 });
}
