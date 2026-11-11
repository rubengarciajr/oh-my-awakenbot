import { useEffect, useState, type ReactNode } from "react";
import "./launch.css";

const BACKGROUNDS = ["charcoal", "quiet-studio"] as const;
const SPLASH_DURATION = 5_000;

/** The desktop launch screen runs alongside bridge startup, then reveals setup or the workspace. */
export function LaunchScreen({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(() =>
    "__TAURI_INTERNALS__" in window || "__AWAKEN_SPLASH__" in window,
  );
  const [background] = useState(() => BACKGROUNDS[Math.floor(Math.random() * BACKGROUNDS.length)]);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  useEffect(() => {
    if (!visible) return;
    const timer = window.setTimeout(() => setVisible(false), SPLASH_DURATION);
    return () => window.clearTimeout(timer);
  }, [visible]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return (
    <>
      <div className="launch-content" inert={visible} aria-hidden={visible || undefined}>{children}</div>
      {visible && (
        <div className="launch-screen" data-background={background} data-testid="launch-screen">
          <img
            src={`/brand/splash-${background}${reducedMotion ? "-still" : ""}.svg`}
            alt=""
            className="launch-orb"
            width={576}
            height={576}
          />
          <div className="launch-wordmark">AWAKEN BOT</div>
        </div>
      )}
    </>
  );
}
