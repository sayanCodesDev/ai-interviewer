// Must be the first import of every test file: it fixes the environment before config loads.
// Real API keys are blanked so that a test can never spend money or reach a hosted service, and
// the database is forced to a local one (config also refuses a non-local TEST_DATABASE_URL).
process.env.NODE_ENV = "test";
process.env.TEST_DATABASE_URL ??= "postgresql://postgres@127.0.0.1:5544/ai_interviewer_test";
process.env.JWT_SECRET = "test-secret-test-secret-test-secret-1234";
process.env.GROQ_API_KEY = "";
process.env.DEEPGRAM_API_KEY = "";
process.env.ALLOWED_ORIGINS = "http://localhost:3000";
process.env.CODE_RUNNER = process.env.CODE_RUNNER || "local";

export {};
