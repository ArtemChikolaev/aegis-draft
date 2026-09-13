// Package formats назначает событию окна (last_1y/2y/5y) детерминированно от
// даты сборки, плюс курируемый valve_legacy. Единственный источник правды о
// принадлежности события к формату и о границах скользящих окон: emit-стадия пайплайна
// ставит events[].formats и manifest.formats через Assign, окна сбора и team-success
// берут границу из Window.Start; web/scripts/gen_mock.mjs зеркалит то же правило
// для мок-датасета. Меняешь правило — правь оба конца (контракт data-contract).
package formats

import (
	"time"

	"github.com/aegis-draft/pipeline/internal/model"
)

// Window — скользящее календарное окно last_Ny. Годы вычитаются как AddDate(-Years,0,0),
// т.е. по календарю, а не по 365 дней.
type Window struct {
	Format model.Format
	Years  int
}

// Start — первый день окна (UTC-полночь, включительно) для сборки asOf.
func (w Window) Start(asOf time.Time) time.Time {
	return UTCDate(asOf).AddDate(-w.Years, 0, 0)
}

var rollingWindows = []Window{
	{model.Last1y, 1},
	{model.Last2y, 2},
	{model.Last5y, 5},
}

// RollingWindows — окна last_1y/2y/5y в каноническом порядке. Возвращает копию: вызывающий
// не испортит общий список.
func RollingWindows() []Window {
	return append([]Window(nil), rollingWindows...)
}

// RollingWindow — окно формата; false для valve_legacy (курируемый набор лиг, а не диапазон
// дат) и неизвестных форматов.
func RollingWindow(format model.Format) (Window, bool) {
	for _, w := range rollingWindows {
		if w.Format == format {
			return w, true
		}
	}
	return Window{}, false
}

// Assign возвращает отсортированный (по rollingWindows, затем valve_legacy)
// список форматов, в которые попадает событие с датой окончания end при сборке
// asOf. valveLegacy — курируемый флаг (все TI + Valve Major; курирование — T4.3),
// который каллер определяет по своему списку, а не по дате.
//
// Событие в окне, если start <= endDay <= asOfDay, где start = asOfDay - years лет.
// Обе даты нормализуются к UTC-полуночи, чтобы результат не зависел от времени суток.
func Assign(end, asOf time.Time, valveLegacy bool) []model.Format {
	asOfDay := UTCDate(asOf)
	endDay := UTCDate(end)
	out := make([]model.Format, 0, len(rollingWindows)+1)
	if !endDay.After(asOfDay) {
		for _, w := range rollingWindows {
			if !endDay.Before(w.Start(asOfDay)) {
				out = append(out, w.Format)
			}
		}
	}
	if valveLegacy {
		out = append(out, model.ValveLegacy)
	}
	return out
}

// UTCDate — UTC-полночь дня t: окна и даты не зависят от времени суток и часового пояса.
func UTCDate(t time.Time) time.Time {
	u := t.UTC()
	return time.Date(u.Year(), u.Month(), u.Day(), 0, 0, 0, 0, time.UTC)
}
