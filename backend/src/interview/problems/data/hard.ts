import type { ProblemDef } from "../types";
import { randInts, randString, range, repeat } from "./helpers";

const sortedRandom = (seed: number, n: number) => randInts(seed, n, -1_000_000, 1_000_000).sort((a, b) => a - b);

export const hardProblems: ProblemDef[] = [
    {
        key: "trapping-rain-water",
        title: "Trapping Rain Water",
        difficulty: "hard",
        tags: ["array", "two-pointers", "stack", "dynamic-programming"],
        statement:
            "Given n non-negative integers representing an elevation map where each bar has width one, compute how much water it can trap after raining.",
        constraints: ["1 <= height.length <= 100000", "0 <= height[i] <= 10000"],
        signature: { name: "trap", params: [{ name: "height", type: "int[]" }], returns: "int" },
        examples: [
            { input: [[0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1]], output: 6 },
            { input: [[4, 2, 0, 3, 2, 5]], output: 9 },
        ],
        hidden: [
            { label: "single bar", input: [[3]] },
            { label: "two bars", input: [[3, 4]] },
            { label: "strictly increasing", input: [[1, 2, 3, 4]] },
            { label: "strictly decreasing", input: [[4, 3, 2, 1]] },
            { label: "single deep valley", input: [[5, 0, 0, 0, 5]] },
            { label: "flat", input: [[2, 2, 2, 2]] },
            { label: "large random input", input: [randInts(201, 100_000, 0, 10_000)] },
            { label: "large valley", input: [[10_000, ...Array(99_998).fill(0), 10_000]] },
        ],
        hints: [
            "Water above a bar is limited by the tallest bar to its left and the tallest to its right.",
            "water[i] = min(maxLeft[i], maxRight[i]) - height[i]. You can precompute both arrays.",
            "To use O(1) space, keep two pointers and running left/right maxima, always advancing the side with the smaller maximum.",
        ],
        solution: { approach: "Two pointers with running left and right maxima (or prefix/suffix maximum arrays).", time: "O(n)", space: "O(1)" },
        reference: String.raw`
def trap(height):
    lo, hi = 0, len(height) - 1
    left_max = right_max = 0
    water = 0
    while lo < hi:
        if height[lo] < height[hi]:
            left_max = max(left_max, height[lo])
            water += left_max - height[lo]
            lo += 1
        else:
            right_max = max(right_max, height[hi])
            water += right_max - height[hi]
            hi -= 1
    return water
`,
    },
    {
        key: "minimum-window-substring",
        title: "Minimum Window Substring",
        difficulty: "hard",
        tags: ["string", "sliding-window", "hash-map"],
        statement:
            "Given two strings s and t, return the shortest substring of s that contains every character of t, counting duplicates. If there is no such substring return an empty string. If several windows share the shortest length, return the leftmost one.",
        constraints: ["1 <= s.length, t.length <= 100000", "s and t consist of English letters"],
        signature: { name: "minWindow", params: [{ name: "s", type: "string" }, { name: "t", type: "string" }], returns: "string" },
        examples: [
            { input: ["ADOBECODEBANC", "ABC"], output: "BANC" },
            { input: ["a", "aa"], output: "", explanation: "t needs two a's but s has one." },
        ],
        hidden: [
            { label: "single matching character", input: ["a", "a"] },
            { label: "t is longer than s", input: ["ab", "abc"] },
            { label: "several equal-length windows, leftmost wins", input: ["abcabc", "abc"] },
            { label: "duplicates required", input: ["aaflslflsldkalskaaa", "aaa"] },
            { label: "whole string needed", input: ["abc", "cba"] },
            { label: "case sensitive", input: ["aAbB", "AB"] },
            { label: "large input", input: [randString(211, 100_000, "abcdef"), "aabbccddeeff"] },
            { label: "large input with no answer", input: [repeat("a", 100_000), "b"] },
        ],
        hints: [
            "A window is valid when it holds every required character with enough copies. Two pointers can grow and shrink it.",
            "Count what t needs, then expand the right edge until the window is valid.",
            "Once valid, shrink from the left as far as it stays valid, record the best, then move on. Track how many distinct characters are satisfied instead of rescanning counts.",
        ],
        solution: { approach: "Sliding window with a need-count map and a satisfied-characters counter.", time: "O(|s| + |t|)", space: "O(alphabet)" },
        reference: String.raw`
def min_window(s, t):
    need = {}
    for c in t:
        need[c] = need.get(c, 0) + 1
    missing = len(t)
    best_start, best_len = 0, float('inf')
    left = 0
    for right, c in enumerate(s):
        if need.get(c, 0) > 0:
            missing -= 1
        need[c] = need.get(c, 0) - 1
        if missing == 0:
            while need[s[left]] < 0:
                need[s[left]] += 1
                left += 1
            if right - left + 1 < best_len:
                best_start, best_len = left, right - left + 1
            need[s[left]] += 1
            missing += 1
            left += 1
    return "" if best_len == float('inf') else s[best_start:best_start + best_len]
`,
    },
    {
        key: "edit-distance",
        title: "Edit Distance",
        difficulty: "hard",
        tags: ["dynamic-programming", "string"],
        statement:
            "Given two strings word1 and word2, return the minimum number of single-character operations needed to convert word1 into word2. The allowed operations are inserting a character, deleting a character, and replacing a character.",
        constraints: ["0 <= word1.length, word2.length <= 1500", "Lowercase English letters only"],
        signature: { name: "minDistance", params: [{ name: "word1", type: "string" }, { name: "word2", type: "string" }], returns: "int" },
        examples: [
            { input: ["horse", "ros"], output: 3, explanation: "horse to rorse to rose to ros." },
            { input: ["intention", "execution"], output: 5 },
        ],
        hidden: [
            { label: "both empty", input: ["", ""] },
            { label: "first is empty", input: ["", "abc"] },
            { label: "second is empty", input: ["abc", ""] },
            { label: "identical", input: ["same", "same"] },
            { label: "single replacement", input: ["a", "b"] },
            { label: "prefix", input: ["abc", "abcdef"] },
            { label: "large random input", input: [randString(221, 1500, "abcd"), randString(222, 1500, "abcd")] },
        ],
        hints: [
            "Compare the last characters of both strings. If they match, what is left to solve?",
            "Let dp[i][j] be the distance between the first i characters of word1 and the first j of word2.",
            "If the characters match, dp[i][j] = dp[i-1][j-1]; otherwise 1 + min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]). Base cases are i and j against the empty string. Two rows are enough.",
        ],
        solution: { approach: "2D dynamic programming over prefixes, reducible to two rows.", time: "O(n x m)", space: "O(min(n, m))" },
        reference: String.raw`
def min_distance(word1, word2):
    a, b = word1, word2
    prev = list(range(len(b) + 1))
    for i in range(1, len(a) + 1):
        cur = [i] + [0] * len(b)
        for j in range(1, len(b) + 1):
            if a[i - 1] == b[j - 1]:
                cur[j] = prev[j - 1]
            else:
                cur[j] = 1 + min(prev[j], cur[j - 1], prev[j - 1])
        prev = cur
    return prev[len(b)]
`,
    },
    {
        key: "median-of-two-sorted-arrays",
        title: "Median of Two Sorted Arrays",
        difficulty: "hard",
        tags: ["array", "binary-search", "divide-and-conquer"],
        statement:
            "Given two sorted integer arrays a and b, return the median of the combined values as a decimal number. Aim for logarithmic time in the total length; a linear merge is a good first answer to discuss.",
        constraints: ["0 <= a.length, b.length <= 50000", "a.length + b.length >= 1", "Both arrays are sorted ascending"],
        signature: { name: "findMedianSortedArrays", params: [{ name: "a", type: "int[]" }, { name: "b", type: "int[]" }], returns: "double" },
        examples: [
            { input: [[1, 3], [2]], output: 2, explanation: "The merged array is 1, 2, 3." },
            { input: [[1, 2], [3, 4]], output: 2.5, explanation: "The merged array is 1, 2, 3, 4, so the median is (2 + 3) / 2." },
        ],
        hidden: [
            { label: "first array empty", input: [[], [1]] },
            { label: "second array empty", input: [[2, 3], []] },
            { label: "identical arrays", input: [[1, 2, 3], [1, 2, 3]] },
            { label: "negative numbers", input: [[-5, -3, -1], [-4, -2]] },
            { label: "no overlap between arrays", input: [[1, 2], [10, 20, 30]] },
            { label: "even total length", input: [[1, 3, 5, 7], [2, 4, 6, 8]] },
            { label: "large input", input: [sortedRandom(231, 50_000), sortedRandom(232, 49_999)] },
        ],
        compare: "float",
        hints: [
            "The median splits the combined values into two halves of equal size. Merging finds it in linear time.",
            "To beat linear time, binary search on how many elements of the smaller array go in the left half.",
            "A partition is right when the largest left value from each array is at most the smallest right value from the other. Search on the smaller array.",
        ],
        solution: { approach: "Binary search a partition point in the shorter array so that left halves are no larger than right halves.", time: "O(log(min(n, m)))", space: "O(1)" },
        reference: String.raw`
def find_median_sorted_arrays(a, b):
    merged = sorted(a + b)
    n = len(merged)
    if n % 2 == 1:
        return float(merged[n // 2])
    return (merged[n // 2 - 1] + merged[n // 2]) / 2.0
`,
    },
    {
        key: "largest-rectangle-in-histogram",
        title: "Largest Rectangle in Histogram",
        difficulty: "hard",
        tags: ["array", "stack", "monotonic-stack"],
        statement:
            "Given an array heights representing the bar heights of a histogram where each bar has width one, return the area of the largest rectangle that fits inside the histogram.",
        constraints: ["1 <= heights.length <= 100000", "0 <= heights[i] <= 10000"],
        signature: { name: "largestRectangleArea", params: [{ name: "heights", type: "int[]" }], returns: "int" },
        examples: [
            { input: [[2, 1, 5, 6, 2, 3]], output: 10, explanation: "The bars of height 5 and 6 form a 5 by 2 rectangle." },
            { input: [[2, 4]], output: 4 },
        ],
        hidden: [
            { label: "single bar", input: [[7]] },
            { label: "all equal", input: [[3, 3, 3, 3]] },
            { label: "increasing", input: [[1, 2, 3, 4, 5]] },
            { label: "decreasing", input: [[5, 4, 3, 2, 1]] },
            { label: "contains zeros", input: [[2, 0, 2]] },
            { label: "large random input", input: [randInts(241, 100_000, 0, 10_000)] },
            { label: "large increasing input", input: [range(100_000).map((i) => Math.floor(i / 10))] },
        ],
        hints: [
            "For each bar, how far could a rectangle of exactly that bar's height extend left and right?",
            "It extends until a shorter bar. So you need the nearest shorter bar on each side.",
            "A monotonic increasing stack of indices finds these in one pass: when a shorter bar arrives, pop and compute the area for the popped height.",
        ],
        solution: { approach: "Monotonic stack; when a bar is popped, its rectangle spans between the new top and the current index.", time: "O(n)", space: "O(n)" },
        reference: String.raw`
def largest_rectangle_area(heights):
    stack = []
    best = 0
    for i, h in enumerate(heights + [0]):
        while stack and heights[stack[-1]] >= h:
            height = heights[stack.pop()]
            left = stack[-1] if stack else -1
            best = max(best, height * (i - left - 1))
        stack.append(i)
    return best
`,
    },
    {
        key: "n-queens-count",
        title: "N-Queens (Count Solutions)",
        difficulty: "hard",
        tags: ["backtracking", "recursion"],
        statement:
            "The n-queens puzzle asks you to place n queens on an n by n chessboard so that no two queens attack each other, meaning no two share a row, column or diagonal. Given n, return the number of distinct solutions.",
        constraints: ["1 <= n <= 9"],
        signature: { name: "totalNQueens", params: [{ name: "n", type: "int" }], returns: "int" },
        examples: [
            { input: [4], output: 2 },
            { input: [1], output: 1 },
        ],
        hidden: [
            { label: "no solution for two", input: [2] },
            { label: "no solution for three", input: [3] },
            { label: "five queens", input: [5] },
            { label: "six queens", input: [6] },
            { label: "eight queens", input: [8] },
            { label: "the maximum", input: [9] },
        ],
        hints: [
            "Place queens one row at a time; each row has exactly one queen.",
            "Backtrack: try every column in the current row, and only continue if it does not conflict.",
            "Track used columns and both diagonal directions in sets (or bitmasks) so each conflict check is constant time. Diagonals: row - col and row + col.",
        ],
        solution: { approach: "Backtracking row by row with column and diagonal occupancy sets.", time: "O(n!) worst case, far less with pruning", space: "O(n)" },
        reference: String.raw`
def total_n_queens(n):
    cols, diag1, diag2 = set(), set(), set()
    def place(row):
        if row == n:
            return 1
        count = 0
        for c in range(n):
            if c in cols or (row - c) in diag1 or (row + c) in diag2:
                continue
            cols.add(c); diag1.add(row - c); diag2.add(row + c)
            count += place(row + 1)
            cols.remove(c); diag1.remove(row - c); diag2.remove(row + c)
        return count
    return place(0)
`,
    },
    {
        key: "longest-valid-parentheses",
        title: "Longest Valid Parentheses",
        difficulty: "hard",
        tags: ["string", "stack", "dynamic-programming"],
        statement:
            "Given a string containing only the characters open and close round bracket, return the length of the longest substring that is a valid, well-formed parentheses sequence.",
        constraints: ["0 <= s.length <= 100000", "s consists only of ( and )"],
        signature: { name: "longestValidParentheses", params: [{ name: "s", type: "string" }], returns: "int" },
        examples: [
            { input: ["(()"], output: 2, explanation: "The longest valid substring is ()." },
            { input: [")()())"], output: 4, explanation: "The longest valid substring is ()()." },
        ],
        hidden: [
            { label: "empty string", input: [""] },
            { label: "only opening brackets", input: ["((("] },
            { label: "valid substring in the middle", input: ["()(()"] },
            { label: "two valid runs joined", input: ["()(())"] },
            { label: "invalid closer splits runs", input: ["()())()()"] },
            { label: "large repeated pairs", input: [repeat("()", 50_000)] },
            { label: "large deeply nested", input: [repeat("(", 50_000) + repeat(")", 50_000)] },
            { label: "large random input", input: [randString(251, 100_000, "(()")] },
        ],
        hints: [
            "A valid substring is delimited by unmatched brackets on either side.",
            "A stack of indices, seeded with -1, lets you measure the current valid length when a bracket closes.",
            "On '(' push the index. On ')' pop; if the stack is empty push the index as a new boundary, otherwise the length is i minus the new top.",
        ],
        solution: { approach: "Stack of indices with a sentinel boundary, or two linear scans counting open/close.", time: "O(n)", space: "O(n)" },
        reference: String.raw`
def longest_valid_parentheses(s):
    stack = [-1]
    best = 0
    for i, c in enumerate(s):
        if c == '(':
            stack.append(i)
        else:
            stack.pop()
            if not stack:
                stack.append(i)
            else:
                best = max(best, i - stack[-1])
    return best
`,
    },
];
