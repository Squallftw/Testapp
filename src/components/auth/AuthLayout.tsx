import type { ReactNode } from 'react';

interface AuthLayoutProps {
  children: ReactNode;
}

/**
 * Split-screen scaffolding shared by every auth page. Form sits on the left
 * in its native card styling; the right side is a themed visual panel with a
 * teal gradient, a Moroccan-inspired geometric pattern, and an architectural
 * skyline silhouette. On mobile, the visual collapses to a thin top banner.
 */
export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col md:flex-row bati-canvas">
      {/* Mobile top banner — short branded gradient with the wordmark only */}
      <div
        className="md:hidden h-28 relative overflow-hidden flex items-center px-6"
        style={{
          background:
            'linear-gradient(135deg, var(--bati-teal) 0%, var(--bati-teal-deep) 100%)',
        }}
      >
        <ZelligeOverlay />
        <div className="relative z-10">
          <BrandMark compact />
        </div>
      </div>

      {/* Form column */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-md">{children}</div>
      </div>

      {/* Visual panel — md and up */}
      <div
        className="hidden md:flex md:flex-1 relative overflow-hidden items-end"
        aria-hidden
        style={{
          background: `
            radial-gradient(circle at 100% 100%, rgba(197, 129, 34, 0.18), transparent 55%),
            linear-gradient(135deg, var(--bati-teal) 0%, var(--bati-teal-deep) 100%)
          `,
        }}
      >
        <ZelligeOverlay />
        <div className="absolute top-10 left-10 right-10 z-10">
          <BrandMark />
        </div>
        <ArchitecturalSilhouette />
      </div>
    </div>
  );
}

interface BrandMarkProps {
  compact?: boolean;
}

function BrandMark({ compact = false }: BrandMarkProps) {
  if (compact) {
    return (
      <div className="text-white">
        <p className="text-lg font-bold tracking-tight">BatiTrack</p>
        <p className="text-[11px] text-white/70 -mt-0.5">Suivi de chantiers</p>
      </div>
    );
  }
  return (
    <div className="text-white">
      <div className="flex items-center gap-3">
        <LogoMark />
        <div>
          <p className="text-3xl font-bold tracking-tight">BatiTrack</p>
          <p className="text-sm text-white/70 mt-0.5">
            Suivi de chantiers au Maroc
          </p>
        </div>
      </div>
      <p className="text-sm text-white/80 mt-8 max-w-sm leading-relaxed">
        Pilotez vos chantiers en temps réel : pointage, matériaux, planning,
        budget. Sur un seul écran, depuis le bureau ou la voiture.
      </p>
    </div>
  );
}

/** Small mark used next to the wordmark — abstract construction triangle + base. */
function LogoMark() {
  return (
    <svg
      width="36"
      height="36"
      viewBox="0 0 36 36"
      fill="none"
      aria-hidden
      className="shrink-0"
    >
      <rect
        x="2"
        y="2"
        width="32"
        height="32"
        rx="6"
        stroke="white"
        strokeOpacity="0.4"
        strokeWidth="1.5"
      />
      <path d="M9 26 L18 10 L27 26 Z" stroke="white" strokeWidth="1.8" fill="none" />
      <line x1="9" y1="26" x2="27" y2="26" stroke="white" strokeWidth="1.8" />
      <circle cx="18" cy="19" r="1.6" fill="white" />
    </svg>
  );
}

/**
 * Repeating geometric pattern inspired by Moroccan zellige — 8-point star
 * approximated by overlaying two rotated squares. Pure SVG-as-data-URI so it
 * tiles cleanly at any panel size without DOM noise.
 */
function ZelligeOverlay() {
  // Two overlaid squares (one rotated 45°) form an 8-point star outline.
  // Render via inline SVG <pattern> so the entire pattern tiles via a single
  // <rect fill="url(#…)"> inside the absolute overlay.
  return (
    <svg
      className="absolute inset-0 w-full h-full"
      aria-hidden
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <pattern
          id="zellige"
          x="0"
          y="0"
          width="72"
          height="72"
          patternUnits="userSpaceOnUse"
        >
          <g
            stroke="white"
            strokeOpacity="0.07"
            strokeWidth="1"
            fill="none"
          >
            <rect x="20" y="20" width="32" height="32" />
            <rect
              x="20"
              y="20"
              width="32"
              height="32"
              transform="rotate(45 36 36)"
            />
            <circle cx="36" cy="36" r="2" />
          </g>
        </pattern>
      </defs>
      <rect x="0" y="0" width="100%" height="100%" fill="url(#zellige)" />
    </svg>
  );
}

/**
 * Architectural skyline: stylized buildings + a construction crane, drawn in
 * cream stroke at varying opacities for atmospheric depth. Bottom-aligned so
 * the buildings sit on a horizon line at the lower third of the panel.
 */
function ArchitecturalSilhouette() {
  return (
    <svg
      className="absolute bottom-0 left-0 w-full"
      viewBox="0 0 800 380"
      preserveAspectRatio="xMidYEnd slice"
      aria-hidden
    >
      {/* Far skyline — faint */}
      <g stroke="white" strokeOpacity="0.18" strokeWidth="1.2" fill="none">
        <rect x="40" y="220" width="50" height="160" />
        <rect x="100" y="240" width="60" height="140" />
        <path d="M170 240 L 200 215 L 230 240 L 230 380 L 170 380 Z" />
        <rect x="240" y="200" width="40" height="180" />
        <rect x="290" y="230" width="55" height="150" />
        <rect x="700" y="210" width="60" height="170" />
        <rect x="760" y="240" width="35" height="140" />
      </g>

      {/* Mid skyline — medium */}
      <g stroke="white" strokeOpacity="0.35" strokeWidth="1.4" fill="none">
        {/* Tower with window stripes */}
        <rect x="120" y="180" width="70" height="200" />
        <line x1="130" y1="210" x2="180" y2="210" />
        <line x1="130" y1="240" x2="180" y2="240" />
        <line x1="130" y1="270" x2="180" y2="270" />
        <line x1="130" y1="300" x2="180" y2="300" />
        <line x1="130" y1="330" x2="180" y2="330" />
        <line x1="130" y1="360" x2="180" y2="360" />

        {/* Building under construction with scaffolding lattice */}
        <rect x="430" y="110" width="120" height="270" />
        <g strokeOpacity="0.22">
          {/* horizontal scaffolding */}
          <line x1="430" y1="150" x2="550" y2="150" />
          <line x1="430" y1="190" x2="550" y2="190" />
          <line x1="430" y1="230" x2="550" y2="230" />
          <line x1="430" y1="270" x2="550" y2="270" />
          <line x1="430" y1="310" x2="550" y2="310" />
          <line x1="430" y1="350" x2="550" y2="350" />
          {/* vertical scaffolding */}
          <line x1="455" y1="110" x2="455" y2="380" />
          <line x1="480" y1="110" x2="480" y2="380" />
          <line x1="505" y1="110" x2="505" y2="380" />
          <line x1="525" y1="110" x2="525" y2="380" />
        </g>

        {/* Wide block with grid of windows */}
        <rect x="580" y="200" width="100" height="180" />
        <line x1="595" y1="225" x2="625" y2="225" />
        <line x1="640" y1="225" x2="670" y2="225" />
        <line x1="595" y1="260" x2="625" y2="260" />
        <line x1="640" y1="260" x2="670" y2="260" />
        <line x1="595" y1="295" x2="625" y2="295" />
        <line x1="640" y1="295" x2="670" y2="295" />
        <line x1="595" y1="330" x2="625" y2="330" />
        <line x1="640" y1="330" x2="670" y2="330" />
      </g>

      {/* Foreground accents — domed building (kasbah hint) + small house */}
      <g stroke="white" strokeOpacity="0.5" strokeWidth="1.6" fill="none">
        {/* Domed building */}
        <path d="M 215 380 L 215 290 Q 250 250 285 290 L 285 380 Z" />
        <line x1="225" y1="320" x2="240" y2="320" />
        <line x1="260" y1="320" x2="275" y2="320" />
        <line x1="245" y1="345" x2="255" y2="345" />

        {/* Small house with arched door */}
        <path d="M 320 380 L 320 310 L 360 280 L 400 310 L 400 380 Z" />
        <path d="M 350 380 L 350 340 Q 360 325 370 340 L 370 380" />
        <line x1="330" y1="335" x2="345" y2="335" />
        <line x1="375" y1="335" x2="390" y2="335" />
      </g>

      {/* Construction crane — over the scaffolded building, drawn brighter */}
      <g stroke="white" strokeOpacity="0.65" strokeWidth="1.6" fill="none">
        {/* Mast */}
        <line x1="490" y1="20" x2="490" y2="120" />
        {/* Lattice on mast */}
        <g strokeOpacity="0.45" strokeWidth="1">
          <line x1="485" y1="35" x2="495" y2="55" />
          <line x1="495" y1="35" x2="485" y2="55" />
          <line x1="485" y1="60" x2="495" y2="80" />
          <line x1="495" y1="60" x2="485" y2="80" />
          <line x1="485" y1="85" x2="495" y2="105" />
          <line x1="495" y1="85" x2="485" y2="105" />
        </g>
        {/* Jib (main arm) */}
        <line x1="380" y1="35" x2="630" y2="35" />
        <line x1="380" y1="40" x2="630" y2="40" />
        {/* Tie cables to mast top */}
        <line x1="395" y1="35" x2="490" y2="10" />
        <line x1="490" y1="10" x2="615" y2="35" />
        {/* Counter-arm weight */}
        <rect x="380" y="40" width="30" height="14" />
        {/* Hook line */}
        <line x1="585" y1="40" x2="585" y2="115" strokeDasharray="3 4" />
        {/* Hook */}
        <path d="M 580 115 Q 585 122 590 115" />
        <circle cx="585" cy="118" r="2.5" />
      </g>

      {/* Ground line */}
      <line
        x1="0"
        y1="380"
        x2="800"
        y2="380"
        stroke="white"
        strokeOpacity="0.6"
        strokeWidth="1.5"
      />
    </svg>
  );
}
