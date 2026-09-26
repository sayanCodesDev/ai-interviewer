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
};
