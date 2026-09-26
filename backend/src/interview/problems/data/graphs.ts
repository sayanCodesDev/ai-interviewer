import type { ProblemDef } from "../types";
import { randInt, randInts, range, rng } from "./helpers";

// Graphs, grids and shortest paths: routing, dependencies, networks and maps.

const adjacency = (n: number, edges: number[][]) => {
    const list: number[][] = Array.from({ length: n }, () => []);
    for (const [a, b] of edges) {
        list[a!]!.push(b!);
        list[b!]!.push(a!);
    }
    return list;
};

const randomEdges = (seed: number, n: number, m: number) => {
    const next = rng(seed);
    return Array.from({ length: m }, () => [randInt(next, 0, n - 1), randInt(next, 0, n - 1)]);
};

/** A connected graph: a random tree plus extra edges. */
const connectedGraph = (seed: number, n: number, extra: number) => {
    const next = rng(seed);
    const edges: number[][] = [];
    for (let v = 1; v < n; v++) edges.push([randInt(next, 0, v - 1), v]);
    for (let i = 0; i < extra; i++) {
        const a = randInt(next, 0, n - 1);
        const b = randInt(next, 0, n - 1);
        if (a !== b) edges.push([a, b]);
    }
    return edges;
};

const randomGridOf = (seed: number, rows: number, cols: number, values: number[], weights: number[]) => {
    const next = rng(seed);
    const total = weights.reduce((a, b) => a + b, 0);
    return Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () => {
            let roll = next() * total;
            for (let i = 0; i < values.length; i++) {
                roll -= weights[i]!;
                if (roll < 0) return values[i]!;
            }
            return values[values.length - 1]!;
        }),
    );
};

const weightedEdges = (seed: number, n: number, m: number, maxWeight: number) => {
    const next = rng(seed);
    return Array.from({ length: m }, () => {
        const u = randInt(next, 1, n);
        let v = randInt(next, 1, n);
        if (v === u) v = (v % n) + 1;
        return [u, v, randInt(next, 1, maxWeight)];
    });
};

const flights = (seed: number, n: number, m: number) => {
    const next = rng(seed);
    return Array.from({ length: m }, () => {
        const from = randInt(next, 0, n - 1);
        let to = randInt(next, 0, n - 1);
        if (to === from) to = (to + 1) % n;
        return [from, to, randInt(next, 10, 500)];
    });
};

/** Every string of length `len` over the first `alphabet` letters. */
const allWords = (len: number, alphabet: number): string[] => {
    let words = [""];
    for (let i = 0; i < len; i++) words = words.flatMap((w) => range(alphabet).map((c) => w + String.fromCharCode(97 + c)));
    return words;
};

const randomWords = (seed: number, count: number, len: number, alphabet: number) => {
    const next = rng(seed);
    const set = new Set<string>();
    while (set.size < count) set.add(range(len).map(() => String.fromCharCode(97 + randInt(next, 0, alphabet - 1))).join(""));
    return [...set];
};

/** People own separate sets of email addresses; each account lists some of one person's addresses. */
const emailAccounts = (seed: number, people: number, accountsPerPerson: number) => {
    const next = rng(seed);
    const accounts: string[][] = [];
    for (let p = 0; p < people; p++) {
        const owned = range(2 + (p % 5)).map((e) => `p${p}e${e}@mail.example`);
        for (let a = 0; a < accountsPerPerson; a++) {
            const listed = owned.filter(() => next() < 0.5);
            if (listed.length === 0) listed.push(owned[Math.floor(next() * owned.length)]!);
            accounts.push([`Person${p}`, ...listed]);
        }
    }
    // Shuffle so related accounts are scattered.
    for (let i = accounts.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [accounts[i], accounts[j]] = [accounts[j]!, accounts[i]!];
    }
    return accounts;
};

const smallGridEdges = (rows: number, cols: number) => {
    const edges: number[][] = [];
    for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
            if (c + 1 < cols) edges.push([r * cols + c, r * cols + c + 1]);
            if (r + 1 < rows) edges.push([r * cols + c, (r + 1) * cols + c]);
        }
    return edges;
};

const cycleEdges = (n: number) => range(n).map((i) => [i, (i + 1) % n]);

export const graphProblems: ProblemDef[] = [
    {
        key: "flood-fill",
        title: "Flood Fill",
        difficulty: "easy",
        tags: ["dfs", "bfs", "matrix", "graph"],
        statement:
            "You are given an image as a grid of integers, a starting cell given by a row and a column, and a new color. Change the color of the starting cell and of every cell connected to it horizontally or vertically that has the same original color, and return the changed image.",
        constraints: ["1 <= rows, columns <= 100", "0 <= color, image[r][c] <= 65535"],
        signature: { name: "floodFill", params: [{ name: "image", type: "int[][]" }, { name: "row", type: "int" }, { name: "col", type: "int" }, { name: "color", type: "int" }], returns: "int[][]" },
        examples: [
            { input: [[[1, 1, 1], [1, 1, 0], [1, 0, 1]], 1, 1, 2], output: [[2, 2, 2], [2, 2, 0], [2, 0, 1]], explanation: "The bottom-right 1 is not connected to the start." },
            { input: [[[0, 0, 0], [0, 0, 0]], 0, 0, 0], output: [[0, 0, 0], [0, 0, 0]] },
        ],
        hidden: [
            { label: "single cell", input: [[[5]], 0, 0, 9] },
            { label: "new color equals old color", input: [[[1, 1], [1, 1]], 0, 1, 1] },
            { label: "a region shaped like a spiral", input: [[[1, 1, 1, 1], [0, 0, 0, 1], [1, 1, 0, 1], [1, 1, 1, 1]], 0, 0, 7] },
            { label: "diagonal cells are not connected", input: [[[1, 0], [0, 1]], 0, 0, 3] },
            { label: "large single-color image", input: [Array.from({ length: 100 }, () => Array(100).fill(4)), 50, 50, 8] },
            { label: "large striped image", input: [Array.from({ length: 100 }, (_, r) => Array(100).fill(r % 2)), 10, 40, 6] },
        ],
        hints: [
            "Every cell that gets recolored is reachable from the start by moving to same-colored neighbours.",
            "Do a DFS or BFS from the start, moving up, down, left and right onto cells that still have the original color.",
            "If the new color equals the original color, return immediately, otherwise recoloring would make the search revisit cells forever.",
        ],
        solution: { approach: "DFS or BFS from the start over cells of the original color, recoloring as you go.", time: "O(rows x cols)", space: "O(rows x cols)" },
        reference: String.raw`
def flood_fill(image, row, col, color):
    original = image[row][col]
    if original == color:
        return image
    rows, cols = len(image), len(image[0])
    stack = [(row, col)]
    image[row][col] = color
    while stack:
        r, c = stack.pop()
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nr, nc = r + dr, c + dc
            if 0 <= nr < rows and 0 <= nc < cols and image[nr][nc] == original:
                image[nr][nc] = color
                stack.append((nr, nc))
    return image
`,
    },
    {
        key: "find-the-town-judge",
        title: "Find the Town Judge",
        difficulty: "easy",
        tags: ["graph", "array", "hash-map"],
        statement:
            "In a town of n people labelled 1 to n, there may be a judge. The judge trusts nobody, and everybody else trusts the judge. You are given trust, an array of pairs [a, b] meaning person a trusts person b. Return the label of the judge, or minus one if there is no judge.",
        constraints: ["1 <= n <= 1000", "0 <= trust.length <= 10000", "All pairs are distinct, and a person never trusts themselves"],
        signature: { name: "findJudge", params: [{ name: "n", type: "int" }, { name: "trust", type: "int[][]" }], returns: "int" },
        examples: [
            { input: [2, [[1, 2]]], output: 2 },
            { input: [3, [[1, 3], [2, 3], [3, 1]]], output: -1, explanation: "Person 3 trusts someone, so cannot be the judge." },
        ],
        hidden: [
            { label: "one person", input: [1, []] },
            { label: "nobody trusts anyone", input: [3, []] },
            { label: "two candidates, one short of trust", input: [4, [[1, 3], [1, 4], [2, 3], [3, 4]]] },
            { label: "everyone trusts everyone but the judge", input: [4, [[1, 4], [2, 4], [3, 4]]] },
            { label: "judge is trusted by all but one", input: [4, [[1, 3], [2, 3]]] },
            { label: "large town", input: [1000, range(999).map((i) => [i + 1, 1000])] },
            { label: "large town without a judge", input: [1000, [...range(999).map((i) => [i + 1, 1000]), [1000, 1]]] },
        ],
        hints: [
            "Think of trust as directed edges. What are the judge's out-degree and in-degree?",
            "The judge has out-degree 0 and in-degree n minus 1.",
            "Keep one counter per person: subtract one when they trust someone, add one when someone trusts them. The judge is the person whose counter reaches n minus 1.",
        ],
        solution: { approach: "Net trust score per person: +1 for each person who trusts them, -1 for each person they trust. The judge scores n - 1.", time: "O(n + trust)", space: "O(n)" },
        reference: String.raw`
def find_judge(n, trust):
    score = [0] * (n + 1)
    for a, b in trust:
        score[a] -= 1
        score[b] += 1
    for person in range(1, n + 1):
        if score[person] == n - 1:
            return person
    return -1
`,
    },
    {
        key: "connected-components",
        title: "Number of Connected Components",
        difficulty: "medium",
        tags: ["graph", "dfs", "bfs", "union-find"],
        statement:
            "You are given n nodes labelled 0 to n minus one and a list of undirected edges, each a pair of nodes. Return the number of connected components in the graph.",
        constraints: ["1 <= n <= 100000", "0 <= edges.length <= 200000", "Edges may repeat, and a node may be joined to itself"],
        signature: { name: "countComponents", params: [{ name: "n", type: "int" }, { name: "edges", type: "int[][]" }], returns: "int" },
        examples: [
            { input: [5, [[0, 1], [1, 2], [3, 4]]], output: 2 },
            { input: [5, [[0, 1], [1, 2], [2, 3], [3, 4]]], output: 1 },
        ],
        hidden: [
            { label: "no edges", input: [6, []] },
            { label: "a single node", input: [1, []] },
            { label: "a cycle", input: [4, [[0, 1], [1, 2], [2, 3], [3, 0]]] },
            { label: "repeated and self edges", input: [3, [[0, 0], [1, 2], [2, 1], [1, 2]]] },
            { label: "a long chain", input: [100_000, range(99_999).map((i) => [i, i + 1])] },
            { label: "large sparse random graph", input: [100_000, randomEdges(101, 100_000, 60_000)] },
            { label: "large dense random graph", input: [50_000, randomEdges(102, 50_000, 100_000)] },
        ],
        hints: [
            "Every node belongs to exactly one component. What could you do to visit an entire component once?",
            "Build adjacency lists, and start a DFS or BFS from every unvisited node, counting how many searches you start.",
            "Alternatively use union-find: start with n components and subtract one every time an edge joins two different sets.",
        ],
        solution: { approach: "Union-find (subtract one per successful union), or DFS/BFS from every unvisited node.", time: "O((n + e) alpha(n))", space: "O(n)" },
        reference: String.raw`
def count_components(n, edges):
    parent = list(range(n))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    components = n
    for a, b in edges:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb
            components -= 1
    return components
`,
    },
    {
        key: "rotting-oranges",
        title: "Rotting Oranges",
        difficulty: "medium",
        tags: ["bfs", "matrix", "graph"],
        statement:
            "You are given a grid where 0 is an empty cell, 1 is a fresh orange and 2 is a rotten orange. Every minute, each fresh orange that is directly up, down, left or right of a rotten orange becomes rotten. Return the number of minutes until no fresh orange remains, or minus one if that never happens.",
        constraints: ["1 <= rows, columns <= 100", "Every cell is 0, 1 or 2"],
        signature: { name: "orangesRotting", params: [{ name: "grid", type: "int[][]" }], returns: "int" },
        examples: [
            { input: [[[2, 1, 1], [1, 1, 0], [0, 1, 1]]], output: 4 },
            { input: [[[2, 1, 1], [0, 1, 1], [1, 0, 1]]], output: -1, explanation: "The orange at the bottom left is never reached." },
            { input: [[[0, 2]]], output: 0 },
        ],
        hidden: [
            { label: "no oranges", input: [[[0, 0], [0, 0]]] },
            { label: "fresh oranges and nothing rotten", input: [[[1, 1], [0, 1]]] },
            { label: "already all rotten", input: [[[2, 2], [2, 2]]] },
            { label: "two sources meeting", input: [[[2, 1, 1, 1, 2]]] },
            { label: "a wall of empty cells", input: [[[2, 0, 1], [1, 0, 1], [1, 0, 1]]] },
            { label: "large open grid", input: [[[2, ...Array(99).fill(1)], ...Array.from({ length: 99 }, () => Array(100).fill(1))]] },
            { label: "large random grid", input: [randomGridOf(111, 100, 100, [0, 1, 2], [2, 30, 1])] },
        ],
        hints: [
            "Rot spreads outward from all the rotten oranges at once, one step per minute. Which search visits nodes in order of distance?",
            "Use breadth-first search starting from every rotten orange at the same time (a multi-source BFS), processing the grid level by level.",
            "Each level of the BFS is one minute. Count the fresh oranges first; if any are left when the queue empties, return minus one.",
        ],
        solution: { approach: "Multi-source BFS from all rotten oranges, one level per minute, tracking the count of fresh oranges.", time: "O(rows x cols)", space: "O(rows x cols)" },
        reference: String.raw`
from collections import deque

def oranges_rotting(grid):
    rows, cols = len(grid), len(grid[0])
    queue = deque()
    fresh = 0
    for r in range(rows):
        for c in range(cols):
            if grid[r][c] == 2:
                queue.append((r, c))
            elif grid[r][c] == 1:
                fresh += 1
    minutes = 0
    while queue and fresh:
        for _ in range(len(queue)):
            r, c = queue.popleft()
            for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nr, nc = r + dr, c + dc
                if 0 <= nr < rows and 0 <= nc < cols and grid[nr][nc] == 1:
                    grid[nr][nc] = 2
                    fresh -= 1
                    queue.append((nr, nc))
        minutes += 1
    return -1 if fresh else minutes
`,
    },
    {
        key: "max-area-of-island",
        title: "Max Area of Island",
        difficulty: "medium",
        tags: ["dfs", "bfs", "matrix", "graph"],
        statement:
            "You are given a grid of 0s and 1s, where 1 is land and 0 is water. An island is a group of land cells connected horizontally or vertically. Return the area of the largest island, which is its number of cells, or 0 if there is no land.",
        constraints: ["1 <= rows, columns <= 200", "Every cell is 0 or 1"],
        signature: { name: "maxAreaOfIsland", params: [{ name: "grid", type: "int[][]" }], returns: "int" },
        examples: [
            { input: [[[0, 1, 1, 0], [0, 1, 0, 0], [1, 0, 0, 1]]], output: 3 },
            { input: [[[0, 0, 0]]], output: 0 },
        ],
        hidden: [
            { label: "one cell of land", input: [[[1]]] },
            { label: "diagonals do not connect", input: [[[1, 0, 1], [0, 1, 0], [1, 0, 1]]] },
            { label: "a ring", input: [[[1, 1, 1], [1, 0, 1], [1, 1, 1]]] },
            { label: "two equal islands", input: [[[1, 1, 0, 1, 1], [0, 0, 0, 0, 0]]] },
            { label: "the whole grid is land", input: [Array.from({ length: 200 }, () => Array(200).fill(1))] },
            { label: "a very long snake", input: [Array.from({ length: 199 }, (_, r) => (r % 2 === 0 ? Array(199).fill(1) : r % 4 === 1 ? [...Array(198).fill(0), 1] : [1, ...Array(198).fill(0)]))] },
            { label: "large random grid", input: [randomGridOf(121, 200, 200, [0, 1], [2, 3])] },
        ],
        hints: [
            "Each island is a connected region. What would let you measure one island's size without counting a cell twice?",
            "When you find unvisited land, run a DFS or BFS from it and count the cells it reaches, marking them visited as you go.",
            "The answer is the largest count over all searches. Use an explicit stack or queue if the grid is large enough that recursion could overflow.",
        ],
        solution: { approach: "Flood fill from every unvisited land cell, counting cells, and keep the maximum.", time: "O(rows x cols)", space: "O(rows x cols)" },
        reference: String.raw`
def max_area_of_island(grid):
    rows, cols = len(grid), len(grid[0])
    best = 0
    for r in range(rows):
        for c in range(cols):
            if grid[r][c] != 1:
                continue
            area = 0
            grid[r][c] = 0
            stack = [(r, c)]
            while stack:
                y, x = stack.pop()
                area += 1
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < rows and 0 <= nx < cols and grid[ny][nx] == 1:
                        grid[ny][nx] = 0
                        stack.append((ny, nx))
            best = max(best, area)
    return best
`,
    },
    {
        key: "shortest-path-in-binary-matrix",
        title: "Shortest Path in a Binary Matrix",
        difficulty: "medium",
        tags: ["bfs", "matrix", "graph"],
        statement:
            "You are given a square grid of 0s and 1s. A clear path goes from the top-left cell to the bottom-right cell, passing only through cells that contain 0, and moving between cells that touch by an edge or a corner, so eight directions in all. Return the length of the shortest clear path, counted in cells, or minus one if there is none.",
        constraints: ["1 <= n <= 150", "Every cell is 0 or 1"],
        signature: { name: "shortestPathBinaryMatrix", params: [{ name: "grid", type: "int[][]" }], returns: "int" },
        examples: [
            { input: [[[0, 1], [1, 0]]], output: 2 },
            { input: [[[0, 0, 0], [1, 1, 0], [1, 1, 0]]], output: 4 },
            { input: [[[1, 0, 0], [1, 1, 0], [1, 1, 0]]], output: -1, explanation: "The start cell is blocked." },
        ],
        hidden: [
            { label: "a single open cell", input: [[[0]]] },
            { label: "a single blocked cell", input: [[[1]]] },
            { label: "the exit is blocked", input: [[[0, 0], [0, 1]]] },
            { label: "a detour is needed", input: [[[0, 0, 0, 0], [1, 1, 1, 0], [0, 0, 0, 0], [0, 1, 1, 1]]] },
            { label: "fully open grid", input: [Array.from({ length: 150 }, () => Array(150).fill(0))] },
            { label: "large maze with walls", input: [Array.from({ length: 150 }, (_, r) => Array.from({ length: 150 }, (_, c) => (r % 4 === 2 && c !== (r % 8 === 2 ? 149 : 0) ? 1 : 0)))] },
            { label: "large random grid", input: [(() => { const g = randomGridOf(131, 150, 150, [0, 1], [7, 3]); g[0]![0] = 0; g[149]![149] = 0; return g; })()] },
        ],
        hints: [
            "You want the fewest cells on a path, and every step costs the same. Which search finds that?",
            "Breadth-first search from the top-left. The first time you reach the bottom-right, the number of cells on the path is the answer.",
            "Try all eight neighbours for each cell, mark cells as visited when you queue them (not when you take them out), and check the start and end cells for blocking first.",
        ],
        solution: { approach: "BFS over the eight-connected grid from the start, counting cells along the shortest path.", time: "O(n^2)", space: "O(n^2)" },
        reference: String.raw`
from collections import deque

def shortest_path_binary_matrix(grid):
    n = len(grid)
    if grid[0][0] == 1 or grid[n - 1][n - 1] == 1:
        return -1
    seen = [[False] * n for _ in range(n)]
    seen[0][0] = True
    queue = deque([(0, 0, 1)])
    while queue:
        r, c, d = queue.popleft()
        if r == n - 1 and c == n - 1:
            return d
        for dr in (-1, 0, 1):
            for dc in (-1, 0, 1):
                nr, nc = r + dr, c + dc
                if 0 <= nr < n and 0 <= nc < n and grid[nr][nc] == 0 and not seen[nr][nc]:
                    seen[nr][nc] = True
                    queue.append((nr, nc, d + 1))
    return -1
`,
    },
    {
        key: "is-graph-bipartite",
        title: "Is Graph Bipartite?",
        difficulty: "medium",
        tags: ["graph", "bfs", "dfs", "union-find"],
        statement:
            "You are given an undirected graph as adjacency lists: graph[i] lists the nodes joined to node i. The graph may have several components. Return true if its nodes can be split into two groups so that every edge joins a node in one group to a node in the other.",
        constraints: ["1 <= graph.length <= 100000", "No node is joined to itself, and no edge is repeated", "If j is in graph[i] then i is in graph[j]"],
        signature: { name: "isBipartite", params: [{ name: "graph", type: "int[][]" }], returns: "bool" },
        examples: [
            { input: [[[1, 3], [0, 2], [1, 3], [0, 2]]], output: true, explanation: "Split into {0, 2} and {1, 3}." },
            { input: [[[1, 2, 3], [0, 2], [0, 1, 3], [0, 2]]], output: false, explanation: "Nodes 0, 1 and 2 form a triangle." },
        ],
        hidden: [
            { label: "a single node", input: [[[]]] },
            { label: "two separate components, one odd cycle", input: [[[1], [0], [3, 4], [2, 4], [2, 3]]] },
            { label: "an even cycle", input: [adjacency(6, cycleEdges(6))] },
            { label: "an odd cycle", input: [adjacency(5, cycleEdges(5))] },
            { label: "isolated nodes", input: [[[], [], [], []]] },
            { label: "large grid graph", input: [adjacency(40_000, smallGridEdges(200, 200))] },
            { label: "large odd cycle", input: [adjacency(60_001, cycleEdges(60_001))] },
        ],
        hints: [
            "If the graph can be split into two groups, then along every edge the two ends are in different groups.",
            "Try to colour the nodes with two colours: colour a node, give all its neighbours the opposite colour, and keep going.",
            "Do a BFS or DFS from every uncoloured node (the graph may be disconnected). If you ever meet a neighbour with the same colour as the current node, the answer is false.",
        ],
        solution: { approach: "Two-colour the graph with BFS/DFS from every component; a same-coloured edge means an odd cycle.", time: "O(V + E)", space: "O(V)" },
        reference: String.raw`
def is_bipartite(graph):
    color = [0] * len(graph)
    for start in range(len(graph)):
        if color[start]:
            continue
        color[start] = 1
        stack = [start]
        while stack:
            node = stack.pop()
            for nxt in graph[node]:
                if color[nxt] == color[node]:
                    return False
                if not color[nxt]:
                    color[nxt] = -color[node]
                    stack.append(nxt)
    return True
`,
    },
    {
        key: "network-delay-time",
        title: "Network Delay Time",
        difficulty: "medium",
        tags: ["graph", "heap", "shortest-path"],
        statement:
            "A network has n nodes labelled 1 to n. You are given times, a list of directed edges [u, v, w] meaning a signal sent from u reaches v after w units of time. A signal is sent from node k. Return the time until every node has received it, or minus one if some node never does.",
        constraints: ["1 <= k <= n <= 1000", "1 <= times.length <= 6000", "1 <= w <= 100", "Edges may repeat with different times"],
        signature: { name: "networkDelayTime", params: [{ name: "times", type: "int[][]" }, { name: "n", type: "int" }, { name: "k", type: "int" }], returns: "int" },
        examples: [
            { input: [[[2, 1, 1], [2, 3, 1], [3, 4, 1]], 4, 2], output: 2 },
            { input: [[[1, 2, 1]], 2, 1], output: 1 },
            { input: [[[1, 2, 1]], 2, 2], output: -1 },
        ],
        hidden: [
            { label: "a single node", input: [[[1, 1, 5]], 1, 1] },
            { label: "the direct edge is slower than a detour", input: [[[1, 2, 10], [1, 3, 1], [3, 2, 1]], 3, 1] },
            { label: "parallel edges", input: [[[1, 2, 9], [1, 2, 2], [2, 3, 4]], 3, 1] },
            { label: "a node nobody can reach", input: [[[1, 2, 1], [3, 1, 1]], 3, 1] },
            { label: "a long chain", input: [range(999).map((i) => [i + 1, i + 2, 3]), 1000, 1] },
            { label: "large random network", input: [weightedEdges(141, 1000, 6000, 100), 1000, 1] },
            { label: "large random network, another source", input: [weightedEdges(142, 1000, 5000, 100), 1000, 500] },
        ],
        hints: [
            "The time for a node to hear the signal is the length of the shortest path to it from k. The answer is the largest of these.",
            "All the times are positive, so Dijkstra's algorithm finds shortest paths from k to every node.",
            "Use a min-heap of (distance, node). If fewer than n nodes are ever reached, return minus one; otherwise return the largest distance.",
        ],
        solution: { approach: "Dijkstra from k with a min-heap; the answer is the largest shortest distance, or -1 if a node is unreachable.", time: "O(E log V)", space: "O(V + E)" },
        reference: String.raw`
import heapq

def network_delay_time(times, n, k):
    graph = [[] for _ in range(n + 1)]
    for u, v, w in times:
        graph[u].append((v, w))
    dist = {}
    heap = [(0, k)]
    while heap:
        d, node = heapq.heappop(heap)
        if node in dist:
            continue
        dist[node] = d
        for nxt, w in graph[node]:
            if nxt not in dist:
                heapq.heappush(heap, (d + w, nxt))
    return max(dist.values()) if len(dist) == n else -1
`,
    },
    {
        key: "cheapest-flights-within-k-stops",
        title: "Cheapest Flights Within K Stops",
        difficulty: "medium",
        tags: ["graph", "dynamic-programming", "shortest-path", "bfs"],
        statement:
            "There are n cities labelled 0 to n minus one and a list of flights [from, to, price], each one way. Return the cheapest price to get from city src to city dst using at most k stops in between, or minus one if it cannot be done.",
        constraints: ["1 <= n <= 100", "0 <= flights.length <= 5000", "0 <= k < n", "src != dst"],
        signature: {
            name: "findCheapestPrice",
            params: [{ name: "n", type: "int" }, { name: "flights", type: "int[][]" }, { name: "src", type: "int" }, { name: "dst", type: "int" }, { name: "k", type: "int" }],
            returns: "int",
        },
        examples: [
            { input: [3, [[0, 1, 100], [1, 2, 100], [0, 2, 500]], 0, 2, 1], output: 200 },
            { input: [3, [[0, 1, 100], [1, 2, 100], [0, 2, 500]], 0, 2, 0], output: 500, explanation: "With no stops only the direct flight is allowed." },
        ],
        hidden: [
            { label: "no route at all", input: [3, [[0, 1, 10]], 0, 2, 2] },
            { label: "the cheap route needs too many stops", input: [4, [[0, 1, 1], [1, 2, 1], [2, 3, 1], [0, 3, 100]], 0, 3, 1] },
            { label: "the cheap route is just within the limit", input: [4, [[0, 1, 1], [1, 2, 1], [2, 3, 1], [0, 3, 100]], 0, 3, 2] },
            { label: "a cycle that is not worth taking", input: [3, [[0, 1, 5], [1, 0, 5], [1, 2, 5]], 0, 2, 3] },
            { label: "cheapest path is not the fewest stops", input: [5, [[0, 1, 10], [0, 4, 100], [1, 2, 10], [2, 3, 10], [3, 4, 10]], 0, 4, 3] },
            { label: "large random flights, few stops", input: [100, flights(151, 100, 5000), 0, 99, 2] },
            { label: "large random flights, many stops", input: [100, flights(152, 100, 4000), 3, 77, 20] },
        ],
        hints: [
            "A cheapest path may not be the fewest-flights path. The stop limit means you have to track how many flights you have used.",
            "Run Bellman-Ford for k + 1 rounds: in each round, relax every flight using only the distances from the previous round.",
            "Copy the distance array at the start of each round so a single round adds at most one flight. After k + 1 rounds, the distance to dst is the answer (or minus one if still infinite).",
        ],
        solution: { approach: "Bellman-Ford limited to k + 1 rounds, relaxing from a copy of the previous round's distances. BFS with (node, stops) states also works.", time: "O(k x E)", space: "O(n)" },
        reference: String.raw`
def find_cheapest_price(n, flights, src, dst, k):
    INF = float("inf")
    dist = [INF] * n
    dist[src] = 0
    for _ in range(k + 1):
        nxt = dist[:]
        for u, v, w in flights:
            if dist[u] != INF and dist[u] + w < nxt[v]:
                nxt[v] = dist[u] + w
        dist = nxt
    return -1 if dist[dst] == INF else dist[dst]
`,
    },
    {
        key: "accounts-merge",
        title: "Merge Accounts",
        difficulty: "medium",
        tags: ["graph", "union-find", "hash-map", "string", "sorting"],
        statement:
            "You are given a list of accounts. Each account is an array whose first element is a name and whose other elements are email addresses. Two accounts belong to the same person if they share at least one email address. Two accounts with the same name may belong to different people, but all accounts of one person have the same name. Merge the accounts of each person and return them, each as the name followed by that person's emails without duplicates in sorted order. The merged accounts may be returned in any order.",
        constraints: ["1 <= accounts.length <= 1000", "Every account has a name and at least one email", "Email addresses are lowercase and contain no spaces"],
        signature: { name: "accountsMerge", params: [{ name: "accounts", type: "string[][]" }], returns: "string[][]" },
        examples: [
            {
                input: [[["John", "john@mail.com", "john_work@mail.com"], ["John", "johnnybravo@mail.com"], ["John", "john@mail.com", "john_home@mail.com"], ["Mary", "mary@mail.com"]]],
                output: [["John", "john@mail.com", "john_home@mail.com", "john_work@mail.com"], ["John", "johnnybravo@mail.com"], ["Mary", "mary@mail.com"]],
            },
        ],
        hidden: [
            { label: "a single account", input: [[["Ann", "b@x.com", "a@x.com"]]] },
            { label: "the same name, different people", input: [[["Sam", "s1@x.com"], ["Sam", "s2@x.com"]]] },
            { label: "a chain of overlapping accounts", input: [[["Kim", "a@x.com", "b@x.com"], ["Kim", "b@x.com", "c@x.com"], ["Kim", "c@x.com", "d@x.com"], ["Kim", "e@x.com"]]] },
            { label: "an account repeats an email", input: [[["Lee", "z@x.com", "z@x.com", "y@x.com"]]] },
            { label: "accounts joined only through a third", input: [[["Al", "a@x.com"], ["Al", "b@x.com"], ["Al", "a@x.com", "b@x.com"]]] },
            { label: "large scattered accounts", input: [emailAccounts(161, 300, 3)] },
            { label: "large scattered accounts, many people", input: [emailAccounts(162, 480, 2)] },
        ],
        hints: [
            "Accounts are connected through shared emails. That suggests thinking of emails as nodes.",
            "Use union-find over emails: every email in an account joins the account's first email's set. Remember which name goes with each email.",
            "After all unions, group emails by their root, sort each group, and put the owner's name in front.",
        ],
        solution: { approach: "Union-find over email addresses (or DFS over an email graph); group by root, sort each group and prepend the name.", time: "O(n log n) over all emails", space: "O(n)" },
        compare: "unorderedDeep",
        reference: String.raw`
def accounts_merge(accounts):
    parent = {}
    owner = {}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for account in accounts:
        name = account[0]
        for email in account[1:]:
            parent.setdefault(email, email)
            owner[email] = name
        for email in account[2:]:
            a, b = find(account[1]), find(email)
            if a != b:
                parent[a] = b
    groups = {}
    for email in parent:
        groups.setdefault(find(email), []).append(email)
    return [[owner[root]] + sorted(emails) for root, emails in groups.items()]
`,
    },
    {
        key: "word-ladder",
        title: "Word Ladder",
        difficulty: "hard",
        tags: ["bfs", "graph", "string", "hash-set"],
        statement:
            "You are given a start word, an end word and a list of allowed words, all of the same length. In one step you may change exactly one letter, and the new word must be in the list. Return the number of words in the shortest sequence from the start word to the end word, counting both ends, or 0 if there is no such sequence. The start word does not need to be in the list.",
        constraints: ["1 <= word length <= 10", "1 <= wordList.length <= 5000", "All words are lowercase letters, and start != end"],
        signature: { name: "ladderLength", params: [{ name: "beginWord", type: "string" }, { name: "endWord", type: "string" }, { name: "wordList", type: "string[]" }], returns: "int" },
        examples: [
            { input: ["hit", "cog", ["hot", "dot", "dog", "lot", "log", "cog"]], output: 5, explanation: "hit, hot, dot, dog, cog." },
            { input: ["hit", "cog", ["hot", "dot", "dog", "lot", "log"]], output: 0, explanation: "The end word is not in the list." },
        ],
        hidden: [
            { label: "one step away", input: ["cat", "cot", ["cot"]] },
            { label: "no connecting words", input: ["aaa", "zzz", ["aab", "zzy", "zzz"]] },
            { label: "two shortest routes of different lengths", input: ["aaaa", "bbbb", ["baaa", "bbaa", "bbba", "bbbb", "abaa", "abba", "abbb", "aabb", "aaab"]] },
            { label: "the start word appears in the list", input: ["hot", "dog", ["hot", "dot", "dog"]] },
            { label: "every word of length five over three letters", input: ["aaaaa", "ccccc", allWords(5, 3).filter((w) => w !== "aaaaa")] },
            { label: "a large random dictionary", input: ["aaaaaa", "dddddd", randomWords(171, 3_000, 6, 4).concat(["dddddd"]).filter((w, i, all) => w !== "aaaaaa" && all.indexOf(w) === i)] },
            { label: "a large dictionary with no answer", input: ["aaaaaa", "eeeeee", randomWords(172, 2_500, 6, 4).concat(["eeeeee"]).filter((w) => w !== "aaaaaa")] },
        ],
        hints: [
            "Think of words as nodes, with an edge between two words that differ in one letter. You want the shortest path.",
            "Breadth-first search from the start word finds the shortest path in an unweighted graph.",
            "To find neighbours fast, group words by patterns with one letter replaced by a wildcard (h*t, *ot, ho*), or try all 26 replacements for each position and check the set.",
        ],
        solution: { approach: "BFS from the start word; neighbours found through wildcard buckets or by trying every single-letter change against a set.", time: "O(N x L^2) with wildcard buckets", space: "O(N x L)" },
        reference: String.raw`
from collections import defaultdict, deque

def ladder_length(begin_word, end_word, word_list):
    words = set(word_list)
    if end_word not in words:
        return 0
    buckets = defaultdict(list)
    for word in words | {begin_word}:
        for i in range(len(word)):
            buckets[word[:i] + "*" + word[i + 1:]].append(word)
    seen = {begin_word}
    queue = deque([(begin_word, 1)])
    while queue:
        word, steps = queue.popleft()
        if word == end_word:
            return steps
        for i in range(len(word)):
            for nxt in buckets[word[:i] + "*" + word[i + 1:]]:
                if nxt not in seen:
                    seen.add(nxt)
                    queue.append((nxt, steps + 1))
    return 0
`,
    },
    {
        key: "shortest-path-visiting-all-nodes",
        title: "Shortest Path Visiting All Nodes",
        difficulty: "hard",
        tags: ["bfs", "graph", "bit-manipulation", "dynamic-programming"],
        statement:
            "You are given a connected undirected graph as adjacency lists, with n nodes labelled 0 to n minus one. You may start at any node, may finish at any node, and may revisit nodes and reuse edges. Return the length, in edges, of the shortest walk that visits every node.",
        constraints: ["1 <= n <= 12", "The graph is connected, has no self-loops, and no repeated edges"],
        signature: { name: "shortestPathLength", params: [{ name: "graph", type: "int[][]" }], returns: "int" },
        examples: [
            { input: [[[1, 2, 3], [0], [0], [0]]], output: 4, explanation: "1, 0, 2, 0, 3." },
            { input: [[[1], [0, 2, 4], [1, 3, 4], [2], [1, 2]]], output: 4 },
        ],
        hidden: [
            { label: "a single node", input: [[[]]] },
            { label: "a straight line", input: [adjacency(6, range(5).map((i) => [i, i + 1]))] },
            { label: "a cycle", input: [adjacency(12, cycleEdges(12))] },
            { label: "a complete graph", input: [adjacency(8, range(8).flatMap((a) => range(8 - a - 1).map((k) => [a, a + 1 + k])))] },
            { label: "a star", input: [adjacency(9, range(8).map((i) => [0, i + 1]))] },
            { label: "a random connected graph", input: [adjacency(12, connectedGraph(181, 12, 4))] },
            { label: "a sparse random tree", input: [adjacency(12, connectedGraph(182, 12, 0))] },
        ],
        hints: [
            "Which nodes you have already visited matters as much as where you are now. What state describes both?",
            "Use the state (current node, set of visited nodes). With at most 12 nodes, the set fits in a bitmask, so there are at most 12 x 4096 states.",
            "BFS over those states, starting from every node at once with only itself visited. The first time you reach a state whose mask has all bits set, the number of steps is the answer.",
        ],
        solution: { approach: "BFS over (node, visited bitmask) states, starting from every node simultaneously.", time: "O(2^n x n^2)", space: "O(2^n x n)" },
        reference: String.raw`
from collections import deque

def shortest_path_length(graph):
    n = len(graph)
    full = (1 << n) - 1
    seen = set()
    queue = deque()
    for node in range(n):
        state = (node, 1 << node)
        seen.add(state)
        queue.append((node, 1 << node, 0))
    while queue:
        node, mask, dist = queue.popleft()
        if mask == full:
            return dist
        for nxt in graph[node]:
            state = (nxt, mask | (1 << nxt))
            if state not in seen:
                seen.add(state)
                queue.append((nxt, mask | (1 << nxt), dist + 1))
    return 0
`,
    },
];
