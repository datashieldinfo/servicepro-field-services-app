interface LogoProps {
  compact?: boolean;
  className?: string;
}

export default function Logo({ compact = false, className = '' }: LogoProps) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Shield SVG with wrench and gear */}
      <div className="relative flex-shrink-0">
        <svg
          width={compact ? 36 : 44}
          height={compact ? 36 : 44}
          viewBox="0 0 44 44"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Shield shape */}
          <path
            d="M22 2L4 10V20C4 31.05 11.84 41.28 22 44C32.16 41.28 40 31.05 40 20V10L22 2Z"
            fill="#1E3A8A"
            stroke="#0EA5E9"
            strokeWidth="1"
          />
          {/* Circuit lines */}
          <path d="M10 16H16L18 14H22" stroke="#0EA5E9" strokeWidth="0.8" opacity="0.5" />
          <path d="M34 16H28L26 14H22" stroke="#0EA5E9" strokeWidth="0.8" opacity="0.5" />
          <path d="M22 32V28L24 26" stroke="#0EA5E9" strokeWidth="0.8" opacity="0.5" />
          <path d="M22 32V28L20 26" stroke="#0EA5E9" strokeWidth="0.8" opacity="0.5" />
          {/* Circuit nodes */}
          <circle cx="10" cy="16" r="1.5" fill="#0EA5E9" opacity="0.6" />
          <circle cx="34" cy="16" r="1.5" fill="#0EA5E9" opacity="0.6" />
          <circle cx="22" cy="32" r="1.5" fill="#0EA5E9" opacity="0.6" />
          {/* Wrench icon */}
          <path
            d="M26.5 16.5C27.3 15.7 27.3 14.5 26.5 13.7L25.8 13C25 12.2 23.8 12.2 23 13L17.5 18.5C16.7 19.3 16.7 20.5 17.5 21.3L18.2 22C19 22.8 20.2 22.8 21 22L26.5 16.5Z"
            fill="white"
            opacity="0.9"
          />
          <path d="M17 23L15 25L16 26L18 24" fill="white" opacity="0.9" />
          <path d="M27 13L29 11L28 10L26 12" fill="white" opacity="0.9" />
          {/* Gold gear badge */}
          <circle cx="34" cy="34" r="7" fill="#F59E0B" stroke="#FDE68A" strokeWidth="1" />
          <path
            d="M34 30.5V31.5M34 36.5V37.5M37.5 34H36.5M31.5 34H30.5M36.5 31.5L35.8 32.2M32.2 35.8L31.5 36.5M36.5 36.5L35.8 35.8M32.2 32.2L31.5 31.5"
            stroke="#92400E"
            strokeWidth="0.8"
            strokeLinecap="round"
          />
          <circle cx="34" cy="34" r="2.5" stroke="#92400E" strokeWidth="0.8" fill="none" />
          <circle cx="34" cy="34" r="1" fill="#92400E" />
        </svg>
      </div>

      {/* Text */}
      {!compact && (
        <div className="flex flex-col">
          <span className="text-xl font-extrabold text-navy leading-tight tracking-tight">ServisGo</span>
          <span className="text-xs font-semibold text-blue-600 font-arabic leading-tight">سيرفس جو</span>
          <span className="text-[9px] text-slate-400 mt-0.5 leading-tight">Powered by Data Shield Digital Solutions</span>
        </div>
      )}
    </div>
  );
}
