import { Switch, Route, Router as WouterRouter } from "wouter";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DashboardLayout } from "@/layouts/dashboard-layout";
import Dashboard from "@/pages/dashboard";
import Customer360 from "@/pages/customer-360";
import CustomerDetail from "@/pages/customer-detail";
import DailyMission from "@/pages/daily-mission";
import LoadingIntelligence from "@/pages/loading-intelligence";
import Route360 from "@/pages/route-360";
import DailyVisitPlan from "@/pages/daily-visit-plan";
import AiAssistant from "@/pages/ai-assistant";
import NewCustomer from "@/pages/new-customer";
import ExecutiveReport from "@/pages/executive-report";
import RouteAnalysis from "@/pages/route-analysis";
import Settings from "@/pages/settings";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/customers" component={Customer360} />
        <Route path="/customers/:id" component={CustomerDetail} />
        <Route path="/daily-mission" component={DailyMission} />
        <Route path="/loading-intelligence" component={LoadingIntelligence} />
        <Route path="/route-360" component={Route360} />
        <Route path="/visits" component={DailyVisitPlan} />
        <Route path="/ai-assistant" component={AiAssistant} />
        <Route path="/new-customer" component={NewCustomer} />
        <Route path="/executive-report" component={ExecutiveReport} />
        <Route path="/route-analysis" component={RouteAnalysis} />
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
