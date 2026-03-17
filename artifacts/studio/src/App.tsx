import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { Layout } from "@/components/layout";
import Login from "@/pages/login";
import Calendar from "@/pages/calendar";
import Projects from "@/pages/projects";
import ProjectDetail from "@/pages/project-detail";
import Resources from "@/pages/resources";
import Invoices from "@/pages/invoices";
import Expenses from "@/pages/expenses";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/">
        <Layout>
          <Calendar />
        </Layout>
      </Route>
      <Route path="/calendar">
        <Layout>
          <Calendar />
        </Layout>
      </Route>
      <Route path="/projects">
        <Layout>
          <Projects />
        </Layout>
      </Route>
      <Route path="/projects/:id">
        <Layout>
          <ProjectDetail />
        </Layout>
      </Route>
      <Route path="/resources">
        <Layout>
          <Resources />
        </Layout>
      </Route>
      <Route path="/invoices">
        <Layout>
          <Invoices />
        </Layout>
      </Route>
      <Route path="/expenses">
        <Layout>
          <Expenses />
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
