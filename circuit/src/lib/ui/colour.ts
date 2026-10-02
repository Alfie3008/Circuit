/**
 * OKLCH → sRGB hex. The design specifies colours in OKLCH, but Blockly only
 * parses hex/rgb, so theme colours are converted here.
 */
export function oklch(l: number, c: number, h: number): string {
  const hr = (h * Math.PI) / 180;
  const a = c * Math.cos(hr);
  const b = c * Math.sin(hr);

  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;

  const lin = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  return (
    "#" +
    lin
      .map((x) => {
        const v = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
        return Math.round(Math.min(1, Math.max(0, v)) * 255)
          .toString(16)
          .padStart(2, "0");
      })
      .join("")
  );
}

/** Category accent at a given lightness/chroma. A null hue is neutral grey. */
export function hueColour(hue: number | null, l = 0.8, c = 0.09): string {
  return oklch(l, hue == null ? 0 : c, hue ?? 0);
}

/** Design tokens shared by the Blockly theme, renderer and React chrome. */
export const TOKENS = {
  page: "#0b0c0d",
  canvas: "#0e0f11",
  panel: "#111214",
  block: "#1a1c20",
  block2: "#22252a",
  border: "#2c2f35",
  ink: "#e8e6e1",
  dim: "#8b8d93",
  signal: oklch(0.84, 0.15, 80),
  ok: oklch(0.8, 0.13, 155),
  err: oklch(0.68, 0.19, 25),
} as const;
