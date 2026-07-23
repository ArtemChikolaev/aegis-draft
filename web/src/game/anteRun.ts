// Ante-петля Roguelite Run (T5.7, срез 1). Чистый stage-orchestration-слой ПОВЕРХ
// TournamentEngine: движок драфта (RunEngine) и сам турнир не трогаем (скилл
// game-state-architecture: этапы — отдельный слой, не вливать в RunEngine/TournamentEngine).
//
// Забег = последовательность этапов с растущим порогом места. На каждом этапе играется один
// турнир (тот же TournamentEngine), но поле сильнее по индексу этапа (fieldBoost). Ростер в
// срезе 1 персистит без изменений, поэтому teamOvr постоянный, а поле обгоняет его — статичный
// состав рано или поздно не пробьёт порог. Пробил порог → следующий этап; промах → смерть.
// Экономика/рынок/редкость/боссы — поздние срезы (PRD §5.9.2), здесь их намеренно нет.
import type { Format, GameData } from "../types/data.ts";
import { TournamentEngine, type PlacementKey } from "./tournament.ts";

/** Стартовая лестница порогов (PRD §5.9.2, §10.E — откалибрована симуляцией 2026-07-23).
 *  Значение = максимальное числовое место, которое ещё считается пройденным: 10 = топ-10.
 *  Плавная рампа (не обрыв топ-2/топ-2): статичный состав живёт до середины, победа требует
 *  докупки силы в Буткемпе. */
export const ANTE_TARGETS: readonly number[] = [10, 6, 4, 3, 1];

/** Насколько сильнее поле каждый следующий этап (в очках силы бота). */
export const ANTE_FIELD_STEP = 3;

/** Стартовый гандикап: на раннем этапе поле СЛАБЕЕ игрока (сдвиг вниз), иначе teamOvr (~78–85)
 *  сидит ниже медианы пула ботов N(86,5) и топ-10 берётся редко — забег ощущается непроходимым.
 *  За забег поле деградирует от -HANDICAP до 0 (idx*STEP − HANDICAP), к финалу = базовый пул.
 *  Откалибровано 2026-07-23 (§10.E); точная величина — placeholder под balance spec. */
export const ANTE_FIELD_HANDICAP = 12;

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
  /** Насколько поле этого этапа сильнее нулевого. */
  fieldBoost: number;
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
    this.currentEngine = this.buildStage(0);
  }

  private buildStage(index: number): TournamentEngine {
    // Своё seed-пространство на этап: этапы не должны делить поток Rng, иначе исход одного
    // зависел бы от числа роллов другого. Сдвиг поля = idx*STEP − HANDICAP: ранние этапы
    // слабее игрока (проходимы), поздние догоняют. Quick Draft зовёт турнир с boost=0 отдельно
    // (mode "run" only) — golden не двигается.
    const stageSeed = `${this.seed}:ante:stage-${index}`;
    const fieldBoost = index * ANTE_FIELD_STEP - ANTE_FIELD_HANDICAP;
    return new TournamentEngine(this.data, this.format, stageSeed, this.teamOvr, this.teamName, 0, fieldBoost);
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
      fieldBoost: this.stageIndex * ANTE_FIELD_STEP,
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
