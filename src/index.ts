#!/usr/bin/env node
import { buildProgram } from "./cli";

buildProgram()
  .parseAsync(process.argv)
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
