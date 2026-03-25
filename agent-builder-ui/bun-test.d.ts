declare module "bun:test" {
  export function afterEach(fn: () => void | Promise<void>): void;

  export function describe(
    name: string,
    fn: () => void | Promise<void>
  ): void;

  export function test(
    name: string,
    fn: () => void | Promise<void>
  ): void;

  export function expect(value: unknown): any;

  export function mock<T extends (...args: any[]) => any>(fn?: T): T;
}
