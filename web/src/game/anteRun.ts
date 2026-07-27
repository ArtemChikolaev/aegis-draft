// Ante-петля Roguelite Run (T5.7, срез 1). Чистый stage-orchestration-слой ПОВЕРХ
// TournamentEngine: движок драфта (RunEngine) и сам турнир не трогаем (скилл
// game-state-architecture: этапы — отдельный слой, не вливать в RunEngine/TournamentEngine).
//
// Забег = последовательность этапов с растущим порогом места. На каждом этапе играется один
// турнир (тот же TournamentEngine), но поле сильнее по индексу этапа (растёт mean). Ростер в
// срезе 1 персистит без изменений, поэтому teamOvr постоянный, а поле обгоняет его — статичный
// состав рано или поздно не пробьёт порог. Пробил порог → следующий этап; промах → смерть.
// Экономика/рынок/редкость/боссы — поздние срезы (PRD §5.9.2), здесь их намеренно нет.
import type { Format, GameData } from "../types/data.ts";
import { PLACEMENT_KEYS, TournamentEngine, type FieldModel, type PlacementKey } from "./tournament.ts";

/** Длина акта: пять этапов, последний — Boss Tournament (PRD §5.9.3). Пока сезон сам состоит из
 *  одного акта, но cadence боссов и разметка UI уже считаются от этого числа, чтобы переход на
 *  `5 актов × 5 этапов` (R6.1) не переписывал оркестратор. */
export const ACT_LENGTH = 5;

/** Босс стоит только на финале акта — заранее видимое исключительное событие, а не фон каждого
 *  второго этапа (R6.2). Раньше `BOSS_FIRST_STAGE = 2` давал босса на КАЖДОМ этапе с третьего:
 *  три боссовых этапа из пяти, что прямо противоречило PRD. */
export function isActFinale(absoluteStageIndex: number): boolean {
  return absoluteStageIndex >= 0 && (absoluteStageIndex + 1) % ACT_LENGTH === 0;
}

/** Легальные пороги = worst-rank реальных placement-бакетов (R9.3/R6.4).
 *
 *  Любое другое число даёт ложную подпись. Прежний `target = 10` не пропускал бакет «9-12»
 *  (worst 12), то есть «топ-10» фактически требовал топ-8 — игрок читал одно правило, а играл по
 *  другому. Проверяется в конструкторе, чтобы будущая калибровка не завела новое ложное число. */
export const LEGAL_ANTE_TARGETS: readonly number[] = [
  ...new Set(PLACEMENT_KEYS.map(placementWorstRank)),
].sort((a, b) => a - b);

export function isLegalAnteTarget(target: number): boolean {
  return LEGAL_ANTE_TARGETS.includes(target);
}

/** Стартовая лестница порогов (PRD §5.9.2/§5.9.3, §10.E — откалибрована симуляцией 2026-07-23).
 *  Значение = максимальное числовое место, которое ещё считается пройденным: 8 = топ-8.
 *  Плавная рампа (не обрыв топ-2/топ-2): статичный состав живёт до середины, победа требует
 *  докупки силы в Буткемпе.
 *  Первый порог был записан как `10`, хотя вёл себя как `8`; 2026-07-27 подпись приведена к
 *  фактическому поведению — проходимость этапа при этом не изменилась ни на один бакет.
 *  Баланс-коэффициенты (часть BALANCE_CONFIG_VERSION — правишь числа, бампай версию в balance.ts). */
export const ANTE_TARGETS: readonly number[] = [8, 6, 4, 3, 1];

/** На сколько растёт СРЕДНЯЯ сила поля с каждым этапом. */
export const ANTE_FIELD_STEP = 3;

/** Средняя сила поля на первом этапе и границы качества ростера соперника (R7.1).
 *
 *  Раньше здесь стоял `ANTE_FIELD_HANDICAP`: поле Quick Draft сдвигалось вниз и переклампливалось
 *  в `[76, 99]`. Замер показал, что это ломало саму выборку — на первом этапе **90.2% ботов
 *  стояли ровно на 76** при `sd ≈ 0.99`, то есть поле было одним значением, а не распределением:
 *  боты играли между собой в монетку, и место игрока решала жеребьёвка. Теперь по этапу двигается
 *  `mean`, а `sd` остаётся живым; нижняя граница качества опущена до 60, чтобы ранние этапы не
 *  упирались в неё снова.
 *
 *  Часть BALANCE_CONFIG_VERSION — правишь числа, бампай версию в balance.ts. */
export const ANTE_FIELD = { meanBase: 71, sd: 5, min: 60, max: 99 } as const;

/** Модель поля этапа `stageIndex` (0-based). Верхняя граница относится к КАЧЕСТВУ ростера;
 *  безлимитная угроза акта/босса/Stake приходит отдельным слагаемым `threat` (R7.2). */
export function anteFieldModel(stageIndex: number): FieldModel {
  return {
    mean: ANTE_FIELD.meanBase + stageIndex * ANTE_FIELD_STEP,
    sd: ANTE_FIELD.sd,
    min: ANTE_FIELD.min,
    max: ANTE_FIELD.max,
  };
}

export type AntePhase = "playing" | "won" | "lost";

/** Худшее (самое высокое) числовое место в бакете PlacementKey. Порог пройден, если весь бакет
 *  укладывается в цель: «7-8» (худшее 8) проходит топ-8, «9-12» (худшее 12) — нет. Так сравнение
 *  бакета с числовой целью однозначно, без «а вдруг там 5-е». */
export function placementWorstRank(placement: PlacementKey): number {
  const dash = placement.indexOf("-");
  return dash === -1 ? Number(placement) : Number(placement.slice(dash + 1));
}

export interface AnteStageView {
  /** Индекс этапа с 0. */
  index: number;
  /** Всего этапов в забеге. */
  count: number;
  /** Порог места текущего этапа (числовой, worst-rank). */
  target: number;
  /** Средняя сила поля этого этапа — то, что растёт от этапа к этапу. */
  fieldMean: number;
}

export interface AnteRunState extends AnteStageView {
  phase: AntePhase;
  /** Место игрока на предыдущем разрешённом этапе, иначе null. */
  lastPlacement: PlacementKey | null;
}

/** Чистая оркестрация ante-забега. Детерминизм: `seed + dataset + версия ⇒ та же
 *  последовательность полей, исходов и точки смерти`. */
export class AnteRunEngine {
  private stageIndex = 0;
  private phase: AntePhase = "playing";
  private lastPlacement: PlacementKey | null = null;
  private currentEngine: TournamentEngine;

  constructor(
    private readonly data: GameData,
    private readonly format: Format,
    private readonly seed: string,
    private teamOvr: number,
    private readonly teamName: string,
    private readonly targets: readonly number[] = ANTE_TARGETS,
  ) {
    if (targets.length === 0) throw new Error("Ante run needs at least one stage");
    const illegal = targets.filter((target) => !isLegalAnteTarget(target));
    if (illegal.length) {
      throw new Error(
        `Порог этапа обязан совпадать с worst-rank реального бакета `
        + `(${LEGAL_ANTE_TARGETS.join(", ")}), получено: ${illegal.join(", ")}`,
      );
    }
    this.currentEngine = this.buildStage(0);
  }

  private buildStage(index: number): TournamentEngine {
    // Своё seed-пространство на этап: этапы не должны делить поток Rng, иначе исход одного
    // зависел бы от числа роллов другого. Поле задаётся моделью этапа; Quick Draft зовёт турнир
    // вообще без неё (дефолт QUICK_DRAFT_FIELD) — golden не двигается.
    const stageSeed = `${this.seed}:ante:stage-${index}`;
    return new TournamentEngine(
      this.data, this.format, stageSeed, this.teamOvr, this.teamName, 0, anteFieldModel(index),
    );
  }

  /** Турнир текущего этапа. UI гонит его reveal (advance) как в Quick Draft. */
  get tournament(): TournamentEngine {
    return this.currentEngine;
  }

  get state(): AnteRunState {
    return {
      index: this.stageIndex,
      count: this.targets.length,
      target: this.targets[this.stageIndex],
      fieldMean: anteFieldModel(this.stageIndex).mean,
      phase: this.phase,
      lastPlacement: this.lastPlacement,
    };
  }

  /** Разрешить текущий этап по фактическому месту игрока. Вызывать, когда турнир доигран
   *  (playoffs терминальный). Пробил порог → следующий этап (или победа на последнем); промах →
   *  смерть. После окончания забега — no-op. Возвращает новую фазу. */
  resolveStage(): AntePhase {
    if (this.phase !== "playing") return this.phase;
    const placement = this.currentEngine.snapshot.userPlacement;
    this.lastPlacement = placement;
    if (placementWorstRank(placement) > this.targets[this.stageIndex]) {
      this.phase = "lost";
    } else if (this.stageIndex >= this.targets.length - 1) {
      this.phase = "won";
    } else {
      this.stageIndex += 1;
      this.currentEngine = this.buildStage(this.stageIndex);
    }
    return this.phase;
  }

  /** Пересобрать поле ТЕКУЩЕГО этапа под новый teamOvr (manual-свап героев до симуляции),
   *  сохранив прогресс по этапам. */
  rebuildCurrentStage(teamOvr: number): void {
    if (this.phase !== "playing") return;
    this.teamOvr = teamOvr;
    this.currentEngine = this.buildStage(this.stageIndex);
  }

  /** Перемотать до этапа `index` (resume сохранённого ante-забега). Детерминизм: пройденные
   *  этапы по seed те же, поэтому просто пересобираем поле нужного этапа без ре-симуляции. */
  jumpToStage(index: number): void {
    if (index < 0 || index >= this.targets.length) throw new Error(`Ante stage out of range: ${index}`);
    this.stageIndex = index;
    this.phase = "playing";
    this.lastPlacement = null;
    this.currentEngine = this.buildStage(index);
  }
}
