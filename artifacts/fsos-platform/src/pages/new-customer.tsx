import { Building2, User, MapPin, CreditCard, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";

const STEPS = [
  { id: 1, label: "Business Info", icon: Building2 },
  { id: 2, label: "Contact Details", icon: User },
  { id: 3, label: "Territory & Route", icon: MapPin },
  { id: 4, label: "Credit & Terms", icon: CreditCard },
];

function Field({ label, placeholder, type = "text", required = false, span = 1 }: {
  label: string; placeholder: string; type?: string; required?: boolean; span?: number;
}) {
  return (
    <div className={span === 2 ? "sm:col-span-2" : ""}>
      <label className="block text-xs font-medium text-muted-foreground mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        type={type}
        placeholder={placeholder}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
  );
}

function SelectField({ label, options, required = false }: { label: string; options: string[]; required?: boolean }) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <select className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring appearance-none">
        <option value="">Select…</option>
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </div>
  );
}

export default function NewCustomer() {
  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader title="New Customer Registration" description="Onboard a new outlet to your territory" />

      {/* Stepper */}
      <div className="flex items-center gap-0">
        {STEPS.map((step, i) => (
          <div key={step.id} className="flex items-center flex-1 last:flex-none">
            <div className={[
              "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors",
              step.id === 1
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground",
            ].join(" ")}>
              <step.icon className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">{step.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <ChevronRight className="h-4 w-4 text-muted-foreground/40 mx-1 shrink-0" />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Business Info */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Building2 className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold text-foreground">Business Information</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Business Name" placeholder="e.g. Al Madina Supermarket" required span={2} />
          <SelectField label="Outlet Type" options={["Hypermarket", "Supermarket", "Mini-market", "Convenience", "Pharmacy", "Co-op", "Wholesale"]} required />
          <SelectField label="Channel" options={["Modern Trade", "Traditional Trade", "HoReCa", "Pharmacy", "Online"]} required />
          <Field label="Trade License No." placeholder="e.g. DED-12345678" required />
          <Field label="VAT Number" placeholder="e.g. 100123456789003" />
          <SelectField label="Business Category" options={["Grocery", "FMCG", "Food & Beverage", "Personal Care", "Mixed"]} />
          <Field label="Website" placeholder="https://www.example.com" type="url" />
        </div>
      </div>

      {/* Step 2: Contact Details */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4 opacity-60 pointer-events-none">
        <div className="flex items-center gap-2 mb-1">
          <User className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">Contact Details</p>
          <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Step 2</span>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Primary Contact Name" placeholder="Full name" required />
          <Field label="Job Title" placeholder="e.g. Purchasing Manager" />
          <Field label="Mobile" placeholder="+971 50 XXX XXXX" type="tel" required />
          <Field label="Email" placeholder="buyer@example.com" type="email" />
          <Field label="WhatsApp" placeholder="+971 50 XXX XXXX" type="tel" />
          <Field label="Preferred Contact Time" placeholder="e.g. 9am – 12pm" />
        </div>
      </div>

      {/* Step 3: Territory */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4 opacity-60 pointer-events-none">
        <div className="flex items-center gap-2 mb-1">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">Territory & Route Assignment</p>
          <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Step 3</span>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Street Address" placeholder="Building, Street, Area" required span={2} />
          <SelectField label="Emirate" options={["Dubai", "Abu Dhabi", "Sharjah", "Ajman", "RAK", "Fujairah", "UAQ"]} required />
          <Field label="Area / District" placeholder="e.g. Al Barsha, Deira" required />
          <SelectField label="Assigned Territory" options={["Dubai South", "Dubai North", "Deira", "Business Bay", "Sharjah Central"]} required />
          <SelectField label="Assigned Route" options={["Route D-1", "Route D-2", "Route D-3", "Route D-4", "Route D-5"]} />
          <SelectField label="Visit Frequency" options={["Daily", "3× per week", "2× per week", "Weekly", "Fortnightly", "Monthly"]} required />
          <Field label="Preferred Visit Day" placeholder="e.g. Monday & Thursday" />
        </div>
      </div>

      {/* Step 4: Credit */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4 opacity-60 pointer-events-none">
        <div className="flex items-center gap-2 mb-1">
          <CreditCard className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">Credit & Payment Terms</p>
          <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Step 4</span>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <SelectField label="Payment Terms" options={["Cash on Delivery", "7 Days", "14 Days", "30 Days", "45 Days", "60 Days"]} required />
          <Field label="Credit Limit (AED)" placeholder="e.g. 25000" type="number" />
          <SelectField label="Currency" options={["AED", "USD", "EUR", "GBP"]} />
          <Field label="IBAN / Bank Account" placeholder="AE07 0331 2345 6789 0123 456" />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-2">
        <button className="px-4 py-2 rounded-md border border-border bg-card text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
          Save as Draft
        </button>
        <div className="flex gap-2">
          <button className="px-4 py-2 rounded-md border border-border bg-card text-sm text-foreground hover:bg-accent transition-colors">
            Back
          </button>
          <button className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
            Next Step →
          </button>
        </div>
      </div>
    </div>
  );
}
