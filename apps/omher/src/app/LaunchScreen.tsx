import { useEffect, useState, type ReactNode } from "react";
import "./launch.css";
import { introForLaunch, recordIntroShown } from "./launchIntro";
import { useVisualActivity } from "./visualActivity";

const BACKGROUNDS = ["charcoal", "quiet-studio"] as const;
const SPLASH_DURATION = 5_000;

/** The daily desktop intro runs alongside bridge startup, then reveals setup or the workspace. */
export function LaunchScreen({ children }: { children: ReactNode }) {
  const active = useVisualActivity();
  const [launch] = useState(() => introForLaunch({
    native: "__TAURI_INTERNALS__" in window, force: "__AWAKEN_SPLASH__" in window,
  }));
  const [visible, setVisible] = useState(launch.show);
  const [background] = useState(() => launch.show
    ? BACKGROUNDS[Math.floor(Math.random() * BACKGROUNDS.length)] : BACKGROUNDS[0]);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  useEffect(() => {
    if (!visible) return;
    recordIntroShown(launch);
    const timer = window.setTimeout(() => setVisible(false), SPLASH_DURATION);
    return () => window.clearTimeout(timer);
  }, [visible, launch]);

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
            src={`/brand/splash-${background}${reducedMotion || !active ? "-still" : ""}.svg`}
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
