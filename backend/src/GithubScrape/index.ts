import axios from "axios"

export async function GithubScrape(githubUrlUsername?: string){
    //get repos name 
    const response =await axios.get(`https://api.github.com/users/${githubUrlUsername}/repos`,)
    const reposName: string[] = await response.data.map((x: { name: string }) => x.name)

    //get the contents of each repos
    const results = await Promise.all(
        reposName.map(async (repo) => {
          const { data } = await axios.get(
            `https://gitingest.com/${githubUrlUsername}/${repo}`,
            {
              headers: { Accept: "text/plain" },
              responseType: "text" // 
            }
          );
          return {
            repo,
            codebase: data
          };
        })
      );
    console.log(results)

}