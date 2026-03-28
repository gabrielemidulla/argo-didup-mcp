const command = Bun.argv[2];

if (command === "mcp") {
  const { startMcpServer } = await import("./src/mcp.ts");
  await startMcpServer();
} else {
  const { run } = await import("./src/cli.ts");
  await run(Bun.argv.slice(2));
}
