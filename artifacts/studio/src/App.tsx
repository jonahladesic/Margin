import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Component, type ReactNode } from "react";
import { Layout } from "@/components/layout";
import { useCurrentUser } from "@/contexts/auth-context";
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import Projects from "@/pages/projects";
import ProjectDetail from "@/pages/project-detail";
import Settings from "@/pages/settings";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex items-center justify-center h-full text-muted-foreground p-8">
          <div className="text-center space-y-2">
            <p className="text-lg font-medium">Unable to load data</p>
            <p className="text-sm">{this.state.error.message}</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isLoading } = useCurrentUser();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="h-6 w-6 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  return <>{children}</>;
}

function AppRouter() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/">
        <RequireAuth>
          <Layout>
            <ErrorBoundary>
              <Dashboard />
            </ErrorBoundary>
          </Layout>
        </RequireAuth>
      </Route>
      <Route path="/dashboard">
        <RequireAuth>
          <Layout>
            <ErrorBoundary>
              <Dashboard />
            </ErrorBoundary>
          </Layout>
        </RequireAuth>
      </Route>
      <Route path="/projects">
        <RequireAuth>
          <Layout>
            <ErrorBoundary>
              <Projects />
            </ErrorBoundary>
          </Layout>
        </RequireAuth>
      </Route>
      <Route path="/projects/:id">
        <RequireAuth>
          <Layout>
            <ErrorBoundary>
              <ProjectDetail />
            </ErrorBoundary>
          </Layout>
        </RequireAuth>
      </Route>
      <Route path="/settings">
        <RequireAuth>
          <Layout>
            <ErrorBoundary>
              <Settings />
            </ErrorBoundary>
          </Layout>
        </RequireAuth>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AppRouter />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
