import { domAnimation, LazyMotion, MotionConfig } from "motion/react";
import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";

import { PageLoader } from "@/components/PageLoader";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AuthProvider } from "@/context/AuthContext";
import { ThemeProvider, useTheme } from "@/context/ThemeContext";
import { SeoManager } from "@/components/SeoManager";
import { Dashboard } from "@/pages/Dashboard";
import { Lobby } from "@/pages/Lobby";
import { NotFound } from "@/pages/NotFound";
import { Setup } from "@/pages/Setup";
import { Signin } from "@/pages/Signin";
import { Signup } from "@/pages/Signup";

// Landing pulls in the motion-heavy marketing sections and Interview pulls in Monaco,
// so neither is downloaded until its route is visited.
const Landing = lazy(() => import("@/pages/Landing").then((module) => ({ default: module.Landing })));
const Interview = lazy(() => import("@/pages/Interview").then((module) => ({ default: module.Interview })));
const RolesIndex = lazy(() => import("@/pages/RolesIndex").then((module) => ({ default: module.RolesIndex })));
const RolePage = lazy(() => import("@/pages/RolePage").then((module) => ({ default: module.RolePage })));
const Privacy = lazy(() => import("@/pages/Privacy").then((module) => ({ default: module.Privacy })));
const Terms = lazy(() => import("@/pages/Terms").then((module) => ({ default: module.Terms })));
const Report = lazy(() => import("@/pages/Report").then((module) => ({ default: module.Report })));

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

/** Providers shared by the browser app and the build-time prerender. */
export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <LazyMotion features={domAnimation} strict>
          <MotionConfig reducedMotion="user">{children}</MotionConfig>
        </LazyMotion>
      </AuthProvider>
    </ThemeProvider>
  );
}

export function AppRoutes() {
  return (
    <>
      <SeoManager />
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/" element={<Landing />} />
                  <Route path="/mock-interviews" element={<RolesIndex />} />
                  <Route path="/mock-interviews/:slug" element={<RolePage />} />
                  <Route path="/privacy" element={<Privacy />} />
                  <Route path="/terms" element={<Terms />} />
                  <Route path="/signin" element={<Signin />} />
                  <Route path="/signup" element={<Signup />} />

                  <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                  <Route path="/setup" element={<ProtectedRoute><Setup /></ProtectedRoute>} />
                  <Route path="/lobby/:id" element={<ProtectedRoute><Lobby /></ProtectedRoute>} />
                  <Route path="/interview/:id" element={<ProtectedRoute><Interview /></ProtectedRoute>} />
                  <Route path="/report/:id" element={<ProtectedRoute><Report /></ProtectedRoute>} />

                  {/* Routes from the first version of the app. */}
                  <Route path="/form" element={<Navigate to="/setup" replace />} />
                  <Route path="/interview" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/result" element={<Navigate to="/dashboard" replace />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
    </>
  );
}

/** Everything inside the router; the browser and the build-time prerender render exactly this. */
export function AppContent() {
  return (
    <>
      <AppRoutes />
      <ThemedToaster />
    </>
  );
}

export function App() {
  return (
    <AppProviders>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </AppProviders>
  );
}

export default App;
