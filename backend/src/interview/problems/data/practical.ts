import type { ProblemDef } from "../types";
import { randInt, randInts, range, rng } from "./helpers";

// Problems that look like the work itself: calendars, caches, rate limits, log analysis and ranking. They are the ones a job
// description in scheduling, backend, data or infrastructure points toward.

function shuffled<T>(seed: number, items: T[]): T[] {
    const next = rng(seed);
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [copy[i], copy[j]] = [copy[j]!, copy[i]!];
    }
    return copy;
}

/** Back-to-back meetings that never overlap, in random order. */
const disjointMeetings = (n: number, seed: number) => shuffled(seed, range(n).map((i) => [i * 10, i * 10 + 7]));

const randomMeetings = (seed: number, n: number, span: number, maxLength: number) => {
    const next = rng(seed);
    return Array.from({ length: n }, () => {
        const start = randInt(next, 0, span);
        return [start, start + randInt(next, 1, maxLength)];
    });
};

/** A non-decreasing sequence of request times. */
const requestTimes = (seed: number, n: number, maxGap: number) => {
    const next = rng(seed);
    let t = 0;
    return Array.from({ length: n }, () => (t += randInt(next, 0, maxGap)));
};

const cacheOps = (seed: number, count: number, keys: number) => {
    const next = rng(seed);
    const ops: string[] = [];
    const args: number[][] = [];
    for (let i = 0; i < count; i++) {
        if (next() < 0.55) {
            ops.push("put");
            args.push([randInt(next, 1, keys), randInt(next, 1, 1000)]);
        } else {
            ops.push("get");
            args.push([randInt(next, 1, keys)]);
        }
    }
    return { ops, args };
};
const bigCache = cacheOps(31, 20_000, 100);
const churnCache = cacheOps(32, 20_000, 5_000);

const ipPool = range(400).map((i) => `10.${Math.floor(i / 100)}.${Math.floor(i / 10) % 10}.${i % 10}`);
const accessLog = (seed: number, n: number) => {
    const next = rng(seed);
    const methods = ["GET", "POST", "PUT", "DELETE"];
    const statuses = [200, 200, 200, 201, 204, 301, 404, 500];
    return Array.from({ length: n }, () => `${ipPool[Math.floor(next() * next() * ipPool.length)]} ${methods[randInt(next, 0, 3)]} /api/v1/item/${randInt(next, 1, 99)} ${statuses[randInt(next, 0, statuses.length - 1)]}`);
};

const wordList = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel", "india", "juliet", "kilo", "lima", "mike", "november", "oscar", "papa", "quebec", "romeo", "sierra", "tango"];
const skewedWords = (seed: number, n: number) => {
    const next = rng(seed);
    return Array.from({ length: n }, () => wordList[Math.floor(next() * next() * wordList.length)]!);
};

/** Points whose squared distances from the origin are all different, so "the k closest" has exactly one answer. */
const distinctDistancePoints = (seed: number, n: number) => {
    const next = rng(seed);
    const seen = new Set<number>();
    const points: number[][] = [];
    while (points.length < n) {
        const x = randInt(next, -5000, 5000);
        const y = randInt(next, -5000, 5000);
        const d = x * x + y * y;
        if (seen.has(d)) continue;
        seen.add(d);
        points.push([x, y]);
    }
    return points;
};

const sortedRuns = (seed: number, runs: number, length: number) =>
    range(runs).map((r) => randInts(seed + r, length, -100_000, 100_000).sort((a, b) => a - b));

export const practicalProblems: ProblemDef[] = [
    {
        key: "meeting-rooms",
        title: "Meeting Rooms",
        difficulty: "easy",
        tags: ["intervals", "sorting"],
        statement:
            "You are given an array of meetings, where each meeting is a pair of start and end times, and the end is exclusive. A person can attend two meetings only if one ends at or before the moment the other starts. Return true if one person can attend every meeting.",
        constraints: ["0 <= meetings.length <= 100000", "0 <= start < end <= 1000000000"],
        signature: { name: "canAttendMeetings", params: [{ name: "meetings", type: "int[][]" }], returns: "bool" },
        examples: [
            { input: [[[0, 30], [5, 10], [15, 20]]], output: false, explanation: "The meeting from 5 to 10 is inside the one from 0 to 30." },
            { input: [[[7, 10], [2, 4]]], output: true },
        ],
        hidden: [
            { label: "no meetings", input: [[]] },
            { label: "meetings that only touch", input: [[[1, 2], [2, 3], [3, 4]]] },
            { label: "one contains another", input: [[[1, 10], [2, 3]]] },
            { label: "unsorted but compatible", input: [[[9, 10], [1, 2], [5, 6], [3, 4]]] },
            { label: "overlap by one unit", input: [[[1, 5], [4, 8]]] },
            { label: "large and compatible", input: [disjointMeetings(50_000, 3)] },
            { label: "large with one overlap", input: [[...disjointMeetings(50_000, 4), [5, 12]]] },
        ],
        hints: [
            "If two meetings overlap, which two must they be once the meetings are put in order of start time?",
            "Sort by start time. Only neighbours in that order can overlap.",
            "After sorting, return false as soon as a meeting starts before the previous one ends.",
        ],
        solution: { approach: "Sort by start time and compare each meeting's start with the previous one's end.", time: "O(n log n)", space: "O(1) extra" },
        reference: String.raw`
def can_attend_meetings(meetings):
    ordered = sorted(meetings)
    return all(ordered[i][1] <= ordered[i + 1][0] for i in range(len(ordered) - 1))
`,
    },
    {
        key: "meeting-rooms-ii",
        title: "Meeting Rooms II",
        difficulty: "medium",
        tags: ["intervals", "heap", "sorting", "greedy"],
        statement:
            "You are given an array of meetings, where each meeting is a pair of start and end times, and the end is exclusive. Return the minimum number of rooms needed so that every meeting has a room and no two meetings share a room at the same moment.",
        constraints: ["1 <= meetings.length <= 100000", "0 <= start < end <= 1000000000"],
        signature: { name: "minMeetingRooms", params: [{ name: "meetings", type: "int[][]" }], returns: "int" },
        examples: [
            { input: [[[0, 30], [5, 10], [15, 20]]], output: 2 },
            { input: [[[7, 10], [2, 4]]], output: 1 },
        ],
        hidden: [
            { label: "single meeting", input: [[[3, 9]]] },
            { label: "everything at the same time", input: [[[1, 5], [1, 5], [1, 5], [1, 5]]] },
            { label: "back to back in one room", input: [[[1, 2], [2, 3], [3, 4], [4, 5]]] },
            { label: "nested meetings", input: [[[1, 20], [2, 19], [3, 18], [4, 5]]] },
            { label: "starts as another ends", input: [[[0, 10], [10, 20], [5, 15]]] },
            { label: "large random schedule", input: [randomMeetings(41, 60_000, 200_000, 400)] },
            { label: "large and disjoint", input: [disjointMeetings(60_000, 42)] },
        ],
        hints: [
            "At any moment, the rooms in use are the meetings that have started and not yet ended. What are you counting?",
            "Process meetings in order of start time and keep track of when each room becomes free. A min-heap of end times gives the earliest one.",
            "For each meeting, if the earliest-ending room is free by its start, reuse it (replace that end time); otherwise open a new room. The heap size at the end is the answer.",
        ],
        solution: { approach: "Sort by start; a min-heap of end times reuses the earliest-free room. Or sweep sorted starts and ends.", time: "O(n log n)", space: "O(n)" },
        reference: String.raw`
import heapq

def min_meeting_rooms(meetings):
    rooms = []
    for start, end in sorted(meetings):
        if rooms and rooms[0] <= start:
            heapq.heapreplace(rooms, end)
        else:
            heapq.heappush(rooms, end)
    return len(rooms)
`,
    },
    {
        key: "insert-interval",
        title: "Insert Interval",
        difficulty: "medium",
        tags: ["intervals", "array"],
        statement:
            "You are given a list of non-overlapping intervals sorted by start, and one new interval. Insert the new interval so the list is still sorted and has no overlaps, merging intervals as needed. Intervals that only touch at an endpoint count as overlapping. Return the resulting list.",
        constraints: ["0 <= intervals.length <= 100000", "The input intervals are sorted and do not overlap", "0 <= start <= end <= 1000000000"],
        signature: { name: "insertInterval", params: [{ name: "intervals", type: "int[][]" }, { name: "newInterval", type: "int[]" }], returns: "int[][]" },
        examples: [
            { input: [[[1, 3], [6, 9]], [2, 5]], output: [[1, 5], [6, 9]] },
            { input: [[[1, 2], [3, 5], [6, 7], [8, 10], [12, 16]], [4, 8]], output: [[1, 2], [3, 10], [12, 16]], explanation: "The new interval overlaps three of the existing ones." },
        ],
        hidden: [
            { label: "empty list", input: [[], [5, 7]] },
            { label: "before everything", input: [[[5, 6], [8, 9]], [1, 2]] },
            { label: "after everything", input: [[[1, 2], [3, 4]], [10, 12]] },
            { label: "covers everything", input: [[[2, 3], [4, 5], [6, 7]], [0, 100]] },
            { label: "touches on both sides", input: [[[1, 2], [3, 4], [5, 6]], [2, 5]] },
            { label: "falls in a gap", input: [[[1, 2], [8, 9]], [4, 5]] },
            { label: "large list", input: [range(50_000).map((i) => [i * 4, i * 4 + 2]), [30_001, 120_005]] },
        ],
        hints: [
            "The intervals are already sorted. Which ones end before the new interval begins, and which start after it ends?",
            "Copy the intervals that end before the new one starts, merge every interval that overlaps it, then copy the rest.",
            "Merging means taking the smallest start and the largest end across the new interval and everything it overlaps. One pass, no sorting needed.",
        ],
        solution: { approach: "One pass: copy the intervals before, merge the overlapping run into the new interval, then copy the intervals after.", time: "O(n)", space: "O(n)" },
        reference: String.raw`
def insert_interval(intervals, new_interval):
    result = []
    start, end = new_interval
    i = 0
    n = len(intervals)
    while i < n and intervals[i][1] < start:
        result.append(intervals[i])
        i += 1
    while i < n and intervals[i][0] <= end:
        start = min(start, intervals[i][0])
        end = max(end, intervals[i][1])
        i += 1
    result.append([start, end])
    while i < n:
        result.append(intervals[i])
        i += 1
    return result
`,
    },
    {
        key: "non-overlapping-intervals",
        title: "Non-overlapping Intervals",
        difficulty: "medium",
        tags: ["intervals", "greedy", "sorting"],
        statement:
            "Given an array of intervals, return the minimum number of intervals to remove so that the rest do not overlap. Intervals that only touch at an endpoint do not overlap.",
        constraints: ["1 <= intervals.length <= 100000", "0 <= start < end <= 1000000000"],
        signature: { name: "eraseOverlapIntervals", params: [{ name: "intervals", type: "int[][]" }], returns: "int" },
        examples: [
            { input: [[[1, 2], [2, 3], [3, 4], [1, 3]]], output: 1, explanation: "Removing [1, 3] leaves three intervals that do not overlap." },
            { input: [[[1, 2], [1, 2], [1, 2]]], output: 2 },
        ],
        hidden: [
            { label: "already compatible", input: [[[1, 2], [2, 3]]] },
            { label: "single interval", input: [[[4, 9]]] },
            { label: "one long interval blocks many short ones", input: [[[1, 100], [1, 2], [3, 4], [5, 6], [7, 8]]] },
            { label: "chain of overlaps", input: [[[1, 3], [2, 4], [3, 5], [4, 6], [5, 7]]] },
            { label: "identical starts", input: [[[0, 5], [0, 4], [0, 3], [0, 2], [0, 1]]] },
            { label: "large random", input: [randomMeetings(51, 70_000, 300_000, 900)] },
        ],
        hints: [
            "Removing the fewest intervals is the same as keeping as many compatible intervals as possible.",
            "Which interval, among those starting at the earliest point, leaves the most room for the ones after it? The one that ends first.",
            "Sort by end time. Keep an interval if it starts at or after the end of the last kept one; otherwise it is removed. The answer is the count removed.",
        ],
        solution: { approach: "Greedy: sort by end time and keep every interval that starts after the last kept one ends.", time: "O(n log n)", space: "O(1) extra" },
        reference: String.raw`
def erase_overlap_intervals(intervals):
    removed = 0
    last_end = None
    for start, end in sorted(intervals, key=lambda p: (p[1], p[0])):
        if last_end is None or start >= last_end:
            last_end = end
        else:
            removed += 1
    return removed
`,
    },
    {
        key: "rate-limiter",
        title: "Rate Limiter",
        difficulty: "medium",
        tags: ["sliding-window", "queue", "design"],
        statement:
            "Implement a sliding-window rate limiter offline. Requests arrive at the given times, in non-decreasing order. A request at time t is allowed if fewer than limit allowed requests have happened at times greater than t minus windowSize, up to and including t. A rejected request does not count toward the limit. Return an array saying whether each request was allowed.",
        constraints: ["1 <= timestamps.length <= 100000", "timestamps is sorted in non-decreasing order", "1 <= limit <= 100000", "1 <= windowSize <= 1000000000"],
        signature: { name: "allowRequests", params: [{ name: "timestamps", type: "int[]" }, { name: "limit", type: "int" }, { name: "windowSize", type: "int" }], returns: "bool[]" },
        examples: [
            { input: [[1, 2, 3, 4, 5], 2, 3], output: [true, true, false, true, true], explanation: "At time 3 the window holds the requests at 1 and 2, so it is full. At time 4 the request at 1 has left it." },
            { input: [[1, 1, 1, 10], 2, 5], output: [true, true, false, true] },
        ],
        hidden: [
            { label: "single request", input: [[5], 1, 10] },
            { label: "limit of one", input: [[1, 2, 3, 4, 5, 6], 1, 2] },
            { label: "a burst at one instant", input: [[7, 7, 7, 7, 7, 7], 3, 100] },
            { label: "exactly at the window edge", input: [[0, 5, 10], 1, 5] },
            { label: "rejected requests do not use up the limit", input: [[1, 2, 3, 4, 5, 6, 7, 8], 2, 4] },
            { label: "large steady stream", input: [requestTimes(61, 100_000, 3), 50, 20] },
            { label: "large dense burst", input: [requestTimes(62, 100_000, 1), 1000, 500] },
        ],
        hints: [
            "For each request you need the number of allowed requests in the last windowSize time units. What do you keep between requests?",
            "Keep the times of allowed requests in a queue. Before deciding, drop the times that are no longer in the window.",
            "A time t0 is out of the window once t0 <= t - windowSize. Pop those from the front of the queue; allow the request if the queue is shorter than limit, and push its time only if it was allowed.",
        ],
        solution: { approach: "A queue of the allowed requests' times; expire the front as time advances.", time: "O(n)", space: "O(limit)" },
        reference: String.raw`
from collections import deque

def allow_requests(timestamps, limit, window_size):
    allowed = deque()
    result = []
    for t in timestamps:
        while allowed and allowed[0] <= t - window_size:
            allowed.popleft()
        if len(allowed) < limit:
            allowed.append(t)
            result.append(True)
        else:
            result.append(False)
    return result
`,
    },
    {
        key: "lru-cache",
        title: "LRU Cache",
        difficulty: "medium",
        tags: ["hash-map", "design"],
        statement:
            "Simulate a least-recently-used cache. You are given its capacity, an array of operations that are each put or get, and an array of parameter lists: a put has the parameters key and value, a get has just the key. A get returns the value for the key, or minus one if it is not in the cache. Both get and put count as using a key. A put of a key already present replaces its value. When a put would take the cache over capacity, the least recently used key is evicted first. Return the results of the get operations, in order.",
        constraints: ["1 <= capacity <= 5000", "1 <= operations.length <= 20000", "1 <= key, value <= 1000000"],
        signature: { name: "lruCache", params: [{ name: "capacity", type: "int" }, { name: "operations", type: "string[]" }, { name: "params", type: "int[][]" }], returns: "int[]" },
        examples: [
            { input: [2, ["put", "put", "get", "put", "get", "put", "get", "get", "get"], [[1, 1], [2, 2], [1], [3, 3], [2], [4, 4], [1], [3], [4]]], output: [1, -1, -1, 3, 4], explanation: "Putting 3 evicts key 2, and putting 4 evicts key 1." },
            { input: [1, ["put", "put", "get", "get"], [[1, 10], [2, 20], [1], [2]]], output: [-1, 20] },
        ],
        hidden: [
            { label: "no eviction needed", input: [10, ["put", "put", "get", "get", "get"], [[1, 5], [2, 6], [1], [2], [3]]] },
            { label: "get refreshes recency", input: [2, ["put", "put", "get", "put", "get", "get"], [[1, 1], [2, 2], [1], [3, 3], [1], [2]]] },
            { label: "put of an existing key refreshes it", input: [2, ["put", "put", "put", "put", "get", "get"], [[1, 1], [2, 2], [1, 9], [3, 3], [1], [2]]] },
            { label: "capacity one", input: [1, ["put", "get", "put", "get", "get"], [[1, 1], [1], [2, 2], [1], [2]]] },
            { label: "only misses", input: [3, ["get", "get", "put", "get"], [[7], [8], [9, 9], [8]]] },
            { label: "large workload, small key range", input: [30, bigCache.ops, bigCache.args] },
            { label: "large workload, constant eviction", input: [100, churnCache.ops, churnCache.args] },
        ],
        hints: [
            "You need to find a key quickly, and also to know which key was used longest ago. What structures give each?",
            "A hash map finds keys in constant time. To track recency, keep the keys in an order where the most recently used moves to one end.",
            "Use a hash map plus a doubly linked list (or an ordered map). On every get or put, move the key to the most-recent end; on overflow, drop the key at the other end.",
        ],
        solution: { approach: "A hash map into a doubly linked list ordered by recency, or a language's ordered map.", time: "O(1) per operation", space: "O(capacity)" },
        reference: String.raw`
from collections import OrderedDict

def lru_cache(capacity, operations, params):
    cache = OrderedDict()
    results = []
    for op, args in zip(operations, params):
        if op == "put":
            key, value = args
            if key in cache:
                cache.move_to_end(key)
            cache[key] = value
            if len(cache) > capacity:
                cache.popitem(last=False)
        else:
            key = args[0]
            if key in cache:
                cache.move_to_end(key)
                results.append(cache[key])
            else:
                results.append(-1)
    return results
`,
    },
    {
        key: "top-k-ips",
        title: "Busiest Clients",
        difficulty: "medium",
        tags: ["string", "hash-map", "sorting", "heap"],
        statement:
            "You are given the lines of a web server access log. Each line has four fields separated by single spaces: the client's IP address, the HTTP method, the path and the status code. Count only successful requests, meaning status codes from 200 to 299. Return the k IP addresses with the most successful requests, most first. Break ties by the IP address in ascending alphabetical order. If fewer than k addresses made a successful request, return all of them.",
        constraints: ["1 <= lines.length <= 100000", "1 <= k <= 1000", "Every line has exactly four fields"],
        signature: { name: "topClients", params: [{ name: "lines", type: "string[]" }, { name: "k", type: "int" }], returns: "string[]" },
        examples: [
            { input: [["10.0.0.1 GET /a 200", "10.0.0.2 GET /b 500", "10.0.0.1 POST /c 201", "10.0.0.3 GET /a 200"], 2], output: ["10.0.0.1", "10.0.0.3"], explanation: "10.0.0.2 only made a failed request." },
            { input: [["1.1.1.1 GET / 404", "2.2.2.2 GET / 500"], 3], output: [] },
        ],
        hidden: [
            { label: "a tie broken alphabetically", input: [["9.9.9.9 GET / 200", "1.1.1.1 GET / 200", "5.5.5.5 GET / 200"], 2] },
            { label: "k larger than the number of clients", input: [["3.3.3.3 GET / 200", "3.3.3.3 GET / 200", "4.4.4.4 GET / 204"], 10] },
            { label: "status boundaries", input: [["1.0.0.1 GET / 199", "1.0.0.2 GET / 200", "1.0.0.3 GET / 299", "1.0.0.4 GET / 300"], 4] },
            { label: "one client only", input: [["8.8.8.8 GET /x 200"], 1] },
            { label: "compares addresses as text", input: [["10.0.0.9 GET / 200", "10.0.0.10 GET / 200", "9.0.0.1 GET / 200"], 3] },
            { label: "large log", input: [accessLog(71, 60_000), 25] },
            { label: "large log, many clients", input: [accessLog(72, 80_000), 400] },
        ],
        hints: [
            "First decide which lines count, then how many times each address appears among them.",
            "Split each line on spaces, check that the status is between 200 and 299, and count addresses in a hash map.",
            "Sort the addresses by count descending and then by address ascending, and take the first k. (A heap of size k does the same in less time for huge inputs.)",
        ],
        solution: { approach: "Count successful requests per address in a hash map, then sort by (count descending, address ascending) and take k.", time: "O(n + m log m)", space: "O(m)" },
        reference: String.raw`
from collections import Counter

def top_clients(lines, k):
    counts = Counter()
    for line in lines:
        ip, _method, _path, status = line.split(" ")
        if 200 <= int(status) <= 299:
            counts[ip] += 1
    ranked = sorted(counts, key=lambda ip: (-counts[ip], ip))
    return ranked[:k]
`,
    },
    {
        key: "top-k-frequent-words",
        title: "Top K Frequent Words",
        difficulty: "medium",
        tags: ["hash-map", "heap", "sorting", "string"],
        statement:
            "Given an array of words and an integer k, return the k most frequent words. Sort them by frequency from highest to lowest, and break ties by putting the alphabetically smaller word first.",
        constraints: ["1 <= words.length <= 100000", "1 <= k <= the number of distinct words", "Words consist of lowercase letters"],
        signature: { name: "topKWords", params: [{ name: "words", type: "string[]" }, { name: "k", type: "int" }], returns: "string[]" },
        examples: [
            { input: [["i", "love", "leetcode", "i", "love", "coding"], 2], output: ["i", "love"] },
            { input: [["the", "day", "is", "sunny", "the", "the", "the", "sunny", "is", "is"], 4], output: ["the", "is", "sunny", "day"] },
        ],
        hidden: [
            { label: "all words tied", input: [["d", "c", "b", "a"], 3] },
            { label: "k equals the distinct count", input: [["x", "y", "x"], 2] },
            { label: "prefix ordering", input: [["app", "apple", "app", "apple", "a"], 3] },
            { label: "a single word repeated", input: [["same", "same", "same"], 1] },
            { label: "large skewed input", input: [skewedWords(81, 90_000), 6] },
            { label: "large input, all distinct words counted", input: [skewedWords(82, 90_000), 20] },
        ],
        hints: [
            "You need each word's count first. Then the ordering has two keys.",
            "Count with a hash map. The ranking is by count descending, and alphabetical for equal counts.",
            "Sort the distinct words with that comparator and take the first k. For a very large number of distinct words, keep a heap of size k instead.",
        ],
        solution: { approach: "Hash-map counts, then sort (or heap) by count descending and word ascending.", time: "O(n + m log m)", space: "O(m)" },
        reference: String.raw`
from collections import Counter

def top_k_words(words, k):
    counts = Counter(words)
    return sorted(counts, key=lambda w: (-counts[w], w))[:k]
`,
    },
    {
        key: "k-closest-points",
        title: "K Closest Points to Origin",
        difficulty: "medium",
        tags: ["heap", "sorting", "array", "quickselect"],
        statement:
            "You are given an array of points on a plane, each as a pair x and y, and an integer k. Return the k points closest to the origin by straight-line distance, in any order. The distances of the points in the input are all different, so the answer is unique.",
        constraints: ["1 <= k <= points.length <= 100000", "-10000 <= x, y <= 10000", "All squared distances from the origin are distinct"],
        signature: { name: "kClosest", params: [{ name: "points", type: "int[][]" }, { name: "k", type: "int" }], returns: "int[][]" },
        examples: [
            { input: [[[1, 3], [-2, 2]], 1], output: [[-2, 2]], explanation: "The squared distances are 10 and 8." },
            { input: [[[3, 3], [5, -1], [-2, 4]], 2], output: [[3, 3], [-2, 4]] },
        ],
        hidden: [
            { label: "k equals the number of points", input: [[[4, 1], [1, 0], [-3, 2]], 3] },
            { label: "a single point", input: [[[9, -9]], 1] },
            { label: "points on the axes", input: [[[0, 6], [-5, 0], [0, -4], [3, 0]], 2] },
            { label: "large input, small k", input: [distinctDistancePoints(91, 60_000), 5] },
            { label: "large input, large k", input: [distinctDistancePoints(92, 60_000), 30_000] },
        ],
        hints: [
            "Comparing squared distances gives the same order as comparing distances, without square roots.",
            "Sorting everything works. Can you avoid ordering points you will never return?",
            "Keep a max-heap of the k closest seen so far and evict the farthest when it grows past k, or use quickselect to partition around the k-th distance.",
        ],
        solution: { approach: "Max-heap of size k on squared distance, or quickselect. Sorting is the simple baseline.", time: "O(n log k)", space: "O(k)" },
        compare: "unordered",
        reference: String.raw`
def k_closest(points, k):
    return sorted(points, key=lambda p: p[0] * p[0] + p[1] * p[1])[:k]
`,
    },
    {
        key: "merge-k-sorted-arrays",
        title: "Merge K Sorted Arrays",
        difficulty: "medium",
        tags: ["heap", "array", "divide-and-conquer"],
        statement:
            "You are given k arrays, each sorted in ascending order. Merge them into one sorted array and return it. Some of the arrays may be empty.",
        constraints: ["0 <= k <= 10000", "The total number of elements is at most 200000", "-1000000 <= value <= 1000000"],
        signature: { name: "mergeKSorted", params: [{ name: "arrays", type: "int[][]" }], returns: "int[]" },
        examples: [
            { input: [[[1, 4, 5], [1, 3, 4], [2, 6]]], output: [1, 1, 2, 3, 4, 4, 5, 6] },
            { input: [[[], [1]]], output: [1] },
        ],
        hidden: [
            { label: "no arrays", input: [[]] },
            { label: "only empty arrays", input: [[[], [], []]] },
            { label: "one array", input: [[[3, 5, 8]]] },
            { label: "negative and duplicate values", input: [[[-5, -5, 0], [-6, -5, 7], [0, 0, 0]]] },
            { label: "many short arrays", input: [range(2_000).map((i) => randInts(500 + i, 4, -1000, 1000).sort((a, b) => a - b))] },
            { label: "a few long arrays", input: [sortedRuns(600, 8, 20_000)] },
            { label: "many arrays of one element", input: [range(5_000).map((i) => [(i * 7919) % 10007])] },
        ],
        hints: [
            "At every step the next value in the merged array is the smallest value among the fronts of the k arrays.",
            "Finding that smallest value quickly among k candidates is what a heap is for.",
            "Push the first element of each array with its array and index. Pop the smallest, output it, and push the next element from the same array. Or merge the arrays pairwise, like merge sort.",
        ],
        solution: { approach: "Min-heap holding one element per array; pop the smallest and push its successor. Pairwise merging works too.", time: "O(n log k)", space: "O(k)" },
        reference: String.raw`
import heapq

def merge_k_sorted(arrays):
    return list(heapq.merge(*arrays))
`,
    },
    {
        key: "task-scheduler",
        title: "Task Scheduler",
        difficulty: "medium",
        tags: ["heap", "greedy", "hash-map"],
        statement:
            "A CPU runs one task per unit of time, and tasks are labelled with capital letters. Two runs of the same task must have at least n units of time between them, during which the CPU runs other tasks or stays idle. Tasks can be run in any order. Return the least number of units of time needed to run every task.",
        constraints: ["1 <= tasks.length <= 100000", "0 <= n <= 100", "Tasks are capital letters A to Z"],
        signature: { name: "leastInterval", params: [{ name: "tasks", type: "string[]" }, { name: "n", type: "int" }], returns: "int" },
        examples: [
            { input: [["A", "A", "A", "B", "B", "B"], 2], output: 8, explanation: "A B idle A B idle A B." },
            { input: [["A", "A", "A", "B", "B", "B"], 0], output: 6 },
            { input: [["A", "A", "A", "A", "A", "A", "B", "C", "D", "E", "F", "G"], 2], output: 16 },
        ],
        hidden: [
            { label: "one task", input: [["A"], 5] },
            { label: "one kind of task", input: [["Z", "Z", "Z", "Z"], 3] },
            { label: "enough variety, no idling", input: [["A", "A", "B", "B", "C", "C", "D", "D"], 1] },
            { label: "several tasks tied for the most frequent", input: [["A", "A", "B", "B", "C", "C"], 3] },
            { label: "large mixed input", input: [Array.from({ length: 60_000 }, (_, i) => "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[(i * i + 3 * i) % 26]!), 7] },
            { label: "large input, long cooldown", input: [Array.from({ length: 60_000 }, (_, i) => "ABC"[i % 3]!), 100] },
        ],
        hints: [
            "The most frequent task forces the schedule's shape: its runs are separated by cooldowns.",
            "If the most frequent task appears m times, there are m minus one gaps of length n between runs, and other tasks can fill those gaps.",
            "The answer is max(number of tasks, (m - 1) * (n + 1) + the number of tasks that appear m times). Or simulate with a max-heap, running the most frequent available task each unit.",
        ],
        solution: { approach: "Count frequencies; the busiest task sets a frame of (m - 1) * (n + 1) + ties, and the answer is at least the number of tasks. A max-heap simulation also works.", time: "O(n)", space: "O(1)" },
        reference: String.raw`
from collections import Counter

def least_interval(tasks, n):
    counts = Counter(tasks)
    most = max(counts.values())
    tied = sum(1 for c in counts.values() if c == most)
    return max(len(tasks), (most - 1) * (n + 1) + tied)
`,
    },
];
