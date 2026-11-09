export default function Logo({ size = 32, light }: { size?: number; light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
        <rect width="64" height="64" rx="16" fill="#0C776C" />
        <path d="M32 11c8 10 16 18 16 27a16 16 0 0 1-32 0c0-9 8-17 16-27z" fill="#fff" />
        <path d="M24 39h16M24 46h10" stroke="#F2704D" strokeWidth="4" strokeLinecap="round" />
      </svg>
      <span className={`text-lg font-extrabold tracking-tight ${light ? 'text-white' : 'text-slate2'}`}>Water<span className={light ? 'text-tide-200' : 'text-tide-600'}>Bill</span></span>
    </span>
  );
}
