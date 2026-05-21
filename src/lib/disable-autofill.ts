/**
 * Disable browser/password-manager autofill suggestions globally.
 *
 * Mobile browsers (Chrome / Safari / Edge) show a credential / contacts / location
 * bar above the keyboard when an <input> or <textarea> is focused — even for
 * unrelated fields like a campaign name, coins amount, or item description.
 * None of the inputs in this app collect credentials or addresses, so we
 * stamp every text input with the attributes that suppress those overlays
 * and tell password managers (1Password, LastPass, Bitwarden) to ignore them.
 *
 * We use a MutationObserver so the rule applies to inputs rendered later
 * (modals, dialogs, dynamically inserted forms) without per-component edits.
 */

const TARGET_INPUT_TYPES = new Set([
  "text",
  "number",
  "tel",
  "search",
  "url",
  "",
  // intentionally omit: password, email — those are legitimate credential fields
]);

function harden(el: HTMLInputElement | HTMLTextAreaElement) {
  // Skip elements that explicitly opt in to credentials (login form, etc.)
  if (el.dataset.allowAutofill === "true") return;

  if (el instanceof HTMLInputElement) {
    const t = (el.type || "text").toLowerCase();
    if (!TARGET_INPUT_TYPES.has(t)) return;
  }

  // Use a non-standard token so Chrome stops matching it to known categories.
  if (!el.getAttribute("autocomplete")) el.setAttribute("autocomplete", "off");
  if (!el.getAttribute("autocorrect")) el.setAttribute("autocorrect", "off");
  if (!el.getAttribute("autocapitalize")) el.setAttribute("autocapitalize", "off");
  if (el.spellcheck !== false) el.spellcheck = false;

  // Password-manager opt-outs.
  if (!el.hasAttribute("data-lpignore")) el.setAttribute("data-lpignore", "true");
  if (!el.hasAttribute("data-1p-ignore")) el.setAttribute("data-1p-ignore", "true");
  if (!el.hasAttribute("data-bwignore")) el.setAttribute("data-bwignore", "true");
  if (!el.hasAttribute("data-form-type")) el.setAttribute("data-form-type", "other");
}

function scan(root: ParentNode) {
  root.querySelectorAll("input, textarea").forEach(el => {
    harden(el as HTMLInputElement | HTMLTextAreaElement);
  });
}

let mounted = false;

export function mountDisableAutofill() {
  if (mounted || typeof document === "undefined") return;
  mounted = true;

  scan(document);

  const observer = new MutationObserver(mutations => {
    for (const m of mutations) {
      m.addedNodes.forEach(node => {
        if (node.nodeType !== 1) return;
        const el = node as Element;
        if (el.matches?.("input, textarea")) {
          harden(el as HTMLInputElement | HTMLTextAreaElement);
        }
        if (el.querySelectorAll) scan(el);
      });
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
