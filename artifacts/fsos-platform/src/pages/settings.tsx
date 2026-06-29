import { User, MapPin, Bell, Shield, Globe, Smartphone } from "lucide-react";
import { PageHeader } from "@/components/page-header";

const TABS = [
  { id: "profile", label: "Profile", icon: User },
  { id: "territory", label: "Territory", icon: MapPin },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "security", label: "Security", icon: Shield },
];

function Field({ label, defaultValue, placeholder, type = "text" }: {
  label: string; defaultValue?: string; placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1.5">{label}</label>
      <input
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
  );
}

function Toggle({ label, description, enabled = false }: { label: string; description: string; enabled?: boolean }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <button
        className={["relative h-5 w-9 rounded-full transition-colors shrink-0", enabled ? "bg-primary" : "bg-muted"].join(" ")}
        aria-checked={enabled}
        role="switch"
      >
        <span className={["absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform", enabled ? "translate-x-4" : "translate-x-0.5"].join(" ")} />
      </button>
    </div>
  );
}

export default function Settings() {
  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader title="Settings" description="Manage your account and platform preferences" />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map((tab, i) => (
          <button
            key={tab.id}
            className={[
              "flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              i === 0
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Profile Section */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-5">
        {/* Avatar row */}
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary">
            J
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">James Al-Farsi</p>
            <p className="text-xs text-muted-foreground">Sales Representative · Dubai South</p>
            <button className="mt-1.5 text-xs text-primary hover:underline">Change photo</button>
          </div>
        </div>

        <div className="border-t border-border pt-4 grid sm:grid-cols-2 gap-4">
          <Field label="First Name" defaultValue="James" />
          <Field label="Last Name" defaultValue="Al-Farsi" />
          <Field label="Email" defaultValue="james.alfarsi@fsos.ae" type="email" />
          <Field label="Mobile" defaultValue="+971 50 123 4567" type="tel" />
          <Field label="Employee ID" defaultValue="REP-00142" />
          <Field label="Join Date" defaultValue="2023-03-15" type="date" />
        </div>
      </div>

      {/* Territory Section */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <MapPin className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold text-foreground">Territory Assignment</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Primary Territory</label>
            <select className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
              <option>Dubai South</option>
              <option>Dubai North</option>
              <option>Deira</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Reporting Manager</label>
            <input defaultValue="Sarah Okonkwo (Area Manager)" readOnly className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground" />
          </div>
          <Field label="Active Routes" defaultValue="Route D-1, D-2" />
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Visit Days</label>
            <div className="flex gap-1.5 flex-wrap">
              {["Sun", "Mon", "Tue", "Wed", "Thu"].map((d, i) => (
                <button key={d} className={["px-2.5 py-1 rounded-md text-xs font-medium border transition-colors", i < 5 ? "bg-primary/10 text-primary border-primary/20" : "bg-card text-muted-foreground border-border"].join(" ")}>
                  {d}
                </button>
              ))}
              {["Fri", "Sat"].map((d) => (
                <button key={d} className="px-2.5 py-1 rounded-md text-xs font-medium border bg-card text-muted-foreground border-border">
                  {d}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Notifications Section */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold text-foreground">Notification Preferences</p>
        </div>
        <div className="space-y-0">
          <Toggle label="Daily Visit Reminders" description="Receive morning notifications for today's planned visits" enabled={true} />
          <Toggle label="Order Confirmations" description="Get notified when orders are confirmed or updated" enabled={true} />
          <Toggle label="At-Risk Customer Alerts" description="Alerts when a customer hasn't been visited in 7+ days" enabled={true} />
          <Toggle label="Weekly Performance Report" description="Receive your weekly summary every Sunday evening" enabled={false} />
          <Toggle label="Route Change Notifications" description="Notify when route assignments are updated by manager" enabled={true} />
          <Toggle label="New Product Launches" description="Alerts on new SKU launches and promotions" enabled={false} />
        </div>
      </div>

      {/* App Preferences */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Globe className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold text-foreground">App Preferences</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Language</label>
            <select className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
              <option>English</option>
              <option>Arabic</option>
              <option>French</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Currency</label>
            <select className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
              <option>AED – UAE Dirham</option>
              <option>USD – US Dollar</option>
              <option>EUR – Euro</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Date Format</label>
            <select className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
              <option>DD/MM/YYYY</option>
              <option>MM/DD/YYYY</option>
              <option>YYYY-MM-DD</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Theme</label>
            <select className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
              <option>System Default</option>
              <option>Light</option>
              <option>Dark</option>
            </select>
          </div>
        </div>
      </div>

      {/* Mobile App */}
      <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-4">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Smartphone className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">FSOS Mobile App</p>
          <p className="text-xs text-muted-foreground">Last synced: Today at 08:45 AM · v2.4.1</p>
        </div>
        <button className="px-3 py-1.5 rounded-md border border-border text-sm text-foreground hover:bg-accent transition-colors shrink-0">
          Sync Now
        </button>
      </div>

      {/* Save */}
      <div className="flex justify-end gap-3 pt-2">
        <button className="px-4 py-2 rounded-md border border-border bg-card text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
          Discard
        </button>
        <button className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
          Save Changes
        </button>
      </div>
    </div>
  );
}
