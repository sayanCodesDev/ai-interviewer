# Sandbox image for running candidate code. Build it once:
#   docker build -t ai-interviewer-runner:latest backend/runner
# The API starts one throwaway container per run with no network, capped memory/CPU/pids,
# a read-only root filesystem and a non-root user (see src/runner/docker.ts).
FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 g++ default-jdk-headless \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin runner

COPY runner.mjs /opt/runner/runner.mjs
COPY compat /opt/runner/compat

USER 10001:10001
WORKDIR /tmp
ENTRYPOINT ["node", "/opt/runner/runner.mjs"]
