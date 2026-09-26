import type { ProblemDef } from "../types";
import { distinctInts, randInt, randInts, randString, range, repeat, rng } from "./helpers";

function shuffled<T>(seed: number, items: T[]): T[] {
    const next = rng(seed);
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [copy[i], copy[j]] = [copy[j]!, copy[i]!];
    }
    return copy;
}

/** Values 0..count-1, where value v appears v+1 times: every frequency is distinct, so the top-k is unambiguous. */
const staircaseFrequencies = shuffled(81, range(300).flatMap((v) => Array(v + 1).fill(v) as number[]));

const randomIntervals = (seed: number, n: number) => {
    const next = rng(seed);
    return Array.from({ length: n }, () => {
        const start = randInt(next, 0, 100_000);
        return [start, start + randInt(next, 0, 40)];
    });
};

const randomGrid = (seed: number, rows: number, cols: number, density: number) => {
    const next = rng(seed);
    return Array.from({ length: rows }, () => Array.from({ length: cols }, () => (next() < density ? "1" : "0")).join(""));
};

const rotated = (n: number, pivot: number) => {
    const base = range(n).map((i) => i * 2 - 60_000);
    return [...base.slice(pivot), ...base.slice(0, pivot)];
};

export const mediumProblems: ProblemDef[] = [
    {
        key: "longest-substring-without-repeating-characters",
        title: "Longest Substring Without Repeating Characters",
        difficulty: "medium",
        tags: ["string", "sliding-window", "hash-map"],
        statement: "Given a string s, return the length of the longest substring that contains no repeated characters.",
        constraints: ["0 <= s.length <= 100000", "s consists of English letters, digits, symbols and spaces"],
        signature: { name: "lengthOfLongestSubstring", params: [{ name: "s", type: "string" }], returns: "int" },
        examples: [
            { input: ["abcabcbb"], output: 3, explanation: "The longest is abc." },
            { input: ["pwwkew"], output: 3, explanation: "The longest is wke." },
        ],
        hidden: [
            { label: "empty string", input: [""] },
            { label: "all the same character", input: ["bbbbb"] },
            { label: "all distinct", input: ["abcdef"] },
            { label: "repeat at the very end", input: ["abcdea"] },
            { label: "spaces and symbols", input: ["a b!a b"] },
            { label: "large random input", input: [randString(91, 100_000, "abcdefghijklmnopqrstuvwxyz")] },
            { label: "large all distinct then repeats", input: [range(60).map((i) => String.fromCharCode(33 + i)).join("").repeat(1000)] },
        ],
        hints: [
            "A window that never contains a repeat can grow and shrink as you scan.",
            "Keep a left edge and move the right edge forward; remember where each character was last seen.",
            "When the new character was seen inside the window, jump the left edge just past its previous position.",
        ],
        solution: { approach: "Sliding window with a map from character to its last index.", time: "O(n)", space: "O(min(n, alphabet))" },
        reference: String.raw`
def length_of_longest_substring(s):
    last = {}
    left = best = 0
    for right, c in enumerate(s):
        if c in last and last[c] >= left:
            left = last[c] + 1
        last[c] = right
        best = max(best, right - left + 1)
    return best
`,
    },
    {
        key: "group-anagrams",
        title: "Group Anagrams",
        difficulty: "medium",
        tags: ["string", "hash-map", "sorting"],
        statement: "Given an array of strings strs, group the anagrams together and return the groups in any order. Two strings are anagrams if they use the same letters the same number of times.",
        constraints: ["1 <= strs.length <= 5000", "0 <= strs[i].length <= 100", "Lowercase English letters only"],
        signature: { name: "groupAnagrams", params: [{ name: "strs", type: "string[]" }], returns: "string[][]" },
        examples: [
            { input: [["eat", "tea", "tan", "ate", "nat", "bat"]], output: [["bat"], ["nat", "tan"], ["ate", "eat", "tea"]], explanation: "Groups and the order inside them may come in any order." },
            { input: [[""]], output: [[""]] },
        ],
        hidden: [
            { label: "single word", input: [["a"]] },
            { label: "no anagrams at all", input: [["ab", "cd", "ef"]] },
            { label: "everything is an anagram", input: [["abc", "bca", "cab", "acb"]] },
            { label: "repeated words and empties", input: [["", "", "a", "a"]] },
            { label: "large input", input: [Array.from({ length: 5000 }, (_, i) => randString(92 + i, 1 + (i % 6), "abcde"))] },
        ],
        compare: "unorderedDeep",
        hints: [
            "Anagrams share a canonical form. What could two anagrams have in common?",
            "Sorting the letters of each word gives the same key for anagrams.",
            "Use a hash map from sorted-word (or a letter-count signature) to the list of original words.",
        ],
        solution: { approach: "Hash map keyed by each word's sorted letters (or 26-count signature).", time: "O(n k log k)", space: "O(n k)" },
        reference: String.raw`
def group_anagrams(strs):
    groups = {}
    for w in strs:
        groups.setdefault("".join(sorted(w)), []).append(w)
    return list(groups.values())
`,
    },
    {
        key: "top-k-frequent-elements",
        title: "Top K Frequent Elements",
        difficulty: "medium",
        tags: ["array", "hash-map", "heap", "bucket-sort"],
        statement: "Given an integer array nums and an integer k, return the k most frequent elements in any order. The answer is guaranteed to be unique: there is no tie for the last place.",
        constraints: ["1 <= nums.length <= 100000", "k is between 1 and the number of distinct elements", "The set of k most frequent elements is unique"],
        signature: { name: "topKFrequent", params: [{ name: "nums", type: "int[]" }, { name: "k", type: "int" }], returns: "int[]" },
        examples: [
            { input: [[1, 1, 1, 2, 2, 3], 2], output: [1, 2] },
            { input: [[1], 1], output: [1] },
        ],
        hidden: [
            { label: "single distinct value", input: [[4, 4, 4], 1] },
            { label: "negative numbers", input: [[-1, -1, -2, -2, -2, 3], 2] },
            { label: "k equals the distinct count", input: [[1, 2, 2, 3, 3, 3], 3] },
            { label: "every value counted once except one", input: [[5, 6, 7, 8, 8], 1] },
            { label: "large input", input: [staircaseFrequencies, 10] },
        ],
        compare: "unordered",
        hints: [
            "First you need to know how often each value occurs.",
            "Count with a hash map, then pick the k largest counts. Sorting all counts works; can you do better?",
            "A min-heap of size k, or bucket sort by frequency (frequencies are at most n), gives near-linear time.",
        ],
        solution: { approach: "Count frequencies, then take the top k with a heap or bucket sort by frequency.", time: "O(n log k) or O(n)", space: "O(n)" },
        reference: String.raw`
from collections import Counter

def top_k_frequent(nums, k):
    return [v for v, _ in Counter(nums).most_common(k)]
`,
    },
    {
        key: "product-of-array-except-self",
        title: "Product of Array Except Self",
        difficulty: "medium",
        tags: ["array", "prefix-sum"],
        statement:
            "Given an integer array nums, return an array answer where answer[i] is the product of every element of nums except nums[i]. Do it in linear time and without using division.",
        constraints: ["2 <= nums.length <= 100000", "Every prefix and suffix product fits in a 32-bit integer"],
        signature: { name: "productExceptSelf", params: [{ name: "nums", type: "int[]" }], returns: "int[]" },
        examples: [
            { input: [[1, 2, 3, 4]], output: [24, 12, 8, 6] },
            { input: [[-1, 1, 0, -3, 3]], output: [0, 0, 9, 0, 0] },
        ],
        hidden: [
            { label: "two elements", input: [[3, 5]] },
            { label: "one zero", input: [[2, 0, 4]] },
            { label: "two zeros", input: [[0, 0, 3]] },
            { label: "negative numbers", input: [[-2, -3, 4]] },
            { label: "all ones", input: [[1, 1, 1, 1]] },
            { label: "large input of ones and minus ones", input: [randInts(101, 100_000, 0, 1).map((b) => (b === 0 ? -1 : 1))] },
        ],
        hints: [
            "Without division, what do you need for position i? Everything to its left and everything to its right.",
            "Precompute the product of all elements to the left of each index, and likewise to the right.",
            "Fill the answer with left products in one pass, then multiply in a running right product in a second pass to use O(1) extra space.",
        ],
        solution: { approach: "Prefix products left-to-right, then multiply by suffix products right-to-left.", time: "O(n)", space: "O(1) extra" },
        reference: String.raw`
def product_except_self(nums):
    n = len(nums)
    out = [1] * n
    left = 1
    for i in range(n):
        out[i] = left
        left *= nums[i]
    right = 1
    for i in range(n - 1, -1, -1):
        out[i] *= right
        right *= nums[i]
    return out
`,
    },
    {
        key: "three-sum",
        title: "3Sum",
        difficulty: "medium",
        tags: ["array", "two-pointers", "sorting"],
        statement:
            "Given an integer array nums, return all the unique triplets of values that add up to zero. The three elements must come from three different positions, and the solution must not contain duplicate triplets. The order of triplets and the order inside each triplet do not matter.",
        constraints: ["3 <= nums.length <= 3000", "-100000 <= nums[i] <= 100000"],
        signature: { name: "threeSum", params: [{ name: "nums", type: "int[]" }], returns: "int[][]" },
        examples: [
            { input: [[-1, 0, 1, 2, -1, -4]], output: [[-1, -1, 2], [-1, 0, 1]] },
            { input: [[0, 1, 1]], output: [] },
        ],
        hidden: [
            { label: "all zeros", input: [[0, 0, 0, 0]] },
            { label: "exactly three zeros", input: [[0, 0, 0]] },
            { label: "no solution", input: [[1, 2, 3, 4]] },
            { label: "many duplicates", input: [[-2, 0, 0, 2, 2, -2]] },
            { label: "mixed signs", input: [[-4, -2, -2, -2, 0, 1, 2, 2, 2, 3, 3, 4, 4, 6, 6]] },
            { label: "large input", input: [randInts(111, 3000, -100, 100)] },
        ],
        compare: "unorderedDeep",
        hints: [
            "Brute force checks every triple. What if you fixed one number and searched for the other two?",
            "Sort the array. For each first element, use two pointers on the rest to find pairs summing to its negative.",
            "Skip repeated values for the first element and after finding a triplet to avoid duplicates.",
        ],
        solution: { approach: "Sort, fix the first value, and sweep the remainder with two pointers, skipping duplicates.", time: "O(n^2)", space: "O(1) extra" },
        reference: String.raw`
def three_sum(nums):
    nums = sorted(nums)
    out = []
    n = len(nums)
    for i in range(n - 2):
        if i > 0 and nums[i] == nums[i - 1]:
            continue
        lo, hi = i + 1, n - 1
        while lo < hi:
            s = nums[i] + nums[lo] + nums[hi]
            if s < 0:
                lo += 1
            elif s > 0:
                hi -= 1
            else:
                out.append([nums[i], nums[lo], nums[hi]])
                lo += 1
                while lo < hi and nums[lo] == nums[lo - 1]:
                    lo += 1
    return out
`,
    },
    {
        key: "container-with-most-water",
        title: "Container With Most Water",
        difficulty: "medium",
        tags: ["array", "two-pointers", "greedy"],
        statement:
            "You are given an array height of n non-negative integers, where each value is the height of a vertical line drawn at that index. Choose two lines that, together with the x-axis, form a container holding the most water, and return that maximum amount. The water held is the distance between the lines times the shorter of the two heights.",
        constraints: ["2 <= height.length <= 100000", "0 <= height[i] <= 10000"],
        signature: { name: "maxArea", params: [{ name: "height", type: "int[]" }], returns: "int" },
        examples: [
            { input: [[1, 8, 6, 2, 5, 4, 8, 3, 7]], output: 49 },
            { input: [[1, 1]], output: 1 },
        ],
        hidden: [
            { label: "two zeros", input: [[0, 0]] },
            { label: "increasing heights", input: [[1, 2, 3, 4, 5]] },
            { label: "tall lines at the ends", input: [[9, 1, 1, 1, 9]] },
            { label: "best pair is in the middle", input: [[1, 2, 10, 10, 2, 1]] },
            { label: "large input", input: [randInts(121, 100_000, 0, 10_000)] },
            { label: "large flat input", input: [repeat("7,", 99_999).split(",").slice(0, 100_000).map(() => 7)] },
        ],
        hints: [
            "The area depends on the width between the lines and the shorter line.",
            "Start with the widest container, using both ends.",
            "Move the pointer at the shorter line inward: moving the taller one can never help, because width shrinks and the height is capped by the short line.",
        ],
        solution: { approach: "Two pointers from both ends, always moving the shorter side inward.", time: "O(n)", space: "O(1)" },
        reference: String.raw`
def max_area(height):
    lo, hi = 0, len(height) - 1
    best = 0
    while lo < hi:
        best = max(best, (hi - lo) * min(height[lo], height[hi]))
        if height[lo] < height[hi]:
            lo += 1
        else:
            hi -= 1
    return best
`,
    },
    {
        key: "merge-intervals",
        title: "Merge Intervals",
        difficulty: "medium",
        tags: ["array", "sorting", "intervals"],
        statement:
            "Given an array of intervals where each interval is a pair of start and end, merge all overlapping intervals and return the merged intervals sorted by start. Intervals that touch, such as one ending at 4 and another starting at 4, count as overlapping.",
        constraints: ["1 <= intervals.length <= 5000", "0 <= start <= end <= 100000"],
        signature: { name: "mergeIntervals", params: [{ name: "intervals", type: "int[][]" }], returns: "int[][]" },
        examples: [
            { input: [[[1, 3], [2, 6], [8, 10], [15, 18]]], output: [[1, 6], [8, 10], [15, 18]] },
            { input: [[[1, 4], [4, 5]]], output: [[1, 5]] },
        ],
        hidden: [
            { label: "single interval", input: [[[5, 7]]] },
            { label: "unsorted input", input: [[[8, 10], [1, 3], [2, 6], [15, 18]]] },
            { label: "one interval inside another", input: [[[1, 10], [2, 3], [4, 5]]] },
            { label: "no overlaps", input: [[[1, 2], [4, 5], [7, 8]]] },
            { label: "everything overlaps", input: [[[1, 4], [0, 5], [3, 9]]] },
            { label: "identical intervals", input: [[[2, 3], [2, 3], [2, 3]]] },
            { label: "large input", input: [randomIntervals(131, 5000)] },
        ],
        hints: [
            "Overlaps are easy to spot when intervals are ordered by their start.",
            "Sort by start, then sweep, keeping the current merged interval.",
            "If the next start is at most the current end, extend the end to the larger of the two; otherwise emit the current one and start a new one.",
        ],
        solution: { approach: "Sort by start, then a single sweep merging while the next start is at most the current end.", time: "O(n log n)", space: "O(n)" },
        reference: String.raw`
def merge_intervals(intervals):
    out = []
    for start, end in sorted(intervals):
        if out and start <= out[-1][1]:
            out[-1][1] = max(out[-1][1], end)
        else:
            out.append([start, end])
    return out
`,
    },
    {
        key: "number-of-islands",
        title: "Number of Islands",
        difficulty: "medium",
        tags: ["graph", "dfs", "bfs", "matrix"],
        statement:
            "You are given a grid as an array of strings, where each character is 1 for land or 0 for water. Return the number of islands. An island is a group of land cells connected horizontally or vertically, and everything outside the grid is water.",
        constraints: ["1 <= rows, columns <= 60", "Every row has the same length and contains only 0 and 1"],
        signature: { name: "numIslands", params: [{ name: "grid", type: "string[]" }], returns: "int" },
        examples: [
            { input: [["11110", "11010", "11000", "00000"]], output: 1 },
            { input: [["11000", "11000", "00100", "00011"]], output: 3 },
        ],
        hidden: [
            { label: "single land cell", input: [["1"]] },
            { label: "single water cell", input: [["0"]] },
            { label: "checkerboard", input: [Array.from({ length: 20 }, (_, r) => Array.from({ length: 20 }, (_, c) => ((r + c) % 2 === 0 ? "1" : "0")).join(""))] },
            { label: "diagonal land is not connected", input: [["100", "010", "001"]] },
            { label: "one big snake", input: [Array.from({ length: 30 }, (_, r) => (r % 2 === 0 ? repeat("1", 30) : r % 4 === 1 ? repeat("0", 29) + "1" : "1" + repeat("0", 29)))] },
            { label: "large random grid", input: [randomGrid(141, 60, 60, 0.5)] },
            { label: "all land", input: [Array.from({ length: 50 }, () => repeat("1", 50))] },
        ],
        hints: [
            "Each island is a connected region. How could you visit every cell of one island once?",
            "When you find unvisited land, run a DFS or BFS from it to mark the whole island.",
            "Count how many times you start a new search. Mark visited cells (modify the grid or use a set) so nothing is counted twice.",
        ],
        solution: { approach: "Scan the grid; on unvisited land start a DFS/BFS flood fill and count one island.", time: "O(rows x cols)", space: "O(rows x cols)" },
        reference: String.raw`
def num_islands(grid):
    rows = len(grid)
    cols = len(grid[0])
    seen = [[False] * cols for _ in range(rows)]
    count = 0
    for r in range(rows):
        for c in range(cols):
            if grid[r][c] == '1' and not seen[r][c]:
                count += 1
                stack = [(r, c)]
                seen[r][c] = True
                while stack:
                    y, x = stack.pop()
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        ny, nx = y + dy, x + dx
                        if 0 <= ny < rows and 0 <= nx < cols and grid[ny][nx] == '1' and not seen[ny][nx]:
                            seen[ny][nx] = True
                            stack.append((ny, nx))
    return count
`,
    },
    {
        key: "coin-change",
        title: "Coin Change",
        difficulty: "medium",
        tags: ["dynamic-programming", "bfs"],
        statement:
            "You are given an array coins of coin denominations and an integer amount. Return the fewest coins needed to make up exactly that amount, or minus one if it cannot be made. You have an unlimited supply of each coin.",
        constraints: ["1 <= coins.length <= 12", "1 <= coins[i] <= 100000", "0 <= amount <= 10000"],
        signature: { name: "coinChange", params: [{ name: "coins", type: "int[]" }, { name: "amount", type: "int" }], returns: "int" },
        examples: [
            { input: [[1, 2, 5], 11], output: 3, explanation: "5 + 5 + 1." },
            { input: [[2], 3], output: -1 },
        ],
        hidden: [
            { label: "amount is zero", input: [[1], 0] },
            { label: "coin larger than the amount", input: [[5, 10], 3] },
            { label: "greedy fails", input: [[1, 3, 4], 6] },
            { label: "single coin exact", input: [[7], 21] },
            { label: "unreachable amount", input: [[5, 10], 7] },
            { label: "large amount", input: [[1, 5, 10, 25, 50, 100, 7, 13], 9973] },
            { label: "large amount, awkward coins", input: [[186, 419, 83, 408], 6249] },
        ],
        hints: [
            "Greedy (largest coin first) is tempting, but does it always work? Try coins 1, 3, 4 and amount 6.",
            "Define best[a] as the fewest coins for amount a; it builds on smaller amounts.",
            "best[a] = 1 + min(best[a - c]) over coins c that fit. Start with best[0] = 0 and treat unreachable as infinity.",
        ],
        solution: { approach: "Bottom-up DP over amounts 0..amount, taking the best previous amount minus each coin.", time: "O(amount x coins)", space: "O(amount)" },
        reference: String.raw`
def coin_change(coins, amount):
    INF = float('inf')
    best = [0] + [INF] * amount
    for a in range(1, amount + 1):
        for c in coins:
            if c <= a and best[a - c] + 1 < best[a]:
                best[a] = best[a - c] + 1
    return -1 if best[amount] == INF else best[amount]
`,
    },
    {
        key: "longest-increasing-subsequence",
        title: "Longest Increasing Subsequence",
        difficulty: "medium",
        tags: ["dynamic-programming", "binary-search"],
        statement:
            "Given an integer array nums, return the length of the longest strictly increasing subsequence. A subsequence keeps the original order but may skip elements.",
        constraints: ["1 <= nums.length <= 5000", "-10000 <= nums[i] <= 10000"],
        signature: { name: "lengthOfLis", params: [{ name: "nums", type: "int[]" }], returns: "int" },
        examples: [
            { input: [[10, 9, 2, 5, 3, 7, 101, 18]], output: 4, explanation: "One answer is 2, 3, 7, 101." },
            { input: [[0, 1, 0, 3, 2, 3]], output: 4 },
        ],
        hidden: [
            { label: "all equal", input: [[7, 7, 7, 7]] },
            { label: "single element", input: [[3]] },
            { label: "already increasing", input: [[1, 2, 3, 4, 5]] },
            { label: "strictly decreasing", input: [[5, 4, 3, 2, 1]] },
            { label: "increasing with a dip", input: [[1, 3, 6, 7, 9, 4, 10, 5, 6]] },
            { label: "large random input", input: [randInts(151, 5000, -10_000, 10_000)] },
            { label: "large increasing input", input: [range(5000)] },
        ],
        hints: [
            "Think of dp[i] as the longest increasing subsequence ending at index i.",
            "dp[i] = 1 + max(dp[j]) for j < i with nums[j] < nums[i]. That is O(n^2).",
            "For O(n log n), keep the smallest possible tail for each length and binary-search where each number belongs.",
        ],
        solution: { approach: "O(n^2) DP, or patience sorting with binary search over tails for O(n log n).", time: "O(n log n)", space: "O(n)" },
        reference: String.raw`
import bisect

def length_of_lis(nums):
    tails = []
    for x in nums:
        i = bisect.bisect_left(tails, x)
        if i == len(tails):
            tails.append(x)
        else:
            tails[i] = x
    return len(tails)
`,
    },
    {
        key: "subarray-sum-equals-k",
        title: "Subarray Sum Equals K",
        difficulty: "medium",
        tags: ["array", "hash-map", "prefix-sum"],
        statement: "Given an integer array nums and an integer k, return the number of contiguous subarrays whose sum equals k. Numbers can be negative, so a sliding window will not work.",
        constraints: ["1 <= nums.length <= 20000", "-1000 <= nums[i] <= 1000", "-10^7 <= k <= 10^7"],
        signature: { name: "subarraySum", params: [{ name: "nums", type: "int[]" }, { name: "k", type: "int" }], returns: "int" },
        examples: [
            { input: [[1, 1, 1], 2], output: 2 },
            { input: [[1, 2, 3], 3], output: 2, explanation: "[1, 2] and [3]." },
        ],
        hidden: [
            { label: "single matching element", input: [[5], 5] },
            { label: "single non-matching element", input: [[5], 4] },
            { label: "zeros", input: [[0, 0, 0], 0] },
            { label: "negative numbers", input: [[1, -1, 0], 0] },
            { label: "no subarray matches", input: [[1, 2, 3], 100] },
            { label: "large input", input: [randInts(161, 20_000, -5, 5), 3] },
        ],
        hints: [
            "A subarray sum is a difference of two prefix sums.",
            "For each prefix sum p, count earlier prefix sums equal to p - k.",
            "Keep a hash map from prefix sum to how many times it has occurred, starting with {0: 1}.",
        ],
        solution: { approach: "Running prefix sum with a hash map of previous prefix-sum counts.", time: "O(n)", space: "O(n)" },
        reference: String.raw`
def subarray_sum(nums, k):
    counts = {0: 1}
    total = 0
    result = 0
    for x in nums:
        total += x
        result += counts.get(total - k, 0)
        counts[total] = counts.get(total, 0) + 1
    return result
`,
    },
    {
        key: "search-in-rotated-sorted-array",
        title: "Search in Rotated Sorted Array",
        difficulty: "medium",
        tags: ["array", "binary-search"],
        statement:
            "An array of distinct integers, originally sorted in ascending order, was rotated at an unknown pivot, so [0, 1, 2, 4, 5, 6, 7] might become [4, 5, 6, 7, 0, 1, 2]. Given the rotated array and a target, return the index of the target or minus one if it is absent, in logarithmic time.",
        constraints: ["1 <= nums.length <= 100000", "All values are distinct"],
        signature: { name: "searchRotated", params: [{ name: "nums", type: "int[]" }, { name: "target", type: "int" }], returns: "int" },
        examples: [
            { input: [[4, 5, 6, 7, 0, 1, 2], 0], output: 4 },
            { input: [[4, 5, 6, 7, 0, 1, 2], 3], output: -1 },
        ],
        hidden: [
            { label: "single element found", input: [[1], 1] },
            { label: "single element missing", input: [[1], 0] },
            { label: "not rotated", input: [[1, 2, 3, 4, 5], 4] },
            { label: "two elements rotated", input: [[3, 1], 1] },
            { label: "target at the pivot", input: [[6, 7, 8, 1, 2, 3], 1] },
            { label: "large input, target in the right run", input: [rotated(100_000, 33_333), 500] },
            { label: "large input, target absent", input: [rotated(100_000, 71_000), 1] },
        ],
        hints: [
            "Even after rotation, at least one half around the middle is sorted.",
            "Compare nums[lo] with nums[mid] to find which half is sorted.",
            "If the target lies within the sorted half's range, search there; otherwise search the other half.",
        ],
        solution: { approach: "Binary search, each step identifying the sorted half and deciding whether the target is inside it.", time: "O(log n)", space: "O(1)" },
        reference: String.raw`
def search_rotated(nums, target):
    lo, hi = 0, len(nums) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if nums[mid] == target:
            return mid
        if nums[lo] <= nums[mid]:
            if nums[lo] <= target < nums[mid]:
                hi = mid - 1
            else:
                lo = mid + 1
        else:
            if nums[mid] < target <= nums[hi]:
                lo = mid + 1
            else:
                hi = mid - 1
    return -1
`,
    },
    {
        key: "course-schedule",
        title: "Course Schedule",
        difficulty: "medium",
        tags: ["graph", "topological-sort", "dfs", "bfs"],
        statement:
            "There are numCourses courses labelled from 0 to numCourses minus one. You are given prerequisites, where each pair [a, b] means you must take course b before course a. Return true if it is possible to finish all courses, and false if the prerequisites contain a cycle.",
        constraints: ["1 <= numCourses <= 3000", "0 <= prerequisites.length <= 10000", "All pairs are distinct"],
        signature: { name: "canFinish", params: [{ name: "numCourses", type: "int" }, { name: "prerequisites", type: "int[][]" }], returns: "bool" },
        examples: [
            { input: [2, [[1, 0]]], output: true },
            { input: [2, [[1, 0], [0, 1]]], output: false, explanation: "Each course needs the other first." },
        ],
        hidden: [
            { label: "no prerequisites", input: [3, []] },
            { label: "course requires itself", input: [1, [[0, 0]]] },
            { label: "diamond dependency", input: [4, [[1, 0], [2, 0], [3, 1], [3, 2]]] },
            { label: "cycle hidden behind a tail", input: [5, [[1, 0], [2, 1], [3, 2], [1, 3], [4, 3]]] },
            { label: "disconnected cycle", input: [6, [[1, 0], [3, 2], [4, 3], [2, 4]]] },
            { label: "long chain", input: [2500, range(2499).map((i) => [i + 1, i])] },
            { label: "long chain closed into a cycle", input: [2500, [...range(2499).map((i) => [i + 1, i]), [0, 2499]]] },
        ],
        hints: [
            "Model courses as nodes and prerequisites as directed edges. When is finishing impossible?",
            "It is impossible exactly when the graph has a cycle.",
            "Use Kahn's algorithm: repeatedly remove courses with no remaining prerequisites; if you remove all of them, there is no cycle. Or DFS with three colours.",
        ],
        solution: { approach: "Topological sort (Kahn's algorithm) or DFS cycle detection.", time: "O(V + E)", space: "O(V + E)" },
        reference: String.raw`
from collections import deque

def can_finish(num_courses, prerequisites):
    adj = [[] for _ in range(num_courses)]
    indeg = [0] * num_courses
    for a, b in prerequisites:
        adj[b].append(a)
        indeg[a] += 1
    queue = deque(i for i in range(num_courses) if indeg[i] == 0)
    done = 0
    while queue:
        node = queue.popleft()
        done += 1
        for nxt in adj[node]:
            indeg[nxt] -= 1
            if indeg[nxt] == 0:
                queue.append(nxt)
    return done == num_courses
`,
    },
    {
        key: "word-break",
        title: "Word Break",
        difficulty: "medium",
        tags: ["dynamic-programming", "string", "hash-set"],
        statement:
            "Given a string s and an array of words wordDict, return true if s can be split into a sequence of one or more dictionary words. The same word may be reused any number of times.",
        constraints: ["1 <= s.length <= 2000", "1 <= wordDict.length <= 1000", "Lowercase English letters only"],
        signature: { name: "wordBreak", params: [{ name: "s", type: "string" }, { name: "wordDict", type: "string[]" }], returns: "bool" },
        examples: [
            { input: ["leetcode", ["leet", "code"]], output: true },
            { input: ["catsandog", ["cats", "dog", "sand", "and", "cat"]], output: false },
        ],
        hidden: [
            { label: "single letter word", input: ["a", ["a"]] },
            { label: "reused word", input: ["applepenapple", ["apple", "pen"]] },
            { label: "overlapping choices", input: ["aaaaaaa", ["aaaa", "aaa"]] },
            { label: "dictionary word longer than the string", input: ["ab", ["abc"]] },
            { label: "exponential for naive recursion", input: ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaab", ["a", "aa", "aaa", "aaaa", "aaaaa", "aaaaaa"]] },
            { label: "large yes case", input: [repeat("ab", 1000), ["a", "b", "ab", "ba"]] },
            { label: "large no case", input: [repeat("ab", 999) + "aa", ["ab", "ba"]] },
        ],
        hints: [
            "Trying every split recursively repeats a lot of work. What subproblem repeats?",
            "canBreak[i] tells whether the first i characters can be segmented.",
            "canBreak[i] is true if some j < i has canBreak[j] and s[j:i] is a word. Store words in a set.",
        ],
        solution: { approach: "DP over prefixes with a hash set of words.", time: "O(n^2) (with word-length bound O(n * maxWordLen))", space: "O(n)" },
        reference: String.raw`
def word_break(s, word_dict):
    words = set(word_dict)
    longest = max(len(w) for w in words)
    ok = [False] * (len(s) + 1)
    ok[0] = True
    for i in range(1, len(s) + 1):
        for j in range(max(0, i - longest), i):
            if ok[j] and s[j:i] in words:
                ok[i] = True
                break
    return ok[len(s)]
`,
    },
    {
        key: "daily-temperatures",
        title: "Daily Temperatures",
        difficulty: "medium",
        tags: ["array", "stack", "monotonic-stack"],
        statement:
            "Given an array temperatures of daily temperatures, return an array answer where answer[i] is the number of days you have to wait after day i to get a warmer temperature. If there is no future warmer day, answer[i] is zero.",
        constraints: ["1 <= temperatures.length <= 100000", "30 <= temperatures[i] <= 100"],
        signature: { name: "dailyTemperatures", params: [{ name: "temperatures", type: "int[]" }], returns: "int[]" },
        examples: [
            { input: [[73, 74, 75, 71, 69, 72, 76, 73]], output: [1, 1, 4, 2, 1, 1, 0, 0] },
            { input: [[30, 60, 90]], output: [1, 1, 0] },
        ],
        hidden: [
            { label: "single day", input: [[50]] },
            { label: "strictly decreasing", input: [[90, 80, 70, 60]] },
            { label: "all equal", input: [[60, 60, 60]] },
            { label: "warmer day is far away", input: [[70, 60, 60, 60, 60, 80]] },
            { label: "large random input", input: [randInts(171, 100_000, 30, 100)] },
            { label: "large decreasing input", input: [range(100_000).map((i) => 100 - Math.floor(i / 1500))] },
        ],
        hints: [
            "For each day you want the next greater element to its right.",
            "A stack of indices whose answers are still unknown works well.",
            "Scan left to right; while the current temperature is higher than the temperature at the stack top, pop and record the distance.",
        ],
        solution: { approach: "Monotonic decreasing stack of indices waiting for a warmer day.", time: "O(n)", space: "O(n)" },
        reference: String.raw`
def daily_temperatures(temperatures):
    out = [0] * len(temperatures)
    stack = []
    for i, t in enumerate(temperatures):
        while stack and temperatures[stack[-1]] < t:
            j = stack.pop()
            out[j] = i - j
        stack.append(i)
    return out
`,
    },
    {
        key: "rotate-image",
        title: "Rotate Image",
        difficulty: "medium",
        tags: ["matrix", "math"],
        statement:
            "You are given an n by n matrix of integers representing an image. Return the image rotated ninety degrees clockwise. Try to do it in place by transposing and then reversing each row.",
        constraints: ["1 <= n <= 200", "-1000 <= matrix[i][j] <= 1000"],
        signature: { name: "rotateImage", params: [{ name: "matrix", type: "int[][]" }], returns: "int[][]" },
        examples: [
            { input: [[[1, 2, 3], [4, 5, 6], [7, 8, 9]]], output: [[7, 4, 1], [8, 5, 2], [9, 6, 3]] },
            { input: [[[5, 1, 9, 11], [2, 4, 8, 10], [13, 3, 6, 7], [15, 14, 12, 16]]], output: [[15, 13, 2, 5], [14, 3, 4, 1], [12, 6, 8, 9], [16, 7, 10, 11]] },
        ],
        hidden: [
            { label: "one by one", input: [[[7]]] },
            { label: "two by two", input: [[[1, 2], [3, 4]]] },
            { label: "five by five", input: [range(5).map((r) => range(5, r * 5 + 1))] },
            { label: "negative values", input: [[[-1, -2], [-3, -4]]] },
            { label: "large input", input: [range(200).map((r) => randInts(181 + r, 200, -1000, 1000))] },
        ],
        hints: [
            "Track where a single cell goes: (row, col) ends up at (col, n - 1 - row).",
            "A clockwise rotation equals a transpose followed by reversing every row.",
            "Transpose by swapping matrix[i][j] with matrix[j][i] for j > i, then reverse each row.",
        ],
        solution: { approach: "Transpose, then reverse each row (or rotate four cells at a time, layer by layer).", time: "O(n^2)", space: "O(1) in place" },
        reference: String.raw`
def rotate_image(matrix):
    n = len(matrix)
    return [[matrix[n - 1 - c][r] for c in range(n)] for r in range(n)]
`,
    },
    {
        key: "kth-largest-element-in-an-array",
        title: "Kth Largest Element in an Array",
        difficulty: "medium",
        tags: ["array", "heap", "quickselect", "sorting"],
        statement:
            "Given an integer array nums and an integer k, return the kth largest element in sorted order. It is the kth largest including duplicates, not the kth distinct value.",
        constraints: ["1 <= k <= nums.length <= 100000", "-10000 <= nums[i] <= 10000"],
        signature: { name: "findKthLargest", params: [{ name: "nums", type: "int[]" }, { name: "k", type: "int" }], returns: "int" },
        examples: [
            { input: [[3, 2, 1, 5, 6, 4], 2], output: 5 },
            { input: [[3, 2, 3, 1, 2, 4, 5, 5, 6], 4], output: 4 },
        ],
        hidden: [
            { label: "k is one", input: [[1, 9, 4], 1] },
            { label: "k equals the length", input: [[4, 8, 1], 3] },
            { label: "all equal", input: [[2, 2, 2, 2], 3] },
            { label: "negative numbers", input: [[-1, -5, -3, -2], 2] },
            { label: "single element", input: [[9], 1] },
            { label: "large input", input: [randInts(191, 100_000, -10_000, 10_000), 500] },
        ],
        hints: [
            "Sorting solves it, at O(n log n). Can you avoid sorting everything?",
            "You only care about the top k. A min-heap of size k keeps exactly those.",
            "Push each number; if the heap grows past k, pop the smallest. The heap top is the answer. Quickselect gives O(n) on average.",
        ],
        solution: { approach: "Min-heap of size k, or quickselect for average O(n).", time: "O(n log k)", space: "O(k)" },
        reference: String.raw`
import heapq

def find_kth_largest(nums, k):
    return heapq.nlargest(k, nums)[-1]
`,
    },
    {
        key: "jump-game",
        title: "Jump Game",
        difficulty: "medium",
        tags: ["array", "greedy", "dynamic-programming"],
        statement:
            "You are given an integer array nums where nums[i] is the maximum jump length from position i. Starting at the first index, return true if you can reach the last index, and false otherwise.",
        constraints: ["1 <= nums.length <= 100000", "0 <= nums[i] <= 100000"],
        signature: { name: "canJump", params: [{ name: "nums", type: "int[]" }], returns: "bool" },
        examples: [
            { input: [[2, 3, 1, 1, 4]], output: true },
            { input: [[3, 2, 1, 0, 4]], output: false, explanation: "You always get stuck at index 3." },
        ],
        hidden: [
            { label: "single element", input: [[0]] },
            { label: "stuck immediately", input: [[0, 1]] },
            { label: "one big jump", input: [[5, 0, 0, 0, 0]] },
            { label: "zero in the middle can be jumped over", input: [[2, 0, 0, 1]] },
            { label: "zero that cannot be jumped over", input: [[1, 1, 0, 1]] },
            { label: "large reachable input", input: [Array(100_000).fill(1)] },
            { label: "large blocked input", input: [[...Array(49_999).fill(1), 0, ...Array(50_000).fill(1)]] },
        ],
        hints: [
            "You do not need to find a path, only decide if the end is reachable.",
            "Track the furthest index reachable so far.",
            "Scan left to right; if the current index is beyond the furthest reach you are stuck, otherwise update furthest = max(furthest, i + nums[i]).",
        ],
        solution: { approach: "Greedy: maintain the furthest reachable index while scanning.", time: "O(n)", space: "O(1)" },
        reference: String.raw`
def can_jump(nums):
    furthest = 0
    for i, jump in enumerate(nums):
        if i > furthest:
            return False
        furthest = max(furthest, i + jump)
    return True
`,
    },
    {
        key: "decode-ways",
        title: "Decode Ways",
        difficulty: "medium",
        tags: ["dynamic-programming", "string"],
        statement:
            "A message containing letters from A to Z is encoded as numbers, where A is 1, B is 2, and so on up to Z as 26. Given a string s of digits, return the number of ways to decode it. Leading zeros are not allowed, so 06 is not valid and a lone zero cannot be decoded.",
        constraints: ["1 <= s.length <= 45", "s contains only digits"],
        signature: { name: "numDecodings", params: [{ name: "s", type: "string" }], returns: "int" },
        examples: [
            { input: ["12"], output: 2, explanation: "AB (1 2) or L (12)." },
            { input: ["06"], output: 0 },
        ],
        hidden: [
            { label: "single zero", input: ["0"] },
            { label: "ten", input: ["10"] },
            { label: "hundred", input: ["100"] },
            { label: "twenty-seven", input: ["27"] },
            { label: "zero blocks a pair", input: ["11106"] },
            { label: "long run of ones", input: [repeat("1", 45)] },
            { label: "mixed long input", input: ["2611055971756562"] },
        ],
        hints: [
            "Think about the last one or two digits of the string.",
            "ways(i) depends on ways(i-1) if the last digit is 1-9, and ways(i-2) if the last two digits form 10-26.",
            "Compute bottom-up with two rolling values, carefully handling zeros.",
        ],
        solution: { approach: "DP over prefixes: single-digit (1-9) and two-digit (10-26) transitions.", time: "O(n)", space: "O(1)" },
        reference: String.raw`
def num_decodings(s):
    n = len(s)
    prev2, prev1 = 1, 1 if s[0] != '0' else 0
    for i in range(2, n + 1):
        cur = 0
        if s[i - 1] != '0':
            cur += prev1
        if 10 <= int(s[i - 2:i]) <= 26:
            cur += prev2
        prev2, prev1 = prev1, cur
    return prev1
`,
    },
];

void distinctInts;
