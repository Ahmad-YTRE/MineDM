declare module "node:dns/promises" {
  export function lookup(hostname: string, options: { all: true; verbatim: true }): Promise<Array<{ address: string; family: number }>>;
}
declare module "node:net" {
  export function isIP(input: string): number;
}
