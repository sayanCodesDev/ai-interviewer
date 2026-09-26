// Imported before anything else by the sandbox tests: they must run against Docker, never the local
// runner, so the choice is made before config is read.
process.env.CODE_RUNNER = "docker";

export {};
