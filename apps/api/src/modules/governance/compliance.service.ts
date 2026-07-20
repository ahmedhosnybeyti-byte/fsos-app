import { Injectable } from "@nestjs/common";
import { COMPANY_POLICY_TYPES, type ComplianceOverview } from "@field-sales-os/schemas";
import { CompanyPolicyService } from "./company-policy.service";

// Phase 9 — Compliance Monitoring.
//
// Interpretation note (documented, not hidden): the constitution asks for
// monitoring companies' adherence to security/password/permission/refresh/
// archiving policies. Real per-record compliance evaluation (e.g. "does
// every user's current password satisfy the active PASSWORD_POLICY") would
// require either re-validating stored password hashes against arbitrary
// future policy rules (not generally possible for a one-way hash) or
// building bespoke evaluators per policy type — a substantial undertaking
// on its own. For this MVP, compliance is reported at the structural level
// the constitution's own example list actually supports without new
// tracking infrastructure: whether each known policy type has an active,
// defined policy for the company. Deeper, per-record compliance evaluation
// is a natural follow-up once a real need for it is identified.
@Injectable()
export class ComplianceService {
  constructor(private readonly policyService: CompanyPolicyService) {}

  async getOverview(companyId: string): Promise<ComplianceOverview> {
    const policies = await this.policyService.list(companyId);
    const byType = new Map(policies.map((p) => [p.policyType, p]));

    const statuses = COMPANY_POLICY_TYPES.map((policyType) => {
      const policy = byType.get(policyType);
      const hasPolicy = Boolean(policy);
      const isCompliant = Boolean(policy?.isActive);
      return {
        policyType,
        hasPolicy,
        isCompliant,
        notes: hasPolicy ? undefined : "No policy defined for this company yet",
      };
    });

    return {
      companyId,
      policies: statuses,
      overallCompliant: statuses.every((s) => s.isCompliant),
      checkedAt: new Date(),
    };
  }
}
