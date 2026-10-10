import { dom } from "../core/dom.js?v=20261010-file-size-refactor-02";

let aboutDialogInitialized = false;

export function initializeAboutDialog() {
  if (aboutDialogInitialized || !dom.aboutDialog || !dom.aboutButton) return;

  const description = dom.aboutDialog.querySelector("#aboutDialogDescription");
  const disclosureButton = description?.querySelector(".about-dialog-disclosure-toggle");
  const disclosureContent = description?.querySelector("#aboutDialogDescriptionRest");
  let pendingDescriptionTransitionEnd = null;

  const resetDescription = () => {
    if (pendingDescriptionTransitionEnd) {
      disclosureContent?.removeEventListener("transitionend", pendingDescriptionTransitionEnd);
      pendingDescriptionTransitionEnd = null;
    }
    description?.classList.remove("is-expanded");
    if (disclosureButton) {
      disclosureButton.hidden = false;
      disclosureButton.setAttribute("aria-expanded", "false");
    }
    if (disclosureContent) {
      disclosureContent.hidden = true;
      disclosureContent.removeAttribute("style");
    }
  };

  disclosureButton?.addEventListener("click", () => {
    if (!description || !disclosureContent || description.classList.contains("is-expanded")) return;

    description.classList.add("is-expanded");
    disclosureButton.hidden = true;
    disclosureButton.setAttribute("aria-expanded", "true");
    disclosureContent.hidden = false;
    disclosureContent.focus({ preventScroll: true });

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    disclosureContent.style.height = "0px";
    disclosureContent.style.opacity = "0";
    disclosureContent.style.overflow = "hidden";
    disclosureContent.style.transition = "height 360ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease-out";
    void disclosureContent.offsetHeight;
    disclosureContent.style.height = `${disclosureContent.scrollHeight}px`;
    disclosureContent.style.opacity = "1";

    pendingDescriptionTransitionEnd = (event) => {
      if (event.target !== disclosureContent || event.propertyName !== "height") return;
      disclosureContent.style.height = "auto";
      disclosureContent.style.opacity = "";
      disclosureContent.style.overflow = "";
      disclosureContent.style.transition = "";
      disclosureContent.removeEventListener("transitionend", pendingDescriptionTransitionEnd);
      pendingDescriptionTransitionEnd = null;
    };
    disclosureContent.addEventListener("transitionend", pendingDescriptionTransitionEnd);
  });

  dom.aboutButton.addEventListener("click", () => {
    dom.aboutDialog.showModal();
    dom.closeAboutDialogButton?.focus();
  });

  dom.closeAboutDialogButton?.addEventListener("click", () => {
    dom.aboutDialog.close();
  });

  dom.aboutDialog.addEventListener("click", (event) => {
    if (event.target === dom.aboutDialog) dom.aboutDialog.close();
  });

  dom.aboutDialog.addEventListener("close", resetDescription);

  aboutDialogInitialized = true;
}
