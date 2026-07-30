// La MISMA llave del juego (anilla trilobulada, tija, collar y
// dientes) como logo SVG dorado: mantiene la identidad visual de las
// llaves 3D de la escena en pantallas 2D (login, etc.).
export default function KeyLogo({ size = 52 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size * 1.4}
      viewBox="0 0 100 140"
      fill="none"
      aria-hidden
    >
      <defs>
        <linearGradient id="keyGold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe08a" />
          <stop offset="0.45" stopColor="#e8b23a" />
          <stop offset="1" stopColor="#a97a14" />
        </linearGradient>
      </defs>
      {/* Orejas de la anilla */}
      <circle cx="35" cy="17" r="8.5" stroke="url(#keyGold)" strokeWidth="6.5" />
      <circle cx="65" cy="17" r="8.5" stroke="url(#keyGold)" strokeWidth="6.5" />
      {/* Anilla principal */}
      <circle cx="50" cy="38" r="19" stroke="url(#keyGold)" strokeWidth="8.5" />
      {/* Tija */}
      <rect x="44.5" y="55" width="11" height="72" rx="4.5" fill="url(#keyGold)" />
      {/* Collar decorativo */}
      <rect x="39" y="64" width="22" height="8" rx="3" fill="url(#keyGold)" />
      {/* Dientes (paletón) */}
      <rect x="54" y="103" width="18" height="9" rx="2" fill="url(#keyGold)" />
      <rect x="54" y="116" width="14" height="8" rx="2" fill="url(#keyGold)" />
    </svg>
  );
}
