import "./index.css";
import { Form } from "./components/Form";
import { Interview } from "./components/Interview";
import { Result } from "./components/Result";
import { Signin } from "./components/Signin";
import { Signup } from "./components/Signup";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Toaster } from "sonner";
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from "./components/ThemeContext";

export function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
      <Routes>
        <Route path="/signin" element={<Signin />} />
        <Route path="/signup" element={<Signup />} />

        <Route path="/" element={
          <ProtectedRoute>
            <Form />
          </ProtectedRoute>
        } />
        <Route path="/interview" element={
          <ProtectedRoute>
            <Interview />
          </ProtectedRoute>
        } />
        <Route path="/result" element={
          <ProtectedRoute>
            <Result />
          </ProtectedRoute>
        } />
      </Routes>
      <Toaster />
      </BrowserRouter >
    </ThemeProvider>
  );
}

export default App;
