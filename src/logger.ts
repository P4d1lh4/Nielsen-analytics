/** Minimal dependency-free, ANSI-coloured logger for terminal output. */

type Params = Record<string, unknown>;

const c = {
  reset: "\x1b[0m",
  cyan: "\x1b[36m",
  blue: "\x1b[34m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  dim: "\x1b[2m",
};

export const logger = {
  info(message: string): void {
    console.log(`${c.cyan}i${c.reset} ${message}`);
  },
  step(index: number, total: number, name: string, params: Params): void {
    console.log(
      `${c.blue}>${c.reset} [${index}/${total}] ${name} ${c.dim}${JSON.stringify(params)}${c.reset}`,
    );
  },
  success(message: string): void {
    console.log(`${c.green}OK${c.reset} ${message}`);
  },
  warn(message: string): void {
    console.warn(`${c.yellow}!${c.reset} ${message}`);
  },
  error(message: string): void {
    console.error(`${c.red}x${c.reset} ${message}`);
  },
};
