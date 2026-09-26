import "./index.css";
import { domAnimation, LazyMotion, MotionConfig } from "motion/react";
import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";

import { PageLoader } from "@/components/PageLoader";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AuthProvider } from "@/context/AuthContext";
import { ThemeProvider, useTheme } from "@/context/ThemeContext";
import { NotFound } from "@/pages/NotFound";
import { Result } from "@/pages/Result";
import { Setup } from "@/pages/Setup";
import { Signin } from "@/pages/Signin";
import { Signup } from "@/pages/Signup";

// Landing pulls in the motion-heavy marketing sections and Interview pulls in Monaco,
// so neither is downloaded until its route is visited.
const Landing = lazy(() => import("@/pages/Landing").then((module) => ({ default: module.Landing })));
const Interview = lazy(() => import("@/pages/Interview").then((module) => ({ default: module.Interview })));

function ThemedToaster() {
  const { theme } = useTheme();

  return (
    <Toaster
      theme={theme}
      position="bottom-right"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius-lg)",
          fontFamily: "var(--font-sans)",
        } as React.CSSProperties
      }
    />
  );
}

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <LazyMotion features={domAnimation} strict>
          <MotionConfig reducedMotion="user">
            <BrowserRouter>
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/" element={<Landing />} />
                  <Route path="/signin" element={<Signin />} />
                  <Route path="/signup" element={<Signup />} />

                  <Route
                    path="/form"
                    element={
                      <ProtectedRoute>
                        <Setup />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/interview"
                    element={
                      <ProtectedRoute>
                        <Interview />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/result"
                    element={
                      <ProtectedRoute>
                        <Result />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
              <ThemedToaster />
            </BrowserRouter>
          </MotionConfig>
        </LazyMotion>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
