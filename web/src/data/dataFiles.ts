// Состав игрового датасета — ОДИН список на всех. Его знают двое: `DataSource` (что грузить в
// игру) и service worker (что класть в офлайн-кэш). Разъедься они — SW закэширует не тот набор,
// и офлайн-запуск упадёт на файле, которого «почему-то» нет.
//
// Набор атомарен: файлы ссылаются друг на друга по общему `accountId`, а `manifest.dataHash`
// считается по байтам всех игровых JSON сразу (ADR 0003). Поэтому и кэшируется он целиком.
import type { GameData } from "../types/data.ts";

/** Файлы, без которых игра не стартует. Порядок не важен, важен состав. */
export const REQUIRED_DATA_FILES = [
  "manifest",
  "events",
  "heroes",
  "packs",
  "players",
  "playerHeroStats",
  "teammates",
  "squadSynergy",
  "eventHeroStats",
  "teamSuccess",
] as const;

/** Файлы, которых может не быть в датасете (эмитятся отдельной стадией пайплайна).
 *  Их отсутствие — не ошибка ни для загрузки игры, ни для полноты офлайн-кэша. */
export const OPTIONAL_DATA_FILES = ["careerPlayerHeroStats"] as const;

export type DataFile = (typeof REQUIRED_DATA_FILES)[number] | (typeof OPTIONAL_DATA_FILES)[number];

// Компайл-тайм замок: имя файла = ключ GameData, и списки покрывают модель ровно. Добавили поле в
// GameData, не добавив файл (или наоборот) — падает `tsc`, а не офлайн-запуск у игрока.
type MissingFile = Exclude<keyof GameData, DataFile>;
type UnknownFile = Exclude<DataFile, keyof GameData>;
const _filesCoverModel: [MissingFile, UnknownFile] extends [never, never] ? true : never = true;
void _filesCoverModel;

/** Путь файла датасета относительно базы приложения (BASE_URL). */
export function dataFilePath(name: string): string {
  return `data/${name}.json`;
}
