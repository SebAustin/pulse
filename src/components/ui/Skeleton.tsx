/**
 * Skeleton loading placeholder.
 * DESIGN §4.16 — shimmer animation, reduced-motion: static block.
 */

type Props = {
  width?: string;
  height?: string;
  className?: string;
  style?: React.CSSProperties;
};

export function Skeleton({ width = "100%", height = "1em", className = "", style }: Props) {
  return (
    <span
      className={`skeleton ${className}`}
      aria-hidden="true"
      style={{ display: "block", width, height, ...style }}
    />
  );
}
