// Тесты стора Аркады запускают забег без экрана Аркады — регистрируем класс сима, как это делает экран (M23).
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { registerArcadeSim } from "../src/state/arcadeStore.ts";

registerArcadeSim(ArcadeSim);
