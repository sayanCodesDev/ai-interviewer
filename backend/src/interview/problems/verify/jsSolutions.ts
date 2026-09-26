/**
 * An independent JavaScript solution for every problem, deliberately written in a different style
 * from the Python references. The tests run these through the harness against the answers computed
 * from the Python references: two implementations that agree on every hidden input are strong
 * evidence that neither the reference nor the problem's tests are wrong.
 */
export const JS_SOLUTIONS: Record<string, string> = {
    "two-sum": `function twoSum(nums, target) { const m = new Map(); for (let i = 0; i < nums.length; i++) { const j = m.get(target - nums[i]); if (j !== undefined) return [j, i]; m.set(nums[i], i); } return []; }`,

    "valid-parentheses": `function isValid(s) { const open = "([{", close = ")]}"; const st = []; for (const ch of s) { if (open.includes(ch)) st.push(open.indexOf(ch)); else { if (st.pop() !== close.indexOf(ch)) return false; } } return st.length === 0; }`,

    "best-time-to-buy-and-sell-stock": `function maxProfit(prices) { let low = Infinity, best = 0; for (const p of prices) { if (p < low) low = p; else if (p - low > best) best = p - low; } return best; }`,

    "contains-duplicate": `function containsDuplicate(nums) { return new Set(nums).size !== nums.length; }`,

    "valid-anagram": `function isAnagram(s, t) { if (s.length !== t.length) return false; const c = new Array(26).fill(0); for (let i = 0; i < s.length; i++) { c[s.charCodeAt(i) - 97]++; c[t.charCodeAt(i) - 97]--; } return c.every((x) => x === 0); }`,

    "binary-search": `function search(nums, target) { let lo = 0, hi = nums.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (nums[mid] < target) lo = mid + 1; else hi = mid; } return lo < nums.length && nums[lo] === target ? lo : -1; }`,

    "merge-sorted-arrays": `function mergeSorted(a, b) { const out = new Array(a.length + b.length); let i = 0, j = 0, k = 0; while (i < a.length || j < b.length) { if (j >= b.length || (i < a.length && a[i] <= b[j])) out[k++] = a[i++]; else out[k++] = b[j++]; } return out; }`,

    "longest-common-prefix": `function longestCommonPrefix(strs) { let end = strs[0].length; for (const s of strs) { let k = 0; while (k < end && k < s.length && s[k] === strs[0][k]) k++; end = k; } return strs[0].slice(0, end); }`,

    "climbing-stairs": `function climbStairs(n) { const ways = [1, 1]; for (let i = 2; i <= n; i++) ways[i] = ways[i - 1] + ways[i - 2]; return ways[n]; }`,

    "maximum-subarray": `function maxSubArray(nums) { let best = -Infinity, run = 0; for (const x of nums) { run = Math.max(0, run) + x; best = Math.max(best, run); } return best; }`,

    "move-zeroes": `function moveZeroes(nums) { let w = 0; for (let r = 0; r < nums.length; r++) if (nums[r] !== 0) { nums[w++] = nums[r]; } while (w < nums.length) nums[w++] = 0; return nums; }`,

    "valid-palindrome": `function isPalindrome(s) { let i = 0, j = s.length - 1; const ok = (c) => /[a-zA-Z0-9]/.test(c); while (i < j) { if (!ok(s[i])) { i++; continue; } if (!ok(s[j])) { j--; continue; } if (s[i].toLowerCase() !== s[j].toLowerCase()) return false; i++; j--; } return true; }`,

    "longest-substring-without-repeating-characters": `function lengthOfLongestSubstring(s) { const seen = new Set(); let l = 0, best = 0; for (let r = 0; r < s.length; r++) { while (seen.has(s[r])) seen.delete(s[l++]); seen.add(s[r]); best = Math.max(best, r - l + 1); } return best; }`,

    "group-anagrams": `function groupAnagrams(strs) { const g = new Map(); for (const w of strs) { const key = [...w].sort().join(""); if (!g.has(key)) g.set(key, []); g.get(key).push(w); } return [...g.values()]; }`,

    "top-k-frequent-elements": `function topKFrequent(nums, k) { const c = new Map(); for (const x of nums) c.set(x, (c.get(x) || 0) + 1); return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, k).map((e) => e[0]); }`,

    "product-of-array-except-self": `function productExceptSelf(nums) { const n = nums.length; const pre = new Array(n + 1).fill(1), suf = new Array(n + 1).fill(1); for (let i = 0; i < n; i++) pre[i + 1] = pre[i] * nums[i]; for (let i = n - 1; i >= 0; i--) suf[i] = suf[i + 1] * nums[i]; return nums.map((_, i) => { const v = pre[i] * suf[i + 1]; return v === 0 ? 0 : v; }); }`,

    "three-sum": `function threeSum(nums) { const a = [...nums].sort((x, y) => x - y); const out = []; for (let i = 0; i < a.length - 2; i++) { if (i && a[i] === a[i - 1]) continue; let l = i + 1, r = a.length - 1; while (l < r) { const s = a[i] + a[l] + a[r]; if (s === 0) { out.push([a[i], a[l], a[r]]); do { l++; } while (l < r && a[l] === a[l - 1]); } else if (s < 0) l++; else r--; } } return out; }`,

    "container-with-most-water": `function maxArea(h) { let best = 0, l = 0, r = h.length - 1; while (l < r) { best = Math.max(best, Math.min(h[l], h[r]) * (r - l)); if (h[l] <= h[r]) l++; else r--; } return best; }`,

    "merge-intervals": `function mergeIntervals(intervals) { const s = intervals.map((x) => [x[0], x[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]); const out = [s[0]]; for (let i = 1; i < s.length; i++) { const last = out[out.length - 1]; if (s[i][0] <= last[1]) last[1] = Math.max(last[1], s[i][1]); else out.push(s[i]); } return out; }`,

    "number-of-islands": `function numIslands(grid) { const R = grid.length, C = grid[0].length; const seen = grid.map((row) => new Array(C).fill(false)); let n = 0; for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) { if (grid[r][c] !== "1" || seen[r][c]) continue; n++; const q = [[r, c]]; seen[r][c] = true; while (q.length) { const [y, x] = q.shift(); for (const [dy, dx] of [[1,0],[-1,0],[0,1],[0,-1]]) { const ny = y + dy, nx = x + dx; if (ny >= 0 && ny < R && nx >= 0 && nx < C && grid[ny][nx] === "1" && !seen[ny][nx]) { seen[ny][nx] = true; q.push([ny, nx]); } } } } return n; }`,

    "coin-change": `function coinChange(coins, amount) { const dp = new Array(amount + 1).fill(Infinity); dp[0] = 0; for (let a = 1; a <= amount; a++) for (const c of coins) if (a >= c) dp[a] = Math.min(dp[a], dp[a - c] + 1); return dp[amount] === Infinity ? -1 : dp[amount]; }`,

    "longest-increasing-subsequence": `function lengthOfLis(nums) { const dp = new Array(nums.length).fill(1); let best = 0; for (let i = 0; i < nums.length; i++) { for (let j = 0; j < i; j++) if (nums[j] < nums[i]) dp[i] = Math.max(dp[i], dp[j] + 1); best = Math.max(best, dp[i]); } return best; }`,

    "subarray-sum-equals-k": `function subarraySum(nums, k) { const seen = new Map([[0, 1]]); let sum = 0, count = 0; for (const x of nums) { sum += x; count += seen.get(sum - k) || 0; seen.set(sum, (seen.get(sum) || 0) + 1); } return count; }`,

    "search-in-rotated-sorted-array": `function searchRotated(nums, target) { let pivot = 0; { let lo = 0, hi = nums.length - 1; while (lo < hi) { const mid = (lo + hi) >> 1; if (nums[mid] > nums[hi]) lo = mid + 1; else hi = mid; } pivot = lo; } let lo = 0, hi = nums.length - 1; while (lo <= hi) { const mid = (lo + hi) >> 1; const real = (mid + pivot) % nums.length; if (nums[real] === target) return real; if (nums[real] < target) lo = mid + 1; else hi = mid - 1; } return -1; }`,

    "course-schedule": `function canFinish(numCourses, prerequisites) { const adj = Array.from({ length: numCourses }, () => []); for (const [a, b] of prerequisites) adj[b].push(a); const state = new Array(numCourses).fill(0); const visit = (u) => { if (state[u] === 1) return false; if (state[u] === 2) return true; state[u] = 1; for (const v of adj[u]) if (!visit(v)) return false; state[u] = 2; return true; }; for (let i = 0; i < numCourses; i++) if (!visit(i)) return false; return true; }`,

    "word-break": `function wordBreak(s, wordDict) { const words = new Set(wordDict); const dp = new Array(s.length + 1).fill(false); dp[0] = true; for (let i = 1; i <= s.length; i++) for (let j = 0; j < i && !dp[i]; j++) if (dp[j] && words.has(s.slice(j, i))) dp[i] = true; return dp[s.length]; }`,

    "daily-temperatures": `function dailyTemperatures(t) { const out = new Array(t.length).fill(0); const st = []; for (let i = t.length - 1; i >= 0; i--) { while (st.length && t[st[st.length - 1]] <= t[i]) st.pop(); out[i] = st.length ? st[st.length - 1] - i : 0; st.push(i); } return out; }`,

    "rotate-image": `function rotateImage(m) { const n = m.length; const out = Array.from({ length: n }, () => new Array(n)); for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) out[c][n - 1 - r] = m[r][c]; return out; }`,

    "kth-largest-element-in-an-array": `function findKthLargest(nums, k) { return [...nums].sort((a, b) => b - a)[k - 1]; }`,

    "jump-game": `function canJump(nums) { let need = 0; for (let i = nums.length - 2; i >= 0; i--) { need = nums[i] >= need + 1 ? 0 : need + 1; } return need === 0; }`,

    "decode-ways": `function numDecodings(s) { const dp = new Array(s.length + 1).fill(0); dp[s.length] = 1; for (let i = s.length - 1; i >= 0; i--) { if (s[i] === "0") { dp[i] = 0; continue; } dp[i] = dp[i + 1]; if (i + 1 < s.length && Number(s.slice(i, i + 2)) <= 26) dp[i] += dp[i + 2]; } return dp[0]; }`,

    "trapping-rain-water": `function trap(h) { const n = h.length; const left = new Array(n), right = new Array(n); let m = 0; for (let i = 0; i < n; i++) { m = Math.max(m, h[i]); left[i] = m; } m = 0; for (let i = n - 1; i >= 0; i--) { m = Math.max(m, h[i]); right[i] = m; } let total = 0; for (let i = 0; i < n; i++) total += Math.min(left[i], right[i]) - h[i]; return total; }`,

    "minimum-window-substring": `function minWindow(s, t) { const need = new Map(); for (const c of t) need.set(c, (need.get(c) || 0) + 1); let formed = 0; const required = need.size; const have = new Map(); let l = 0, best = [Infinity, 0]; for (let r = 0; r < s.length; r++) { const c = s[r]; have.set(c, (have.get(c) || 0) + 1); if (need.has(c) && have.get(c) === need.get(c)) formed++; while (formed === required) { if (r - l + 1 < best[0]) best = [r - l + 1, l]; const d = s[l]; have.set(d, have.get(d) - 1); if (need.has(d) && have.get(d) < need.get(d)) formed--; l++; } } return best[0] === Infinity ? "" : s.slice(best[1], best[1] + best[0]); }`,

    "edit-distance": `function minDistance(a, b) { const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0)); for (let i = 0; i <= a.length; i++) dp[i][0] = i; for (let j = 0; j <= b.length; j++) dp[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]); return dp[a.length][b.length]; }`,

    "median-of-two-sorted-arrays": `function findMedianSortedArrays(a, b) { const m = []; let i = 0, j = 0; while (i < a.length || j < b.length) m.push(j >= b.length || (i < a.length && a[i] <= b[j]) ? a[i++] : b[j++]); const n = m.length; return n % 2 ? m[(n - 1) / 2] : (m[n / 2 - 1] + m[n / 2]) / 2; }`,

    "largest-rectangle-in-histogram": `function largestRectangleArea(h) { const n = h.length; const left = new Array(n), right = new Array(n); let st = []; for (let i = 0; i < n; i++) { while (st.length && h[st[st.length - 1]] >= h[i]) st.pop(); left[i] = st.length ? st[st.length - 1] : -1; st.push(i); } st = []; for (let i = n - 1; i >= 0; i--) { while (st.length && h[st[st.length - 1]] >= h[i]) st.pop(); right[i] = st.length ? st[st.length - 1] : n; st.push(i); } let best = 0; for (let i = 0; i < n; i++) best = Math.max(best, h[i] * (right[i] - left[i] - 1)); return best; }`,

    "n-queens-count": `function totalNQueens(n) { const full = (1 << n) - 1; const go = (cols, d1, d2) => { if (cols === full) return 1; let free = full & ~(cols | d1 | d2), count = 0; while (free) { const bit = free & -free; free -= bit; count += go(cols | bit, ((d1 | bit) << 1) & full, (d2 | bit) >> 1); } return count; }; return go(0, 0, 0); }`,

    "longest-valid-parentheses": `function longestValidParentheses(s) { const dp = new Array(s.length).fill(0); let best = 0; for (let i = 1; i < s.length; i++) { if (s[i] !== ")") continue; if (s[i - 1] === "(") dp[i] = (i >= 2 ? dp[i - 2] : 0) + 2; else if (i - dp[i - 1] > 0 && s[i - dp[i - 1] - 1] === "(") dp[i] = dp[i - 1] + 2 + (i - dp[i - 1] >= 2 ? dp[i - dp[i - 1] - 2] : 0); best = Math.max(best, dp[i]); } return best; }`,

    // ---- practical problems

    "meeting-rooms": `function canAttendMeetings(meetings) { const s = [...meetings].sort((a, b) => a[0] - b[0]); for (let i = 1; i < s.length; i++) if (s[i][0] < s[i - 1][1]) return false; return true; }`,

    "meeting-rooms-ii": `function minMeetingRooms(meetings) { const starts = meetings.map((m) => m[0]).sort((a, b) => a - b), ends = meetings.map((m) => m[1]).sort((a, b) => a - b); let inUse = 0, most = 0, j = 0; for (let i = 0; i < starts.length; i++) { while (ends[j] <= starts[i]) { j++; inUse--; } inUse++; if (inUse > most) most = inUse; } return most; }`,

    "insert-interval": `function insertInterval(intervals, newInterval) { const out = []; let [lo, hi] = newInterval; let placed = false; for (const [s, e] of intervals) { if (e < lo) out.push([s, e]); else if (s > hi) { if (!placed) { out.push([lo, hi]); placed = true; } out.push([s, e]); } else { lo = Math.min(lo, s); hi = Math.max(hi, e); } } if (!placed) out.push([lo, hi]); return out; }`,

    "non-overlapping-intervals": `function eraseOverlapIntervals(intervals) { const s = [...intervals].sort((a, b) => a[1] - b[1] || a[0] - b[0]); let kept = 0, end = -Infinity; for (const [a, b] of s) if (a >= end) { kept++; end = b; } return s.length - kept; }`,

    "rate-limiter": `function allowRequests(timestamps, limit, windowSize) { const times = []; let head = 0; return timestamps.map((t) => { while (head < times.length && times[head] <= t - windowSize) head++; if (times.length - head < limit) { times.push(t); return true; } return false; }); }`,

    "lru-cache": `function lruCache(capacity, operations, params) { const map = new Map(); const out = []; operations.forEach((op, i) => { const a = params[i]; if (op === "put") { if (map.has(a[0])) map.delete(a[0]); map.set(a[0], a[1]); if (map.size > capacity) map.delete(map.keys().next().value); } else if (map.has(a[0])) { const v = map.get(a[0]); map.delete(a[0]); map.set(a[0], v); out.push(v); } else out.push(-1); }); return out; }`,

    "top-k-ips": `function topClients(lines, k) { const c = new Map(); for (const line of lines) { const f = line.split(" "); const s = Number(f[3]); if (s >= 200 && s <= 299) c.set(f[0], (c.get(f[0]) || 0) + 1); } return [...c.keys()].sort((x, y) => c.get(y) - c.get(x) || (x < y ? -1 : x > y ? 1 : 0)).slice(0, k); }`,

    "top-k-frequent-words": `function topKWords(words, k) { const c = {}; for (const w of words) c[w] = (c[w] || 0) + 1; return Object.keys(c).sort((a, b) => c[b] - c[a] || (a < b ? -1 : 1)).slice(0, k); }`,

    "k-closest-points": `function kClosest(points, k) { return points.map((p) => [p[0] * p[0] + p[1] * p[1], p]).sort((a, b) => a[0] - b[0]).slice(0, k).map((e) => e[1]); }`,

    "merge-k-sorted-arrays": `function mergeKSorted(arrays) { const heap = []; const push = (v) => { heap.push(v); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } }; const pop = () => { const top = heap[0]; const last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { let l = 2 * i + 1, r = l + 1, m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; }; arrays.forEach((a, i) => { if (a.length) push([a[0], i, 0]); }); const out = []; while (heap.length) { const [v, i, j] = pop(); out.push(v); if (j + 1 < arrays[i].length) push([arrays[i][j + 1], i, j + 1]); } return out; }`,

    "task-scheduler": `function leastInterval(tasks, n) { const c = new Array(26).fill(0); for (const t of tasks) c[t.charCodeAt(0) - 65]++; let time = 0, left = tasks.length; while (left > 0) { const order = c.map((v, i) => [v, i]).filter((x) => x[0] > 0).sort((a, b) => b[0] - a[0]).slice(0, n + 1); for (const [, i] of order) { c[i]--; left--; } time += left === 0 ? order.length : n + 1; } return time; }`,

    // ---- graphs and grids

    "flood-fill": `function floodFill(image, row, col, color) { const orig = image[row][col]; if (orig === color) return image; const q = [[row, col]]; image[row][col] = color; for (let i = 0; i < q.length; i++) { const [r, c] = q[i]; for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nr = r + dr, nc = c + dc; if (nr >= 0 && nr < image.length && nc >= 0 && nc < image[0].length && image[nr][nc] === orig) { image[nr][nc] = color; q.push([nr, nc]); } } } return image; }`,

    "find-the-town-judge": `function findJudge(n, trust) { const out = new Array(n + 1).fill(0), inn = new Array(n + 1).fill(0); for (const [a, b] of trust) { out[a]++; inn[b]++; } for (let p = 1; p <= n; p++) if (out[p] === 0 && inn[p] === n - 1) return p; return -1; }`,

    "connected-components": `function countComponents(n, edges) { const adj = Array.from({ length: n }, () => []); for (const [a, b] of edges) { adj[a].push(b); adj[b].push(a); } const seen = new Uint8Array(n); let count = 0; for (let i = 0; i < n; i++) { if (seen[i]) continue; count++; const st = [i]; seen[i] = 1; while (st.length) { const x = st.pop(); for (const y of adj[x]) if (!seen[y]) { seen[y] = 1; st.push(y); } } } return count; }`,

    "rotting-oranges": `function orangesRotting(grid) { const g = grid.map((r) => [...r]); const R = g.length, C = g[0].length; let minutes = 0; for (;;) { const next = []; for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) { if (g[r][c] !== 1) continue; if ((r > 0 && g[r - 1][c] === 2) || (r + 1 < R && g[r + 1][c] === 2) || (c > 0 && g[r][c - 1] === 2) || (c + 1 < C && g[r][c + 1] === 2)) next.push([r, c]); } if (!next.length) break; for (const [r, c] of next) g[r][c] = 2; minutes++; } return g.some((row) => row.includes(1)) ? -1 : minutes; }`,

    "max-area-of-island": `function maxAreaOfIsland(grid) { const R = grid.length, C = grid[0].length; const seen = grid.map((r) => r.map(() => false)); let best = 0; for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) { if (grid[r][c] !== 1 || seen[r][c]) continue; let area = 0; const q = [[r, c]]; seen[r][c] = true; for (let i = 0; i < q.length; i++) { const [y, x] = q[i]; area++; for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ny = y + dy, nx = x + dx; if (ny >= 0 && ny < R && nx >= 0 && nx < C && grid[ny][nx] === 1 && !seen[ny][nx]) { seen[ny][nx] = true; q.push([ny, nx]); } } } best = Math.max(best, area); } return best; }`,

    "shortest-path-in-binary-matrix": `function shortestPathBinaryMatrix(grid) { const n = grid.length; if (grid[0][0] || grid[n - 1][n - 1]) return -1; let frontier = [[0, 0]]; const seen = grid.map((r) => r.map(() => false)); seen[0][0] = true; let len = 1; while (frontier.length) { const next = []; for (const [r, c] of frontier) { if (r === n - 1 && c === n - 1) return len; for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const nr = r + dr, nc = c + dc; if (nr >= 0 && nr < n && nc >= 0 && nc < n && !grid[nr][nc] && !seen[nr][nc]) { seen[nr][nc] = true; next.push([nr, nc]); } } } frontier = next; len++; } return -1; }`,

    "is-graph-bipartite": `function isBipartite(graph) { const p = graph.map((_, i) => i); const find = (x) => { while (p[x] !== x) { p[x] = p[p[x]]; x = p[x]; } return x; }; for (let u = 0; u < graph.length; u++) { for (const v of graph[u]) if (find(u) === find(v)) return false; for (let i = 1; i < graph[u].length; i++) p[find(graph[u][i])] = find(graph[u][0]); } return true; }`,

    "network-delay-time": `function networkDelayTime(times, n, k) { const d = new Array(n + 1).fill(Infinity); d[k] = 0; for (let i = 0; i < n; i++) { let changed = false; for (const [u, v, w] of times) if (d[u] + w < d[v]) { d[v] = d[u] + w; changed = true; } if (!changed) break; } let worst = 0; for (let i = 1; i <= n; i++) { if (d[i] === Infinity) return -1; worst = Math.max(worst, d[i]); } return worst; }`,

    "cheapest-flights-within-k-stops": `function findCheapestPrice(n, flights, src, dst, k) { let dist = new Array(n).fill(Infinity); dist[src] = 0; for (let i = 0; i <= k; i++) { const next = dist.slice(); for (const [u, v, w] of flights) if (dist[u] + w < next[v]) next[v] = dist[u] + w; dist = next; } return dist[dst] === Infinity ? -1 : dist[dst]; }`,

    "accounts-merge": `function accountsMerge(accounts) { const adj = new Map(), name = new Map(); for (const acc of accounts) { for (let i = 1; i < acc.length; i++) { name.set(acc[i], acc[0]); if (!adj.has(acc[i])) adj.set(acc[i], []); if (i > 1) { adj.get(acc[1]).push(acc[i]); adj.get(acc[i]).push(acc[1]); } } } const seen = new Set(), out = []; for (const e of adj.keys()) { if (seen.has(e)) continue; const comp = [], st = [e]; seen.add(e); while (st.length) { const x = st.pop(); comp.push(x); for (const y of adj.get(x)) if (!seen.has(y)) { seen.add(y); st.push(y); } } out.push([name.get(e), ...comp.sort()]); } return out; }`,

    "word-ladder": `function ladderLength(b, e, list) { const words = new Set(list); if (!words.has(e)) return 0; let frontier = [b]; const seen = new Set([b]); let d = 1; while (frontier.length) { const next = []; for (const w of frontier) { if (w === e) return d; for (let i = 0; i < w.length; i++) for (let c = 97; c < 123; c++) { const x = w.slice(0, i) + String.fromCharCode(c) + w.slice(i + 1); if (words.has(x) && !seen.has(x)) { seen.add(x); next.push(x); } } } frontier = next; d++; } return 0; }`,

    "shortest-path-visiting-all-nodes": `function shortestPathLength(graph) { const n = graph.length, full = (1 << n) - 1; const seen = new Uint8Array(n * (1 << n)); let frontier = []; for (let i = 0; i < n; i++) { seen[i * (1 << n) + (1 << i)] = 1; frontier.push([i, 1 << i]); } let steps = 0; while (frontier.length) { const next = []; for (const [node, mask] of frontier) { if (mask === full) return steps; for (const nb of graph[node]) { const nm = mask | (1 << nb); const id = nb * (1 << n) + nm; if (!seen[id]) { seen[id] = 1; next.push([nb, nm]); } } } frontier = next; steps++; } return 0; }`,

    // ---- classic patterns

    "single-number": `function singleNumber(nums) { const seen = new Set(); let twice = 0, once = 0; for (const x of nums) { if (seen.has(x)) { seen.delete(x); } else seen.add(x); } return [...seen][0]; }`,

    "missing-number": `function missingNumber(nums) { let x = nums.length; for (let i = 0; i < nums.length; i++) x ^= i ^ nums[i]; return x; }`,

    "roman-to-integer": `function romanToInt(s) { const v = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 }; let total = 0, prev = 0; for (let i = s.length - 1; i >= 0; i--) { const cur = v[s[i]]; total += cur < prev ? -cur : cur; prev = cur; } return total; }`,

    "first-unique-character": `function firstUniqChar(s) { const first = new Map(), dup = new Set(); for (let i = 0; i < s.length; i++) { if (first.has(s[i])) dup.add(s[i]); else first.set(s[i], i); } let best = -1; for (const [ch, i] of first) if (!dup.has(ch) && (best === -1 || i < best)) best = i; return best; }`,

    "min-cost-climbing-stairs": `function minCostClimbingStairs(cost) { const best = [0, 0]; for (let i = 2; i <= cost.length; i++) best[i] = Math.min(best[i - 1] + cost[i - 1], best[i - 2] + cost[i - 2]); return best[cost.length]; }`,

    "number-of-1-bits": `function hammingWeight(n) { let c = 0; while (n > 0) { c += n % 2; n = Math.floor(n / 2); } return c; }`,

    "intersection-of-two-arrays": `function intersection(a, b) { const sa = new Set(a); const out = new Set(); for (const x of b) if (sa.has(x)) out.add(x); return [...out]; }`,

    "is-subsequence": `function isSubsequence(s, t) { let j = 0; for (let i = 0; i < t.length && j < s.length; i++) if (t[i] === s[j]) j++; return j === s.length; }`,

    "plus-one": `function plusOne(digits) { const d = [...digits]; let i = d.length - 1; while (i >= 0 && d[i] === 9) { d[i] = 0; i--; } if (i < 0) return [1, ...d]; d[i]++; return d; }`,

    "peak-index-in-mountain-array": `function peakIndexInMountainArray(arr) { let lo = 1, hi = arr.length - 2; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (arr[m] > arr[m - 1]) lo = m; else hi = m - 1; } return lo; }`,

    "longest-consecutive-sequence": `function longestConsecutive(nums) { const sorted = [...new Set(nums)].sort((a, b) => a - b); let best = 0, run = 0; for (let i = 0; i < sorted.length; i++) { run = i > 0 && sorted[i] === sorted[i - 1] + 1 ? run + 1 : 1; if (run > best) best = run; } return best; }`,

    "minimum-size-subarray-sum": `function minSubArrayLen(target, nums) { const pre = [0]; for (const x of nums) pre.push(pre[pre.length - 1] + x); let best = Infinity; for (let i = 0; i < nums.length; i++) { let lo = i + 1, hi = nums.length; while (lo <= hi) { const m = (lo + hi) >> 1; if (pre[m] - pre[i] >= target) { best = Math.min(best, m - i); hi = m - 1; } else lo = m + 1; } } return best === Infinity ? 0 : best; }`,

    "find-all-anagrams": `function findAnagrams(s, p) { const out = []; if (p.length > s.length) return out; const diff = new Array(26).fill(0); for (const ch of p) diff[ch.charCodeAt(0) - 97]--; let nonZero = 0; const bump = (i, d) => { if (diff[i] === 0) nonZero++; diff[i] += d; if (diff[i] === 0) nonZero--; }; for (let i = 0; i < 26; i++) if (diff[i] !== 0) nonZero++; for (let i = 0; i < s.length; i++) { bump(s.charCodeAt(i) - 97, 1); if (i >= p.length) bump(s.charCodeAt(i - p.length) - 97, -1); if (nonZero === 0) out.push(i - p.length + 1); } return out; }`,

    "subsets": `function subsets(nums) { const out = []; const n = nums.length; for (let mask = 0; mask < (1 << n); mask++) { const cur = []; for (let i = 0; i < n; i++) if (mask & (1 << i)) cur.push(nums[i]); out.push(cur); } return out; }`,

    "combination-sum": `function combinationSum(candidates, target) { const out = []; const c = [...candidates].sort((a, b) => a - b); const go = (i, left, cur) => { if (left === 0) { out.push([...cur]); return; } if (i >= c.length || c[i] > left) return; cur.push(c[i]); go(i, left - c[i], cur); cur.pop(); go(i + 1, left, cur); }; go(0, target, []); return out; }`,

    "generate-parentheses": `function generateParenthesis(n) { let level = [""]; const opens = new Map([["", 0]]); const out = []; const go = (cur, o, c) => { if (cur.length === 2 * n) { out.push(cur); return; } if (o < n) go(cur + "(", o + 1, c); if (c < o) go(cur + ")", o, c + 1); }; go("", 0, 0); return out; }`,

    "house-robber": `function rob(nums) { const best = [0, 0]; for (let i = 0; i < nums.length; i++) best[i + 2] = Math.max(best[i + 1], best[i] + nums[i]); return best[nums.length + 1]; }`,

    "unique-paths-with-obstacles": `function uniquePathsWithObstacles(grid) { const R = grid.length, C = grid[0].length; const w = grid.map((r) => r.map(() => 0)); if (grid[0][0] === 0) w[0][0] = 1; for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) { if (grid[r][c] === 1) { w[r][c] = 0; continue; } if (r === 0 && c === 0) continue; w[r][c] = (r > 0 ? w[r - 1][c] : 0) + (c > 0 ? w[r][c - 1] : 0); } return w[R - 1][C - 1]; }`,

    "partition-equal-subset-sum": `function canPartition(nums) { const total = nums.reduce((a, b) => a + b, 0); if (total % 2) return false; const half = total / 2; let sums = new Set([0]); for (const x of nums) { const next = new Set(sums); for (const s of sums) if (s + x <= half) next.add(s + x); sums = next; if (sums.has(half)) return true; } return sums.has(half); }`,

    "longest-palindromic-substring": `function longestPalindrome(s) { const n = s.length; const pal = Array.from({ length: n }, () => new Array(n).fill(false)); let start = 0, len = 1; for (let end = 0; end < n; end++) for (let begin = 0; begin <= end; begin++) { if (s[begin] === s[end] && (end - begin < 2 || pal[begin + 1][end - 1])) { pal[begin][end] = true; const l = end - begin + 1; if (l > len || (l === len && begin < start)) { len = l; start = begin; } } } return s.slice(start, start + len); }`,

    "koko-eating-bananas": `function minEatingSpeed(piles, h) { let k = 1; const need = (speed) => piles.reduce((a, p) => a + Math.ceil(p / speed), 0); let lo = 1, hi = Math.max(...piles); while (lo < hi) { const m = Math.floor((lo + hi) / 2); if (need(m) <= h) hi = m; else lo = m + 1; } return lo; }`,

    "capacity-to-ship-packages": `function shipWithinDays(weights, days) { const daysFor = (cap) => { let d = 1, load = 0; for (const w of weights) { if (load + w > cap) { d++; load = 0; } load += w; } return d; }; let lo = Math.max(...weights), hi = weights.reduce((a, b) => a + b, 0); while (lo < hi) { const m = (lo + hi) >> 1; if (daysFor(m) <= days) hi = m; else lo = m + 1; } return lo; }`,

    "search-a-2d-matrix": `function searchMatrix(matrix, target) { let r = 0; while (r + 1 < matrix.length && matrix[r + 1][0] <= target) r++; let lo = 0, hi = matrix[r].length - 1; while (lo <= hi) { const m = (lo + hi) >> 1; if (matrix[r][m] === target) return true; if (matrix[r][m] < target) lo = m + 1; else hi = m - 1; } return false; }`,

    "evaluate-reverse-polish-notation": `function evalRpn(tokens) { const st = []; for (const t of tokens) { if (["+", "-", "*", "/"].includes(t)) { const b = st.pop(), a = st.pop(); st.push(t === "+" ? a + b : t === "-" ? a - b : t === "*" ? a * b : Math.trunc(a / b)); } else st.push(Number(t)); } return st.pop(); }`,

    "decode-string": `function decodeString(s) { const parse = (i) => { let out = ""; while (i < s.length && s[i] !== "]") { if (/[a-z]/.test(s[i])) { out += s[i++]; } else { let k = 0; while (/[0-9]/.test(s[i])) k = k * 10 + Number(s[i++]); const [inner, next] = parse(i + 1); out += inner.repeat(k); i = next + 1; } } return [out, i]; }; return parse(0)[0]; }`,

    "gas-station": `function canCompleteCircuit(gas, cost) { let total = 0, low = Infinity, at = 0; for (let i = 0; i < gas.length; i++) { total += gas[i] - cost[i]; if (total < low) { low = total; at = i; } } return total < 0 ? -1 : (at + 1) % gas.length; }`,

    "partition-labels": `function partitionLabels(s) { const last = {}; for (let i = 0; i < s.length; i++) last[s[i]] = i; const out = []; let start = 0, end = 0; for (let i = 0; i < s.length; i++) { end = Math.max(end, last[s[i]]); if (i === end) { out.push(i - start + 1); start = i + 1; } } return out; }`,

    "spiral-matrix": `function spiralOrder(matrix) { const R = matrix.length, C = matrix[0].length; const seen = matrix.map((r) => r.map(() => false)); const out = []; let r = 0, c = 0, d = 0; const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]]; for (let i = 0; i < R * C; i++) { out.push(matrix[r][c]); seen[r][c] = true; let nr = r + dirs[d][0], nc = c + dirs[d][1]; if (nr < 0 || nr >= R || nc < 0 || nc >= C || seen[nr][nc]) { d = (d + 1) % 4; nr = r + dirs[d][0]; nc = c + dirs[d][1]; } r = nr; c = nc; } return out; }`,

    "valid-sudoku": `function isValidSudoku(board) { const seen = new Set(); for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) { const d = board[r][c]; if (d === ".") continue; const keys = ["r" + r + d, "c" + c + d, "b" + Math.floor(r / 3) + Math.floor(c / 3) + d]; for (const k of keys) { if (seen.has(k)) return false; seen.add(k); } } return true; }`,

    "counting-bits": `function countBits(n) { const out = []; for (let i = 0; i <= n; i++) { let x = i, c = 0; while (x) { x &= x - 1; c++; } out.push(c); } return out; }`,

    "maximum-product-subarray": `function maxProduct(nums) { let best = -Infinity; for (let i = 0; i < nums.length; i++) { let p = 1; for (let j = i; j < nums.length && j < i + 40; j++) { p *= nums[j]; if (p > best) best = p; if (p === 0) break; } } return best; }`,

    "subarray-product-less-than-k": `function numSubarrayProductLessThanK(nums, k) { if (k <= 1) return 0; let count = 0, left = 0, prod = 1; for (let right = 0; right < nums.length; right++) { prod *= nums[right]; while (prod >= k) prod /= nums[left++]; count += right - left + 1; } return count; }`,

    "autocomplete-counts": `function prefixCounts(words, prefixes) { const sorted = [...words].sort(); const lowerBound = (x) => { let lo = 0, hi = sorted.length; while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < x) lo = m + 1; else hi = m; } return lo; }; return prefixes.map((p) => { const lo = lowerBound(p); const hi = lowerBound(p + "{"); return hi - lo; }); }`,

    "longest-repeating-character-replacement": `function characterReplacement(s, k) { let best = 0; const counts = new Array(26).fill(0); let left = 0, most = 0; for (let right = 0; right < s.length; right++) { const i = s.charCodeAt(right) - 65; counts[i]++; most = Math.max(most, counts[i]); if (right - left + 1 - most > k) { counts[s.charCodeAt(left) - 65]--; left++; } best = Math.max(best, right - left + 1); } return best; }`,

    // ---- the harder end

    "sliding-window-maximum": `function maxSlidingWindow(nums, k) { const n = nums.length, left = new Array(n), right = new Array(n); for (let i = 0; i < n; i++) left[i] = i % k === 0 ? nums[i] : Math.max(left[i - 1], nums[i]); for (let i = n - 1; i >= 0; i--) right[i] = i === n - 1 || (i + 1) % k === 0 ? nums[i] : Math.max(right[i + 1], nums[i]); const out = []; for (let i = 0; i + k <= n; i++) out.push(Math.max(right[i], left[i + k - 1])); return out; }`,

    "regular-expression-matching": `function isMatch(s, p) { const memo = new Map(); const go = (i, j) => { if (j === p.length) return i === s.length; const key = i * (p.length + 1) + j; if (memo.has(key)) return memo.get(key); const first = i < s.length && (p[j] === s[i] || p[j] === '.'); let r; if (j + 1 < p.length && p[j + 1] === '*') r = go(i, j + 2) || (first && go(i + 1, j)); else r = first && go(i + 1, j + 1); memo.set(key, r); return r; }; return go(0, 0); }`,

    "burst-balloons": `function maxCoins(nums) { const a = [1, ...nums, 1]; const n = a.length; const memo = Array.from({ length: n }, () => new Array(n).fill(-1)); const go = (l, r) => { if (r - l < 2) return 0; if (memo[l][r] >= 0) return memo[l][r]; let best = 0; for (let k = l + 1; k < r; k++) best = Math.max(best, go(l, k) + go(k, r) + a[l] * a[k] * a[r]); return (memo[l][r] = best); }; return go(0, n - 1); }`,

    "longest-increasing-path-in-a-matrix": `function longestIncreasingPath(m) { const R = m.length, C = m[0].length; const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]]; const outdeg = m.map((row, r) => row.map((v, c) => dirs.filter(([dr, dc]) => { const nr = r + dr, nc = c + dc; return nr >= 0 && nr < R && nc >= 0 && nc < C && m[nr][nc] > v; }).length)); let layer = []; for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if (outdeg[r][c] === 0) layer.push([r, c]); let len = 0; while (layer.length) { len++; const next = []; for (const [r, c] of layer) for (const [dr, dc] of dirs) { const nr = r + dr, nc = c + dc; if (nr >= 0 && nr < R && nc >= 0 && nc < C && m[nr][nc] < m[r][c] && --outdeg[nr][nc] === 0) next.push([nr, nc]); } layer = next; } return len; }`,

    "count-smaller-after-self": `function countSmaller(nums) { const n = nums.length; const res = new Array(n).fill(0); const idx = nums.map((_, i) => i); const tmp = new Array(n); const sort = (lo, hi) => { if (hi - lo < 2) return; const mid = (lo + hi) >> 1; sort(lo, mid); sort(mid, hi); let i = lo, j = mid, k = lo; while (i < mid || j < hi) { if (j >= hi || (i < mid && nums[idx[i]] <= nums[idx[j]])) { res[idx[i]] += j - mid; tmp[k++] = idx[i++]; } else tmp[k++] = idx[j++]; } for (let t = lo; t < hi; t++) idx[t] = tmp[t]; }; sort(0, n); return res; }`,

    "alien-dictionary": `function alienOrder(words) { const letters = new Set(words.join("")); const after = new Map([...letters].map((c) => [c, new Set()])); const indeg = new Map([...letters].map((c) => [c, 0])); for (let i = 0; i + 1 < words.length; i++) { const a = words[i], b = words[i + 1]; let j = 0; while (j < a.length && j < b.length && a[j] === b[j]) j++; if (j === a.length || j === b.length) { if (a.length > b.length) return ""; continue; } if (!after.get(a[j]).has(b[j])) { after.get(a[j]).add(b[j]); indeg.set(b[j], indeg.get(b[j]) + 1); } } const queue = [...letters].filter((c) => indeg.get(c) === 0).sort(); const order = []; while (queue.length) { const c = queue.shift(); order.push(c); for (const nx of [...after.get(c)].sort()) { indeg.set(nx, indeg.get(nx) - 1); if (indeg.get(nx) === 0) queue.push(nx); } } return order.length === letters.size ? order.join("") : ""; }`,
};
