const command = Bun.argv[2];

if (command === "mcp") {
  const { startMcpServer } = await import("./src/mcp.ts");
  await startMcpServer();
} else if (command === "serve") {
  const { startHttpServer } = await import("./src/server.ts");
  await startHttpServer();
} else if (command === "telegram") {
  await import("./examples/telegram.ts");
} else {
  const { run } = await import("./src/cli.ts");
  await run(Bun.argv.slice(2));
}
