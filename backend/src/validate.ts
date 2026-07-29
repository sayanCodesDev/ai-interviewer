import zod from "zod";

export const UrlsValidate = zod.object({
    githubUrl: zod.string().optional(),
    targetRole: zod.string().min(1, "Target role is required"),
    resumeText: zod.string().optional(),
});

 
