import zod from "zod";

export const UrlsValidate= zod.object({
    githubUrl : zod.string(),
    linkedinUrl : zod.string(),
})
 
