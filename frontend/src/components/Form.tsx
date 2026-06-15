import {useState} from "react";
import axios from "axios";
import { toast } from "sonner";
import { BACKEND_URL } from "@/lib/config";

export function Form(){
    const [githubUrl,setGithubUrl] = useState("");
    const [linkedinUrl,setLinkedinUrl] = useState("");

    async function submit(){
        if(!githubUrl || !linkedinUrl){
            toast.warning("URL inputs cannt be empty", { position: "bottom-right" })
            return;
        }
        await axios.post(`${BACKEND_URL}/api/pre-interview`,{
            githubUrl,
            linkedinUrl
        })
    }

    return (
        <div className="h-screen w-screen flex flex-col items-center justify-center gap-4">
            <h1 className="text-4xl font-medium">Ai Interviewer</h1>
            
            <input className=" min-w-sm border-1 border-black/10 rounded-md p-2 font-light " 
            type="text" placeholder="Your Github URL" onChange={(e)=>{
                setGithubUrl(e.target.value)
            }
            } />
            <input className=" min-w-sm border-1 border-black/10 rounded-md p-2 font-light " 
            type="text" placeholder="Your Linkedin URL" onChange={(e)=>{
                setLinkedinUrl(e.target.value)
            }}/>
            
            <button className="bg-black/10 border-1 border-black/10 rounded-lg px-2 py-0.5 cursor-pointer shadow-sm"
            onClick={submit}>Start interview</button>
        </div>
    )
}