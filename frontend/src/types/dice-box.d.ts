declare module '@3d-dice/dice-box' {
  interface DiceBoxConfig {
    assetPath: string;
    id?: string;
    startingHeight?: number;
    throwForce?: number;
    spinForce?: number;
    lightIntensity?: number;
    theme?: string;
    offscreen?: boolean;
    onRollComplete?: (results: DieResult[]) => void;
    onDieComplete?: (result: DieResult) => void;
    onBeforeRoll?: () => void;
  }

  interface DieResult {
    value: number;
    type: string;
    sides: number;
  }

  class DiceBox {
    constructor(selector: string | HTMLElement, config?: DiceBoxConfig);
    init(): Promise<void>;
    roll(notation: string): Promise<DieResult[]>;
    clear(): Promise<void>;
    hide(): this;
    show(): this;
    onRollComplete: ((results: DieResult[]) => void) | null;
    onDieComplete: ((result: DieResult) => void) | null;
  }

  export default DiceBox;
}
