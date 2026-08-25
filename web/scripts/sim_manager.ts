// Балансовый симулятор Esports Manager (T5.5 срез 4, dev-инструмент, НЕ CI-тест: числа
// зависят от датасета). Играет N карьер × S сезонов двумя стратегиями подписи и печатает
// экономический профиль: банк по сезонам, доля пройденных квалификаций, финалы и титулы.
//
// Симулятор играет ЛЕГАЛЬНУЮ карьеру тем же движком, что человек: трайауты первой карточкой,
// пул героев первыми тремя, подпись пятёрки стратегией, все события подряд, события-выборы
// принимаются при достатке денег, оффсезон подтверждается без release.
//
// Запуск:
//   npm run sim:manager -- 200            200 карьер × 3 сезона, обе стратегии
//   npm run sim:manager -- 100 5          100 карьер × 5 сезонов
import { loadGameData } from "../test/helpers/data.ts";
import {
  HERO_PICKS_PER_ROUND,
  HERO_ROUNDS,
  ManagerEngine,
  TRYOUT_PICKS,
  type ManagerConfig,
  type OrgCandidate,
} from "../src/game/manager/engine.ts";
import { OFFSEASON_BOOTCAMP, MANAGER_ECONOMY_VERSION, MANAGER_INCOME } from "../src/game/manager/economy.ts";
import { ROLE_SEQUENCE } from "../src/game/packs.ts";

const data = loadGameData();
const careers = Number(process.argv[2] ?? 200);
const seasons = Number(process.argv[3] ?? 3);

type Strategy = "cheap" | "greedy";

/** Дешевейшая валидная пятёрка (нижняя граница качества). */
function cheapFive(candidates: OrgCandidate[]): number[] {
  const ids: number[] = [];
  const sorted = [...candidates].sort((a, b) => a.salary - b.salary);
  for (const role of ROLE_SEQUENCE) {
    const pick = sorted.find(
      (c) => c.candidate.player.role === role && !ids.includes(c.candidate.player.accountId),
    )!;
    ids.push(pick.candidate.player.accountId);
  }
  return ids;
}

/** Максимальная сумма OVR под кап: полный перебор комбинаций по ролям (13 кандидатов — дёшево). */
function greedyFive(candidates: OrgCandidate[], incomeK: number): number[] {
  const byRole = (role: string) => candidates.filter((c) => c.candidate.player.role === role);
  const carries = byRole("safelane");
  const mids = byRole("mid");
  const offs = byRole("offlane");
  const sups = byRole("support");
  let best: OrgCandidate[] | null = null;
  let bestOvr = -1;
  for (const c of carries) for (const m of mids) for (const o of offs) {
    for (let i = 0; i < sups.length; i += 1) for (let j = i + 1; j < sups.length; j += 1) {
      const five = [c, m, o, sups[i], sups[j]];
      const ids = new Set(five.map((p) => p.candidate.player.accountId));
      if (ids.size !== 5) continue;
      const wages = five.reduce((sum, p) => sum + p.salary, 0);
      if (wages > incomeK) continue;
      const ovr = five.reduce((sum, p) => sum + p.candidate.player.ovr, 0);
      if (ovr > bestOvr) { bestOvr = ovr; best = five; }
    }
  }
  return (best ?? candidates.slice(0, 5)).map((p) => p.candidate.player.accountId);
}

interface SeasonStats {
  bankEnd: number[];
  quals: number[]; // пройдено квалификаций из 5
  finaleQual: number;
  finaleTitle: number;
  titles: number[];
  wages: number[];
  teamOvr: number[];
  negativeBank: number;
}

function playCareer(seed: string, strategy: Strategy, perSeason: SeasonStats[]): void {
  const config: ManagerConfig = { orgName: "Sim", region: "weu", difficulty: "normal", format: "last_2y" };
  const engine = ManagerEngine.create(data, seed, config);
  for (let i = 0; i < TRYOUT_PICKS; i += 1) {
    engine.pickTryout(engine.state.tryoutOffer[0].candidate.player.accountId);
  }
  for (let r = 0; r < HERO_ROUNDS; r += 1) {
    engine.pickHeroes(engine.state.heroOffer.slice(0, HERO_PICKS_PER_ROUND));
  }
  const five = strategy === "cheap"
    ? cheapFive(engine.state.candidates)
    : greedyFive(engine.state.candidates, MANAGER_INCOME[config.difficulty]);
  if (!engine.signRoster(five)) throw new Error(`unsignable roster: ${seed} ${strategy}`);

  for (let season = 0; season < seasons; season += 1) {
    const stats = perSeason[season];
    let guard = 0;
    while (!engine.seasonFinished() && guard < 80) {
      engine.playNextEvent();
      engine.continueSeason();
      const pending = engine.state.pendingRandomEvent;
      if (pending) engine.resolveRandomEvent(pending.choice ? engine.state.bankK >= pending.choice.costK : false);
      guard += 1;
    }
    const s = engine.state;
    stats.bankEnd.push(s.bankK);
    if (s.bankK < 0) stats.negativeBank += 1;
    const quals = s.calendar.filter((slot) => slot.kind === "qualifier" && slot.result && slot.result.placement <= 2).length;
    stats.quals.push(quals);
    const fq = s.calendar.find((slot) => slot.kind === "finaleQual");
    if (fq?.result && fq.result.placement <= 1) stats.finaleQual += 1;
    const finale = s.calendar.find((slot) => slot.kind === "finale");
    if (finale?.result?.placement === 1) stats.finaleTitle += 1;
    stats.titles.push(s.calendar.filter((slot) => slot.result?.placement === 1).length);
    stats.wages.push(engine.wagesK);
    stats.teamOvr.push(Math.round(engine.score()?.teamOvr ?? 0));
    if (engine.state.phase === "offseason") {
      // m1.7.0: сбор — превращение банка в форму (обе стратегии, при запасе ≥ 2 цен: cheap
      // проверяет смысл копилки, greedy — что сбор не мешает трансферам). Затем кап оффсезона:
      // пока прогнозные зарплаты выше дохода, отпускается самый дорогой остающийся.
      // Лестница m1.8.0: уровни берутся, пока запас ≥ 2 цен следующего — та же логика буфера.
      while (engine.bootcampNextCostK != null && engine.state.bankK >= engine.bootcampNextCostK * 2) {
        if (!engine.buyOffseasonBootcamp()) break;
      }
      let guardRelease = 0;
      while (!engine.offseasonBudget().ok && guardRelease++ < 6) {
        const s3 = engine.state;
        const leaving = new Set([...s3.released, ...s3.departures]);
        const kept = s3.roster.filter((p) => !leaving.has(p.candidate.player.accountId));
        if (kept.length === 0) break;
        const priciest = kept.reduce((top, p) => {
          const wage = (id: number) => s3.offseasonSalaries[id] ?? 0;
          return wage(p.candidate.player.accountId) > wage(top.candidate.player.accountId) ? p : top;
        });
        engine.toggleRelease(priciest.candidate.player.accountId);
      }
      engine.confirmOffseason();
      // Трансферное окно (срез 5): greedy тратит банк на лучший апгрейд, пока взнос ≤ 60%
      // банка и офер сильнее заменяемого; cheap копит (контроль «банк без применения»).
      if (strategy === "greedy") {
        let guard2 = 0;
        while (guard2 < 4) {
          const s2 = engine.state;
          const candidates = s2.transferMarket
            .filter((offer) => offer.feeK <= s2.bankK * 0.6)
            .map((offer) => {
              const replace = s2.roster
                .filter((p) => p.candidate.player.role === offer.player.candidate.player.role)
                .sort((a, b) => a.candidate.player.ovr - b.candidate.player.ovr)[0];
              return { offer, replace, gain: offer.player.candidate.player.ovr - (replace?.candidate.player.ovr ?? 99) };
            })
            .filter((x) => x.replace && x.gain > 0)
            .sort((a, b) => b.gain - a.gain);
          if (!candidates.length) break;
          const best = candidates[0];
          if (!engine.buyTransfer(best.offer.player.candidate.player.accountId, best.replace.candidate.player.accountId)) break;
          guard2 += 1;
        }
      }
      engine.startNextSeason();
    }
  }
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const fmt = (x: number) => (Math.round(x * 10) / 10).toString();

console.log(`sim_manager: ${careers} карьер × ${seasons} сезонов · ${MANAGER_ECONOMY_VERSION} · dataHash ${data.manifest.dataHash?.slice(0, 8)}`);
for (const strategy of ["cheap", "greedy"] as Strategy[]) {
  const perSeason: SeasonStats[] = Array.from({ length: seasons }, () => ({
    bankEnd: [], quals: [], finaleQual: 0, finaleTitle: 0, titles: [], wages: [], teamOvr: [], negativeBank: 0,
  }));
  for (let i = 0; i < careers; i += 1) playCareer(`sim-${i}`, strategy, perSeason);
  console.log(`\n— стратегия ${strategy}`);
  perSeason.forEach((s, index) => {
    console.log(
      `  S${index + 1}: OVR ${fmt(avg(s.teamOvr))} · зарплаты $${fmt(avg(s.wages))}k · банк(кон) $${fmt(avg(s.bankEnd))}k` +
      ` · банк<0 ${((100 * s.negativeBank) / careers).toFixed(0)}%` +
      ` · квалы ${fmt(avg(s.quals))}/5 · отбор финала ${((100 * s.finaleQual) / careers).toFixed(0)}%` +
      ` · титул финала ${((100 * s.finaleTitle) / careers).toFixed(0)}% · титулов/сезон ${fmt(avg(s.titles))}`,
    );
  });
}
