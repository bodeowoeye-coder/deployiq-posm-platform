import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const page = read("app/workspace/admin/projects/[id]/work-packages/[workPackageId]/template/page.tsx");
const ui = read("components/workspace/BuildTemplateConfiguration.tsx");
const management = read("components/workspace/BuildProjectManagement.tsx");
const workPackages = read("lib/build/workPackages/service.ts");
const templates = read("lib/build/templates/service.ts");
const categories = read("lib/build/activityCategories/service.ts");
const activities = read("lib/build/activityTemplates/service.ts");
const checklists = read("lib/build/checklists/service.ts");
const dependencies = read("lib/build/dependencies/service.ts");
const resources = read("lib/build/resources/service.ts");
const adminPage = read("app/admin/build/template-authoring/page.tsx");

test("S3A-5 customer route resolves canonical Build and Work Package authority", () => {
  assert.match(page, /getBuildProjectWorkspaceOverview\(params\.id\)/);
  assert.match(page, /overview\.workPackages\.find/);
  assert.match(page, /instantiateTemplate/);
});
test("S3A-5 tenant and global templates are visible through existing service scope", () => assert.match(templates, /client_id\.eq\.\$\{clientId\},is_global\.eq\.true/));
test("S3A-5 global template is read-only for customer configuration", () => { assert.match(page, /!configuration\.bundle\.template\.is_global/); assert.match(ui, /Global template · View only/); });
test("S3A-5 cross-tenant template writes fail closed", () => assert.match(templates, /existing\.client_id !== access\.project\.client_id/));
test("S3A-5 archived template writes fail closed", () => assert.match(templates, /Archived templates cannot be modified/));
test("S3A-5 tenant template creation derives ownership and cannot create global", () => { assert.match(templates, /access\.authContext\.is_admin && Boolean\(params\.input\.isGlobal\)/); assert.match(templates, /client_id: isGlobal \? null : access\.project\.client_id/); });
test("S3A-5 category ancestry and customer authority are explicit", () => { assert.match(categories, /allowCustomerAdminWrite: Boolean\(params\.canWrite\)/); assert.match(categories, /normalized\.template_id !== template\.id/); });
test("S3A-5 activity category and template ancestry remain enforced", () => { assert.match(activities, /activity\.template_id !== template\.id/); assert.match(activities, /category\.template_id !== access\.template\.id/); });
test("S3A-5 checklist activity ancestry remains enforced", () => assert.match(checklists, /checklist\.activity_template_id !== access\.activity\.id/));
test("S3A-5 dependencies remain same-template scoped", () => assert.match(dependencies, /Dependency activity references are outside template scope/));
test("S3A-5 dependency self-edge is rejected", () => assert.match(dependencies, /SELF_REFERENCE/));
test("S3A-5 duplicate dependency is rejected", () => assert.match(dependencies, /DUPLICATE_EDGE|Duplicate dependency pair/));
test("S3A-5 dependency cycles remain rejected", () => assert.match(dependencies, /CYCLE/));
test("S3A-5 resources remain tenant or global visible", () => assert.match(resources, /client_id\.eq\.\$\{clientId\},is_global\.eq\.true/));
test("S3A-5 resource requirement ancestry remains enforced", () => { assert.match(resources, /activityTemplateId category must match/); assert.match(resources, /allowCustomerAdminWrite: Boolean\(params\.canWrite\)/); });
test("S3A-5 customer permission is active membership, not coarse client role alone", () => { assert.match(workPackages, /hasCustomerAdminMembership/); assert.match(workPackages, /authContext\.client_id === project\.client_id/); });
test("S3A-5 platform admin authoring route remains role protected", () => assert.match(adminPage, /requireRole\(\["admin"\]/));
test("S3A-5 Retail is excluded by the canonical Build resolver", () => assert.match(page, /getBuildProjectWorkspaceOverview/));
test("S3A-5 selected project controls mixed-tenant behavior", () => assert.match(page, /params\.id/));
test("S3A-5 introduces no legacy client route", () => assert.doesNotMatch([page, ui, management].join("\n"), /["'`]\/client(?:\/|["'`])/));
test("S3A-5 UI separates configuration from runtime execution", () => { assert.match(ui, /Define the work activities required for this Operational Template/); assert.doesNotMatch(ui, /progress percentage|evidence capture|site diary/i); });
test("S3A-5 Work Package exposes modern workspace template entry", () => { assert.match(management, /Manage Template/); assert.match(management, /\/workspace\/admin\/projects/); });
test("S3A-5 UX provides compact internal template navigation", () => {
  assert.match(ui, /Overview/);
  assert.match(ui, /Categories/);
  assert.match(ui, /Activities/);
  assert.match(ui, /Dependencies/);
  assert.match(ui, /Resources/);
  assert.match(ui, /activeSection === "overview"/);
});
test("S3A-5 UX opens only one Activity editor and checklist context at a time", () => {
  assert.match(ui, /editingActivityId === activity\.id/);
  assert.match(ui, /setEditingActivityId\(\(current\)/);
  assert.match(ui, /checklistActivityId === activity\.id/);
  assert.match(ui, /View \/ Edit/);
});
test("S3A-5 UX keeps Category records summary-first", () => {
  assert.match(ui, /editingCategoryId === category\.id/);
  assert.match(ui, /activityCount/);
  assert.match(ui, /editing \? "Close" : "Edit"/);
});
