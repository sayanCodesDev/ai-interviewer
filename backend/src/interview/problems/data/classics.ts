import type { ProblemDef } from "../types";
import { distinctInts, randInt, randInts, randString, range, repeat, rng } from "./helpers";

// The classic patterns, across the topics the rest of the bank is thin on: bit tricks, sliding windows, backtracking,
// binary search on the answer, greedy choices, stacks, matrices and harder dynamic programming.

function shuffled<T>(seed: number, items: T[]): T[] {
    const next = rng(seed);
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [copy[i], copy[j]] = [copy[j]!, copy[i]!];
    }
    return copy;
}

/** Every value twice, and one value once, shuffled. */
const pairedWithOne = (seed: number, pairs: number, single: number) => {
    const values = distinctInts(seed, pairs, -1_000_000_000, 1_000_000_000).filter((v) => v !== single);
    return shuffled(seed + 1, [...values, ...values, single]);
};

/** 0..n with one value removed, shuffled. */
const zeroToNMissing = (seed: number, n: number, missing: number) => shuffled(seed, range(n + 1).filter((v) => v !== missing));

const sortedMatrix = (rows: number, cols: number) => range(rows).map((r) => range(cols).map((c) => r * cols * 3 + c * 3 + 1));

const cellGrid = (seed: number, rows: number, cols: number, max: number) => {
    const next = rng(seed);
    return Array.from({ length: rows }, () => Array.from({ length: cols }, () => randInt(next, 0, max)));
};

/** A circuit with exactly one valid starting station: total fuel equals total cost and the lowest running balance is reached once. */
const gasStationCircuit = (seed: number, n: number): [number[], number[]] => {
    for (let attempt = seed; ; attempt++) {
        const cost = randInts(attempt, n, 1, 10_000);
        const gas = randInts(attempt + 7919, n, 0, 10_000);
        gas[0] = gas[0]! + (cost.reduce((a, b) => a + b, 0) - gas.reduce((a, b) => a + b, 0));
        if (gas[0]! < 0) continue;
        let balance = 0;
        const balances = gas.map((g, i) => (balance += g - cost[i]!));
        const lowest = Math.min(...balances);
        if (balances.filter((b) => b === lowest).length === 1) return [gas, cost];
    }
};
const [circuitGas, circuitCost] = gasStationCircuit(341, 60_000);

const sudoku = (rows: string[]) => rows.map((row) => row.split(""));

const SOLVED_SUDOKU = ["534678912", "672195348", "198342567", "859761423", "426853791", "713924856", "961537284", "287419635", "345286179"];

const words = (seed: number, count: number, length: number, alphabet: number) => {
    const next = rng(seed);
    return Array.from({ length: count }, () => range(1 + Math.floor(next() * length)).map(() => String.fromCharCode(97 + randInt(next, 0, alphabet - 1))).join(""));
};

const lettersOnly = (seed: number, n: number, alphabet: string) => randString(seed, n, alphabet);

export const classicProblems: ProblemDef[] = [
    {
        key: "single-number",
        title: "Single Number",
        difficulty: "easy",
        tags: ["array", "bit-manipulation", "hash-map"],
        statement:
            "You are given an array of integers in which every value appears exactly twice except for one value, which appears once. Return the value that appears once. Try to do it in one pass with constant extra memory.",
        constraints: ["1 <= nums.length <= 100001", "nums.length is odd", "Every value appears twice except one"],
        signature: { name: "singleNumber", params: [{ name: "nums", type: "int[]" }], returns: "int" },
        examples: [
            { input: [[2, 2, 1]], output: 1 },
            { input: [[4, 1, 2, 1, 2]], output: 4 },
        ],
        hidden: [
            { label: "one element", input: [[7]] },
            { label: "negative values", input: [[-3, -3, -8]] },
            { label: "the single value is zero", input: [[5, 0, 5]] },
            { label: "extreme values", input: [[2147483647, -2147483647, 2147483647]] },
            { label: "large input", input: [pairedWithOne(201, 50_000, 123_456_789)] },
            { label: "large input, negative single", input: [pairedWithOne(202, 50_000, -987_654_321)] },
        ],
        hints: [
            "What happens if you combine two equal values in some operation? Is there an operation where equal values cancel?",
            "XOR of a number with itself is 0, and XOR with 0 leaves a number unchanged. It is also commutative and associative.",
            "XOR every element together. The pairs cancel out and only the single value remains.",
        ],
        solution: { approach: "XOR all elements: pairs cancel, leaving the single value. A hash map or set of counts also works with more memory.", time: "O(n)", space: "O(1)" },
        reference: String.raw`
def single_number(nums):
    result = 0
    for n in nums:
        result ^= n
    return result
`,
    },
    {
        key: "missing-number",
        title: "Missing Number",
        difficulty: "easy",
        tags: ["array", "math", "bit-manipulation"],
        statement:
            "You are given an array of n distinct integers, each in the range 0 to n inclusive. Exactly one number from that range is missing. Return it.",
        constraints: ["1 <= nums.length <= 100000", "All values are distinct and within 0..n"],
        signature: { name: "missingNumber", params: [{ name: "nums", type: "int[]" }], returns: "int" },
        examples: [
            { input: [[3, 0, 1]], output: 2 },
            { input: [[9, 6, 4, 2, 3, 5, 7, 0, 1]], output: 8 },
        ],
        hidden: [
            { label: "the top value is missing", input: [[0, 1]] },
            { label: "zero is missing", input: [[1]] },
            { label: "one element, zero present", input: [[0]] },
            { label: "sorted, missing in the middle", input: [[0, 1, 2, 4, 5, 6]] },
            { label: "large shuffled input", input: [zeroToNMissing(211, 100_000, 54_321)] },
            { label: "large input, top value missing", input: [zeroToNMissing(212, 100_000, 100_000)] },
        ],
        hints: [
            "You know exactly which numbers should be there. What single quantity would change if one is missing?",
            "The sum of 0..n is n(n+1)/2. Compare it with the sum of the array.",
            "Return n(n+1)/2 minus the array's sum. (XOR-ing every index and value together also isolates the missing one and cannot overflow.)",
        ],
        solution: { approach: "Expected sum n(n+1)/2 minus the actual sum, or XOR of all indices and values.", time: "O(n)", space: "O(1)" },
        reference: String.raw`
def missing_number(nums):
    n = len(nums)
    return n * (n + 1) // 2 - sum(nums)
`,
    },
    {
        key: "roman-to-integer",
        title: "Roman to Integer",
        difficulty: "easy",
        tags: ["string", "math", "hash-map"],
        statement:
            "Convert a Roman numeral to an integer. The symbols are I for 1, V for 5, X for 10, L for 50, C for 100, D for 500 and M for 1000. Symbols are normally written largest to smallest, but a smaller symbol placed before a larger one is subtracted, as in IV for 4, IX for 9, XL for 40, XC for 90, CD for 400 and CM for 900.",
        constraints: ["1 <= s.length <= 15", "s is a valid Roman numeral representing 1 to 3999"],
        signature: { name: "romanToInt", params: [{ name: "s", type: "string" }], returns: "int" },
        examples: [
            { input: ["III"], output: 3 },
            { input: ["LVIII"], output: 58, explanation: "L is 50, V is 5 and III is 3." },
            { input: ["MCMXCIV"], output: 1994 },
        ],
        hidden: [
            { label: "a single symbol", input: ["M"] },
            { label: "four", input: ["IV"] },
            { label: "nine hundred", input: ["CM"] },
            { label: "the largest value", input: ["MMMCMXCIX"] },
            { label: "several subtractions", input: ["XLIX"] },
            { label: "repeated symbols", input: ["MMDCCCLXXXVIII"] },
            { label: "the smallest value", input: ["I"] },
        ],
        hints: [
            "Most of the time you add each symbol's value. When do you subtract instead?",
            "A symbol is subtracted when the symbol after it is larger.",
            "Scan left to right: if the current value is smaller than the next one, subtract it, otherwise add it. (Scanning right to left and comparing with the previous value also works.)",
        ],
        solution: { approach: "One pass: subtract a symbol's value when a larger symbol follows it, otherwise add it.", time: "O(n)", space: "O(1)" },
        reference: String.raw`
def roman_to_int(s):
    values = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100, "D": 500, "M": 1000}
    total = 0
    for i, ch in enumerate(s):
        v = values[ch]
        if i + 1 < len(s) and v < values[s[i + 1]]:
            total -= v
        else:
            total += v
    return total
`,
    },
    {
        key: "first-unique-character",
        title: "First Unique Character",
        difficulty: "easy",
        tags: ["string", "hash-map"],
        statement:
            "Given a string s, find the first character that does not repeat anywhere in the string and return its index. If there is no such character, return minus one.",
        constraints: ["1 <= s.length <= 100000", "s consists of lowercase English letters"],
        signature: { name: "firstUniqChar", params: [{ name: "s", type: "string" }], returns: "int" },
        examples: [
            { input: ["leetcode"], output: 0 },
            { input: ["loveleetcode"], output: 2 },
            { input: ["aabb"], output: -1 },
        ],
        hidden: [
            { label: "one character", input: ["z"] },
            { label: "the unique character is last", input: ["aabbccd"] },
            { label: "every character repeats", input: ["abcabc"] },
            { label: "all distinct", input: ["qwerty"] },
            { label: "large input with one unique letter", input: [repeat("ab", 39_999) + "c" + repeat("ab", 10_000)] },
            { label: "large random input", input: [lettersOnly(221, 100_000, "abcdefghijklmnopqrstuvwxyz")] },
        ],
        hints: [
            "Deciding whether a character repeats needs information from the whole string, not just what you have seen so far.",
            "Make one pass to count how many times each letter appears.",
            "Make a second pass and return the first index whose letter has a count of one.",
        ],
        solution: { approach: "Count each letter, then scan again for the first with count 1.", time: "O(n)", space: "O(1)" },
        reference: String.raw`
from collections import Counter

def first_uniq_char(s):
    counts = Counter(s)
    for i, ch in enumerate(s):
        if counts[ch] == 1:
            return i
    return -1
`,
    },
    {
        key: "min-cost-climbing-stairs",
        title: "Min Cost Climbing Stairs",
        difficulty: "easy",
        tags: ["dynamic-programming", "array"],
        statement:
            "You are given an array cost where cost[i] is the price of stepping off stair i. Once you pay, you can climb one or two stairs. You may start on stair 0 or stair 1. Return the minimum cost to reach the top, which is the position just past the last stair.",
        constraints: ["2 <= cost.length <= 1000", "0 <= cost[i] <= 999"],
        signature: { name: "minCostClimbingStairs", params: [{ name: "cost", type: "int[]" }], returns: "int" },
        examples: [
            { input: [[10, 15, 20]], output: 15, explanation: "Start on stair 1, pay 15, and climb two stairs to the top." },
            { input: [[1, 100, 1, 1, 1, 100, 1, 1, 100, 1]], output: 6 },
        ],
        hidden: [
            { label: "two stairs", input: [[5, 3]] },
            { label: "all zeros", input: [[0, 0, 0, 0]] },
            { label: "expensive last stair is skipped", input: [[1, 1, 1, 999]] },
            { label: "alternating costs", input: [[10, 1, 10, 1, 10, 1]] },
            { label: "large random", input: [randInts(231, 1000, 0, 999)] },
        ],
        hints: [
            "The cheapest way to be on stair i depends only on the cheapest ways to be on the two stairs before it.",
            "Let best[i] be the minimum cost to arrive at position i. Then best[i] = min(best[i-1] + cost[i-1], best[i-2] + cost[i-2]).",
            "You only need the last two values, so this can be done with two variables instead of an array.",
        ],
        solution: { approach: "Dynamic programming over positions using the previous two results.", time: "O(n)", space: "O(1)" },
        reference: String.raw`
def min_cost_climbing_stairs(cost):
    a, b = 0, 0
    for i in range(2, len(cost) + 1):
        a, b = b, min(b + cost[i - 1], a + cost[i - 2])
    return b
`,
    },
    {
        key: "number-of-1-bits",
        title: "Number of 1 Bits",
        difficulty: "easy",
        tags: ["bit-manipulation", "math"],
        statement: "Given a non-negative integer, return the number of 1 bits in its binary representation.",
        constraints: ["0 <= n <= 2147483647"],
        signature: { name: "hammingWeight", params: [{ name: "n", type: "int" }], returns: "int" },
        examples: [
            { input: [11], output: 3, explanation: "11 is 1011 in binary." },
            { input: [128], output: 1 },
            { input: [2147483645], output: 30 },
        ],
        hidden: [
            { label: "zero", input: [0] },
            { label: "one", input: [1] },
            { label: "a power of two", input: [1 << 30] },
            { label: "all ones", input: [2147483647] },
            { label: "alternating bits", input: [1431655765] },
            { label: "a large arbitrary number", input: [1_234_567_890] },
        ],
        hints: [
            "You could look at the bits one at a time. How do you read the lowest bit, and how do you move to the next?",
            "n & 1 gives the lowest bit and n >> 1 drops it. Repeat until n is zero.",
            "A faster trick: n & (n - 1) clears the lowest set bit, so count how many times you can do that before n becomes zero.",
        ],
        solution: { approach: "Repeatedly clear the lowest set bit with n & (n - 1) and count the steps.", time: "O(number of set bits)", space: "O(1)" },
        reference: String.raw`
def hamming_weight(n):
    count = 0
    while n:
        n &= n - 1
        count += 1
    return count
`,
    },
    {
        key: "intersection-of-two-arrays",
        title: "Intersection of Two Arrays",
        difficulty: "easy",
        tags: ["array", "hash-set", "sorting"],
        statement:
            "Given two integer arrays, return an array of the values that appear in both. Each value should appear only once in the result, and the result may be in any order.",
        constraints: ["1 <= a.length, b.length <= 100000", "-1000000000 <= value <= 1000000000"],
        signature: { name: "intersection", params: [{ name: "a", type: "int[]" }, { name: "b", type: "int[]" }], returns: "int[]" },
        examples: [
            { input: [[1, 2, 2, 1], [2, 2]], output: [2] },
            { input: [[4, 9, 5], [9, 4, 9, 8, 4]], output: [9, 4] },
        ],
        hidden: [
            { label: "no common values", input: [[1, 2, 3], [4, 5, 6]] },
            { label: "identical arrays", input: [[3, 1, 2], [2, 3, 1]] },
            { label: "duplicates on both sides", input: [[7, 7, 7], [7, 7]] },
            { label: "negative values", input: [[-1, -2, 0], [0, -2, 5]] },
            { label: "large overlapping arrays", input: [distinctInts(241, 80_000, -500_000, 500_000), distinctInts(242, 80_000, -500_000, 500_000)] },
        ],
        compare: "unordered",
        hints: [
            "You need to test membership quickly, and each shared value should only be reported once.",
            "Put one array's values in a hash set, then check the other array's values against it.",
            "Add matches to a result set (or remove them from the first set as you find them) so duplicates are not reported twice.",
        ],
        solution: { approach: "Hash sets: keep the values of one array, and collect distinct matches from the other.", time: "O(n + m)", space: "O(n)" },
        reference: String.raw`
def intersection(a, b):
    return sorted(set(a) & set(b))
`,
    },
    {
        key: "is-subsequence",
        title: "Is Subsequence",
        difficulty: "easy",
        tags: ["string", "two-pointers"],
        statement:
            "Given strings s and t, return true if s is a subsequence of t. A subsequence is what remains after deleting some characters, possibly none, without changing the order of the rest.",
        constraints: ["0 <= s.length <= 100000", "0 <= t.length <= 1000000", "Both consist of lowercase letters"],
        signature: { name: "isSubsequence", params: [{ name: "s", type: "string" }, { name: "t", type: "string" }], returns: "bool" },
        examples: [
            { input: ["abc", "ahbgdc"], output: true },
            { input: ["axc", "ahbgdc"], output: false },
        ],
        hidden: [
            { label: "empty s", input: ["", "abc"] },
            { label: "empty t", input: ["a", ""] },
            { label: "both empty", input: ["", ""] },
            { label: "order matters", input: ["ba", "ab"] },
            { label: "s longer than t", input: ["abcd", "abc"] },
            { label: "large subsequence", input: [lettersOnly(251, 3_000, "abc"), repeat("abc", 200_000)] },
            { label: "large non-subsequence", input: [repeat("z", 10), repeat("abc", 300_000)] },
        ],
        hints: [
            "Walk through t once. What do you need to remember about s as you go?",
            "Keep a pointer into s. Advance it each time the current character of t matches the character it points at.",
            "s is a subsequence exactly when the pointer has reached the end of s by the time you finish t.",
        ],
        solution: { approach: "Two pointers: advance the pointer in s whenever the current character of t matches it.", time: "O(n + m)", space: "O(1)" },
        reference: String.raw`
def is_subsequence(s, t):
    i = 0
    for ch in t:
        if i < len(s) and s[i] == ch:
            i += 1
    return i == len(s)
`,
    },
    {
        key: "plus-one",
        title: "Plus One",
        difficulty: "easy",
        tags: ["array", "math"],
        statement:
            "A large non-negative integer is stored as an array of its decimal digits, most significant digit first, with no leading zeros except for the number zero itself. Add one to the number and return the digits of the result.",
        constraints: ["1 <= digits.length <= 1000", "0 <= digits[i] <= 9"],
        signature: { name: "plusOne", params: [{ name: "digits", type: "int[]" }], returns: "int[]" },
        examples: [
            { input: [[1, 2, 3]], output: [1, 2, 4] },
            { input: [[9, 9]], output: [1, 0, 0] },
        ],
        hidden: [
            { label: "zero", input: [[0]] },
            { label: "a single nine", input: [[9]] },
            { label: "a carry that stops early", input: [[1, 9, 9]] },
            { label: "a trailing nine", input: [[4, 9]] },
            { label: "one thousand nines", input: [Array(1000).fill(9)] },
            { label: "a long number with no carry", input: [range(1000).map((i) => (i === 0 ? 5 : i % 9))] },
        ],
        hints: [
            "Adding one is like adding on paper: start at the last digit.",
            "If the last digit is less than 9, increment it and you are done. If it is 9, it becomes 0 and you carry into the next digit.",
            "If a carry falls off the front (every digit was 9), the result is one digit longer: a 1 followed by zeros.",
        ],
        solution: { approach: "Walk from the last digit, turning 9s to 0s until a digit can be incremented; if none can, prepend a 1.", time: "O(n)", space: "O(1) extra" },
        reference: String.raw`
def plus_one(digits):
    result = digits[:]
    for i in range(len(result) - 1, -1, -1):
        if result[i] < 9:
            result[i] += 1
            return result
        result[i] = 0
    return [1] + result
`,
    },
    {
        key: "peak-index-in-mountain-array",
        title: "Peak of a Mountain",
        difficulty: "easy",
        tags: ["array", "binary-search"],
        statement:
            "An array is a mountain if it strictly increases up to one peak element and then strictly decreases, with at least one element on each side of the peak. Given a mountain array, return the index of its peak. Solve it in logarithmic time.",
        constraints: ["3 <= arr.length <= 100000", "arr is a mountain array"],
        signature: { name: "peakIndexInMountainArray", params: [{ name: "arr", type: "int[]" }], returns: "int" },
        examples: [
            { input: [[0, 1, 0]], output: 1 },
            { input: [[0, 2, 1, 0]], output: 1 },
            { input: [[0, 10, 5, 2]], output: 1 },
        ],
        hidden: [
            { label: "peak at the second element", input: [[1, 9, 3, 2, 1]] },
            { label: "peak at the second to last element", input: [[1, 2, 3, 4, 9, 1]] },
            { label: "symmetric", input: [[1, 2, 3, 4, 3, 2, 1]] },
            { label: "large, peak near the start", input: [[1, 1_000_000, ...range(99_998).map((i) => 999_999 - i)]] },
            { label: "large, peak near the end", input: [[...range(99_998).map((i) => i + 1), 500_000, 3]] },
            { label: "large, peak in the middle", input: [[...range(50_000).map((i) => i * 2), ...range(49_999).map((i) => 99_997 - i * 2)]] },
        ],
        hints: [
            "Compare an element with its right neighbour. What does that tell you about which side of the peak you are on?",
            "If arr[mid] < arr[mid + 1] you are on the rising slope, so the peak is to the right. Otherwise the peak is at mid or to its left.",
            "Binary search: keep lo and hi, move lo to mid + 1 on the rising slope, otherwise hi to mid. When they meet, that index is the peak.",
        ],
        solution: { approach: "Binary search comparing arr[mid] with arr[mid + 1] to decide which slope you are on.", time: "O(log n)", space: "O(1)" },
        reference: String.raw`
def peak_index_in_mountain_array(arr):
    lo, hi = 0, len(arr) - 1
    while lo < hi:
        mid = (lo + hi) // 2
        if arr[mid] < arr[mid + 1]:
            lo = mid + 1
        else:
            hi = mid
    return lo
`,
    },
    {
        key: "longest-consecutive-sequence",
        title: "Longest Consecutive Sequence",
        difficulty: "medium",
        tags: ["array", "hash-set"],
        statement:
            "Given an unsorted array of integers, return the length of the longest run of consecutive values that can be formed from its elements, in any order. For example, 4, 5, 6 and 7 form a run of length four. Your solution should run in linear time.",
        constraints: ["0 <= nums.length <= 100000", "-1000000000 <= nums[i] <= 1000000000", "Values may repeat"],
        signature: { name: "longestConsecutive", params: [{ name: "nums", type: "int[]" }], returns: "int" },
        examples: [
            { input: [[100, 4, 200, 1, 3, 2]], output: 4, explanation: "1, 2, 3, 4." },
            { input: [[0, 3, 7, 2, 5, 8, 4, 6, 0, 1]], output: 9 },
        ],
        hidden: [
            { label: "empty", input: [[]] },
            { label: "one element", input: [[5]] },
            { label: "all duplicates", input: [[2, 2, 2, 2]] },
            { label: "negative and positive values", input: [[-2, -1, 0, 1, 5, 6]] },
            { label: "extreme values", input: [[-1_000_000_000, 1_000_000_000, -999_999_999]] },
            { label: "a long run among noise", input: [shuffled(261, [...range(30_000, 500_000), ...randInts(262, 40_000, -900_000_000, -100_000_000)])] },
            { label: "large with many short runs", input: [randInts(263, 100_000, 0, 400_000)] },
        ],
        hints: [
            "Sorting would work in O(n log n). To reach O(n), you need a faster way to ask 'is x + 1 present?'.",
            "Put every value in a hash set. A run starts at a value whose predecessor (x - 1) is not in the set.",
            "For each such start, count upward (x + 1, x + 2, ...) while values are in the set. Each element is visited at most twice overall.",
        ],
        solution: { approach: "Hash set; count runs only from values with no predecessor in the set.", time: "O(n)", space: "O(n)" },
        reference: String.raw`
def longest_consecutive(nums):
    values = set(nums)
    best = 0
    for x in values:
        if x - 1 not in values:
            length = 1
            while x + length in values:
                length += 1
            best = max(best, length)
    return best
`,
    },
    {
        key: "minimum-size-subarray-sum",
        title: "Minimum Size Subarray Sum",
        difficulty: "medium",
        tags: ["array", "sliding-window", "two-pointers", "binary-search"],
        statement:
            "Given an array of positive integers and a positive target, return the length of the shortest contiguous subarray whose sum is at least the target. If there is no such subarray, return 0.",
        constraints: ["1 <= nums.length <= 100000", "1 <= nums[i] <= 10000", "1 <= target <= 1000000000"],
        signature: { name: "minSubArrayLen", params: [{ name: "target", type: "int" }, { name: "nums", type: "int[]" }], returns: "int" },
        examples: [
            { input: [7, [2, 3, 1, 2, 4, 3]], output: 2, explanation: "The subarray [4, 3] has sum 7." },
            { input: [4, [1, 4, 4]], output: 1 },
            { input: [11, [1, 1, 1, 1, 1, 1, 1, 1]], output: 0 },
        ],
        hidden: [
            { label: "one element that is enough", input: [5, [9]] },
            { label: "one element that is not enough", input: [10, [9]] },
            { label: "the whole array is needed", input: [10, [1, 2, 3, 4]] },
            { label: "the answer is at the end", input: [15, [1, 1, 1, 1, 1, 9, 6]] },
            { label: "large array, small target", input: [50, randInts(271, 100_000, 1, 10_000)] },
            { label: "large array, large target", input: [300_000_000, randInts(272, 100_000, 1, 10_000)] },
            { label: "large array, unreachable target", input: [1_000_000_000, randInts(273, 100_000, 1, 1_000)] },
        ],
        hints: [
            "All values are positive, so adding an element only increases a sum and removing one only decreases it.",
            "Use a window [left, right] and a running sum. Extend right until the sum reaches the target.",
            "When the sum is at least the target, record the window length and shrink from the left as far as you can while it stays at least the target. Each index enters and leaves the window once.",
        ],
        solution: { approach: "Sliding window over positive numbers: grow to reach the target, then shrink from the left.", time: "O(n)", space: "O(1)" },
        reference: String.raw`
def min_sub_array_len(target, nums):
    best = 0
    left = 0
    total = 0
    for right, value in enumerate(nums):
        total += value
        while total >= target:
            length = right - left + 1
            if best == 0 or length < best:
                best = length
            total -= nums[left]
            left += 1
    return best
`,
    },
    {
        key: "find-all-anagrams",
        title: "Find All Anagrams in a String",
        difficulty: "medium",
        tags: ["string", "sliding-window", "hash-map"],
        statement:
            "Given two strings s and p, return the starting indices of every substring of s that is an anagram of p, in increasing order. An anagram uses exactly the same letters as p, the same number of times, in any order.",
        constraints: ["1 <= s.length, p.length <= 100000", "Both strings consist of lowercase English letters"],
        signature: { name: "findAnagrams", params: [{ name: "s", type: "string" }, { name: "p", type: "string" }], returns: "int[]" },
        examples: [
            { input: ["cbaebabacd", "abc"], output: [0, 6] },
            { input: ["abab", "ab"], output: [0, 1, 2] },
        ],
        hidden: [
            { label: "p longer than s", input: ["ab", "abc"] },
            { label: "no anagram", input: ["aaaa", "b"] },
            { label: "the whole string", input: ["listen", "silent"] },
            { label: "overlapping matches", input: ["aaaaa", "aa"] },
            { label: "repeated letters in p", input: ["abaacbaabac", "aab"] },
            { label: "large random text", input: [lettersOnly(281, 100_000, "abc"), "abcab"] },
            { label: "large text, long pattern", input: [lettersOnly(282, 100_000, "ab"), lettersOnly(283, 5_000, "ab")] },
        ],
        hints: [
            "Any window of length p.length is a candidate. What makes two strings anagrams of each other?",
            "They have the same count for each letter. Keep the letter counts of p and of the current window of s.",
            "Slide the window by adding the new letter and removing the old one, updating the counts (or a single 'letters still differing' number) so each step is constant time.",
        ],
        solution: { approach: "Fixed-size sliding window with letter counts, comparing to p's counts as the window moves.", time: "O(n)", space: "O(1)" },
        reference: String.raw`
def find_anagrams(s, p):
    if len(p) > len(s):
        return []
    need = [0] * 26
    have = [0] * 26
    for ch in p:
        need[ord(ch) - 97] += 1
    result = []
    for i, ch in enumerate(s):
        have[ord(ch) - 97] += 1
        if i >= len(p):
            have[ord(s[i - len(p)]) - 97] -= 1
        if have == need:
            result.append(i - len(p) + 1)
    return result
`,
    },
    {
        key: "subsets",
        title: "Subsets",
        difficulty: "medium",
        tags: ["backtracking", "array", "recursion", "bit-manipulation"],
        statement:
            "Given an array of distinct integers, return every possible subset, including the empty subset and the array itself. The result must not contain duplicate subsets, and the subsets and their contents can be in any order.",
        constraints: ["0 <= nums.length <= 12", "All values are distinct", "-10 <= nums[i] <= 10"],
        signature: { name: "subsets", params: [{ name: "nums", type: "int[]" }], returns: "int[][]" },
        examples: [
            { input: [[1, 2, 3]], output: [[], [1], [2], [1, 2], [3], [1, 3], [2, 3], [1, 2, 3]] },
            { input: [[0]], output: [[], [0]] },
        ],
        hidden: [
            { label: "empty input", input: [[]] },
            { label: "two elements", input: [[5, -5]] },
            { label: "negative values", input: [[-3, -1, 0, 2]] },
            { label: "eight elements", input: [[1, 2, 3, 4, 5, 6, 7, 8]] },
            { label: "twelve elements", input: [[-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5]] },
        ],
        compare: "unorderedDeep",
        hints: [
            "Each element is either in a subset or not. That is two choices per element.",
            "Build the subsets recursively: for each position, either include the element or skip it, then move to the next position.",
            "Alternatively, start with [[]] and, for each number, add a copy of every existing subset with that number appended. There are 2^n subsets in all.",
        ],
        solution: { approach: "Backtracking with include/exclude choices, or iteratively doubling the list of subsets per element.", time: "O(n x 2^n)", space: "O(n x 2^n)" },
        reference: String.raw`
def subsets(nums):
    result = [[]]
    for x in nums:
        result += [s + [x] for s in result]
    return result
`,
    },
    {
        key: "combination-sum",
        title: "Combination Sum",
        difficulty: "medium",
        tags: ["backtracking", "array", "dynamic-programming"],
        statement:
            "Given an array of distinct positive integers called candidates and a positive target, return every unique combination of candidates that sums to the target. A candidate may be used any number of times. Two combinations are the same if they use each number the same number of times. The combinations may be returned in any order.",
        constraints: ["1 <= candidates.length <= 20", "2 <= candidates[i] <= 40", "1 <= target <= 40", "All candidates are distinct"],
        signature: { name: "combinationSum", params: [{ name: "candidates", type: "int[]" }, { name: "target", type: "int" }], returns: "int[][]" },
        examples: [
            { input: [[2, 3, 6, 7], 7], output: [[2, 2, 3], [7]] },
            { input: [[2, 3, 5], 8], output: [[2, 2, 2, 2], [2, 3, 3], [3, 5]] },
            { input: [[2], 1], output: [] },
        ],
        hidden: [
            { label: "the target is a candidate", input: [[7, 3], 7] },
            { label: "the target is below every candidate", input: [[5, 6], 4] },
            { label: "one candidate repeated", input: [[3], 9] },
            { label: "a small candidate, many combinations", input: [[2, 3, 5, 7], 20] },
            { label: "large target", input: [[2, 3, 5, 7, 11], 40] },
            { label: "unordered candidates", input: [[8, 2, 5, 3], 16] },
        ],
        compare: "unorderedDeep",
        hints: [
            "At each step you choose a candidate, and you may choose it again. How do you avoid producing the same combination in a different order?",
            "Process candidates in a fixed order: at each recursive call, only consider candidates at or after the current index.",
            "Recurse with the remaining target. Stop with a result when it reaches zero, and stop the branch when it goes negative. Sorting the candidates lets you stop early.",
        ],
        solution: { approach: "Backtracking over candidates by index, allowing reuse, subtracting from the target.", time: "Exponential in target / min(candidate)", space: "O(target / min(candidate)) recursion" },
        reference: String.raw`
def combination_sum(candidates, target):
    candidates = sorted(candidates)
    result = []

    def walk(start, remaining, chosen):
        if remaining == 0:
            result.append(chosen[:])
            return
        for i in range(start, len(candidates)):
            if candidates[i] > remaining:
                break
            chosen.append(candidates[i])
            walk(i, remaining - candidates[i], chosen)
            chosen.pop()

    walk(0, target, [])
    return result
`,
    },
    {
        key: "generate-parentheses",
        title: "Generate Parentheses",
        difficulty: "medium",
        tags: ["backtracking", "stack", "string", "recursion"],
        statement: "Given n pairs of parentheses, return every well-formed combination of them, as strings. The strings may be returned in any order.",
        constraints: ["1 <= n <= 9"],
        signature: { name: "generateParenthesis", params: [{ name: "n", type: "int" }], returns: "string[]" },
        examples: [
            { input: [3], output: ["((()))", "(()())", "(())()", "()(())", "()()()"] },
            { input: [1], output: ["()"] },
        ],
        hidden: [
            { label: "two pairs", input: [2] },
            { label: "four pairs", input: [4] },
            { label: "six pairs", input: [6] },
            { label: "nine pairs", input: [9] },
        ],
        compare: "unordered",
        hints: [
            "A string is well-formed when no prefix has more closing brackets than opening ones, and the totals match.",
            "Build the string one character at a time, tracking how many opening and closing brackets you have used.",
            "You may add an opening bracket while you have used fewer than n, and a closing bracket only while closings used are fewer than openings used. Record the string when its length reaches 2n.",
        ],
        solution: { approach: "Backtracking with counts of opened and closed brackets, only making moves that keep the prefix valid.", time: "O(4^n / sqrt(n))", space: "O(n) recursion" },
        reference: String.raw`
def generate_parenthesis(n):
    result = []

    def build(current, opened, closed):
        if len(current) == 2 * n:
            result.append(current)
            return
        if opened < n:
            build(current + "(", opened + 1, closed)
        if closed < opened:
            build(current + ")", opened, closed + 1)

    build("", 0, 0)
    return result
`,
    },
    {
        key: "house-robber",
        title: "House Robber",
        difficulty: "medium",
        tags: ["dynamic-programming", "array"],
        statement:
            "Houses along a street each hold some money. Adjacent houses have connected alarms, so you cannot take from two neighbouring houses on the same night. Given the amount in each house, return the most you can take without triggering an alarm.",
        constraints: ["1 <= nums.length <= 100000", "0 <= nums[i] <= 10000"],
        signature: { name: "rob", params: [{ name: "nums", type: "int[]" }], returns: "int" },
        examples: [
            { input: [[1, 2, 3, 1]], output: 4, explanation: "Take houses 1 and 3." },
            { input: [[2, 7, 9, 3, 1]], output: 12 },
        ],
        hidden: [
            { label: "one house", input: [[8]] },
            { label: "two houses", input: [[3, 9]] },
            { label: "all zeros", input: [[0, 0, 0]] },
            { label: "skip two in a row is optimal", input: [[5, 1, 1, 5]] },
            { label: "increasing values", input: [[1, 2, 3, 4, 5, 6]] },
            { label: "large random street", input: [randInts(291, 100_000, 0, 10_000)] },
        ],
        hints: [
            "For each house you decide to take it or skip it. What does taking it rule out?",
            "Let best[i] be the most you can get from the first i houses. Then best[i] = max(best[i-1], best[i-2] + nums[i-1]).",
            "Only the last two values are needed, so keep two variables and update them as you scan.",
        ],
        solution: { approach: "Dynamic programming: best(i) = max(best(i-1), best(i-2) + nums[i]), using two rolling values.", time: "O(n)", space: "O(1)" },
        reference: String.raw`
def rob(nums):
    skip, take = 0, 0
    for x in nums:
        skip, take = max(skip, take), skip + x
    return max(skip, take)
`,
    },
    {
        key: "unique-paths-with-obstacles",
        title: "Unique Paths With Obstacles",
        difficulty: "medium",
        tags: ["dynamic-programming", "matrix"],
        statement:
            "A robot starts at the top-left cell of a grid and wants to reach the bottom-right cell, moving only right or down. Cells containing 1 are obstacles the robot cannot enter, and cells containing 0 are free. Return the number of different paths from the start to the end.",
        constraints: ["1 <= rows, columns <= 15", "Every cell is 0 or 1", "The answer fits in a 32-bit integer"],
        signature: { name: "uniquePathsWithObstacles", params: [{ name: "grid", type: "int[][]" }], returns: "int" },
        examples: [
            { input: [[[0, 0, 0], [0, 1, 0], [0, 0, 0]]], output: 2 },
            { input: [[[0, 1], [0, 0]]], output: 1 },
        ],
        hidden: [
            { label: "start blocked", input: [[[1, 0], [0, 0]]] },
            { label: "end blocked", input: [[[0, 0], [0, 1]]] },
            { label: "single free cell", input: [[[0]]] },
            { label: "a single row", input: [[[0, 0, 0, 0]]] },
            { label: "a single row with an obstacle", input: [[[0, 0, 1, 0]]] },
            { label: "an open grid", input: [Array.from({ length: 15 }, () => Array(15).fill(0))] },
            { label: "an open grid with a few obstacles", input: [Array.from({ length: 15 }, (_, r) => Array.from({ length: 15 }, (_, c) => (r > 2 && r % 4 === 3 && c === r ? 1 : 0)))] },
        ],
        hints: [
            "The number of ways to reach a cell depends on the number of ways to reach the cell above it and the cell to its left.",
            "Let ways[r][c] = ways[r-1][c] + ways[r][c-1] for free cells, and 0 for obstacles.",
            "Set the start to 1 (if it is free), fill the grid row by row, and return the bottom-right value. One row of memory is enough.",
        ],
        solution: { approach: "Grid dynamic programming: paths to a cell are the sum of paths from above and from the left; obstacles have zero.", time: "O(rows x cols)", space: "O(cols)" },
        reference: String.raw`
def unique_paths_with_obstacles(grid):
    rows, cols = len(grid), len(grid[0])
    ways = [0] * cols
    ways[0] = 1 if grid[0][0] == 0 else 0
    for r in range(rows):
        for c in range(cols):
            if grid[r][c] == 1:
                ways[c] = 0
            elif c > 0:
                ways[c] += ways[c - 1]
    return ways[cols - 1]
`,
    },
    {
        key: "partition-equal-subset-sum",
        title: "Partition Equal Subset Sum",
        difficulty: "medium",
        tags: ["dynamic-programming", "array"],
        statement:
            "Given an array of positive integers, return true if it can be split into two groups whose sums are equal, and false otherwise. Every element must go into exactly one group.",
        constraints: ["1 <= nums.length <= 200", "1 <= nums[i] <= 100"],
        signature: { name: "canPartition", params: [{ name: "nums", type: "int[]" }], returns: "bool" },
        examples: [
            { input: [[1, 5, 11, 5]], output: true, explanation: "[1, 5, 5] and [11]." },
            { input: [[1, 2, 3, 5]], output: false },
        ],
        hidden: [
            { label: "one element", input: [[4]] },
            { label: "two equal elements", input: [[6, 6]] },
            { label: "an odd total", input: [[1, 1, 1]] },
            { label: "one huge element", input: [[100, 1, 1, 1, 1]] },
            { label: "many small elements", input: [Array(200).fill(1)] },
            { label: "large random", input: [randInts(301, 200, 1, 100)] },
            { label: "large with an even total but no split", input: [[4, ...Array(199).fill(6)]] },
        ],
        hints: [
            "If the total is odd it is impossible. Otherwise the question becomes: can some subset add up to half the total?",
            "That is a subset-sum problem. Let reachable[s] say whether some subset sums to s.",
            "Loop over the numbers, and for each one update reachable from high sums to low sums (so a number is not used twice): reachable[s] |= reachable[s - x].",
        ],
        solution: { approach: "0/1 knapsack style subset-sum for half the total, with a boolean array updated from high sums to low.", time: "O(n x sum)", space: "O(sum)" },
        reference: String.raw`
def can_partition(nums):
    total = sum(nums)
    if total % 2:
        return False
    half = total // 2
    reachable = [False] * (half + 1)
    reachable[0] = True
    for x in nums:
        for s in range(half, x - 1, -1):
            if reachable[s - x]:
                reachable[s] = True
    return reachable[half]
`,
    },
    {
        key: "longest-palindromic-substring",
        title: "Longest Palindromic Substring",
        difficulty: "medium",
        tags: ["string", "dynamic-programming", "two-pointers"],
        statement:
            "Given a string s, return its longest palindromic substring. If several palindromic substrings share the longest length, return the one that starts first.",
        constraints: ["1 <= s.length <= 1000", "s consists of digits and English letters"],
        signature: { name: "longestPalindrome", params: [{ name: "s", type: "string" }], returns: "string" },
        examples: [
            { input: ["babad"], output: "bab", explanation: "\"aba\" is also a palindrome of the same length, but \"bab\" starts first." },
            { input: ["cbbd"], output: "bb" },
        ],
        hidden: [
            { label: "one character", input: ["a"] },
            { label: "no repeated characters", input: ["abcd"] },
            { label: "the whole string", input: ["racecar"] },
            { label: "even length palindrome", input: ["abccbaxyz"] },
            { label: "palindrome at the end", input: ["xyzabacaba"] },
            { label: "all the same character", input: [repeat("a", 1000)] },
            { label: "large random with a planted palindrome", input: [lettersOnly(311, 400, "abc") + "xyzzyx" + lettersOnly(312, 400, "abc")] },
        ],
        hints: [
            "A palindrome mirrors around its centre. How many possible centres are there in a string of length n?",
            "There are 2n - 1 centres: each character, and each gap between two characters.",
            "For every centre, expand outwards while the characters on both sides match, and remember the longest (earliest on ties). That is O(n^2) time and O(1) space.",
        ],
        solution: { approach: "Expand around each of the 2n - 1 centres, keeping the longest palindrome found (earliest on ties). Manacher's algorithm is O(n).", time: "O(n^2)", space: "O(1)" },
        reference: String.raw`
def longest_palindrome(s):
    best_start, best_len = 0, 1
    n = len(s)
    for centre in range(2 * n - 1):
        lo = centre // 2
        hi = lo + centre % 2
        while lo >= 0 and hi < n and s[lo] == s[hi]:
            lo -= 1
            hi += 1
        length = hi - lo - 1
        if length > best_len:
            best_len = length
            best_start = lo + 1
    return s[best_start:best_start + best_len]
`,
    },
    {
        key: "koko-eating-bananas",
        title: "Eating Speed",
        difficulty: "medium",
        tags: ["binary-search", "array", "math"],
        statement:
            "There are piles of bananas, and a guard returns in h hours. Each hour you choose one pile and eat up to k bananas from it. If the pile has fewer than k bananas you eat them all and do nothing more that hour. Return the minimum integer k that lets you eat every banana within h hours.",
        constraints: ["1 <= piles.length <= h <= 1000000000", "piles.length <= 10000", "1 <= piles[i] <= 100000"],
        signature: { name: "minEatingSpeed", params: [{ name: "piles", type: "int[]" }, { name: "h", type: "int" }], returns: "int" },
        examples: [
            { input: [[3, 6, 7, 11], 8], output: 4 },
            { input: [[30, 11, 23, 4, 20], 5], output: 30 },
            { input: [[30, 11, 23, 4, 20], 6], output: 23 },
        ],
        hidden: [
            { label: "one pile", input: [[10], 5] },
            { label: "as many hours as bananas", input: [[1, 1, 1, 1], 100] },
            { label: "exactly one hour per pile", input: [[5, 9, 2], 3] },
            { label: "a huge pile", input: [[100_000, 1, 1], 4] },
            { label: "large random piles", input: [randInts(321, 10_000, 1, 100_000), 50_000] },
            { label: "large random piles, tight deadline", input: [randInts(322, 10_000, 1, 100_000), 10_000] },
        ],
        hints: [
            "If you can finish at speed k, you can also finish at any faster speed. What kind of search does that suggest?",
            "Binary search on k between 1 and the size of the largest pile. For a candidate k, the hours needed are the sum over piles of ceil(pile / k).",
            "If the hours needed are at most h, try a smaller k; otherwise try a larger one. The answer is the smallest k that works.",
        ],
        solution: { approach: "Binary search on the speed, checking the total hours with ceiling division.", time: "O(n log max)", space: "O(1)" },
        reference: String.raw`
def min_eating_speed(piles, h):
    lo, hi = 1, max(piles)
    while lo < hi:
        k = (lo + hi) // 2
        hours = sum((p + k - 1) // k for p in piles)
        if hours <= h:
            hi = k
        else:
            lo = k + 1
    return lo
`,
    },
    {
        key: "capacity-to-ship-packages",
        title: "Capacity to Ship Packages",
        difficulty: "medium",
        tags: ["binary-search", "array", "greedy"],
        statement:
            "Packages on a conveyor must be shipped in the given order within the given number of days. Each day you load packages in order, without exceeding the ship's weight capacity, and ship them. Return the least capacity that lets every package be shipped within days.",
        constraints: ["1 <= days <= weights.length <= 50000", "1 <= weights[i] <= 500"],
        signature: { name: "shipWithinDays", params: [{ name: "weights", type: "int[]" }, { name: "days", type: "int" }], returns: "int" },
        examples: [
            { input: [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5], output: 15 },
            { input: [[3, 2, 2, 4, 1, 4], 3], output: 6 },
            { input: [[1, 2, 3, 1, 1], 4], output: 3 },
        ],
        hidden: [
            { label: "one day", input: [[4, 4, 4], 1] },
            { label: "one package per day", input: [[9, 2, 7], 3] },
            { label: "a single heavy package", input: [[500, 1, 1, 1], 2] },
            { label: "equal weights", input: [Array(1000).fill(7), 10] },
            { label: "large random", input: [randInts(331, 50_000, 1, 500), 40] },
            { label: "large random, many days", input: [randInts(332, 50_000, 1, 500), 25_000] },
        ],
        hints: [
            "The capacity must be at least the heaviest package, and never needs to exceed the total weight. What happens as capacity grows?",
            "The number of days needed never increases as capacity increases, so you can binary search on the capacity.",
            "For a candidate capacity, simulate greedily: fill each day until the next package would not fit, then start a new day. If the days used are at most the limit, the capacity works.",
        ],
        solution: { approach: "Binary search the capacity between max(weights) and sum(weights); check feasibility with a greedy day-by-day simulation.", time: "O(n log sum)", space: "O(1)" },
        reference: String.raw`
def ship_within_days(weights, days):
    lo, hi = max(weights), sum(weights)

    def needed(capacity):
        used, load = 1, 0
        for w in weights:
            if load + w > capacity:
                used += 1
                load = 0
            load += w
        return used

    while lo < hi:
        mid = (lo + hi) // 2
        if needed(mid) <= days:
            hi = mid
        else:
            lo = mid + 1
    return lo
`,
    },
    {
        key: "search-a-2d-matrix",
        title: "Search a 2D Matrix",
        difficulty: "medium",
        tags: ["binary-search", "matrix", "array"],
        statement:
            "You are given a matrix of integers in which each row is sorted in ascending order and the first value of every row is greater than the last value of the row before it. Return true if the target is in the matrix. Your solution should run in logarithmic time.",
        constraints: ["1 <= rows, columns <= 500", "-1000000 <= matrix[i][j], target <= 1000000"],
        signature: { name: "searchMatrix", params: [{ name: "matrix", type: "int[][]" }, { name: "target", type: "int" }], returns: "bool" },
        examples: [
            { input: [[[1, 3, 5, 7], [10, 11, 16, 20], [23, 30, 34, 60]], 3], output: true },
            { input: [[[1, 3, 5, 7], [10, 11, 16, 20], [23, 30, 34, 60]], 13], output: false },
        ],
        hidden: [
            { label: "one cell, found", input: [[[5]], 5] },
            { label: "one cell, missing", input: [[[5]], 6] },
            { label: "the first element", input: [[[2, 4], [6, 8]], 2] },
            { label: "the last element", input: [[[2, 4], [6, 8]], 8] },
            { label: "below every value", input: [[[2, 4], [6, 8]], -5] },
            { label: "between two rows", input: [[[1, 2, 3], [10, 11, 12]], 5] },
            { label: "large matrix, present", input: [sortedMatrix(500, 500), 375_301] },
            { label: "large matrix, absent", input: [sortedMatrix(500, 500), 2] },
        ],
        hints: [
            "Because each row starts after the previous one ends, the whole matrix read row by row is one sorted list.",
            "Treat the matrix as a flat sorted array of rows x cols elements. The element at flat index i is matrix[i / cols][i % cols].",
            "Run an ordinary binary search over indices 0 to rows*cols - 1, converting each middle index to a row and column.",
        ],
        solution: { approach: "Binary search over the flattened index range, mapping an index to (row, column).", time: "O(log(rows x cols))", space: "O(1)" },
        reference: String.raw`
def search_matrix(matrix, target):
    rows, cols = len(matrix), len(matrix[0])
    lo, hi = 0, rows * cols - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        value = matrix[mid // cols][mid % cols]
        if value == target:
            return True
        if value < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return False
`,
    },
    {
        key: "evaluate-reverse-polish-notation",
        title: "Evaluate Reverse Polish Notation",
        difficulty: "medium",
        tags: ["stack", "math", "string"],
        statement:
            "Evaluate an arithmetic expression written in reverse Polish notation, as an array of tokens. The valid operators are plus, minus, multiply and divide, written + - * and /. Each operand is an integer. Division truncates toward zero. The expression is always valid, and no division by zero occurs.",
        constraints: ["1 <= tokens.length <= 10000", "Every intermediate result fits in a 32-bit integer"],
        signature: { name: "evalRpn", params: [{ name: "tokens", type: "string[]" }], returns: "int" },
        examples: [
            { input: [["2", "1", "+", "3", "*"]], output: 9, explanation: "(2 + 1) * 3." },
            { input: [["4", "13", "5", "/", "+"]], output: 6, explanation: "4 + (13 / 5)." },
            { input: [["10", "6", "9", "3", "+", "-11", "*", "/", "*", "17", "+", "5", "+"]], output: 22 },
        ],
        hidden: [
            { label: "a single number", input: [["42"]] },
            { label: "negative operands", input: [["-7", "2", "/"]] },
            { label: "truncation toward zero", input: [["7", "-2", "/"]] },
            { label: "subtraction order", input: [["3", "10", "-"]] },
            { label: "a long chain of additions", input: [["1", ...range(3_000).flatMap(() => ["1", "+"])]] },
            { label: "a long alternating chain", input: [["2", ...range(2_000).flatMap((i) => ["1", i % 2 === 0 ? "+" : "-"])]] },
        ],
        hints: [
            "In this notation an operator applies to the two values just before it. What structure gives you the most recent values first?",
            "Use a stack. Push numbers. When you see an operator, pop two values, apply the operator, and push the result.",
            "Mind the order of subtraction and division: the first value popped is the right-hand operand. Division must truncate toward zero (not floor) for negative results.",
        ],
        solution: { approach: "Stack evaluation: push operands; on an operator, pop b then a, push a op b (truncating division).", time: "O(n)", space: "O(n)" },
        reference: String.raw`
def eval_rpn(tokens):
    stack = []
    for token in tokens:
        if token in ("+", "-", "*", "/"):
            b = stack.pop()
            a = stack.pop()
            if token == "+":
                stack.append(a + b)
            elif token == "-":
                stack.append(a - b)
            elif token == "*":
                stack.append(a * b)
            else:
                q = abs(a) // abs(b)
                stack.append(q if (a < 0) == (b < 0) else -q)
        else:
            stack.append(int(token))
    return stack[0]
`,
    },
    {
        key: "decode-string",
        title: "Decode String",
        difficulty: "medium",
        tags: ["stack", "string", "recursion"],
        statement:
            "An encoded string follows the rule k[text], meaning the text inside the brackets is repeated exactly k times. Encodings can be nested, and there may be plain letters between them. Given a valid encoded string, return the decoded string. The input has no stray whitespace, and the digits only ever appear as repeat counts.",
        constraints: ["1 <= s.length <= 100", "s contains lowercase letters, digits and square brackets", "1 <= k <= 300", "The decoded length is at most 100000"],
        signature: { name: "decodeString", params: [{ name: "s", type: "string" }], returns: "string" },
        examples: [
            { input: ["3[a]2[bc]"], output: "aaabcbc" },
            { input: ["3[a2[c]]"], output: "accaccacc" },
            { input: ["2[abc]3[cd]ef"], output: "abcabccdcdcdef" },
        ],
        hidden: [
            { label: "no brackets", input: ["abc"] },
            { label: "a multi-digit count", input: ["12[xy]"] },
            { label: "deep nesting", input: ["2[a2[b2[c2[d]]]]"] },
            { label: "text around brackets", input: ["ab3[c]de2[f]"] },
            { label: "adjacent groups", input: ["2[a]2[b]2[c]"] },
            { label: "a large expansion", input: ["100[10[ab]5[cde]]"] },
            { label: "the count then a single letter", input: ["300[z]"] },
        ],
        hints: [
            "The nesting means inner groups must be finished before the outer ones. What structure handles 'finish the most recent thing first'?",
            "Use a stack. When you meet '[', remember the text built so far and the repeat count, then start fresh for the inside.",
            "When you meet ']', pop the saved text and count: the new current text is saved + current repeated count times. Remember counts can have several digits.",
        ],
        solution: { approach: "Stack of (previous text, repeat count): on ']' combine them, on '[' push, digits accumulate into the count.", time: "O(length of the decoded string)", space: "O(length of the decoded string)" },
        reference: String.raw`
def decode_string(s):
    stack = []
    current = ""
    count = 0
    for ch in s:
        if ch.isdigit():
            count = count * 10 + int(ch)
        elif ch == "[":
            stack.append((current, count))
            current, count = "", 0
        elif ch == "]":
            previous, repeat = stack.pop()
            current = previous + current * repeat
        else:
            current += ch
    return current
`,
    },
    {
        key: "gas-station",
        title: "Gas Station",
        difficulty: "medium",
        tags: ["greedy", "array"],
        statement:
            "There are n gas stations around a circular route. Station i has gas[i] fuel, and driving from station i to the next one costs cost[i] fuel. Starting with an empty tank at some station, you fill up there and drive clockwise. Return the index of the station to start from to complete the full circle, or minus one if it cannot be done. If a solution exists, it is unique.",
        constraints: ["1 <= n <= 100000", "0 <= gas[i], cost[i] <= 1000000", "If a solution exists it is unique"],
        signature: { name: "canCompleteCircuit", params: [{ name: "gas", type: "int[]" }, { name: "cost", type: "int[]" }], returns: "int" },
        examples: [
            { input: [[1, 2, 3, 4, 5], [3, 4, 5, 1, 2]], output: 3 },
            { input: [[2, 3, 4], [3, 4, 3]], output: -1 },
        ],
        hidden: [
            { label: "one station, enough fuel", input: [[5], [4]] },
            { label: "one station, not enough", input: [[3], [4]] },
            { label: "the start is the last station", input: [[1, 1, 5], [3, 3, 1]] },
            { label: "total fuel equals total cost", input: [[3, 1, 1], [1, 2, 2]] },
            { label: "large circuit, exactly enough fuel", input: [circuitGas, circuitCost] },
            { label: "large circuit with too little fuel", input: [randInts(342, 60_000, 0, 5_000), randInts(343, 60_000, 5_001, 10_000)] },
        ],
        hints: [
            "If the total fuel is less than the total cost, no start works. Otherwise a start exists.",
            "Try starting at station 0 and keep a running tank. What does it mean if the tank goes negative at station i?",
            "If the tank goes negative at i, none of the stations from the current start through i can be a valid start. Restart from i + 1 with an empty tank. The last restart point is the answer when total fuel is at least total cost.",
        ],
        solution: { approach: "One pass: track the running tank and the total surplus; reset the start whenever the tank goes negative.", time: "O(n)", space: "O(1)" },
        reference: String.raw`
def can_complete_circuit(gas, cost):
    total = 0
    tank = 0
    start = 0
    for i in range(len(gas)):
        gain = gas[i] - cost[i]
        total += gain
        tank += gain
        if tank < 0:
            start = i + 1
            tank = 0
    return start if total >= 0 else -1
`,
    },
    {
        key: "partition-labels",
        title: "Partition Labels",
        difficulty: "medium",
        tags: ["greedy", "hash-map", "two-pointers", "string"],
        statement:
            "Split a string into as many parts as possible so that each letter appears in at most one part. Return the sizes of the parts, in order.",
        constraints: ["1 <= s.length <= 500", "s consists of lowercase English letters"],
        signature: { name: "partitionLabels", params: [{ name: "s", type: "string" }], returns: "int[]" },
        examples: [
            { input: ["ababcbacadefegdehijhklij"], output: [9, 7, 8], explanation: "ababcbaca, defegde and hijhklij." },
            { input: ["eccbbbbdec"], output: [10] },
        ],
        hidden: [
            { label: "one letter", input: ["a"] },
            { label: "all different letters", input: ["abcdef"] },
            { label: "the same letter twice at the ends", input: ["abcda"] },
            { label: "nested spans", input: ["aebbcdcea"] },
            { label: "repeated single letters", input: ["aaabbbccc"] },
            { label: "large random", input: [lettersOnly(351, 500, "abcdefghij")] },
        ],
        hints: [
            "A letter forces everything from its first to its last occurrence into one part. What does that do to other letters inside that span?",
            "First record the last index of each letter. Then scan, tracking the furthest last index of any letter seen in the current part.",
            "When the scan index reaches that furthest index, the part is complete: record its length and start a new part.",
        ],
        solution: { approach: "Record each letter's last position, then extend the current part's end greedily and cut when the index reaches it.", time: "O(n)", space: "O(1)" },
        reference: String.raw`
def partition_labels(s):
    last = {ch: i for i, ch in enumerate(s)}
    sizes = []
    start = end = 0
    for i, ch in enumerate(s):
        end = max(end, last[ch])
        if i == end:
            sizes.append(end - start + 1)
            start = i + 1
    return sizes
`,
    },
    {
        key: "spiral-matrix",
        title: "Spiral Matrix",
        difficulty: "medium",
        tags: ["matrix", "array"],
        statement: "Given a matrix of integers, return all of its elements in spiral order, starting at the top-left and going clockwise.",
        constraints: ["1 <= rows, columns <= 100", "-100 <= matrix[i][j] <= 100"],
        signature: { name: "spiralOrder", params: [{ name: "matrix", type: "int[][]" }], returns: "int[]" },
        examples: [
            { input: [[[1, 2, 3], [4, 5, 6], [7, 8, 9]]], output: [1, 2, 3, 6, 9, 8, 7, 4, 5] },
            { input: [[[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]]], output: [1, 2, 3, 4, 8, 12, 11, 10, 9, 5, 6, 7] },
        ],
        hidden: [
            { label: "one element", input: [[[7]]] },
            { label: "a single row", input: [[[1, 2, 3, 4]]] },
            { label: "a single column", input: [[[1], [2], [3]]] },
            { label: "a tall matrix", input: [[[1, 2], [3, 4], [5, 6], [7, 8]]] },
            { label: "a wide matrix", input: [[[1, 2, 3, 4, 5], [6, 7, 8, 9, 10]]] },
            { label: "a large square", input: [cellGrid(361, 100, 100, 100)] },
            { label: "a large rectangle", input: [cellGrid(362, 37, 100, 100)] },
        ],
        hints: [
            "The spiral peels the matrix layer by layer: the top row, the right column, the bottom row, the left column, then the inner matrix.",
            "Keep four boundaries: top, bottom, left and right. After walking each side, move that boundary inwards.",
            "Be careful with a single remaining row or column: after walking the top row and right column, check that the boundaries have not crossed before walking back along the bottom and left.",
        ],
        solution: { approach: "Walk the four sides of the current layer, shrinking top, right, bottom and left boundaries, checking they have not crossed.", time: "O(rows x cols)", space: "O(1) extra" },
        reference: String.raw`
def spiral_order(matrix):
    result = []
    top, bottom = 0, len(matrix) - 1
    left, right = 0, len(matrix[0]) - 1
    while top <= bottom and left <= right:
        for c in range(left, right + 1):
            result.append(matrix[top][c])
        for r in range(top + 1, bottom + 1):
            result.append(matrix[r][right])
        if top < bottom and left < right:
            for c in range(right - 1, left - 1, -1):
                result.append(matrix[bottom][c])
            for r in range(bottom - 1, top, -1):
                result.append(matrix[r][left])
        top += 1
        bottom -= 1
        left += 1
        right -= 1
    return result
`,
    },
    {
        key: "valid-sudoku",
        title: "Valid Sudoku",
        difficulty: "medium",
        tags: ["matrix", "hash-set", "array"],
        statement:
            "Determine whether a 9 by 9 Sudoku board is valid so far. Only the filled cells are checked: each row, each column and each of the nine 3 by 3 boxes must contain the digits 1 to 9 at most once each. Empty cells are written as a full stop. The board does not have to be solvable.",
        constraints: ["The board is 9 by 9", "Each cell is a digit from 1 to 9 or a full stop"],
        signature: { name: "isValidSudoku", params: [{ name: "board", type: "string[][]" }], returns: "bool" },
        examples: [
            { input: [sudoku(["53..7....", "6..195...", ".98....6.", "8...6...3", "4..8.3..1", "7...2...6", ".6....28.", "...419..5", "....8..79"])], output: true },
            { input: [sudoku(["83..7....", "6..195...", ".98....6.", "8...6...3", "4..8.3..1", "7...2...6", ".6....28.", "...419..5", "....8..79"])], output: false, explanation: "There are two 8s in the first column." },
        ],
        hidden: [
            { label: "an empty board", input: [sudoku(Array(9).fill("........."))] },
            { label: "a completed valid board", input: [sudoku(SOLVED_SUDOKU)] },
            { label: "a duplicate in a row", input: [sudoku(["55.......", ".........", ".........", ".........", ".........", ".........", ".........", ".........", "........."])] },
            { label: "a duplicate in a box only", input: [sudoku(["1........", ".1.......", ".........", ".........", ".........", ".........", ".........", ".........", "........."])] },
            { label: "a duplicate in a column only", input: [sudoku(["..9......", ".........", ".........", ".........", "..9......", ".........", ".........", ".........", "........."])] },
            { label: "a solved board with one changed digit", input: [sudoku(SOLVED_SUDOKU.map((row, i) => (i === 4 ? "426853791".replace("9", "3") : row)))] },
        ],
        hints: [
            "There are three kinds of group to check: rows, columns and boxes. For each, you only need to know whether a digit has been seen before.",
            "Keep a set of seen digits for each row, each column and each box.",
            "The box for cell (r, c) is (r // 3, c // 3). For each filled cell, return false if its digit is already in its row set, column set or box set; otherwise add it to all three.",
        ],
        solution: { approach: "One pass with sets of seen digits per row, column and box.", time: "O(81)", space: "O(81)" },
        reference: String.raw`
def is_valid_sudoku(board):
    rows = [set() for _ in range(9)]
    cols = [set() for _ in range(9)]
    boxes = [set() for _ in range(9)]
    for r in range(9):
        for c in range(9):
            d = board[r][c]
            if d == ".":
                continue
            b = (r // 3) * 3 + c // 3
            if d in rows[r] or d in cols[c] or d in boxes[b]:
                return False
            rows[r].add(d)
            cols[c].add(d)
            boxes[b].add(d)
    return True
`,
    },
    {
        key: "counting-bits",
        title: "Counting Bits",
        difficulty: "medium",
        tags: ["dynamic-programming", "bit-manipulation"],
        statement:
            "Given a non-negative integer n, return an array of length n plus one where the entry at index i is the number of 1 bits in the binary representation of i. Aim for linear time, without counting the bits of every number separately.",
        constraints: ["0 <= n <= 100000"],
        signature: { name: "countBits", params: [{ name: "n", type: "int" }], returns: "int[]" },
        examples: [
            { input: [2], output: [0, 1, 1] },
            { input: [5], output: [0, 1, 1, 2, 1, 2] },
        ],
        hidden: [
            { label: "zero", input: [0] },
            { label: "one", input: [1] },
            { label: "just past a power of two", input: [17] },
            { label: "a power of two", input: [64] },
            { label: "a large n", input: [100_000] },
            { label: "one below a power of two", input: [65_535] },
        ],
        hints: [
            "The bit count of a number is closely related to the bit count of a smaller number you have already computed.",
            "Shifting a number right by one drops its lowest bit. So bits(i) = bits(i >> 1) + (i & 1).",
            "Fill the answer array from 0 up to n, using ans[i] = ans[i >> 1] + (i & 1).",
        ],
        solution: { approach: "Dynamic programming on bits: ans[i] = ans[i >> 1] + (i & 1).", time: "O(n)", space: "O(n)" },
        reference: String.raw`
def count_bits(n):
    ans = [0] * (n + 1)
    for i in range(1, n + 1):
        ans[i] = ans[i >> 1] + (i & 1)
    return ans
`,
    },
    {
        key: "maximum-product-subarray",
        title: "Maximum Product Subarray",
        difficulty: "medium",
        tags: ["dynamic-programming", "array"],
        statement:
            "Given an array of integers, find the contiguous non-empty subarray with the largest product, and return that product. The answer always fits in a 32-bit integer.",
        constraints: ["1 <= nums.length <= 100000", "-2 <= nums[i] <= 2", "The product of any subarray fits in a 32-bit integer"],
        signature: { name: "maxProduct", params: [{ name: "nums", type: "int[]" }], returns: "int" },
        examples: [
            { input: [[2, 3, -2, 4]], output: 6 },
            { input: [[-2, 0, -1]], output: 0 },
        ],
        hidden: [
            { label: "one negative number", input: [[-3 + 1]] },
            { label: "two negatives make a positive", input: [[-2, -2]] },
            { label: "a zero splits the array", input: [[2, 2, 0, 2]] },
            { label: "the best subarray skips the first element", input: [[-1, 2, 2, -1, -2]] },
            { label: "all negatives, odd count", input: [[-1, -2, -1, -2, -1]] },
            { label: "large array of ones and zeros", input: [randInts(371, 100_000, -1, 1)] },
            { label: "large with occasional twos", input: [randInts(372, 100_000, -1, 1).map((v, i) => (i % 5000 === 0 ? 2 : v))] },
        ],
        hints: [
            "A negative number can turn the smallest product into the largest one. What do you need to keep besides the maximum?",
            "Track both the maximum and the minimum product of a subarray ending at the current position.",
            "For each new x, the candidates are x itself, x times the previous maximum, and x times the previous minimum. Update both, and keep the best maximum seen.",
        ],
        solution: { approach: "Track the max and min product ending at each position (a negative flips them); keep the best max.", time: "O(n)", space: "O(1)" },
        reference: String.raw`
def max_product(nums):
    best = high = low = nums[0]
    for x in nums[1:]:
        candidates = (x, high * x, low * x)
        high, low = max(candidates), min(candidates)
        best = max(best, high)
    return best
`,
    },
    {
        key: "subarray-product-less-than-k",
        title: "Subarray Product Less Than K",
        difficulty: "medium",
        tags: ["sliding-window", "two-pointers", "array"],
        statement:
            "Given an array of positive integers and an integer k, return the number of contiguous subarrays whose product is strictly less than k.",
        constraints: ["1 <= nums.length <= 30000", "1 <= nums[i] <= 1000", "0 <= k <= 1000000"],
        signature: { name: "numSubarrayProductLessThanK", params: [{ name: "nums", type: "int[]" }, { name: "k", type: "int" }], returns: "int" },
        examples: [
            { input: [[10, 5, 2, 6], 100], output: 8 },
            { input: [[1, 2, 3], 0], output: 0 },
        ],
        hidden: [
            { label: "k is one", input: [[1, 1, 1], 1] },
            { label: "every element is too big", input: [[50, 60, 70], 10] },
            { label: "every element fits", input: [[1, 1, 1, 1], 2] },
            { label: "one element", input: [[5], 6] },
            { label: "large array of ones", input: [Array(30_000).fill(1), 2] },
            { label: "large random", input: [randInts(381, 30_000, 1, 20), 1_000_000] },
            { label: "large random, small k", input: [randInts(382, 30_000, 1, 1000), 5_000] },
        ],
        hints: [
            "All numbers are positive, so a longer window never has a smaller product. That makes a two-pointer approach possible.",
            "Keep a window [left, right] and its product. When the product reaches k or more, move left forward, dividing it out.",
            "Each time the window is valid after adding nums[right], every subarray ending at right and starting inside the window counts: that is right - left + 1 new subarrays.",
        ],
        solution: { approach: "Sliding window with a running product; add (right - left + 1) for each right endpoint.", time: "O(n)", space: "O(1)" },
        reference: String.raw`
def num_subarray_product_less_than_k(nums, k):
    if k <= 1:
        return 0
    count = 0
    product = 1
    left = 0
    for right, value in enumerate(nums):
        product *= value
        while product >= k:
            product //= nums[left]
            left += 1
        count += right - left + 1
    return count
`,
    },
    {
        key: "autocomplete-counts",
        title: "Autocomplete Counts",
        difficulty: "medium",
        tags: ["string", "trie", "sorting", "binary-search", "hash-map"],
        statement:
            "A search box suggests completions from a dictionary. You are given the dictionary's words (which may repeat) and a list of typed prefixes. For each prefix, return how many dictionary entries start with it. A word counts as starting with itself.",
        constraints: ["1 <= words.length <= 100000", "1 <= prefixes.length <= 100000", "Words and prefixes consist of lowercase letters, up to 20 characters"],
        signature: { name: "prefixCounts", params: [{ name: "words", type: "string[]" }, { name: "prefixes", type: "string[]" }], returns: "int[]" },
        examples: [
            { input: [["apple", "app", "apply", "ape", "bat"], ["ap", "app", "b", "c"]], output: [4, 3, 1, 0] },
            { input: [["a", "a", "ab"], ["a", "ab", "abc"]], output: [3, 1, 0] },
        ],
        hidden: [
            { label: "an empty result", input: [["cat"], ["dog"]] },
            { label: "a prefix longer than any word", input: [["go"], ["gopher"]] },
            { label: "the prefix equals a word", input: [["tree", "tree", "trees"], ["tree"]] },
            { label: "single letters", input: [["a", "b", "ab", "ba", "aa"], ["a", "b"]] },
            { label: "large dictionary and queries", input: [words(391, 60_000, 12, 4), words(392, 60_000, 5, 4)] },
            { label: "large dictionary, long prefixes", input: [words(393, 80_000, 20, 3), words(394, 40_000, 8, 3)] },
        ],
        hints: [
            "Every word that starts with a prefix shares those first letters. What structure stores words so that shared beginnings are stored once?",
            "A trie: each node has children by letter and a count of how many words pass through it. Inserting a word increments the count along its path.",
            "To answer a prefix, walk the trie letter by letter and return the count at the last node (0 if the path breaks). Sorting the words and binary searching the range of the prefix also works.",
        ],
        solution: { approach: "A trie with a pass-through count per node, or sorted words with two binary searches per prefix.", time: "O(total length of words + prefixes)", space: "O(total length of words)" },
        reference: String.raw`
def prefix_counts(words, prefixes):
    trie = {}
    for word in words:
        node = trie
        for ch in word:
            node = node.setdefault(ch, {})
            node["#"] = node.get("#", 0) + 1
    result = []
    for prefix in prefixes:
        node = trie
        for ch in prefix:
            node = node.get(ch)
            if node is None:
                break
        if node is None:
            result.append(0)
        elif prefix:
            result.append(node["#"])
        else:
            result.append(len(words))
    return result
`,
    },
    {
        key: "longest-repeating-character-replacement",
        title: "Longest Repeating Character Replacement",
        difficulty: "medium",
        tags: ["string", "sliding-window", "hash-map"],
        statement:
            "You are given a string of capital letters and an integer k. You may replace at most k characters, each with any other capital letter. Return the length of the longest substring that can be made of a single repeated letter using those replacements.",
        constraints: ["1 <= s.length <= 100000", "0 <= k <= s.length", "s consists of capital English letters"],
        signature: { name: "characterReplacement", params: [{ name: "s", type: "string" }, { name: "k", type: "int" }], returns: "int" },
        examples: [
            { input: ["ABAB", 2], output: 4 },
            { input: ["AABABBA", 1], output: 4 },
        ],
        hidden: [
            { label: "no replacements allowed", input: ["AABBBCC", 0] },
            { label: "one character", input: ["Z", 5] },
            { label: "k covers everything", input: ["ABCDE", 4] },
            { label: "all the same letter", input: [repeat("Q", 1000), 3] },
            { label: "large random, small k", input: [lettersOnly(401, 100_000, "ABC"), 5] },
            { label: "large random, large k", input: [lettersOnly(402, 100_000, "ABCDEFGH"), 20_000] },
        ],
        hints: [
            "For a window, the fewest replacements needed is the window length minus the count of its most common letter.",
            "Slide a window: expand right, tracking letter counts and the highest count seen in the window.",
            "If length - maxCount exceeds k, move the left edge forward by one. The window never needs to shrink below the best length found, so the answer is the final window size.",
        ],
        solution: { approach: "Sliding window keeping letter counts; the window is valid while length - maxCount <= k.", time: "O(n)", space: "O(1)" },
        reference: String.raw`
def character_replacement(s, k):
    counts = [0] * 26
    best = 0
    left = 0
    most = 0
    for right, ch in enumerate(s):
        counts[ord(ch) - 65] += 1
        most = max(most, counts[ord(ch) - 65])
        while (right - left + 1) - most > k:
            counts[ord(s[left]) - 65] -= 1
            left += 1
        best = max(best, right - left + 1)
    return best
`,
    },
];
