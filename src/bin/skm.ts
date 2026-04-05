import { runCli } from '../cli/program.js';

const exitCode = await runCli(process.argv);
if (exitCode !== 0) {
  process.exitCode = exitCode;
}
