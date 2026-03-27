import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Component, type ReactNode } from "react";
import { Layout } from "@/components/layout";
import Login from "@/pages/login";
import Calendar from "@/pages/calendar";
import Projects from "@/pages/projects";
import ProjectDetail from "@/pages/project-detail";
import Resources from "@/pages/resources";
import Invoices from "@/pages/invoices";
import Expenses from "@/pages/expenses";
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
            <p className="text-xs">The API backend is not running.</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/">
        <Layout>
          <ErrorBoundary>
            <Calendar />
          </ErrorBoundary>
        </Layout>
      </Route>
      <Route path="/calendar">
        <Layout>
          <ErrorBoundary>
            <Calendar />
          </ErrorBoundary>
        </Layout>
      </Route>
      <Route path="/projects">
        <Layout>
          <ErrorBoundary>
            <Projects />
          </ErrorBoundary>
        </Layout>
      </Route>
      <Route path="/projects/:id">
        <Layout>
          <ErrorBoundary>
            <ProjectDetail />
          </ErrorBoundary>
        </Layout>
      </Route>
      <Route path="/resources">
        <Layout>
          <ErrorBoundary>
            <Resources />
          </ErrorBoundary>
        </Layout>
      </Route>
      <Route path="/invoices">
        <Layout>
          <ErrorBoundary>
            <Invoices />
          </ErrorBoundary>
        </Layout>
      </Route>
      <Route path="/expenses">
        <Layout>
          <ErrorBoundary>
            <Expenses />
          </ErrorBoundary>
        </Layout>
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
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
