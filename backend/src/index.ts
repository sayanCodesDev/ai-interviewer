import express from "express";
import { UrlsValidate } from "./validate";
import axios from "axios";
import cors from "cors"
import { GithubScrape } from "./GithubScrape";

const app =express()
app.use(express.json())
app.use(cors({origin:"*"}))

app.post("/api/pre-interview",async (req,res)=>{
    const validate = UrlsValidate.safeParse(req.body)
    if(!validate.success){
        res.status(411).json({msg: "Urls are not correct",validate} )
    }
    const githubUrl = validate.data?.githubUrl   //http://github.com/sayanCodesDev
    const linkedinUrl = validate.data?.linkedinUrl //https://www.linkedin.com/in/sayan-ojha-b6022036b/

    //get username
    const githubUrlUsername= githubUrl?.endsWith("/") ? githubUrl?.split("/").slice(0,-1).pop() : githubUrl?.split("/").pop()
    const linkedinUrlUsername = linkedinUrl?.endsWith("/") ? linkedinUrl?.split("/").slice(0,-1).pop() : linkedinUrl?.split("/").pop()
    
    
    GithubScrape(githubUrlUsername)


    res.json({"githubUrlUsername": githubUrlUsername, })
})


app.listen (3001,()=>{
    console.log("Server started")
})