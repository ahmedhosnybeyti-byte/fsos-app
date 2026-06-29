import { Switch, Route, Router as WouterRouter } from "wouter";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DashboardLayout } from "@/layouts/dashboard-layout";
import Dashboard from "@/pages/dashboard";
import Analytics from "@/pages/analytics";
import Reports from "@/pages/reports";
import Users from "@/pages/users";
import Projects from "@/pages/projects";
import Compliance from "@/pages/compliance";
import Notifications from "@/pages/notifications";
import Settings from "@/pages/settings";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/analytics" component={Analytics} />
        <Route path="/reports" component={Reports} />
        <Route path="/users" component={Users} />
        <Route path="/projects" component={Projects} />
        <Route path="/compliance" component={Compliance} />
        <Route path="/notifications" component={Notifications} />
        <Route path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function App() {
  return (
    <TooltipProvider>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <Router />
      </WouterRouter>
    </TooltipProvider>
  );
}

export default App;
