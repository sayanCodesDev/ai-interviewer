import type { Level } from "./problems";

/**
 * Hand-written interview content for each supported role. It is the fallback when there is no job
 * description to analyse (or the analysis fails), and it doubles as the source for the public
 * "mock interview" pages, so what those pages promise is what the interviewer actually asks.
 */

export interface BankQuestion {
    question: string;
    skill: string;
    lookFor: string[];
    followUps: string[];
    /** The lowest level at which this is a fair question (0 intern .. 4 staff). */
    minLevel: number;
}

export interface DesignPrompt {
    title: string;
    prompt: string;
    lookFor: string[];
}

export interface RoleBank {
    slug: string;
    role: string;
    /** One sentence describing the person this interview suits. */
    summary: string;
    focusAreas: string[];
    keyterms: string[];
    /** Coding topics that matter most for the role. */
    codingTags: string[];
    technical: BankQuestion[];
    design: DesignPrompt[];
}

const q = (question: string, skill: string, minLevel: number, lookFor: string[], followUps: string[] = []): BankQuestion => ({ question, skill, minLevel, lookFor, followUps });

export const ROLE_BANKS: RoleBank[] = [
    {
        slug: "frontend-engineer",
        role: "Frontend Engineer",
        summary: "For candidates building interfaces in JavaScript or TypeScript: rendering, state, performance and accessibility.",
        focusAreas: ["Browser rendering and the event loop", "React state and performance", "Accessibility", "Web performance and Core Web Vitals", "Security on the client"],
        keyterms: ["React", "TypeScript", "JavaScript", "CSS", "DOM", "hydration", "memoization", "Webpack", "Vite", "Next.js", "accessibility", "ARIA", "Core Web Vitals", "useEffect", "useMemo", "reconciliation", "virtual DOM", "CORS", "XSS", "CSRF"],
        codingTags: ["array", "string", "hash-map", "stack", "two-pointers"],
        technical: [
            q("Walk me through what happens between typing a URL and seeing a rendered page, focusing on the browser.", "Browser internals", 0,
                ["DNS, TCP and TLS, then the HTTP request", "HTML parsed into the DOM, CSS into the CSSOM", "Render tree, layout, paint and compositing", "Render-blocking CSS and scripts"], ["What causes layout thrashing, and how do you avoid it?"]),
            q("Explain the JavaScript event loop, and how microtasks differ from macrotasks.", "Event loop", 0,
                ["Call stack and task queues", "Promises run as microtasks before the next macrotask", "setTimeout versus promise ordering", "Long tasks block rendering"], ["Given a promise and a setTimeout of zero, which logs first, and why?"]),
            q("How do closures work, and can you describe a bug they can cause?", "Closures", 0,
                ["A function keeps access to its defining scope", "The classic loop-variable bug with var", "Stale closures in React hooks"]),
            q("How does React decide what to re-render, and how would you find and fix needless re-renders in a slow screen?", "React rendering", 1,
                ["State and prop changes trigger renders; keys and reconciliation", "Profiling before optimising", "memo, useMemo and useCallback, and their cost", "Splitting state, lifting or colocating it, virtualising long lists"], ["When is memoisation actually harmful?"]),
            q("How would you make a custom dropdown accessible?", "Accessibility", 1,
                ["Correct roles and ARIA states", "Full keyboard operation and focus management", "Screen reader announcements", "Contrast and visible focus"]),
            q("Explain CSS specificity and the box model, and how you would build a layout that works from phones to wide monitors.", "CSS layout", 0,
                ["Specificity order and why to keep it low", "Box sizing, margin collapse", "Flexbox and grid, fluid units, container or media queries"]),
            q("How do you manage state in a large front-end application? When do you reach for a global store versus local state or a server-cache library?", "State management", 2,
                ["Local first, lift only when needed", "Server state is different from client state", "Trade-offs of stores like Redux or Zustand", "Derived state and normalisation"]),
            q("What are the Core Web Vitals, and how would you improve LCP and INP on a heavy page?", "Web performance", 2,
                ["What LCP, INP and CLS measure", "Image and font loading, code splitting, caching", "Reducing main-thread work and hydration cost", "Measuring in the field, not just in the lab"]),
            q("How do you defend a front end against XSS and CSRF?", "Client security", 2,
                ["Escaping and never injecting untrusted HTML", "Content Security Policy", "SameSite cookies, CSRF tokens", "Where to store tokens and why"]),
            q("Design client-side caching and optimistic updates for a list that users edit constantly.", "Data fetching", 3,
                ["A cache keyed by resource with invalidation", "Optimistic update with rollback on failure", "Race conditions between requests", "Offline and retry behaviour"]),
        ],
        design: [
            { title: "Collaborative document editor", prompt: "Design the front-end architecture of a simplified collaborative document editor, where several people edit the same document at once.", lookFor: ["Component and state structure", "Real-time sync: WebSockets, conflict handling such as OT or CRDTs", "Optimistic local edits and offline behaviour", "Performance for large documents", "Accessibility and testing"] },
            { title: "Infinite news feed", prompt: "Design an infinite-scrolling news feed with images and live updates.", lookFor: ["Pagination and virtualisation", "Image loading and layout stability", "Live updates without losing scroll position", "Caching and error states", "Performance budgets"] },
        ],
    },
    {
        slug: "backend-engineer",
        role: "Backend Engineer",
        summary: "For candidates building services and APIs: data modelling, concurrency, reliability and scaling.",
        focusAreas: ["API design and idempotency", "Databases, indexing and transactions", "Caching and queues", "Concurrency and performance", "Authentication and security"],
        keyterms: ["PostgreSQL", "MySQL", "Redis", "Kafka", "RabbitMQ", "REST", "gRPC", "GraphQL", "idempotency", "transaction", "isolation level", "index", "B-tree", "sharding", "replication", "JWT", "OAuth", "microservices", "latency", "throughput", "Node.js", "Go", "Java", "Spring"],
        codingTags: ["hash-map", "array", "graph", "heap", "dynamic-programming"],
        technical: [
            q("How does a database index work, and when would the query planner ignore one?", "Database indexing", 0,
                ["B-tree structure and how it speeds lookups", "Selectivity, leftmost-prefix rule, covering indexes", "The write and storage cost of indexes", "Using EXPLAIN to check"], ["How would you index a query that filters on two columns and sorts on a third?"]),
            q("Compare REST, gRPC and GraphQL. When would you choose each?", "API styles", 0,
                ["Resource model versus RPC versus client-shaped queries", "Payload size, streaming, tooling, browser support", "Caching and versioning implications"]),
            q("What is a database transaction, and what problems do isolation levels solve? Give a lost-update example.", "Transactions", 1,
                ["ACID basics", "Dirty, non-repeatable and phantom reads", "Lost update and how to prevent it: locking or optimistic versioning", "Cost of higher isolation"]),
            q("Design a payment endpoint that is safe if the client retries the request.", "Idempotency", 1,
                ["Idempotency keys stored with the result", "Handling concurrent duplicates", "Retry-safe status codes", "Exactly-once is really at-least-once plus idempotency"]),
            q("Explain cache-aside versus write-through caching, and how you handle invalidation and stampedes.", "Caching", 2,
                ["When each pattern fits", "TTLs, explicit invalidation, versioned keys", "Thundering herd: locking, request coalescing, jittered expiry"]),
            q("When would you put a message queue between two services? Discuss delivery guarantees.", "Messaging", 2,
                ["Decoupling, buffering bursts, retries", "At-most-once, at-least-once, exactly-once", "Ordering, partitions, dead-letter queues", "Idempotent consumers"]),
            q("Sessions or JWTs? How do you handle refresh and revocation?", "Authentication", 1,
                ["Stateful versus stateless trade-offs", "Short-lived access tokens and rotating refresh tokens", "Revocation, storage location, CSRF and XSS exposure"]),
            q("Design a rate limiter. Compare token bucket with sliding window.", "Rate limiting", 2,
                ["Algorithms and their burst behaviour", "Where state lives; shared store for many instances", "Per-user versus per-IP, and headers returned"]),
            q("Your API's p99 latency doubled overnight. How do you investigate?", "Debugging production", 2,
                ["Check recent deploys and traffic changes", "Metrics, traces and logs to localise the slow hop", "Database locks, connection pool exhaustion, GC, downstream calls", "Mitigate first, then root-cause"]),
            q("Explain how a service handles many concurrent requests: threads versus an event loop, connection pools, and back-pressure.", "Concurrency", 3,
                ["Blocking versus non-blocking I/O", "Pool sizing and queueing", "Shedding load, timeouts, circuit breakers"]),
        ],
        design: [
            { title: "URL shortener", prompt: "Design a URL shortening service that handles billions of redirects.", lookFor: ["Key generation and collisions", "Read-heavy scaling: caching, CDN, replicas", "Data model and storage choice", "Analytics without slowing redirects", "Failure and abuse handling"] },
            { title: "Notification service", prompt: "Design a service that sends email, push and SMS notifications on behalf of many products.", lookFor: ["Queueing and fan-out", "Retries, idempotency, deduplication", "Per-user preferences and rate limits", "Provider failover", "Observability"] },
        ],
    },
    {
        slug: "full-stack-developer",
        role: "Full Stack Developer",
        summary: "For candidates who work across the browser, the API and the database and need to reason about the whole request path.",
        focusAreas: ["The full request path", "API and data modelling", "State and authentication", "Performance end to end", "Testing and deployment"],
        keyterms: ["React", "Node.js", "TypeScript", "PostgreSQL", "REST", "GraphQL", "JWT", "OAuth", "CORS", "SSR", "hydration", "ORM", "Prisma", "N+1", "WebSocket", "Docker", "CI/CD", "Redis", "Next.js", "Express"],
        codingTags: ["array", "string", "hash-map", "stack", "graph"],
        technical: [
            q("Trace a single user action, like clicking Save, from the button to the database and back. Where can it fail?", "Request path", 0,
                ["Event handler, request, validation on both sides", "API, auth check, database write, response", "Loading, error and retry states in the UI", "Idempotency and duplicate submits"]),
            q("What is the N+1 query problem, and how do you find and fix it?", "Data access", 1,
                ["Symptom: many small queries per request", "Eager loading, joins, batching, DataLoader", "Finding it with query logs or tracing"]),
            q("Explain CORS. Why does it exist and how do you configure it safely?", "Web security", 1,
                ["Same-origin policy", "Preflight requests and allowed origins", "Credentials and why wildcard origins are unsafe"]),
            q("Server-side rendering, static generation or client rendering: how do you choose?", "Rendering strategy", 2,
                ["SEO, time to first byte and interactivity trade-offs", "Personalised versus cacheable content", "Hydration cost and caching layers"]),
            q("Walk me through how you would implement sign-in and keep the user signed in securely.", "Authentication", 1,
                ["Password hashing", "Sessions or tokens, cookie flags, refresh", "CSRF and XSS considerations", "Logout and revocation"]),
            q("How would you model users, teams and permissions in a relational database?", "Data modelling", 2,
                ["Normalised tables and join tables", "Role or policy based access", "Indexes and migration strategy"]),
            q("Compare polling, server-sent events and WebSockets for live updates.", "Real-time", 2,
                ["Direction of data, connection cost, scaling", "Reconnects and missed messages", "When polling is good enough"]),
            q("What would your testing strategy be for a feature that spans the UI, an API and a database?", "Testing", 2,
                ["Unit, integration and end-to-end balance", "Test data and isolation", "What not to test, and flaky tests"]),
            q("Your page loads slowly. How do you decide whether the problem is the front end, the API or the database?", "Performance", 2,
                ["Measure first: network waterfall, server timing, query times", "Common culprits at each layer", "Caching and pagination"]),
            q("How do you ship changes safely: migrations, feature flags, rollbacks?", "Delivery", 3,
                ["Backward-compatible migrations in steps", "Feature flags and gradual rollout", "Rollback plan and monitoring"]),
        ],
        design: [
            { title: "Team task tracker", prompt: "Design a team task-tracking app with real-time updates, from the UI through the API to the database.", lookFor: ["Data model and permissions", "API design and pagination", "Real-time sync approach", "State handling in the UI", "Scaling and deployment"] },
        ],
    },
    {
        slug: "devops-sre-engineer",
        role: "DevOps / SRE Engineer",
        summary: "For candidates who run production systems: delivery pipelines, infrastructure as code, reliability and incident response.",
        focusAreas: ["CI/CD and safe deployments", "Kubernetes and containers", "Observability and SLOs", "Incident response", "Infrastructure as code and Linux"],
        keyterms: ["Kubernetes", "Docker", "Terraform", "Ansible", "Prometheus", "Grafana", "Helm", "CI/CD", "Jenkins", "GitHub Actions", "SLO", "SLI", "error budget", "postmortem", "AWS", "load balancer", "cgroups", "namespaces", "canary", "blue-green", "observability", "OpenTelemetry"],
        codingTags: ["string", "hash-map", "array", "graph", "stack"],
        technical: [
            q("How does a Kubernetes Deployment roll out a new version, and how do you roll back?", "Kubernetes", 1,
                ["ReplicaSets and rolling update strategy", "Readiness and liveness probes, maxSurge and maxUnavailable", "kubectl rollout undo, and why readiness gates matter"]),
            q("What are SLIs, SLOs and error budgets? How do they change how a team works?", "Reliability", 1,
                ["Definitions with an example", "Error budget policy: freeze releases when burned", "Alerting on burn rate instead of raw thresholds"]),
            q("A service's latency doubled after a deploy. Walk me through your response.", "Incident response", 1,
                ["Confirm impact, then mitigate first (rollback)", "Golden signals and traces to localise", "Compare the change set, check dependencies", "Communicate, then a blameless postmortem"]),
            q("Design a CI/CD pipeline. What stages does it have, and how do artifacts move between environments?", "CI/CD", 1,
                ["Build once, promote the same immutable artifact", "Tests, security scans, approvals", "Secrets handling", "Deployment strategies: canary or blue-green"]),
            q("How do you manage Terraform state on a team, and what goes wrong with drift?", "Infrastructure as code", 2,
                ["Remote state with locking", "Modules and environment separation", "Detecting and reconciling drift, plan review"]),
            q("A Linux server is slow. What do you check, in what order?", "Linux troubleshooting", 0,
                ["Load, CPU, memory and swap, disk I/O, network", "Tools like top, vmstat, iostat, ss", "Distinguishing saturation from errors"]),
            q("How do containers isolate a process? What are namespaces and cgroups?", "Containers", 1,
                ["Namespaces limit what a process sees; cgroups limit what it uses", "Images and layers", "Hardening: non-root, read-only filesystem, dropped capabilities"]),
            q("Explain how a request travels from a client through a load balancer to a pod.", "Networking", 2,
                ["DNS, TLS termination, load balancing algorithm", "Health checks, Services and Ingress", "Where timeouts and retries belong"]),
            q("Metrics, logs and traces: what is each good for, and how do you avoid alert fatigue?", "Observability", 2,
                ["Complementary strengths", "Actionable, symptom-based alerts", "Runbooks and ownership"]),
            q("How would you plan capacity and control cost for a growing platform?", "Capacity", 3,
                ["Load testing and headroom", "Autoscaling limits, right-sizing, reservations", "Cost visibility per team"]),
        ],
        design: [
            { title: "Zero-downtime platform", prompt: "Design the deployment and observability setup for a platform of fifty services that must deploy several times a day without downtime.", lookFor: ["Pipeline and promotion model", "Progressive delivery and automated rollback", "Metrics, logs, tracing, SLO alerting", "Configuration and secrets", "Failure isolation"] },
            { title: "Multi-region failover", prompt: "Design a multi-region setup for a stateful service that must survive a full regional outage.", lookFor: ["Active-active versus active-passive", "Data replication and consistency", "Traffic failover and DNS", "Recovery objectives and drills"] },
        ],
    },
    {
        slug: "data-engineer",
        role: "Data Engineer",
        summary: "For candidates building pipelines and warehouses: batch and streaming, modelling, quality and orchestration.",
        focusAreas: ["Batch versus streaming", "Data modelling and warehouses", "SQL and Spark", "Data quality and idempotency", "Orchestration and lakehouse formats"],
        keyterms: ["Spark", "Kafka", "Airflow", "dbt", "Snowflake", "BigQuery", "Redshift", "Parquet", "Delta Lake", "Iceberg", "ETL", "ELT", "CDC", "data warehouse", "data lake", "partitioning", "shuffle", "idempotent", "backfill", "star schema", "slowly changing dimension", "SQL", "window function"],
        codingTags: ["array", "hash-map", "string", "heap", "sorting"],
        technical: [
            q("When would you choose batch processing over streaming, and the reverse? What does exactly-once really mean?", "Batch vs streaming", 1,
                ["Latency needs versus complexity and cost", "Micro-batch and hybrid designs", "At-least-once plus idempotent writes"]),
            q("Explain a star schema and how you would handle a slowly changing dimension.", "Data modelling", 1,
                ["Facts and dimensions", "Type 1 versus Type 2 changes", "Surrogate keys, effective dates"]),
            q("Write, in words, a SQL query that returns the latest order per customer, and one for a running total.", "SQL", 0,
                ["Window functions with ROW_NUMBER or MAX OVER", "Partitioning and ordering", "Alternatives with joins and their cost"]),
            q("How do you make a pipeline idempotent, and how do you run a backfill safely?", "Pipeline design", 2,
                ["Overwrite partitions or merge on keys", "Deterministic inputs, no wall-clock dependence", "Backfill isolation and late-arriving data"]),
            q("What causes a Spark shuffle, and how do you deal with skew?", "Spark", 2,
                ["Wide transformations and data movement", "Broadcast joins, salting, repartitioning", "Reading the Spark UI"]),
            q("How do partitions, consumer groups and offsets work in Kafka?", "Kafka", 2,
                ["Ordering only within a partition", "Consumer group rebalancing", "Offset commits and delivery semantics, retention"]),
            q("How would you catch bad data before it reaches dashboards?", "Data quality", 1,
                ["Schema and constraint checks, freshness and volume tests", "Contracts with producers", "Alerting and lineage for impact analysis"]),
            q("What are the benefits of columnar formats like Parquet, and what do table formats such as Iceberg or Delta add?", "Storage formats", 2,
                ["Column pruning, compression, predicate pushdown", "ACID, schema evolution, time travel", "Small files and compaction"]),
            q("How do you design an Airflow DAG that is reliable and easy to operate?", "Orchestration", 1,
                ["Small idempotent tasks, retries, SLAs", "Avoiding heavy work in the scheduler", "Sensors, backfills, dependencies"]),
            q("Change data capture versus periodic full extracts: trade-offs?", "Ingestion", 3,
                ["Log-based CDC, ordering, deletes", "Load on the source, initial snapshot", "Schema changes"]),
        ],
        design: [
            { title: "Clickstream analytics", prompt: "Design a pipeline that turns website clickstream events into near-real-time dashboards and daily reports.", lookFor: ["Ingestion and buffering", "Stream versus batch layers", "Storage and modelling", "Late and duplicate events", "Quality, monitoring, cost"] },
            { title: "Operational database to warehouse", prompt: "Design replication of a busy operational database into a warehouse with minimal impact on the source.", lookFor: ["CDC approach", "Deletes and schema changes", "Ordering and consistency", "Backfills and reconciliation"] },
        ],
    },
    {
        slug: "mobile-app-developer",
        role: "Mobile App Developer (React Native/Flutter)",
        summary: "For candidates building cross-platform mobile apps: rendering, performance, offline behaviour and release management.",
        focusAreas: ["Cross-platform architecture", "List and rendering performance", "Offline-first and sync", "Lifecycle, push and deep links", "Security and releases"],
        keyterms: ["React Native", "Flutter", "Dart", "Expo", "JSI", "Fabric", "Hermes", "Skia", "Impeller", "Redux", "Riverpod", "Bloc", "FlatList", "push notification", "APNs", "FCM", "deep link", "Keychain", "Keystore", "CodePush", "TestFlight"],
        codingTags: ["array", "string", "hash-map", "stack", "two-pointers"],
        technical: [
            q("How does a cross-platform framework render your UI? Compare React Native's architecture with Flutter's engine.", "Architecture", 1,
                ["JavaScript thread, native views and the bridge or JSI and Fabric", "Flutter draws its own widgets via Skia or Impeller", "Consequences for performance and native look"]),
            q("How do you keep a long scrolling list smooth?", "List performance", 0,
                ["Virtualised lists, stable keys, avoiding re-renders", "Image sizing and caching", "Moving work off the UI thread"]),
            q("How do you choose a state management approach for a mobile app?", "State management", 1,
                ["Local versus shared state", "Trade-offs of Redux, Zustand, Riverpod or Bloc", "Persisting and restoring state"]),
            q("Design offline-first behaviour: how do you store data locally and sync it later?", "Offline and sync", 2,
                ["Local database, a queue of pending changes", "Conflict resolution strategy", "Detecting connectivity, retries, UX for stale data"]),
            q("Explain the app lifecycle, and how push notifications and background work fit into it.", "Lifecycle", 1,
                ["Foreground, background, terminated states", "APNs and FCM flow, silent pushes", "OS limits on background execution"]),
            q("A crash is reported only in production. How do you investigate?", "Debugging", 2,
                ["Crash reporting with symbolicated stack traces", "Reproducing by device, OS and version", "Staged rollout and rollback or hotfix"]),
            q("How do you handle navigation and deep links so that a link opens the right screen from any state?", "Navigation", 2,
                ["Route configuration and parameters", "Cold start versus warm start handling", "Auth-gated links"]),
            q("Where do platform differences bite you, and how do you write native code when you must?", "Platform specifics", 2,
                ["Permissions, keyboards, safe areas, back behaviour", "Native modules or platform channels", "Testing on real devices"]),
            q("How do you keep secrets and user data safe on a phone?", "Mobile security", 2,
                ["Keychain and Keystore, not plain storage", "Transport security and pinning trade-offs", "Jailbreak detection limits, minimal data on device"]),
            q("Describe your release process. What are the trade-offs of over-the-air updates?", "Releases", 3,
                ["Signing, review, staged rollouts", "OTA update limits imposed by the stores", "Feature flags and version compatibility"]),
        ],
        design: [
            { title: "Offline-capable chat", prompt: "Design a chat app for mobile that works on flaky networks and offline.", lookFor: ["Local storage and message queue", "Delivery, ordering and read receipts", "Push notifications and background sync", "Media upload and retry", "Battery and data usage"] },
        ],
    },
    {
        slug: "system-architect-tech-lead",
        role: "System Architect / Tech Lead",
        summary: "For candidates who set technical direction: architecture trade-offs, scaling, reliability and leading a team.",
        focusAreas: ["Architecture trade-offs", "Consistency and distributed systems", "Scaling and reliability", "Migration strategy", "Leadership and decision making"],
        keyterms: ["microservices", "monolith", "event-driven", "CQRS", "saga", "outbox pattern", "eventual consistency", "CAP theorem", "sharding", "circuit breaker", "bulkhead", "strangler fig", "architecture decision record", "multi-tenant", "zero trust", "threat model", "SLO"],
        codingTags: ["graph", "hash-map", "dynamic-programming", "heap", "array"],
        technical: [
            q("How do you decide between a monolith and microservices for a team of fifteen?", "Architecture", 2,
                ["Team structure, deployment independence, operational cost", "Start modular, split with evidence", "Data ownership and coupling"]),
            q("How do you keep data consistent across services without distributed transactions?", "Distributed data", 3,
                ["Sagas and compensations", "The outbox pattern, idempotent consumers", "Where eventual consistency is acceptable"]),
            q("How would you migrate a legacy system with no downtime?", "Migration", 3,
                ["Strangler fig approach, incremental routing", "Dual writes and data sync risks", "Rollback plan and success metrics"]),
            q("Where do systems fail as they scale, and how do you find the next bottleneck?", "Scaling", 3,
                ["Measure and model load", "Caching, read replicas, sharding and their costs", "CAP trade-offs in practice"]),
            q("Describe your approach to reliability: timeouts, retries, circuit breakers and graceful degradation.", "Reliability", 3,
                ["Bounded retries with backoff and jitter", "Bulkheads and load shedding", "Deciding what degrades first"]),
            q("How do you make and record architectural decisions, and handle disagreement on the team?", "Decision making", 3,
                ["Architecture decision records, options and trade-offs", "Disagree and commit, time-boxing", "Revisiting decisions with new data"]),
            q("How do you decide what technical debt to pay down, and get buy-in for it?", "Technical debt", 3,
                ["Tie debt to business risk and velocity", "Small continuous investment versus big rewrites", "Making the cost visible"]),
            q("Walk me through threat modelling a new service.", "Security architecture", 3,
                ["Assets, trust boundaries, attackers", "STRIDE or similar, mitigations", "Least privilege, secrets, auditing"]),
            q("How do you grow other engineers and shape a healthy code review culture?", "Leadership", 3,
                ["Delegation with support, feedback that is specific", "Review for learning as well as correctness", "Unblocking without taking over"]),
            q("Build or buy: how do you decide?", "Trade-offs", 3,
                ["Core versus commodity capability", "Total cost including maintenance and lock-in", "Exit strategy"]),
        ],
        design: [
            { title: "Multi-tenant SaaS platform", prompt: "Design a multi-tenant SaaS platform with per-tenant isolation, usage metering and a path to enterprise customers who need dedicated infrastructure.", lookFor: ["Tenancy model and isolation levels", "Data partitioning, noisy neighbours", "Metering and billing pipeline", "Security and compliance", "Operability at scale"] },
            { title: "Global low-latency feed", prompt: "Design a globally distributed activity feed that must feel instant for users on every continent.", lookFor: ["Fan-out on write versus read", "Regional replication and consistency", "Caching and CDNs", "Ranking and personalisation hooks", "Failure handling"] },
        ],
    },
];

export function getRoleBank(role: string): RoleBank {
    return ROLE_BANKS.find((bank) => bank.role === role) ?? ROLE_BANKS.find((bank) => bank.slug === "full-stack-developer")!;
}

export function findRoleBySlug(slug: string): RoleBank | undefined {
    return ROLE_BANKS.find((bank) => bank.slug === slug);
}

export const SUPPORTED_ROLES: readonly string[] = ROLE_BANKS.map((bank) => bank.role);

export interface BackgroundQuestion {
    question: string;
    topic: string;
    lookFor: string[];
}

export const GENERIC_BACKGROUND: BackgroundQuestion[] = [
    { topic: "Recent project", question: "Tell me about a recent project you're proud of. What was your part in it, and what was the hardest technical problem?", lookFor: ["Clear scope and personal contribution", "A concrete technical challenge and how it was solved", "Trade-offs and what they would change"] },
    { topic: "Technical strengths", question: "Which technologies are you strongest in, and where are you still growing?", lookFor: ["Honest self-assessment", "Depth in at least one area", "A plan for growth"] },
    { topic: "Motivation", question: "What draws you to this kind of role, and what are you hoping to do next?", lookFor: ["Genuine motivation", "Understanding of the role", "Realistic goals"] },
    { topic: "Learning", question: "How do you keep learning new things, and what is something you learned recently?", lookFor: ["Specific, recent example", "Method for learning", "Applying it in practice"] },
];

export interface BehavioralQuestion {
    topic: string;
    question: string;
    lookFor: string[];
    minLevel: number;
}

export const BEHAVIORAL_BANK: BehavioralQuestion[] = [
    { topic: "Disagreement", minLevel: 0, question: "Tell me about a time you disagreed with a teammate about a technical decision. What happened?", lookFor: ["Specific situation", "Listening and data over ego", "How it was resolved, and the outcome"] },
    { topic: "Failure", minLevel: 0, question: "Tell me about something that went wrong on a project you worked on. What was your role, and what did you take from it?", lookFor: ["Ownership without blame", "Concrete actions taken", "A lasting change in how they work"] },
    { topic: "Ambiguity", minLevel: 1, question: "Describe a time you had to deliver something with unclear requirements. How did you make progress?", lookFor: ["Asking clarifying questions", "Making assumptions explicit", "Iterating with feedback"] },
    { topic: "Deadline pressure", minLevel: 1, question: "Tell me about a time you had to hit a tight deadline. What did you cut, and how did you decide?", lookFor: ["Prioritisation logic", "Communicating trade-offs", "Quality safeguards"] },
    { topic: "Feedback", minLevel: 0, question: "Tell me about feedback that was hard to hear. What did you do with it?", lookFor: ["Openness", "Specific change", "Follow-through"] },
    { topic: "Mentoring", minLevel: 3, question: "Tell me about a time you helped another engineer grow. What did you do, and what changed?", lookFor: ["Tailored approach", "Balance of support and autonomy", "Measurable improvement"] },
    { topic: "Influence", minLevel: 3, question: "Describe a time you changed the direction of a project without having formal authority. How?", lookFor: ["Building a case with evidence", "Stakeholder alignment", "Result and reflection"] },
    { topic: "Ownership", minLevel: 2, question: "Tell me about a time you noticed a problem nobody had asked you to fix. What did you do?", lookFor: ["Initiative", "Scoping and communication", "Impact"] },
];

export function levelLabel(level: Level): string {
    return { intern: "intern", junior: "junior", mid: "mid-level", senior: "senior", staff: "staff-level" }[level];
}

// Deliberately unused import guard so the module fails loudly if Level changes shape.
export type _LevelCheck = Level;
