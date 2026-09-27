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
    {
        slug: "machine-learning-engineer",
        role: "Machine Learning Engineer",
        summary: "For candidates who build and ship models: features, training, evaluation and serving them reliably.",
        focusAreas: ["Feature engineering and data leakage", "Model evaluation and validation", "Training at scale", "Serving, latency and drift", "Experiment design"],
        keyterms: ["PyTorch", "TensorFlow", "scikit-learn", "feature store", "embedding", "fine-tuning", "overfitting", "cross-validation", "precision", "recall", "AUC", "A/B test", "data drift", "model registry", "batch inference", "online inference", "vector database", "gradient descent", "regularisation", "label leakage"],
        codingTags: ["array", "matrix", "hash-map", "sorting", "prefix-sum"],
        technical: [
            q("Walk me through building a model to predict something from raw data, end to end.", "ML pipeline", 0,
                ["Problem framing and what 'good' means", "Data collection, cleaning, splitting", "Feature engineering, a baseline before anything fancy", "Evaluation against the baseline"], ["What would you do first if the model badly underperforms the baseline?"]),
            q("What is overfitting, and what would make you suspect a model has it?", "Generalisation", 0,
                ["Gap between train and validation performance", "Model complexity versus data size", "Regularisation, more data, simpler model, early stopping"]),
            q("How do you choose which metric to optimise for a classifier on an imbalanced dataset?", "Evaluation", 1,
                ["Why accuracy misleads on imbalance", "Precision, recall, F1 and the trade-off between them", "Picking the metric from the real cost of each error"], ["When would you care more about recall than precision?"]),
            q("What is data leakage, and how have you caught it in practice?", "Data leakage", 1,
                ["Information from the future or the label leaking into features", "Leakage through preprocessing done before the split", "Time-based splits for time-dependent data"]),
            q("How would you validate a model before it ever reaches production?", "Validation", 1,
                ["Held-out and cross-validation", "Slicing performance by segment, not just the aggregate", "Sanity checks and a human review of edge cases"]),
            q("You trained a model that looks great offline, but it's failing in production. How do you debug it?", "Train-serve skew", 2,
                ["Training-serving skew in features or preprocessing", "Data drift versus concept drift", "Checking the pipeline before the model itself"]),
            q("How would you serve a model that needs a prediction in under 50 milliseconds?", "Serving", 2,
                ["Batch versus online inference", "Model size, quantisation, distillation", "Caching, warm pools, and what happens on a cold start"]),
            q("How do you design an A/B test to tell whether a new model is actually better?", "Experimentation", 2,
                ["Randomisation unit and guardrail metrics", "Sample size and how long to run it", "Novelty effects and interaction with other experiments"]),
            q("How do you detect and respond to a model degrading in production over time?", "Monitoring", 3,
                ["Monitoring input distributions and prediction distributions, not just accuracy", "Ground truth lag: how you get labels late", "A retraining and rollback strategy"]),
        ],
        design: [
            { title: "Recommendation system", prompt: "Design a recommendation system for a content platform with tens of millions of users, including how you would measure whether it's working.", lookFor: ["Candidate generation versus ranking", "Cold start for new users and new items", "Offline evaluation versus online experiments", "Feedback loops and popularity bias", "Serving latency at scale"] },
            { title: "Fraud detection pipeline", prompt: "Design a system that scores transactions for fraud in real time, where both false positives and false negatives are expensive.", lookFor: ["Feature computation in real time", "Handling extreme class imbalance", "Threshold choice and the cost of each error type", "Model updates as fraud patterns shift", "Explainability for disputed decisions"] },
        ],
    },
    {
        slug: "security-engineer",
        role: "Security Engineer",
        summary: "For candidates who secure systems: application security, threat modelling, incident response and secure design.",
        focusAreas: ["Application security (OWASP-style vulnerabilities)", "Authentication and authorization", "Threat modelling", "Incident response", "Secure infrastructure and secrets"],
        keyterms: ["OWASP", "SQL injection", "XSS", "CSRF", "SSRF", "OAuth", "JWT", "mTLS", "least privilege", "threat model", "STRIDE", "zero trust", "secrets management", "SIEM", "penetration testing", "CVE", "supply chain", "encryption at rest", "encryption in transit", "incident response"],
        codingTags: ["string", "hash-map", "bit-manipulation", "array", "stack"],
        technical: [
            q("Walk me through what you'd look for reviewing a pull request that adds a new API endpoint accepting user input.", "Code review for security", 0,
                ["Input validation and output encoding", "AuthN versus authZ on the endpoint", "Where the input ends up: a query, a shell, a template"], ["What's the difference between authentication and authorization, concretely?"]),
            q("Explain SQL injection and how modern frameworks prevent it, plus a case where it can still slip through.", "Injection", 0,
                ["Untrusted input reaching a query as code, not data", "Parameterised queries versus string concatenation", "Dynamic table or column names, ORMs used unsafely"]),
            q("What is XSS, and what's the difference between stored, reflected and DOM-based?", "XSS", 1,
                ["Untrusted content rendered as executable script", "Where each type's payload lives and travels", "Output encoding and a Content Security Policy as defence in depth"]),
            q("How would you design authentication and session management for a new web app?", "AuthN design", 1,
                ["Password hashing, MFA, account lockout without enabling enumeration", "Session tokens versus stateless tokens, and revocation", "Secure cookie flags, CSRF protection"]),
            q("Walk me through threat modelling a new feature before it ships.", "Threat modelling", 2,
                ["Assets, entry points, trust boundaries", "STRIDE or an equivalent structured walk", "Turning findings into concrete mitigations, not just a list"], ["How do you prioritise which findings get fixed before launch?"]),
            q("What is SSRF, and why does it matter more once services talk to cloud metadata endpoints?", "SSRF", 2,
                ["Server tricked into making a request on the attacker's behalf", "Cloud metadata endpoints as a common target", "Allow-lists, network segmentation, disabling redirects"]),
            q("How would you design least-privilege access for a service that touches several internal systems?", "Access control", 2,
                ["Scoped, short-lived credentials over broad standing access", "Service identity and mutual TLS between services", "Auditing who has access to what, and why"]),
            q("Walk me through your first hour after being paged for a suspected active breach.", "Incident response", 3,
                ["Confirm and scope before acting rashly", "Contain without destroying evidence", "Who gets told, and when, including legal and customers"]),
            q("How do you think about supply chain risk in a codebase with hundreds of dependencies?", "Supply chain", 3,
                ["Pinning, provenance and signature verification", "Automated vulnerability scanning and its false-positive cost", "A plan for the next widely-exploited package vulnerability"]),
        ],
        design: [
            { title: "Secrets and credentials service", prompt: "Design a secrets management system for an organisation with hundreds of services, where a leaked secret must be found and rotated fast.", lookFor: ["Storage, encryption and access control for secrets", "Short-lived credentials over long-lived ones", "Auditing every access", "Rotation strategy and blast-radius limits", "Detecting a leaked secret quickly"] },
            { title: "Zero-trust internal network", prompt: "Design access to internal tools for a company moving away from a trusted-internal-network model to zero trust.", lookFor: ["Identity-aware access per request, not per network", "Device posture and continuous verification", "Segmentation and least privilege", "Migration path without breaking everyone's workflow", "Logging and anomaly detection"] },
        ],
    },
    {
        slug: "qa-test-engineer",
        role: "QA / Test Engineer",
        summary: "For candidates who build confidence in software before and after it ships: test strategy, automation and quality risk.",
        focusAreas: ["Test strategy and coverage", "Automation frameworks", "Flaky tests and CI reliability", "Regression and risk analysis", "Bug investigation and reporting"],
        keyterms: ["test pyramid", "unit test", "integration test", "end-to-end test", "flaky test", "mocking", "test fixtures", "CI/CD", "regression suite", "exploratory testing", "load testing", "test coverage", "Selenium", "Playwright", "contract testing", "smoke test", "bug triage", "root cause analysis", "acceptance criteria", "test data"],
        codingTags: ["array", "string", "hash-map", "two-pointers", "sorting"],
        technical: [
            q("How do you decide what to cover with unit tests versus integration tests versus end-to-end tests?", "Test strategy", 0,
                ["The test pyramid and why each layer exists", "Speed and reliability trade-offs at each layer", "Not testing the same thing redundantly at every layer"], ["What would make you push a test down a layer, or up one?"]),
            q("Given a new feature with an acceptance criteria doc, how do you turn it into a test plan?", "Test planning", 0,
                ["Breaking criteria into concrete test cases", "Edge cases and negative cases, not just the happy path", "Deciding what's worth automating versus checking once"]),
            q("A test suite that used to be reliable is now flaky. How do you investigate?", "Flaky tests", 1,
                ["Distinguishing a real bug from a bad test", "Common causes: timing, shared state, order dependence", "Quarantine versus fix versus delete, and how you decide"], ["What's your policy on a test that fails one time in twenty?"]),
            q("How do you write tests that don't break every time the implementation changes?", "Maintainable tests", 1,
                ["Testing behaviour and contracts, not internals", "Good use of test doubles versus over-mocking", "Readable failures that say what actually broke"]),
            q("How would you test a system you can't fully see the internals of, like a third-party integration?", "Black-box testing", 2,
                ["Contract tests against the interface", "Simulating failure modes: timeouts, malformed responses, rate limits", "Monitoring in production as a form of testing"]),
            q("Walk me through triaging a bug report with a vague description like 'it doesn't work sometimes'.", "Bug investigation", 2,
                ["Getting to a reliable repro before doing anything else", "Narrowing scope: environment, data, timing", "Distinguishing severity from priority"]),
            q("How do you decide what to automate versus what's better tested manually or exploratorily?", "Automation strategy", 2,
                ["Cost of writing and maintaining automation versus its value", "Where exploratory testing finds things automation won't", "Regression-prone areas as the first automation target"]),
            q("How would you keep a CI pipeline's test suite fast as the codebase and suite both grow?", "CI performance", 3,
                ["Parallelisation and sharding", "Splitting fast smoke tests from a slower full suite", "Data on which tests actually catch bugs, versus dead weight"]),
            q("How do you build a quality culture in a team that sees testing as someone else's job?", "Quality culture", 3,
                ["Making quality visible: metrics, dashboards, incident reviews", "Shifting testing earlier, closer to the code that's written", "Leading by example rather than gatekeeping at the end"]),
        ],
        design: [
            { title: "End-to-end test infrastructure", prompt: "Design the end-to-end test infrastructure for a web app released several times a day, where slow or flaky tests currently block every release.", lookFor: ["Test environment strategy: shared, ephemeral or production-like", "Parallelisation and sharding for speed", "Flake detection and quarantine process", "What blocks a release versus what just warns", "Ownership of tests that break"] },
            { title: "Load and reliability testing", prompt: "Design a load-testing strategy for a service ahead of a launch expected to bring ten times normal traffic.", lookFor: ["Realistic traffic modelling, not just raw throughput", "What to measure: latency percentiles, error rate, saturation point", "Testing failure modes, not just the happy path at scale", "Environment parity with production", "A go or no-go process from the results"] },
        ],
    },
    {
        slug: "data-scientist",
        role: "Data Scientist",
        summary: "For candidates who turn data into decisions: statistics, experimentation, analysis and communicating findings.",
        focusAreas: ["Statistical reasoning", "Experiment design", "Exploratory data analysis", "Communicating uncertainty", "Practical modelling"],
        keyterms: ["hypothesis test", "p-value", "confidence interval", "A/B test", "statistical significance", "confounding", "regression", "correlation", "sampling bias", "SQL", "pandas", "outlier", "Bayesian", "power analysis", "causal inference", "segmentation", "cohort analysis", "dashboard", "effect size", "variance"],
        codingTags: ["array", "hash-map", "sorting", "prefix-sum", "two-pointers"],
        technical: [
            q("Walk me through how you'd approach a vague ask like 'figure out why signups dropped last month'.", "Analytical approach", 0,
                ["Clarifying the actual question and what decision it feeds", "Looking at the data before forming a theory", "Segmenting to find where the drop is concentrated"], ["What's the first chart you'd pull?"]),
            q("Explain p-values and statistical significance to someone who doesn't have a stats background.", "Statistical reasoning", 0,
                ["What a p-value actually means, and what it does not", "Significance versus practical importance", "The risk of testing many things and finding one by chance"]),
            q("What is confounding, and how have you dealt with it in an analysis?", "Confounding", 1,
                ["A variable that affects both the supposed cause and the outcome", "Correlation is not causation, with a concrete example", "Controlling for it, or why you couldn't"], ["Give me an example of a confounder you've actually run into."]),
            q("How do you decide on sample size before running an experiment?", "Power analysis", 1,
                ["Minimum detectable effect and the trade-off with runtime", "Baseline rate and variance driving the required sample", "What happens if you peek at results early"]),
            q("You're given a messy dataset with missing values and outliers. How do you approach cleaning it?", "Data cleaning", 1,
                ["Understanding why data is missing before deciding how to handle it", "Outliers as signal versus noise, not automatically deleted", "Documenting cleaning decisions so they're reproducible"]),
            q("An A/B test shows a statistically significant lift, but the product team is skeptical. How do you build confidence in the result?", "Experiment validation", 2,
                ["Sanity checks: sample ratio mismatch, pre-period balance", "Practical significance versus statistical significance", "Segment consistency and looking for a plausible mechanism"]),
            q("How do you explain a model or analysis's uncertainty to a stakeholder who wants a single number?", "Communicating uncertainty", 2,
                ["Confidence or credible intervals in plain language", "Framing a range and what drives its width", "Not overstating confidence to seem more useful"]),
            q("How would you detect that an earlier analysis or dashboard is now giving misleading numbers?", "Data quality", 2,
                ["Monitoring key metrics for unexplained shifts", "Upstream schema or tracking changes as a common cause", "A process for someone to flag a number that looks wrong"]),
            q("How do you decide between a simple, interpretable model and a more accurate, complex one for a business-facing analysis?", "Model choice", 3,
                ["Who consumes the result and what they need from it", "Interpretability's value when a decision must be explained", "Accuracy gains that don't change the decision aren't worth the complexity"]),
        ],
        design: [
            { title: "Experimentation platform", prompt: "Design the analysis pipeline for a company's A/B testing platform, from an experiment being launched to a trustworthy result reaching the team that ran it.", lookFor: ["Metric definitions and guardrail metrics", "Automatic checks: sample ratio mismatch, novelty effects", "Handling multiple simultaneous experiments", "Presenting uncertainty, not just a verdict", "Preventing p-hacking through repeated peeking"] },
            { title: "Churn analysis and intervention", prompt: "Design an approach to understand why customers churn and to identify who is at risk before they leave.", lookFor: ["Defining churn precisely for this business", "Feature and cohort analysis to find drivers", "A model or heuristic for risk, and how it's evaluated", "Turning findings into an actionable intervention", "Measuring whether the intervention actually worked"] },
        ],
    },
    {
        slug: "game-developer",
        role: "Game Developer",
        summary: "For candidates building games: real-time performance, gameplay systems, engines and the tricky edges of simulation.",
        focusAreas: ["Real-time performance and frame budgets", "Game loop and simulation", "Memory management", "Networking for multiplayer", "Engine architecture (Unity/Unreal or custom)"],
        keyterms: ["game loop", "frame budget", "delta time", "entity component system", "object pooling", "garbage collection", "physics engine", "collision detection", "shader", "draw call", "Unity", "Unreal", "client-server prediction", "lag compensation", "state synchronisation", "spatial partitioning", "level of detail", "profiling", "fixed timestep", "occlusion culling"],
        codingTags: ["matrix", "array", "hash-map", "heap", "graph"],
        technical: [
            q("Walk me through a game loop and why a fixed timestep matters for simulation.", "Game loop", 0,
                ["Update and render separated, and why", "Delta time and frame-rate independence", "Fixed timestep for physics so behaviour is deterministic"], ["What goes wrong if you tie physics directly to frame rate?"]),
            q("Why does object pooling matter in a game, and where have you used it?", "Memory and performance", 0,
                ["Allocation and garbage collection cost during gameplay", "Reusing objects like bullets or particles instead of allocating", "The trade-off: pool size versus memory held idle"]),
            q("How would you find out why a scene is dropping frames?", "Profiling", 1,
                ["Profiling before guessing: CPU, GPU or memory bound", "Draw calls, overdraw, and batching", "Distinguishing a spike from a sustained cost"]),
            q("Explain the entity-component-system pattern, and when you'd reach for it over classic inheritance.", "Architecture", 1,
                ["Composition over deep inheritance hierarchies", "Data-oriented layout for cache-friendly updates", "When ECS is overkill for a smaller game"]),
            q("How does collision detection typically work, and how would you speed it up for hundreds of objects?", "Collision and spatial structures", 2,
                ["Broad phase versus narrow phase", "Spatial partitioning: grids, quadtrees or similar", "Trade-offs between accuracy and performance"]),
            q("How would you design client-server networking for a fast-paced multiplayer game with noticeable latency?", "Multiplayer networking", 2,
                ["Client-side prediction and server reconciliation", "Lag compensation for hit detection", "What the server must remain authoritative over, and why"]),
            q("How do you manage state that must stay in sync between many players without the network becoming the bottleneck?", "State synchronisation", 3,
                ["Delta compression: sending changes, not full state", "Prioritising what's visible or relevant to each player", "Handling packet loss and out-of-order delivery gracefully"]),
            q("How would you design a level-of-detail system for a large open world?", "LOD and streaming", 3,
                ["Distance-based detail reduction for meshes and logic", "Streaming assets in and out without a visible hitch", "Balancing visual quality against memory and load"]),
            q("What's your approach to debugging a bug that only reproduces intermittently during actual play?", "Debugging live systems", 3,
                ["Logging and replay systems built for exactly this", "Narrowing conditions: input sequence, timing, hardware", "Adding instrumentation without changing the behaviour being chased"]),
        ],
        design: [
            { title: "Real-time multiplayer arena", prompt: "Design the client-server architecture for a real-time multiplayer arena game for up to twenty players, where responsiveness matters more than perfect consistency.", lookFor: ["Authoritative server with client prediction", "Lag compensation and hit registration", "Bandwidth budget and update rate", "Handling disconnects and rejoining", "Cheating resistance"] },
            { title: "Open-world streaming", prompt: "Design how a large open-world game streams its world in and out of memory as the player moves through it.", lookFor: ["Chunking the world and loading radius", "Asynchronous loading without hitching", "Memory budget and eviction strategy", "Level of detail as a complement to streaming", "Handling fast movement that outpaces loading"] },
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
