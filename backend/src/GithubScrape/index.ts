import axios from "axios"

export interface GithubRepoData {
  repo: string;
  codebase: string;
}

export async function GithubScrape(githubUrlUsername?: string): Promise<GithubRepoData[]> {
  if (!githubUrlUsername) return [];
  try {
    // Get list of repos (public only, sorted by recently pushed, limit 6)
    const response = await axios.get(
      `https://api.github.com/users/${githubUrlUsername}/repos?sort=pushed&per_page=6`
    );
    const reposName: string[] = response.data.map((x: { name: string }) => x.name);

    // Get codebase content from gitingest for each repo
    const results = await Promise.allSettled(
      reposName.map(async (repo) => {
        const { data } = await axios.get(
          `https://gitingest.com/${githubUrlUsername}/${repo}`,
          {
            headers: { Accept: "text/plain" },
            responseType: "text",
            timeout: 10000
          }
        );
        return {
          repo,
          // Trim each repo codebase to 3000 chars to keep prompt manageable
          codebase: typeof data === "string" ? data.slice(0, 3000) : ""
        };
      })
    );

    // Only keep fulfilled results
    const scraped: GithubRepoData[] = results
      .filter((r): r is PromiseFulfilledResult<GithubRepoData> => r.status === "fulfilled")
      .map(r => r.value);

    console.log(`[GitHub Scrape] Fetched ${scraped.length} repos for ${githubUrlUsername}`);
    return scraped;

  } catch (err: any) {
    console.error("[GitHub Scrape] Error:", err.message);
    return [];
  }
}
