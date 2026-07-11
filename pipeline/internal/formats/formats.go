// Package formats назначает событию окна (last_1y/2y/5y) детерминированно от
// даты сборки, плюс курируемый valve_legacy. Единственный источник правды о
// принадлежности события к формату: emit-стадия пайплайна ставит events[].formats
// и manifest.formats через Assign; web/scripts/gen_mock.mjs зеркалит то же правило
// для мок-датасета. Меняешь правило — правь оба конца (контракт data-contract).
package formats

import (
	"time"

	"github.com/aegis-draft/pipeline/internal/model"
)

// rollingWindows — скользящие календарные окна last_Ny (годы вычитаются как
// AddDate(-years,0,0), т.е. по календарю, а не по 365 дней).
var rollingWindows = []struct {
	format model.Format
	years  int
}{
	{model.Last1y, 1},
	{model.Last2y, 2},
	{model.Last5y, 5},
}

// Assign возвращает отсортированный (по rollingWindows, затем valve_legacy)
// список форматов, в которые попадает событие с датой окончания end при сборке
// asOf. valveLegacy — курируемый флаг (все TI + Valve Major; курирование — T4.3),
// который каллер определяет по своему списку, а не по дате.
//
// Событие в окне, если start <= endDay <= asOfDay, где start = asOfDay - years лет.
// Обе даты нормализуются к UTC-полуночи, чтобы результат не зависел от времени суток.
func Assign(end, asOf time.Time, valveLegacy bool) []model.Format {
	asOfDay := utcDate(asOf)
	endDay := utcDate(end)
	out := make([]model.Format, 0, len(rollingWindows)+1)
	if !endDay.After(asOfDay) {
		for _, w := range rollingWindows {
			start := asOfDay.AddDate(-w.years, 0, 0)
			if !endDay.Before(start) {
				out = append(out, w.format)
			}
		}
	}
	if valveLegacy {
		out = append(out, model.ValveLegacy)
	}
	return out
}

func utcDate(t time.Time) time.Time {
	u := t.UTC()
	return time.Date(u.Year(), u.Month(), u.Day(), 0, 0, 0, 0, time.UTC)
}
