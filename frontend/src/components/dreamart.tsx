export function MushroomDream({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 260 330" className={`dream-art ${className}`} aria-hidden="true">
      <defs>
        <radialGradient id="da-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff6c9" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#fff6c9" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="da-cap" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e8566e" />
          <stop offset="100%" stopColor="#b8324c" />
        </linearGradient>
        <linearGradient id="da-stem" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#efe0c2" />
          <stop offset="60%" stopColor="#fbf3e2" />
          <stop offset="100%" stopColor="#e2cfa8" />
        </linearGradient>
      </defs>

      <circle cx="58" cy="52" r="46" fill="url(#da-glow)" className="dream-pulse" />
      <path d="M70 22a32 32 0 1 0 0 60a26 26 0 1 1 0-60z" fill="#f4d98a" stroke="#c9a24f" strokeWidth="1.5" />
      <g className="dream-twinkle" fill="#f4d98a">
        <path d="M200 30l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" />
        <path d="M150 70l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" style={{ animationDelay: "0.8s" }} />
        <path d="M232 92l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" style={{ animationDelay: "1.6s" }} />
        <circle cx="120" cy="34" r="2" style={{ animationDelay: "0.4s" }} />
        <circle cx="24" cy="128" r="1.8" style={{ animationDelay: "1.2s" }} />
      </g>

      <g className="dream-rings" fill="none" stroke="#b9a6e6" strokeWidth="2.5" strokeLinecap="round">
        <ellipse cx="172" cy="128" rx="9" ry="6" />
        <ellipse cx="184" cy="104" rx="12" ry="8" style={{ animationDelay: "1s" }} />
        <ellipse cx="170" cy="78" rx="15" ry="10" style={{ animationDelay: "2s" }} />
      </g>

      <ellipse cx="130" cy="312" rx="118" ry="16" fill="#9cc27e" />
      <ellipse cx="130" cy="308" rx="104" ry="11" fill="#b5d796" />

      <path d="M112 300c-4-40-2-80 6-112h28c8 32 10 72 6 112z" fill="url(#da-stem)" stroke="#9a7a55" strokeWidth="2" />
      <path d="M118 200c6 4 22 4 28 0" fill="none" stroke="#c9b48c" strokeWidth="1.5" />
      <path d="M40 196c0-50 40-84 92-84s92 34 92 84c-30 10-154 10-184 0z" fill="url(#da-cap)" stroke="#7d1f33" strokeWidth="2" />
      <g fill="#fff7ec" opacity="0.95">
        <ellipse cx="86" cy="160" rx="13" ry="9" />
        <ellipse cx="130" cy="134" rx="11" ry="8" />
        <ellipse cx="176" cy="158" rx="14" ry="9" />
        <ellipse cx="110" cy="182" rx="8" ry="5" />
        <ellipse cx="200" cy="184" rx="7" ry="5" />
        <ellipse cx="62" cy="186" rx="6" ry="4" />
      </g>

      <g className="dream-bob">
        <circle cx="96" cy="118" r="11" fill="#6aa6d6" stroke="#2f5f86" strokeWidth="1.5" />
        <circle cx="114" cy="112" r="12" fill="#7cb3df" stroke="#2f5f86" strokeWidth="1.5" />
        <circle cx="133" cy="110" r="12.5" fill="#6aa6d6" stroke="#2f5f86" strokeWidth="1.5" />
        <circle cx="151" cy="104" r="13" fill="#7cb3df" stroke="#2f5f86" strokeWidth="1.5" />
        <circle cx="158" cy="84" r="13" fill="#8cc0e6" stroke="#2f5f86" strokeWidth="1.5" />
        <circle cx="154" cy="80" r="2.2" fill="#1d2b3a" />
        <circle cx="164" cy="80" r="2.2" fill="#1d2b3a" />
        <path d="M155 89q4 3 8 0" fill="none" stroke="#1d2b3a" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M152 72l-4-10M164 72l4-10" stroke="#2f5f86" strokeWidth="2" strokeLinecap="round" />
        <path d="M168 92c6 6 6 16 2 24" fill="none" stroke="#7a5a3a" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="170" cy="118" r="3" fill="#f4d98a" />
      </g>

      <g className="dream-bob" style={{ animationDelay: "1.4s" }}>
        <path d="M20 304c0-6 2-22 6-26h10c4 4 6 20 6 26z" fill="#f6ecd6" stroke="#9a7a55" strokeWidth="1.5" />
        <path d="M8 280c0-14 10-24 23-24s23 10 23 24c-10 4-36 4-46 0z" fill="#8e6bc9" stroke="#4e3580" strokeWidth="1.5" />
        <circle cx="22" cy="268" r="3" fill="#efe2ff" />
        <circle cx="38" cy="266" r="2.5" fill="#efe2ff" />
      </g>
      <g className="dream-bob" style={{ animationDelay: "0.7s" }}>
        <path d="M216 306c0-5 1-16 4-19h8c3 3 4 14 4 19z" fill="#f6ecd6" stroke="#9a7a55" strokeWidth="1.5" />
        <path d="M206 288c0-11 8-19 18-19s18 8 18 19c-8 3-28 3-36 0z" fill="#3a9d93" stroke="#1f5f59" strokeWidth="1.5" />
        <circle cx="218" cy="279" r="2.4" fill="#dff5f2" />
        <circle cx="231" cy="281" r="2" fill="#dff5f2" />
      </g>
      <g fill="#7da64a">
        <path d="M70 306c2-10 6-14 10-16-2 6-3 11-2 16z" />
        <path d="M186 306c-2-9-6-13-10-15 2 5 3 10 2 15z" />
        <path d="M100 308c1-7 4-10 7-11-1 4-2 7-1 11z" />
      </g>
    </svg>
  );
}

export function CheshireTree({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 260 330" className={`dream-art ${className}`} aria-hidden="true">
      <defs>
        <linearGradient id="da-fade" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0%" stopColor="#fff" stopOpacity="1" />
          <stop offset="55%" stopColor="#fff" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0.1" />
        </linearGradient>
        <mask id="da-fade-mask">
          <rect x="0" y="0" width="260" height="330" fill="url(#da-fade)" />
        </mask>
        <linearGradient id="da-fur" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c86fd0" />
          <stop offset="100%" stopColor="#8a3d9e" />
        </linearGradient>
      </defs>

      <path d="M262 150c-40 6-70 20-102 26s-70 0-104 18c-14 8-26 22-34 36" fill="none" stroke="#6b4a2e" strokeWidth="16" strokeLinecap="round" />
      <path d="M262 150c-40 6-70 20-102 26s-70 0-104 18c-14 8-26 22-34 36" fill="none" stroke="#8a6440" strokeWidth="7" strokeLinecap="round" opacity="0.7" />
      <path d="M150 178c-6 14-4 30 4 40M84 192c-12-10-28-12-40-8" fill="none" stroke="#6b4a2e" strokeWidth="5" strokeLinecap="round" />
      <g fill="#7da64a" stroke="#4f7a2a" strokeWidth="1">
        <path d="M154 218c-10 2-16 10-14 18 10-2 16-10 14-18z" />
        <path d="M44 184c-10-4-20 0-22 8 10 4 20 0 22-8z" />
        <path d="M230 150c-4-10-14-14-22-10 4 10 14 14 22 10z" />
        <path d="M196 166c2 10 10 16 18 14-2-10-10-16-18-14z" />
        <path d="M24 226c-8 4-12 12-8 20 8-4 12-12 8-20z" />
      </g>

      <g mask="url(#da-fade-mask)" className="dream-fade">
        <path d="M70 182c-14-10-18-28-10-40 6 8 4 20 14 30" fill="none" stroke="url(#da-fur)" strokeWidth="9" strokeLinecap="round" />
        <path d="M70 182c-14-10-18-28-10-40" fill="none" stroke="#f3c6f5" strokeWidth="9" strokeLinecap="round" strokeDasharray="5 9" />
        <ellipse cx="132" cy="160" rx="62" ry="24" fill="url(#da-fur)" stroke="#5d2470" strokeWidth="2" />
        <g stroke="#f3c6f5" strokeWidth="6" strokeLinecap="round" opacity="0.85">
          <path d="M92 146q4 14 0 28" fill="none" />
          <path d="M112 140q5 18 0 40" fill="none" />
          <path d="M134 138q5 20 0 44" fill="none" />
          <path d="M156 140q5 18 0 40" fill="none" />
        </g>
        <path d="M100 180q6 8 14 8M160 180q6 8 14 8" fill="none" stroke="#5d2470" strokeWidth="5" strokeLinecap="round" />
      </g>

      <g className="dream-bob" style={{ animationDuration: "6s" }}>
        <path d="M176 112l-6-26 22 14z" fill="#c86fd0" stroke="#5d2470" strokeWidth="2" strokeLinejoin="round" />
        <path d="M222 112l8-26-22 14z" fill="#c86fd0" stroke="#5d2470" strokeWidth="2" strokeLinejoin="round" />
        <path d="M177 104l-3-12 9 7zM221 104l4-12-9 7z" fill="#f3c6f5" />
        <ellipse cx="200" cy="128" rx="34" ry="28" fill="url(#da-fur)" stroke="#5d2470" strokeWidth="2" />
        <path d="M172 118q6-4 10 2M218 120q4-6 10-2" fill="none" stroke="#f3c6f5" strokeWidth="4" strokeLinecap="round" />
        <ellipse cx="187" cy="122" rx="7" ry="8" fill="#ffe14d" stroke="#5d2470" strokeWidth="1.5" />
        <ellipse cx="213" cy="122" rx="7" ry="8" fill="#ffe14d" stroke="#5d2470" strokeWidth="1.5" />
        <ellipse cx="187" cy="123" rx="1.8" ry="6" fill="#1d1028" className="dream-blink" />
        <ellipse cx="213" cy="123" rx="1.8" ry="6" fill="#1d1028" className="dream-blink" />
        <path d="M176 136q24 22 48 0q-24 8-48 0z" fill="#fff" stroke="#5d2470" strokeWidth="2" strokeLinejoin="round" />
        <path d="M182 139v6M188 141v8M194 142v9M200 142v9M206 142v9M212 141v8M218 139v6" stroke="#5d2470" strokeWidth="1.2" />
        <path d="M166 134l-14-2M166 139l-14 3M234 134l14-2M234 139l14 3" stroke="#5d2470" strokeWidth="1.2" strokeLinecap="round" />
      </g>

      <g className="dream-bob" style={{ animationDelay: "0.5s" }}>
        <path d="M40 54h34l-4 20c-1 6-6 9-13 9s-12-3-13-9z" fill="#fbf3e2" stroke="#9a7a55" strokeWidth="1.8" />
        <path d="M74 60c8 0 10 10 0 12" fill="none" stroke="#9a7a55" strokeWidth="1.8" />
        <path d="M36 84h42" stroke="#9a7a55" strokeWidth="2" strokeLinecap="round" />
        <path d="M50 66l4 4 6-6" fill="none" stroke="#d9475f" strokeWidth="2" strokeLinecap="round" />
        <path d="M52 46c-3-6 3-8 0-14M62 46c-3-6 3-8 0-14" fill="none" stroke="#b9a6e6" strokeWidth="1.8" strokeLinecap="round" className="dream-steam" />
      </g>

      <g className="dream-bob" style={{ animationDelay: "1.8s" }}>
        <path d="M126 20v14" stroke="#c9a24f" strokeWidth="1.5" strokeDasharray="2 3" />
        <circle cx="126" cy="54" r="18" fill="#fff8e6" stroke="#c9a24f" strokeWidth="3.5" />
        <circle cx="126" cy="36" r="3" fill="none" stroke="#c9a24f" strokeWidth="2" />
        <path d="M126 54v-11M126 54l8 4" stroke="#1d2b3a" strokeWidth="2" strokeLinecap="round" />
        <circle cx="126" cy="54" r="1.8" fill="#d9475f" />
      </g>

      <g className="dream-bob" style={{ animationDelay: "2.6s" }} transform="rotate(14 210 266)">
        <rect x="190" y="236" width="40" height="56" rx="5" fill="#fffaf0" stroke="#9a7a55" strokeWidth="1.8" />
        <path d="M210 254c-6-8-14-2-9 5l9 9 9-9c5-7-3-13-9-5z" fill="#d9475f" />
        <text x="195" y="250" fontSize="10" fill="#d9475f" fontFamily="serif">A</text>
      </g>
      <g className="dream-twinkle" fill="#f4d98a">
        <path d="M100 250l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" />
        <path d="M238 34l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" style={{ animationDelay: "1s" }} />
        <circle cx="30" cy="120" r="2" style={{ animationDelay: "0.5s" }} />
      </g>
    </svg>
  );
}
