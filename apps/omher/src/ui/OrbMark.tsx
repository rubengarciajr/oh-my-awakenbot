import { useVisualActivity } from "../app/visualActivity";

/** A quiet, twenty-second version of the launch orb. The circular edge stays fixed. */
export function OrbMark({ className = "" }: { className?: string }) {
  const active = useVisualActivity();
  return (
    <picture className={`orb-mark ${className}`} aria-hidden="true">
      <source media="(prefers-reduced-motion: reduce)" srcSet="/brand/orb-slow-still.svg" />
      <img src={active ? "/brand/orb-slow.svg" : "/brand/orb-slow-still.svg"} alt="" width={20} height={20} />
    </picture>
  );
}
