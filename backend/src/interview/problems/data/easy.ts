import type { ProblemDef } from "../types";
import { distinctInts, randInts, randString, range, repeat, uniqueTwoSum } from "./helpers";

const [bigTwoSum, bigTwoSumTarget] = uniqueTwoSum(11, 100_000, [37, 99_950]);
const [nearEndTwoSum, nearEndTarget] = uniqueTwoSum(12, 60_000, [59_998, 59_999]);
const sortedBig = range(100_000).map((i) => i * 3 - 50_000);

export const easyProblems: ProblemDef[] = [
    {
        key: "two-sum",
        title: "Two Sum",
        difficulty: "easy",
        tags: ["array", "hash-map"],
        statement:
            "Given an array of integers called nums and an integer called target, return the indices of the two different elements whose values add up to the target. Exactly one such pair exists, and you may not use the same element twice. The indices may be returned in any order.",
        constraints: ["2 <= nums.length <= 100000", "-10^9 <= nums[i] <= 10^9", "Exactly one valid pair exists"],
        signature: { name: "twoSum", params: [{ name: "nums", type: "int[]" }, { name: "target", type: "int" }], returns: "int[]" },
        examples: [
            { input: [[2, 7, 11, 15], 9], output: [0, 1], explanation: "nums[0] + nums[1] = 2 + 7 = 9." },
            { input: [[3, 2, 4], 6], output: [1, 2] },
        ],
        hidden: [
            { label: "smallest input", input: [[1, 2], 3] },
            { label: "negative numbers", input: [[-3, 4, 3, 90], 0] },
            { label: "duplicate values", input: [[3, 3], 6] },
            { label: "pair at the two ends", input: [[1, 5, 8, 12, 4, 20], 21] },
            { label: "extreme values", input: [[1000000000, -1000000000, 7, 42], 0] },
            { label: "large input", input: [bigTwoSum, bigTwoSumTarget] },
            { label: "large input, pair at the end", input: [nearEndTwoSum, nearEndTarget] },
        ],
        compare: "unordered",
        hints: [
            "For each number, what other number would complete the sum? How could you check for it quickly?",
            "A hash map from value to index lets you look up the complement in constant time as you scan.",
            "Scan once. For each nums[i], check whether target - nums[i] is already in the map; if so you are done, otherwise store nums[i].",
        ],
        solution: { approach: "One pass with a hash map from value to index, looking up target minus the current value.", time: "O(n)", space: "O(n)" },
        reference: String.raw`
def two_sum(nums, target):
    seen = {}
    for i, n in enumerate(nums):
        if target - n in seen:
            return [seen[target - n], i]
        seen[n] = i
    return []
`,
    },
    {
        key: "valid-parentheses",
        title: "Valid Parentheses",
        difficulty: "easy",
        tags: ["string", "stack"],
        statement:
            "Given a string s containing only the characters round, square and curly brackets, determine whether it is valid. A string is valid if every opening bracket is closed by the same type of bracket, and brackets are closed in the correct order.",
        constraints: ["1 <= s.length <= 100000", "s consists only of ( ) [ ] { }"],
        signature: { name: "isValid", params: [{ name: "s", type: "string" }], returns: "bool" },
        examples: [
            { input: ["()[]{}"], output: true },
            { input: ["(]"], output: false, explanation: "The round bracket is closed by a square one." },
        ],
        hidden: [
            { label: "single pair", input: ["()"] },
            { label: "nested", input: ["{[()]}"] },
            { label: "interleaved", input: ["([)]"] },
            { label: "only opening brackets", input: ["((("] },
            { label: "only closing brackets", input: ["))"] },
            { label: "unbalanced tail", input: ["()("] },
            { label: "closing before opening", input: [")("] },
            { label: "large valid input", input: [repeat("(", 50_000) + repeat(")", 50_000)] },
            { label: "large invalid input", input: [repeat("[", 49_999) + "{" + repeat("]", 50_000)] },
        ],
        hints: [
            "The most recent unclosed opening bracket must be the next one to be closed. What structure gives you 'most recent first'?",
            "Use a stack: push opening brackets, and when you see a closing one, compare it to the top.",
            "Return false if the stack is empty on a closing bracket, or the top does not match. At the end the stack must be empty.",
        ],
        solution: { approach: "Stack of open brackets; each closing bracket must match the top, and the stack must end empty.", time: "O(n)", space: "O(n)" },
        reference: String.raw`
def is_valid(s):
    pairs = {')': '(', ']': '[', '}': '{'}
    stack = []
    for c in s:
        if c in pairs:
            if not stack or stack.pop() != pairs[c]:
                return False
        else:
            stack.append(c)
    return not stack
`,
    },
    {
        key: "best-time-to-buy-and-sell-stock",
        title: "Best Time to Buy and Sell Stock",
        difficulty: "easy",
        tags: ["array", "greedy", "dynamic-programming"],
        statement:
            "You are given an array prices where prices[i] is the price of a stock on day i. You may buy on one day and sell on a later day. Return the maximum profit you can make, or zero if no profit is possible.",
        constraints: ["1 <= prices.length <= 100000", "0 <= prices[i] <= 10000"],
        signature: { name: "maxProfit", params: [{ name: "prices", type: "int[]" }], returns: "int" },
        examples: [
            { input: [[7, 1, 5, 3, 6, 4]], output: 5, explanation: "Buy at 1, sell at 6." },
            { input: [[7, 6, 4, 3, 1]], output: 0, explanation: "Prices only fall, so do not trade." },
        ],
        hidden: [
            { label: "single day", input: [[5]] },
            { label: "strictly increasing", input: [[1, 2, 3, 4, 5]] },
            { label: "peak before the low", input: [[3, 10, 1, 2]] },
            { label: "flat prices", input: [[2, 2, 2, 2]] },
            { label: "best trade is first to last", input: [[1, 9, 5, 3, 10]] },
            { label: "large input", input: [randInts(21, 100_000, 0, 10_000)] },
        ],
        hints: [
            "For a fixed selling day, which buying day is best?",
            "Track the lowest price seen so far as you scan.",
            "At each day, profit is price minus the running minimum; keep the best profit seen.",
        ],
        solution: { approach: "Single pass tracking the running minimum price and the best profit so far.", time: "O(n)", space: "O(1)" },
        reference: String.raw`
def max_profit(prices):
    best = 0
    low = prices[0]
    for p in prices:
        low = min(low, p)
        best = max(best, p - low)
    return best
`,
    },
    {
        key: "contains-duplicate",
        title: "Contains Duplicate",
        difficulty: "easy",
        tags: ["array", "hash-set", "sorting"],
        statement: "Given an integer array nums, return true if any value appears at least twice in the array, and false if every element is distinct.",
        constraints: ["1 <= nums.length <= 100000", "-10^9 <= nums[i] <= 10^9"],
        signature: { name: "containsDuplicate", params: [{ name: "nums", type: "int[]" }], returns: "bool" },
        examples: [
            { input: [[1, 2, 3, 1]], output: true },
            { input: [[1, 2, 3, 4]], output: false },
        ],
        hidden: [
            { label: "single element", input: [[7]] },
            { label: "two equal elements", input: [[4, 4]] },
            { label: "negative duplicates", input: [[-5, 3, -5]] },
            { label: "duplicate at the far end", input: [[...distinctInts(31, 99_999, -1_000_000_000, 1_000_000_000), 0]] },
            { label: "large all distinct", input: [distinctInts(32, 100_000, -1_000_000_000, 1_000_000_000)] },
        ],
        hints: [
            "The simplest check compares every pair. Can you avoid that?",
            "Remember what you have already seen. A set answers 'seen before?' quickly.",
            "Return true the first time an element is already in the set; otherwise add it.",
        ],
        solution: { approach: "Hash set of seen values, or sort and compare neighbours.", time: "O(n)", space: "O(n)" },
        reference: String.raw`
def contains_duplicate(nums):
    seen = set()
    for n in nums:
        if n in seen:
            return True
        seen.add(n)
    return False
`,
    },
    {
        key: "valid-anagram",
        title: "Valid Anagram",
        difficulty: "easy",
        tags: ["string", "hash-map", "sorting"],
        statement: "Given two strings s and t, return true if t is an anagram of s, meaning it uses exactly the same letters the same number of times, and false otherwise.",
        constraints: ["1 <= s.length, t.length <= 50000", "s and t consist of lowercase English letters"],
        signature: { name: "isAnagram", params: [{ name: "s", type: "string" }, { name: "t", type: "string" }], returns: "bool" },
        examples: [
            { input: ["anagram", "nagaram"], output: true },
            { input: ["rat", "car"], output: false },
        ],
        hidden: [
            { label: "different lengths", input: ["ab", "abc"] },
            { label: "same letters, different counts", input: ["aacc", "ccac"] },
            { label: "single character", input: ["a", "a"] },
            { label: "single different character", input: ["a", "b"] },
            { label: "large anagram", input: [randString(41, 50_000, "abcdefghijklmnopqrstuvwxyz"), randString(41, 50_000, "abcdefghijklmnopqrstuvwxyz").split("").reverse().join("")] },
            { label: "large near-miss", input: [repeat("a", 49_999) + "b", repeat("a", 50_000)] },
        ],
        hints: [
            "Two strings are anagrams exactly when their letter counts match.",
            "Count letters of s, then subtract letters of t.",
            "If the lengths differ, return false immediately. Otherwise every count must end at zero.",
        ],
        solution: { approach: "Compare letter frequency tables (26 counters), or sort both strings.", time: "O(n)", space: "O(1)" },
        reference: String.raw`
def is_anagram(s, t):
    if len(s) != len(t):
        return False
    counts = {}
    for c in s:
        counts[c] = counts.get(c, 0) + 1
    for c in t:
        counts[c] = counts.get(c, 0) - 1
        if counts[c] < 0:
            return False
    return True
`,
    },
    {
        key: "binary-search",
        title: "Binary Search",
        difficulty: "easy",
        tags: ["array", "binary-search"],
        statement:
            "Given an array of distinct integers nums sorted in ascending order and an integer target, return the index of target in nums, or minus one if it is not present. Your solution must run in logarithmic time.",
        constraints: ["1 <= nums.length <= 100000", "nums is sorted ascending with distinct values"],
        signature: { name: "search", params: [{ name: "nums", type: "int[]" }, { name: "target", type: "int" }], returns: "int" },
        examples: [
            { input: [[-1, 0, 3, 5, 9, 12], 9], output: 4 },
            { input: [[-1, 0, 3, 5, 9, 12], 2], output: -1 },
        ],
        hidden: [
            { label: "single element found", input: [[5], 5] },
            { label: "single element missing", input: [[5], 3] },
            { label: "smaller than everything", input: [[2, 4, 6, 8], 1] },
            { label: "larger than everything", input: [[2, 4, 6, 8], 9] },
            { label: "first element", input: [[2, 4, 6, 8], 2] },
            { label: "last element", input: [[2, 4, 6, 8], 8] },
            { label: "large input, present", input: [sortedBig, sortedBig[73_211]!] },
            { label: "large input, absent", input: [sortedBig, 1] },
        ],
        hints: [
            "Because the array is sorted, one comparison can rule out half of it.",
            "Keep a low and high pointer and look at the middle element.",
            "If the middle is too small move low up; if too large move high down; watch for off-by-one when updating.",
        ],
        solution: { approach: "Classic binary search on a closed interval.", time: "O(log n)", space: "O(1)" },
        reference: String.raw`
def search(nums, target):
    lo, hi = 0, len(nums) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if nums[mid] == target:
            return mid
        if nums[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1
`,
    },
    {
        key: "merge-sorted-arrays",
        title: "Merge Two Sorted Arrays",
        difficulty: "easy",
        tags: ["array", "two-pointers"],
        statement: "Given two integer arrays a and b, each sorted in ascending order, return a single array containing all their elements in ascending order.",
        constraints: ["0 <= a.length, b.length <= 50000", "Both arrays are sorted ascending and may contain duplicates"],
        signature: { name: "mergeSorted", params: [{ name: "a", type: "int[]" }, { name: "b", type: "int[]" }], returns: "int[]" },
        examples: [
            { input: [[1, 3, 5], [2, 4, 6]], output: [1, 2, 3, 4, 5, 6] },
            { input: [[], [1]], output: [1] },
        ],
        hidden: [
            { label: "both empty", input: [[], []] },
            { label: "duplicates across arrays", input: [[1, 2, 2], [2, 2, 3]] },
            { label: "all of a before b", input: [[1, 2, 3], [4, 5, 6]] },
            { label: "all of b before a", input: [[7, 8], [1, 2]] },
            { label: "negative numbers", input: [[-5, -1, 0], [-4, -3, 2]] },
            { label: "large input", input: [randInts(51, 50_000, -1_000_000, 1_000_000).sort((x, y) => x - y), randInts(52, 50_000, -1_000_000, 1_000_000).sort((x, y) => x - y)] },
        ],
        hints: [
            "You do not need to sort again: both inputs are already sorted.",
            "Keep one pointer in each array and always take the smaller current element.",
            "When one array runs out, append what remains of the other.",
        ],
        solution: { approach: "Two-pointer merge, as in merge sort.", time: "O(n + m)", space: "O(n + m)" },
        reference: String.raw`
def merge_sorted(a, b):
    out = []
    i = j = 0
    while i < len(a) and j < len(b):
        if a[i] <= b[j]:
            out.append(a[i]); i += 1
        else:
            out.append(b[j]); j += 1
    out.extend(a[i:])
    out.extend(b[j:])
    return out
`,
    },
    {
        key: "longest-common-prefix",
        title: "Longest Common Prefix",
        difficulty: "easy",
        tags: ["string"],
        statement: "Given an array of strings strs, return the longest string that is a prefix of every string in the array. If there is no common prefix, return an empty string.",
        constraints: ["1 <= strs.length <= 200", "0 <= strs[i].length <= 200", "Lowercase English letters only"],
        signature: { name: "longestCommonPrefix", params: [{ name: "strs", type: "string[]" }], returns: "string" },
        examples: [
            { input: [["flower", "flow", "flight"]], output: "fl" },
            { input: [["dog", "racecar", "car"]], output: "", explanation: "There is no common prefix." },
        ],
        hidden: [
            { label: "single string", input: [["alone"]] },
            { label: "identical strings", input: [["same", "same", "same"]] },
            { label: "contains an empty string", input: [["abc", "", "abd"]] },
            { label: "prefix is the shortest string", input: [["ab", "abc", "abcd"]] },
            { label: "differ at the first letter", input: [["xa", "ya"]] },
            { label: "long strings", input: [[repeat("a", 200), repeat("a", 199) + "b", repeat("a", 150) + "c"]] },
        ],
        hints: [
            "The common prefix can never be longer than the shortest string.",
            "Compare all strings one character position at a time.",
            "Stop at the first position where any string differs or ends.",
        ],
        solution: { approach: "Scan columns left to right until a mismatch or the shortest string ends.", time: "O(total characters)", space: "O(1)" },
        reference: String.raw`
def longest_common_prefix(strs):
    prefix = strs[0]
    for s in strs[1:]:
        while not s.startswith(prefix):
            prefix = prefix[:-1]
    return prefix
`,
    },
    {
        key: "climbing-stairs",
        title: "Climbing Stairs",
        difficulty: "easy",
        tags: ["dynamic-programming", "math"],
        statement: "You are climbing a staircase with n steps. Each time you can climb either one or two steps. Return the number of distinct ways you can reach the top.",
        constraints: ["1 <= n <= 45"],
        signature: { name: "climbStairs", params: [{ name: "n", type: "int" }], returns: "int" },
        examples: [
            { input: [2], output: 2, explanation: "1+1 or 2." },
            { input: [3], output: 3, explanation: "1+1+1, 1+2, 2+1." },
        ],
        hidden: [
            { label: "one step", input: [1] },
            { label: "four steps", input: [4] },
            { label: "ten steps", input: [10] },
            { label: "twenty steps", input: [20] },
            { label: "the maximum", input: [45] },
        ],
        hints: [
            "Think about the last move: you arrived from step n-1 or n-2.",
            "That means ways(n) = ways(n-1) + ways(n-2). Does that look familiar?",
            "Build it bottom-up keeping only the last two values, or memoise the recursion.",
        ],
        solution: { approach: "Fibonacci recurrence computed iteratively.", time: "O(n)", space: "O(1)" },
        reference: String.raw`
def climb_stairs(n):
    a, b = 1, 1
    for _ in range(n - 1):
        a, b = b, a + b
    return b
`,
    },
    {
        key: "maximum-subarray",
        title: "Maximum Subarray",
        difficulty: "easy",
        tags: ["array", "dynamic-programming", "divide-and-conquer"],
        statement: "Given an integer array nums, find the contiguous subarray containing at least one number that has the largest sum, and return that sum.",
        constraints: ["1 <= nums.length <= 100000", "-1000 <= nums[i] <= 1000"],
        signature: { name: "maxSubArray", params: [{ name: "nums", type: "int[]" }], returns: "int" },
        examples: [
            { input: [[-2, 1, -3, 4, -1, 2, 1, -5, 4]], output: 6, explanation: "The subarray [4, -1, 2, 1] sums to 6." },
            { input: [[1]], output: 1 },
        ],
        hidden: [
            { label: "all negative", input: [[-3, -1, -2]] },
            { label: "all positive", input: [[1, 2, 3, 4]] },
            { label: "best subarray at the end", input: [[-5, -2, 4, 6]] },
            { label: "reset in the middle", input: [[5, -20, 6, 1]] },
            { label: "single negative", input: [[-7]] },
            { label: "large input", input: [randInts(61, 100_000, -100, 100)] },
        ],
        hints: [
            "At each position, is it better to extend the previous subarray or start fresh?",
            "Track the best sum of a subarray ending at the current element.",
            "current = max(x, current + x); the answer is the largest current seen (Kadane's algorithm).",
        ],
        solution: { approach: "Kadane's algorithm: best sum ending here, and the best overall.", time: "O(n)", space: "O(1)" },
        reference: String.raw`
def max_sub_array(nums):
    best = cur = nums[0]
    for x in nums[1:]:
        cur = max(x, cur + x)
        best = max(best, cur)
    return best
`,
    },
    {
        key: "move-zeroes",
        title: "Move Zeroes",
        difficulty: "easy",
        tags: ["array", "two-pointers"],
        statement:
            "Given an integer array nums, move all zeros to the end while keeping the relative order of the non-zero elements, and return the resulting array. Try to do it with a single pass and without allocating a second array.",
        constraints: ["1 <= nums.length <= 100000", "-2^31 <= nums[i] <= 2^31 - 1"],
        signature: { name: "moveZeroes", params: [{ name: "nums", type: "int[]" }], returns: "int[]" },
        examples: [
            { input: [[0, 1, 0, 3, 12]], output: [1, 3, 12, 0, 0] },
            { input: [[0]], output: [0] },
        ],
        hidden: [
            { label: "no zeros", input: [[1, 2, 3]] },
            { label: "all zeros", input: [[0, 0, 0]] },
            { label: "zeros already at the end", input: [[4, 5, 0, 0]] },
            { label: "zeros at the start", input: [[0, 0, 7, 8]] },
            { label: "negative numbers", input: [[-1, 0, -2, 0, 3]] },
            { label: "large input", input: [randInts(71, 100_000, -3, 3)] },
        ],
        hints: [
            "You could collect non-zero values first, then fill the rest with zeros. Can you do it in place?",
            "Keep a write pointer for the next position of a non-zero value.",
            "Scan with a read pointer; whenever you see a non-zero, place it at the write pointer and advance it. Fill the tail with zeros.",
        ],
        solution: { approach: "Two pointers: compact non-zero values forward, then zero-fill the remainder.", time: "O(n)", space: "O(1)" },
        reference: String.raw`
def move_zeroes(nums):
    out = [x for x in nums if x != 0]
    return out + [0] * (len(nums) - len(out))
`,
    },
    {
        key: "valid-palindrome",
        title: "Valid Palindrome",
        difficulty: "easy",
        tags: ["string", "two-pointers"],
        statement:
            "A phrase is a palindrome if, after converting all uppercase letters to lowercase and removing every character that is not a letter or digit, it reads the same forwards and backwards. Given a string s, return true if it is a palindrome and false otherwise.",
        constraints: ["1 <= s.length <= 100000", "s consists of printable ASCII characters"],
        signature: { name: "isPalindrome", params: [{ name: "s", type: "string" }], returns: "bool" },
        examples: [
            { input: ["A man, a plan, a canal: Panama"], output: true, explanation: "It reads amanaplanacanalpanama." },
            { input: ["race a car"], output: false },
        ],
        hidden: [
            { label: "only spaces", input: [" "] },
            { label: "digit and letter", input: ["0P"] },
            { label: "underscore is not alphanumeric", input: ["ab_a"] },
            { label: "single character", input: ["z"] },
            { label: "mixed case", input: ["No lemon, no melon"] },
            { label: "large palindrome", input: [repeat("ab", 25_000) + "c" + repeat("ba", 25_000)] },
            { label: "large near-palindrome", input: [repeat("ab", 25_000) + "c" + repeat("ba", 24_999) + "bb"] },
        ],
        hints: [
            "First decide what to ignore: everything except letters and digits, ignoring case.",
            "Use two pointers moving inward from both ends, skipping characters that do not count.",
            "Compare lower-cased characters at the pointers; any mismatch means false.",
        ],
        solution: { approach: "Two pointers from both ends, skipping non-alphanumeric characters and comparing case-insensitively.", time: "O(n)", space: "O(1)" },
        reference: String.raw`
def is_palindrome(s):
    t = [c.lower() for c in s if c.isalnum() and c.isascii()]
    return t == t[::-1]
`,
    },
];
