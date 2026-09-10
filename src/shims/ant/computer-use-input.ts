/**
 * Types for the unpublished `@ant/computer-use-input` package (Rust/enigo
 * native addon: mouse, keyboard, frontmost app). Loaded at runtime via
 * `require()` in src/utils/computerUse/inputLoader.ts, which throws a clear
 * error when the addon is absent — so this shim only needs the types.
 */

export type ComputerUseInputAPI = {
  moveMouse(x: number, y: number): void
  click(button: string): void
  key(key: string): void
  keys(keys: string[]): void
  type(text: string): void
  scroll(dx: number, dy: number): void
}

export type ComputerUseInput = ComputerUseInputAPI & {
  isSupported?: boolean
}
