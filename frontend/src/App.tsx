import "./index.css";
import { useState } from "react";
import { Form } from "@/components/Form"
import { Interview } from "@/components/Interview";
import { Result } from "@/components/Result";
import { Toaster } from "sonner"
import { BrowserRouter, Routes, Route } from 'react-router-dom';

export function App() {
  return <BrowserRouter>
    <Routes>
      <Route path="/" element={<Form />} />
      <Route path="/interview" element={<Interview />} />
      <Route path="result" element={<Result />} />
    </Routes>
    <Toaster />
  </BrowserRouter>
}

export default App;
