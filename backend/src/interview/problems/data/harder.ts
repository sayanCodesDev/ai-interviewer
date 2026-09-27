import type { ProblemDef } from "../types";
import { randInt, randInts, range, repeat, rng } from "./helpers";

// The harder end: monotonic queues, interval dynamic programming, pattern matching, topological ordering and counting with a tree.

const shuffledLetters = (seed: number, count: number) => {
    const next = rng(seed);
    const letters = range(count).map((i) => String.fromCharCode(97 + i));
    for (let i = letters.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [letters[i], letters[j]] = [letters[j]!, letters[i]!];
    }
    return letters;
};

/** A grid whose values increase along a snake through every cell, so the longest increasing path visits all of them. */
const snakeGrid = (rows: number, cols: number) => range(rows).map((r) => range(cols).map((c) => (r % 2 === 0 ? r * cols + c : r * cols + (cols - 1 - c))));

const randomValues = (seed: number, rows: number, cols: number, max: number) => {
    const next = rng(seed);
    return Array.from({ length: rows }, () => Array.from({ length: cols }, () => randInt(next, 0, max)));
};

const letterString = (seed: number, n: number, alphabet: string) => {
    const next = rng(seed);
    return range(n).map(() => alphabet[Math.floor(next() * alphabet.length)]!).join("");
};

const alienLetters = shuffledLetters(501, 26);
const alienLettersSmall = shuffledLetters(502, 12);
const alienPairs = shuffledLetters(503, 20);

export const harderProblems: ProblemDef[] = [
    {
        key: "sliding-window-maximum",
        title: "Sliding Window Maximum",
        difficulty: "hard",
        tags: ["sliding-window", "array", "monotonic-stack", "heap"],
        statement:
            "You are given an array of integers and a window size k. The window starts at the left end of the array and moves right one position at a time. Return the maximum value in the window at each position.",
        constraints: ["1 <= k <= nums.length <= 100000", "-1000000 <= nums[i] <= 1000000"],
        signature: { name: "maxSlidingWindow", params: [{ name: "nums", type: "int[]" }, { name: "k", type: "int" }], returns: "int[]" },
        examples: [
            { input: [[1, 3, -1, -3, 5, 3, 6, 7], 3], output: [3, 3, 5, 5, 6, 7] },
            { input: [[1], 1], output: [1] },
        ],
        hidden: [
            { label: "window of one", input: [[4, 2, 12, 3], 1] },
            { label: "window is the whole array", input: [[4, 2, 12, 3], 4] },
            { label: "negative numbers", input: [[-7, -8, 7, 5, 7, 1, 6, 0], 4] },
            { label: "strictly increasing", input: [range(50_000), 500] },
            { label: "strictly decreasing", input: [range(50_000).map((i) => 50_000 - i), 500] },
            { label: "large random, small window", input: [randInts(511, 100_000, -1_000_000, 1_000_000), 10] },
            { label: "large random, big window", input: [randInts(512, 100_000, -1_000_000, 1_000_000), 5_000] },
        ],
        hints: [
            "Recomputing the maximum of every window from scratch is O(n x k). What information from the previous window can you reuse?",
            "An element that is smaller than a later element in the window can never be the maximum again. Keep only candidates that could still become the maximum.",
            "Use a deque of indices whose values are decreasing. For each new element, pop smaller values from the back, push the new index, pop the front if it has left the window, and the front is the window's maximum.",
        ],
        solution: { approach: "A monotonic deque of indices with decreasing values; the front is the window maximum. Each element enters and leaves once.", time: "O(n)", space: "O(k)" },
        reference: String.raw`
from collections import deque

def max_sliding_window(nums, k):
    window = deque()
    result = []
    for i, value in enumerate(nums):
        while window and nums[window[-1]] <= value:
            window.pop()
        window.append(i)
        if window[0] <= i - k:
            window.popleft()
        if i >= k - 1:
            result.append(nums[window[0]])
    return result
`,
    },
    {
        key: "regular-expression-matching",
        title: "Regular Expression Matching",
        difficulty: "hard",
        tags: ["dynamic-programming", "string", "recursion"],
        statement:
            "Implement matching of a string against a pattern that supports two special characters. A full stop matches any single character. A star matches zero or more of the element right before it, so a star always follows another character. The match must cover the entire string, not just part of it. Return true if the string matches the pattern.",
        constraints: ["1 <= s.length <= 600", "1 <= p.length <= 600", "s has only lowercase letters", "p has lowercase letters, full stops and stars, and every star follows a letter or a full stop"],
        signature: { name: "isMatch", params: [{ name: "s", type: "string" }, { name: "p", type: "string" }], returns: "bool" },
        examples: [
            { input: ["aa", "a"], output: false },
            { input: ["aa", "a*"], output: true },
            { input: ["ab", ".*"], output: true },
        ],
        hidden: [
            { label: "star matches zero times", input: ["aab", "c*a*b"] },
            { label: "the classic failing case", input: ["mississippi", "mis*is*p*."] },
            { label: "the classic matching case", input: ["mississippi", "mis*is*ip*."] },
            { label: "star before the end", input: ["a", "ab*"] },
            { label: "dot star in the middle", input: ["abcdef", "a.*f"] },
            { label: "pattern longer than the string, all optional", input: ["a", "a*b*c*d*"] },
            { label: "long string, needs backtracking", input: [repeat("a", 500), repeat("a*", 200) + "b"] },
            { label: "long match", input: [repeat("ab", 250), repeat("a*b*", 100) + ".*"] },
        ],
        hints: [
            "Whether s[i:] matches p[j:] depends on smaller suffixes. Define that as a subproblem.",
            "If the next pattern character is a star, you have two choices: skip the starred element (zero matches), or, if the first characters match, consume one character of s and stay on the same pattern position.",
            "Without a star, the first characters must match (equal, or the pattern has a full stop) and both indices advance. Memoise on (i, j), or fill a table from the end of both strings.",
        ],
        solution: { approach: "Dynamic programming over (i, j) suffix pairs, handling the star as skip-or-consume.", time: "O(n x m)", space: "O(n x m)" },
        reference: String.raw`
def is_match(s, p):
    n, m = len(s), len(p)
    match = [[False] * (m + 1) for _ in range(n + 1)]
    match[n][m] = True
    for i in range(n, -1, -1):
        for j in range(m - 1, -1, -1):
            first = i < n and p[j] in (s[i], ".")
            if j + 1 < m and p[j + 1] == "*":
                match[i][j] = match[i][j + 2] or (first and match[i + 1][j])
            else:
                match[i][j] = first and match[i + 1][j + 1]
    return match[0][0]
`,
    },
    {
        key: "burst-balloons",
        title: "Burst Balloons",
        difficulty: "hard",
        tags: ["dynamic-programming", "array", "divide-and-conquer"],
        statement:
            "You are given balloons in a row, each painted with a number. Bursting the balloon at position i earns you the product of its number and the numbers on the balloons immediately to its left and right. A balloon that is off either end counts as having the number 1. Return the maximum coins you can collect by bursting all the balloons in the best order.",
        constraints: ["1 <= nums.length <= 150", "0 <= nums[i] <= 100"],
        signature: { name: "maxCoins", params: [{ name: "nums", type: "int[]" }], returns: "int" },
        examples: [
            { input: [[3, 1, 5, 8]], output: 167, explanation: "Burst 1, then 5, then 3, then 8: 15 + 120 + 24 + 8." },
            { input: [[1, 5]], output: 10 },
        ],
        hidden: [
            { label: "one balloon", input: [[7]] },
            { label: "all zeros", input: [[0, 0, 0]] },
            { label: "a zero in the middle", input: [[9, 0, 9]] },
            { label: "all the same", input: [[2, 2, 2, 2, 2]] },
            { label: "descending", input: [[9, 8, 7, 6, 5, 4]] },
            { label: "large random", input: [randInts(521, 140, 0, 100)] },
            { label: "large with big values", input: [randInts(522, 150, 50, 100)] },
        ],
        hints: [
            "Thinking about which balloon to burst first is hard, because it changes the neighbours. Think about which one is burst last in a range instead.",
            "If k is the last balloon burst between positions i and j, its neighbours are the boundary balloons i and j, and the two sides are independent subproblems.",
            "Pad the array with 1s at both ends. dp[i][j] = max over k in (i, j) of dp[i][k] + dp[k][j] + nums[i] * nums[k] * nums[j]. Fill by increasing gap.",
        ],
        solution: { approach: "Interval DP choosing the last balloon burst in each open interval, on the array padded with 1s.", time: "O(n^3)", space: "O(n^2)" },
        reference: String.raw`
def max_coins(nums):
    a = [1] + nums + [1]
    n = len(a)
    dp = [[0] * n for _ in range(n)]
    for gap in range(2, n):
        for i in range(n - gap):
            j = i + gap
            best = 0
            for k in range(i + 1, j):
                value = dp[i][k] + dp[k][j] + a[i] * a[k] * a[j]
                if value > best:
                    best = value
            dp[i][j] = best
    return dp[0][n - 1]
`,
    },
    {
        key: "longest-increasing-path-in-a-matrix",
        title: "Longest Increasing Path in a Matrix",
        difficulty: "hard",
        tags: ["dynamic-programming", "dfs", "matrix", "topological-sort", "graph"],
        statement:
            "Given a grid of integers, return the length of the longest path along which the values are strictly increasing. From each cell you may move up, down, left or right, but not diagonally and not outside the grid.",
        constraints: ["1 <= rows, columns <= 100", "0 <= matrix[i][j] <= 1000000000"],
        signature: { name: "longestIncreasingPath", params: [{ name: "matrix", type: "int[][]" }], returns: "int" },
        examples: [
            { input: [[[9, 9, 4], [6, 6, 8], [2, 1, 1]]], output: 4, explanation: "1, 2, 6, 9." },
            { input: [[[3, 4, 5], [3, 2, 6], [2, 2, 1]]], output: 4 },
            { input: [[[1]]], output: 1 },
        ],
        hidden: [
            { label: "all equal", input: [[[5, 5], [5, 5]]] },
            { label: "a single row", input: [[[1, 2, 3, 4, 5]]] },
            { label: "a single column, decreasing", input: [[[5], [4], [3], [2], [1]]] },
            { label: "row-major increasing", input: [range(40).map((r) => range(40).map((c) => r * 40 + c))] },
            { label: "a snake through every cell", input: [snakeGrid(100, 100)] },
            { label: "large random", input: [randomValues(531, 100, 100, 1_000_000_000)] },
            { label: "large random with many ties", input: [randomValues(532, 100, 100, 20)] },
        ],
        hints: [
            "From a cell, the longest increasing path depends only on the longest paths starting from its larger neighbours.",
            "Memoise: longest(r, c) = 1 + max(longest of each larger neighbour). Each cell is computed once.",
            "The recursion can get very deep on a big grid. Alternatively process cells in order of increasing value from the largest down, or peel off cells with no larger neighbour layer by layer (a topological order).",
        ],
        solution: { approach: "Memoised DFS from each cell, or DP over cells sorted by value; the values give a natural topological order.", time: "O(rows x cols)", space: "O(rows x cols)" },
        reference: String.raw`
def longest_increasing_path(matrix):
    rows, cols = len(matrix), len(matrix[0])
    cells = sorted(((matrix[r][c], r, c) for r in range(rows) for c in range(cols)), reverse=True)
    best = [[1] * cols for _ in range(rows)]
    answer = 1
    for value, r, c in cells:
        length = 1
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nr, nc = r + dr, c + dc
            if 0 <= nr < rows and 0 <= nc < cols and matrix[nr][nc] > value:
                length = max(length, 1 + best[nr][nc])
        best[r][c] = length
        answer = max(answer, length)
    return answer
`,
    },
    {
        key: "count-smaller-after-self",
        title: "Count of Smaller Numbers After Self",
        difficulty: "hard",
        tags: ["array", "binary-search", "divide-and-conquer", "sorting"],
        statement:
            "Given an array of integers, return an array where entry i is the number of elements to the right of position i that are strictly smaller than the value at position i.",
        constraints: ["1 <= nums.length <= 100000", "-10000 <= nums[i] <= 10000"],
        signature: { name: "countSmaller", params: [{ name: "nums", type: "int[]" }], returns: "int[]" },
        examples: [
            { input: [[5, 2, 6, 1]], output: [2, 1, 1, 0] },
            { input: [[-1]], output: [0] },
            { input: [[-1, -1]], output: [0, 0] },
        ],
        hidden: [
            { label: "already ascending", input: [[1, 2, 3, 4]] },
            { label: "strictly descending", input: [[9, 7, 5, 3, 1]] },
            { label: "all equal", input: [[4, 4, 4, 4]] },
            { label: "negative and positive", input: [[3, -2, 0, -5, 3, -2]] },
            { label: "large random", input: [randInts(541, 100_000, -10_000, 10_000)] },
            { label: "large descending", input: [range(100_000).map((i) => 10_000 - Math.floor(i / 5))] },
            { label: "large few distinct values", input: [randInts(542, 100_000, 0, 20)] },
        ],
        hints: [
            "Counting for each element by scanning to its right is O(n^2). You need to answer 'how many smaller values are already seen?' faster.",
            "Process the array from right to left, keeping a structure over the values seen so far that can count how many are smaller than x.",
            "A Fenwick tree (binary indexed tree) over the compressed values gives O(log n) counts and updates. A merge sort that counts, while merging, how many right-side elements jump ahead of each left element also works.",
        ],
        solution: { approach: "Scan right to left with a Fenwick tree over value ranks; or count during a merge sort that tracks original indices.", time: "O(n log n)", space: "O(n)" },
        reference: String.raw`
def count_smaller(nums):
    ranks = {v: i + 1 for i, v in enumerate(sorted(set(nums)))}
    size = len(ranks)
    tree = [0] * (size + 1)

    def add(i):
        while i <= size:
            tree[i] += 1
            i += i & -i

    def query(i):
        total = 0
        while i > 0:
            total += tree[i]
            i -= i & -i
        return total

    result = [0] * len(nums)
    for i in range(len(nums) - 1, -1, -1):
        rank = ranks[nums[i]]
        result[i] = query(rank - 1)
        add(rank)
    return result
`,
    },
    {
        key: "alien-dictionary",
        title: "Alien Dictionary",
        difficulty: "hard",
        tags: ["graph", "topological-sort", "string", "bfs"],
        statement:
            "A new language uses the English letters, but in an unknown order. You are given a list of words that are sorted in that language's dictionary order. Work out the order of the letters that appear in the words and return them as a string, from first to last. If the words are inconsistent, for example because the order would contain a cycle or a longer word comes before its own prefix, return an empty string. Inputs are chosen so that at most one order of the letters is consistent with the words.",
        constraints: ["1 <= words.length <= 100", "1 <= words[i].length <= 100", "Words consist of lowercase letters", "If the words are consistent, exactly one ordering of their letters fits"],
        signature: { name: "alienOrder", params: [{ name: "words", type: "string[]" }], returns: "string" },
        examples: [
            { input: [["wrt", "wrf", "er", "ett", "rftt"]], output: "wertf" },
            { input: [["z", "x"]], output: "zx" },
            { input: [["z", "x", "z"]], output: "", explanation: "z before x and x before z cannot both hold." },
        ],
        hidden: [
            { label: "a longer word before its own prefix", input: [["abc", "ab"]] },
            { label: "a single letter", input: [["z"]] },
            { label: "each word is one letter", input: [alienLettersSmall] },
            { label: "twenty-six single-letter words", input: [alienLetters] },
            { label: "chained two-letter words", input: [[...alienPairs.slice(0, -1).map((c, i) => c + alienPairs[i + 1]!), alienPairs[alienPairs.length - 1]!]] },
            { label: "an order forced by shared prefixes", input: [["ab", "ac", "bc", "bd", "cd"]] },
            { label: "a cycle through three letters", input: [["a", "b", "c", "a"]] },
        ],
        hints: [
            "Comparing two neighbouring words tells you the order of exactly one pair of letters: the first position where they differ.",
            "Turn those pairs into a directed graph with an edge from the earlier letter to the later one, and remember every letter that appears.",
            "Topologically sort the graph (Kahn's algorithm or DFS). If the sort cannot include every letter, there is a cycle, so return an empty string. Also watch for a word followed by its own proper prefix, which is invalid.",
        ],
        solution: { approach: "Build precedence edges from the first differing letter of adjacent words, then topologically sort; a cycle or a bad prefix gives an empty string.", time: "O(total characters)", space: "O(alphabet)" },
        reference: String.raw`
from collections import deque

def alien_order(words):
    letters = {c for w in words for c in w}
    after = {c: set() for c in letters}
    indegree = {c: 0 for c in letters}
    for a, b in zip(words, words[1:]):
        for x, y in zip(a, b):
            if x != y:
                if y not in after[x]:
                    after[x].add(y)
                    indegree[y] += 1
                break
        else:
            if len(a) > len(b):
                return ""
    queue = deque(sorted(c for c in letters if indegree[c] == 0))
    order = []
    while queue:
        c = queue.popleft()
        order.append(c)
        for nxt in sorted(after[c]):
            indegree[nxt] -= 1
            if indegree[nxt] == 0:
                queue.append(nxt)
    return "".join(order) if len(order) == len(letters) else ""
`,
    },
];
