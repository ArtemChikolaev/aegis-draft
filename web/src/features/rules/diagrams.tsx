// Инлайн-SVG-иллюстрации страницы правил. Презентационные: все подписи приходят из экрана
// (i18n там), цвета — токены темы (инлайновый SVG наследует CSS-переменные документа).
// Это одноразовый арт этого экрана, поэтому живёт в features/rules, а не в ui/.

/** Формула счёта: BASE + HERO SYNERGY + CHEMISTRY = TEAM OVR. */
export function ScoreDiagram({ base, synergy, chemistry, ovr }: {
  base: string; synergy: string; chemistry: string; ovr: string;
}) {
  const box = (x: number, w: number, label: string, accent = false) => (
    <g>
      <rect x={x} y={30} width={w} height={56} rx={10}
        fill={accent ? "var(--accent-soft)" : "none"}
        stroke={accent ? "var(--accent-strong)" : "var(--line-strong)"} strokeWidth={accent ? 2 : 1.5} />
      <text x={x + w / 2} y={63} textAnchor="middle" fill={accent ? "var(--accent-strong)" : "var(--text)"}
        fontSize={15} fontWeight={700}>{label}</text>
    </g>
  );
  const plus = (x: number) => (
    <text x={x} y={63} textAnchor="middle" fill="var(--muted)" fontSize={20} fontWeight={700}>+</text>
  );
  return (
    <svg viewBox="0 0 720 116" role="img" aria-label={`${base} + ${synergy} + ${chemistry} = ${ovr}`}>
      {box(0, 132, base)}
      {plus(150)}
      {box(168, 186, synergy)}
      {plus(372)}
      {box(390, 152, chemistry)}
      <text x={560} y={63} textAnchor="middle" fill="var(--muted)" fontSize={20} fontWeight={700}>=</text>
      {box(578, 142, ovr, true)}
    </svg>
  );
}

/** Петля Quick Draft: паки → пятёрка+герои → группы → плей-офф → место. */
export function ClassicFlowDiagram({ steps }: { steps: [string, string, string, string, string] }) {
  const w = 124;
  const gap = 25;
  return (
    <svg viewBox="0 0 720 96" role="img" aria-label={steps.join(" → ")}>
      {steps.map((label, i) => {
        const x = i * (w + gap);
        const last = i === steps.length - 1;
        return (
          <g key={label}>
            <rect x={x} y={22} width={w} height={52} rx={10}
              fill={last ? "var(--accent-soft)" : "none"}
              stroke={last ? "var(--accent-strong)" : "var(--line-strong)"} strokeWidth={last ? 2 : 1.5} />
            <text x={x + w / 2} y={53} textAnchor="middle"
              fill={last ? "var(--accent-strong)" : "var(--text)"} fontSize={13.5} fontWeight={700}>{label}</text>
            {!last && (
              <text x={x + w + gap / 2} y={53} textAnchor="middle" fill="var(--muted)" fontSize={16}>→</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Roguelite: порог растёт быстрее «бесплатной» силы; между этапами Буткемп, финал акта — босс. */
export function RunLadderDiagram({ threshold, power, boss, camp, acts }: {
  threshold: string; power: string; boss: string; camp: string; acts: string;
}) {
  // 25 этапов, 5 актов. Кривые схематичны: суть — расходящиеся линии, а не точные числа.
  const x0 = 16;
  const y0 = 172;
  const stageW = 26.4;
  const xAt = (stage: number) => x0 + (stage - 1) * stageW;
  // Порог: ступени вверх; сила без усилений: почти плоская.
  const thresholdPts = Array.from({ length: 25 }, (_, i) => `${xAt(i + 1)},${y0 - 8 - i * 5.2}`).join(" ");
  const powerPts = Array.from({ length: 25 }, (_, i) => `${xAt(i + 1)},${y0 - 26 - i * 1.1}`).join(" ");
  const bosses = [5, 10, 15, 20, 25];
  return (
    <svg viewBox="0 0 720 224" role="img" aria-label={`${threshold} / ${power} / ${boss}`}>
      {/* Ось этапов + границы актов */}
      <line x1={x0} y1={y0} x2={xAt(25) + 8} y2={y0} stroke="var(--line-strong)" strokeWidth={1.5} />
      {bosses.map((s) => (
        <line key={s} x1={xAt(s)} y1={y0} x2={xAt(s)} y2={38} stroke="var(--line)" strokeDasharray="3 5" />
      ))}
      {Array.from({ length: 25 }, (_, i) => (
        <circle key={i} cx={xAt(i + 1)} cy={y0} r={2.2} fill="var(--muted)" />
      ))}
      {/* Кривые */}
      <polyline points={powerPts} fill="none" stroke="var(--muted)" strokeWidth={2} strokeDasharray="6 5" />
      <polyline points={thresholdPts} fill="none" stroke="var(--accent-strong)" strokeWidth={2.5} />
      {/* Боссы — финал каждого акта */}
      {bosses.map((s) => (
        <g key={`b${s}`} transform={`translate(${xAt(s)}, ${y0 - 8 - (s - 1) * 5.2})`}>
          <rect x={-6} y={-6} width={12} height={12} transform="rotate(45)" fill="var(--danger)" />
        </g>
      ))}
      {/* Подписи */}
      <text x={xAt(25) + 8} y={y0 + 18} textAnchor="end" fill="var(--muted)" fontSize={12.5} fontWeight={600}>{acts}</text>
      <text x={x0} y={y0 + 18} fill="var(--muted)" fontSize={12.5} fontWeight={600}>{camp}</text>
      <text x={x0 + 4} y={52} fill="var(--accent-strong)" fontSize={13.5} fontWeight={700}>{threshold}</text>
      <text x={x0 + 4} y={126} fill="var(--muted)" fontSize={13.5} fontWeight={600}>{power}</text>
      <text x={xAt(25) - 14} y={30} textAnchor="end" fill="var(--danger)" fontSize={13.5} fontWeight={700}>◆ {boss}</text>
    </svg>
  );
}
