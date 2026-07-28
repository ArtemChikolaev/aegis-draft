import "./powerBreakdown.css";

/** Разложение силы забега (R8.2/R8.3): слои показываются раздельно и в фиксированном порядке.
 *
 *  Примитив намеренно не знает про game/: он принимает уже посчитанные числа и подписи. Показывать
 *  его нужно ТОЛЬКО когда хоть один слой активен — иначе это строка «+0 / ×1.00», не несущая
 *  информации. Условие проверяет вызывающий (`powerBreakdown().trivial`).
 *
 *  Зачем вообще: после появления предметов «Team OVR» и сила, с которой команда выходит на этап, —
 *  разные величины. Без разложения игрок видел бы в поле число, которого нет нигде на экране. */
export function PowerBreakdown({
  roster,
  additive,
  xMult,
  total,
  labels,
  testId,
}: {
  roster: number;
  additive: number;
  xMult: number;
  total: number;
  labels: { roster: string; additive: string; xMult: string; total: string };
  testId?: string;
}) {
  const fmt = (value: number) => (Number.isInteger(value) ? value.toString() : (Math.round(value * 10) / 10).toString());
  return (
    <div className="power-breakdown" data-testid={testId}>
      <span className="power-breakdown__row">
        <small>{labels.roster}</small><b>{fmt(roster)}</b>
      </span>
      {additive !== 0 && (
        <span className="power-breakdown__row">
          <small>{labels.additive}</small><b>{additive > 0 ? `+${fmt(additive)}` : fmt(additive)}%</b>
        </span>
      )}
      {xMult !== 1 && (
        <span className="power-breakdown__row">
          <small>{labels.xMult}</small><b>×{xMult.toFixed(2)}</b>
        </span>
      )}
      <span className="power-breakdown__row power-breakdown__row--total">
        <small>{labels.total}</small>
        <b data-testid={testId ? `${testId}-total` : undefined}>{fmt(Math.round(total * 10) / 10)}</b>
      </span>
    </div>
  );
}
