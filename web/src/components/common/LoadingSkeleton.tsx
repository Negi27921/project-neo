export default function LoadingSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div style={{ padding: 16 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{
            height: 36,
            background: 'var(--bg-hover)',
            borderRadius: 4,
            marginBottom: 8,
            opacity: 1 - i * 0.12,
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
        />
      ))}
      <style>{`@keyframes pulse { 0%,100%{opacity:0.6} 50%{opacity:0.3} }`}</style>
    </div>
  )
}
