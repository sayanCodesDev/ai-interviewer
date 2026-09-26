import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { speechText } from "./speechText";

const say = speechText;

describe("speechText: things a synthesiser gets wrong", () => {
    test("Big-O reads as words", () => {
        assert.equal(say("That's O(n log n) time."), "That's O of n log n time.");
        assert.equal(say("It runs in O(1) space."), "It runs in O of one space.");
        assert.equal(say("Brute force is O(n^2)."), "Brute force is O of n squared.");
        assert.equal(say("Or O(2^n) for subsets."), "Or O of two to the n for subsets.");
        assert.equal(say("Sorting is Θ(n log n) at best."), "Sorting is theta of n log n at best.");
    });

    test("powers and scientific numbers", () => {
        assert.equal(say("n can be up to 10^5."), "n can be up to ten to the fifth.");
        assert.equal(say("Use a modulus of 1e9."), "Use a modulus of ten to the nine.");
    });

    test("arrows and comparisons", () => {
        assert.equal(say("Map keys -> values."), "Map keys to values.");
        assert.equal(say("Check that i <= n and j >= 0."), "Check that i is at most n and j is at least 0.");
        assert.equal(say("Is x != y?"), "Is x is not equal to y?");
        assert.equal(say("a && b || c"), "a and b or c");
    });

    test("abbreviations and shorthand", () => {
        assert.equal(say("Use a cache, e.g., Redis, vs. the database."), "Use a cache, for example, Redis, versus the database.");
        assert.equal(say("Handle errors, i.e. retries."), "Handle errors, that is, retries.");
        assert.equal(say("You deploy to k8s w/ Helm."), "You deploy to Kubernetes with Helm.");
        assert.equal(say("Write SQL queries."), "Write sequel queries.");
    });

    test("identifiers and call syntax", () => {
        assert.equal(say("Call two_sum on the input."), "Call two sum on the input.");
        assert.equal(say("Use the hashMap for lookups."), "Use the hash map for lookups.");
        assert.equal(say("Then run process()."), "Then run process.");
    });

    test("addresses", () => {
        assert.equal(say("See github.com/octocat/hello."), "See github dot com slash octocat slash hello.");
        assert.equal(say("Try https://example.com/docs"), "Try example dot com slash docs");
    });

    test("symbols, percentages, dashes, markdown leftovers and emoji", () => {
        assert.equal(say("About 40% faster — nice 🙂"), "About 40 percent faster, nice");
        assert.equal(say("Use `a * b` here"), "Use a b here");
    });
});

describe("speechText: ordinary speech is left alone", () => {
    for (const sentence of [
        "Tell me about a project you're proud of.",
        "What was the hardest technical problem, and how did you solve it?",
        "That sounds workable. Can you walk me through the time complexity?",
        "Thanks, Sam. Let's move on to the coding problem.",
        "I'd start with a hash map, then check the edge cases: an empty array, one element, and duplicates.",
        "You have about five minutes left.",
    ]) {
        test(sentence.slice(0, 40), () => assert.equal(say(sentence), sentence));
    }
});
