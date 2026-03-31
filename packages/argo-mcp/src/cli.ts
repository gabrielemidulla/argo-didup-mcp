import type { Command } from "commander";
import { buildProgram } from "./cli/register-commands.ts";

function printUsage(program: Command): never {
  console.error(
    "Uso: bun index.ts <comando> (cwd: packages/argo-mcp) oppure dalla root: bun ./packages/argo-mcp/index.ts <comando>\n",
  );
  console.error(program.helpInformation());
  process.exit(1);
}

export async function run(args: string[]): Promise<void> {
  const program = buildProgram();
  if (args.length === 0) {
    printUsage(program);
  }
  await program.parseAsync(args, { from: "user" });
}
