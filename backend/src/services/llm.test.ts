import test from "node:test";
import assert from "node:assert/strict";
import { extractProblemStatement } from "./llm";

const TAG = "[SHOW_EDITOR:javascript]";
const extract = (response: string) =>
    extractProblemStatement(response, response.indexOf(TAG), TAG.length);

/**
 * [label, full model response, text that must survive, text that must be stripped]
 *
 * The samples marked "observed" are verbatim shapes qwen3.8-27b and gpt-oss-120b
 * actually produced. The adversarial cases guard the opposite risk: the chatter
 * patterns must never eat a genuine problem statement or its constraints.
 */
const cases: Array<[string, string, string, string | null]> = [
    ["observed: tag first, problem only",
     `${TAG} Write a function called findDuplicate that takes an array of integers where every number is between 1 and n inclusive. There is exactly one duplicate number. Return that duplicate.`,
     "Write a function called findDuplicate", null],

    ["observed: intro sentences before the tag",
     `Welcome to the coding round. I will present one problem at a time. Please write your solution in JavaScript. Remember to consider edge cases. Here is your first problem. ${TAG} You are given an array of integers nums. Find the longest subsequence where consecutive elements differ by exactly 1.`,
     "You are given an array of integers nums", "Welcome to the coding round"],

    ["chatter after the tag instead of before it",
     `${TAG}Welcome to the coding round. Please write your solution in JavaScript. Remember to consider edge cases and time complexity. Here is your first problem. You are given an array of integers nums, find the longest consecutive sequence.`,
     "You are given an array of integers nums", "Welcome to the coding round"],

    ["observed: trailing language housekeeping",
     `${TAG}Given an array of integers nums and an integer target, return the indices of the two numbers such that they add up to target. You can return the answer in any order. Feel free to select your preferred language at the top of the editor.`,
     "You can return the answer in any order", "preferred language"],

    ["trailing 'let me know when you are done'",
     `${TAG}Implement a queue using two stacks. Support push, pop and peek. Let me know when you are done.`,
     "Implement a queue using two stacks", "Let me know when"],

    ["observed: markdown inside the problem text",
     `Welcome to the coding round.\n\n${TAG}\nWrite a function called \`longestConsecutive(nums)\` that returns the length of the **longest** sequence of consecutive numbers.`,
     "longestConsecutive(nums)", "**longest**"],

    ["problem spoken first, tag emitted last",
     `Given a binary tree, return the maximum depth of the tree. The depth is the number of nodes along the longest path. ${TAG}`,
     "Given a binary tree, return the maximum depth", null],

    ["HIDE_EDITOR in the same response",
     `${TAG}Reverse a linked list in place and return the new head. [HIDE_EDITOR]`,
     "Reverse a linked list in place", "HIDE_EDITOR"],

    // --- Adversarial: legitimate problem text that must survive intact ---
    ["statement opening 'Write a function'",
     `Alright. ${TAG}Write a function that merges two sorted arrays into one sorted array without using extra space.`,
     "Write a function that merges two sorted arrays", null],

    ["statement opening 'In this problem'",
     `${TAG}In this problem, you are given a string s. Return the length of the longest palindromic substring.`,
     "In this problem, you are given a string s", null],

    ["statement opening 'Given'",
     `Okay, let's begin. ${TAG}Given an array of integers and a target, return the indices of two numbers adding to the target.`,
     "Given an array of integers and a target", null],

    ["'Remember' mid-statement survives",
     `${TAG}Implement an LRU cache. Remember that get and put must both run in constant time.`,
     "Remember that get and put must both run in constant time", null],

    ["the word 'problem' inside the statement survives",
     `${TAG}This is a classic interval scheduling problem. Given a list of meeting intervals, determine the minimum number of rooms required.`,
     "Given a list of meeting intervals", null],

    ["statement opening 'Good'",
     `${TAG}Good sequences are defined as arrays where every adjacent pair differs by one. Count the good sequences of length n.`,
     "sequences are defined as arrays", null],

    ["trailing complexity constraint is not chatter",
     `${TAG}Search a rotated sorted array for a target and return its index. Return -1 if it is not present. Your solution must run in logarithmic time.`,
     "Your solution must run in logarithmic time", null],

    ["trailing 'return the answer in any order' is not chatter",
     `${TAG}Group all anagrams from a list of strings together. You can return the answer in any order.`,
     "You can return the answer in any order", null],
];

for (const [label, response, mustKeep, mustDrop] of cases) {
    test(`editor question extraction — ${label}`, () => {
        const extracted = extract(response);
        assert.ok(
            extracted.includes(mustKeep),
            `expected the statement to keep "${mustKeep}" but got "${extracted}"`
        );
        if (mustDrop !== null) {
            assert.ok(
                !extracted.includes(mustDrop),
                `expected "${mustDrop}" to be stripped but got "${extracted}"`
            );
        }
    });
}
