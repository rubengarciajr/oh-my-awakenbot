import { OrbMark } from "../ui/OrbMark";
import { t } from "../i18n";
import { useVisualActivity } from "./visualActivity";
import "./account-loading.css";

export function AccountLoading({ visible }: { visible: boolean }) {
  const active = useVisualActivity();
  if (!visible) return null;
  return (
    <div className="account-loading" data-testid="account-loading" hidden={!active}
      role="status" aria-live="polite" aria-label={t("tl.loading")}>
      <div className="account-loading-center" aria-hidden="true">
        <OrbMark />
        <p>{t("loading.label")}<span className="account-loading-dots"><i>.</i><i>.</i><i>.</i></span></p>
      </div>
    </div>
  );
}
