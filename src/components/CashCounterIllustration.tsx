// Comedic animated illustration: a happy person counting an ever-growing stack of cash.
// `intensity` is 0..1 — controls how tall the cash stack grows and how fast it shakes.
interface Props { intensity: number }

export function CashCounterIllustration({ intensity }: Props) {
  const stackCount = 3 + Math.round(intensity * 8); // 3..11 bills
  const wobble = 0.6 + intensity * 0.8; // animation speed multiplier
  const bills = Array.from({ length: stackCount });

  return (
    <div className="relative h-40 sm:h-44 w-full pointer-events-none select-none" aria-hidden>
      <style>{`
        @keyframes hch-shake { 0%,100% { transform: rotate(-3deg);} 50% { transform: rotate(3deg);} }
        @keyframes hch-fly { 0% { transform: translate(-20px,-10px) rotate(-20deg); opacity:0;} 50% { opacity:1;} 100% { transform: translate(60px,-90px) rotate(40deg); opacity:0;} }
        @keyframes hch-bounce { 0%,100% { transform: translateY(0);} 50% { transform: translateY(-4px);} }
        @keyframes hch-eyes { 0%,90%,100% { transform: scaleY(1);} 95% { transform: scaleY(0.1);} }
      `}</style>

      {/* Floating dollar signs */}
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="absolute text-emerald-500 font-black text-xl"
          style={{
            left: `${20 + i * 18}%`,
            bottom: "30%",
            animation: `hch-fly ${1.8 / wobble}s ease-out ${i * 0.4}s infinite`,
          }}
        >$</div>
      ))}

      <div className="absolute inset-0 flex items-end justify-center gap-2">
        {/* Person */}
        <div style={{ animation: `hch-bounce ${1 / wobble}s ease-in-out infinite` }}>
          <svg width="90" height="130" viewBox="0 0 90 130" className="drop-shadow">
            {/* Body */}
            <rect x="22" y="55" width="46" height="55" rx="10" fill="hsl(220 70% 50%)" />
            {/* Arms reaching toward cash */}
            <rect x="58" y="60" width="22" height="8" rx="4" fill="hsl(30 60% 75%)" transform="rotate(-15 58 64)" />
            <rect x="10" y="60" width="22" height="8" rx="4" fill="hsl(30 60% 75%)" transform="rotate(15 32 64)" />
            {/* Head */}
            <circle cx="45" cy="35" r="22" fill="hsl(30 60% 78%)" />
            {/* Hair */}
            <path d="M25 28 Q45 8 65 28 Q60 18 45 16 Q30 18 25 28 Z" fill="hsl(25 40% 25%)" />
            {/* Eyes — dollar signs! */}
            <text x="35" y="40" fontSize="14" fontWeight="900" fill="hsl(140 70% 35%)" style={{ animation: "hch-eyes 2s infinite" }}>$</text>
            <text x="50" y="40" fontSize="14" fontWeight="900" fill="hsl(140 70% 35%)" style={{ animation: "hch-eyes 2s infinite" }}>$</text>
            {/* Big smile */}
            <path d="M33 46 Q45 56 57 46" stroke="hsl(0 0% 15%)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
            {/* Legs */}
            <rect x="28" y="108" width="12" height="20" rx="3" fill="hsl(220 30% 30%)" />
            <rect x="50" y="108" width="12" height="20" rx="3" fill="hsl(220 30% 30%)" />
          </svg>
        </div>

        {/* Cash stack — grows with intensity */}
        <div className="relative flex flex-col-reverse items-center pb-2" style={{ minWidth: 90 }}>
          {bills.map((_, i) => (
            <div
              key={i}
              className="relative -mt-3 first:mt-0"
              style={{
                animation: `hch-shake ${0.4 / wobble}s ease-in-out ${i * 0.05}s infinite`,
                zIndex: i,
              }}
            >
              <svg width="90" height="40" viewBox="0 0 90 40">
                <rect x="2" y="2" width="86" height="36" rx="4" fill="hsl(140 50% 75%)" stroke="hsl(140 60% 35%)" strokeWidth="1.5" />
                <circle cx="45" cy="20" r="10" fill="none" stroke="hsl(140 60% 35%)" strokeWidth="1.5" />
                <text x="45" y="25" textAnchor="middle" fontSize="14" fontWeight="900" fill="hsl(140 60% 25%)">$</text>
                <text x="10" y="13" fontSize="6" fontWeight="700" fill="hsl(140 60% 35%)">100</text>
                <text x="74" y="35" fontSize="6" fontWeight="700" fill="hsl(140 60% 35%)">100</text>
              </svg>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
