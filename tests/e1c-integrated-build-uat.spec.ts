import { expect, test, type APIResponse, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

type Manifest = { fixture: { projectId:string;siteId:string }; workPackages:Array<{id:string;code:string}>; identities:Record<string,{userId:string;email:string}> };
const manifestPath = process.env.E1C_UAT_MANIFEST;
const password = process.env.E1C_UAT_PASSWORD;
const baseURL = process.env.E1C_UAT_BASE_URL ?? "http://localhost:3000";
if (!manifestPath || !password || process.env.DEPLOYIQ_ENVIRONMENT !== "local") throw new Error("E1C browser UAT requires its guarded local runner.");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
const scope = { projectId: manifest.fixture.projectId, siteId: manifest.fixture.siteId, workPackageId: manifest.workPackages.find((item)=>item.code==="WP-03")!.id };
const service=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});

async function body(response: APIResponse) { const value=await response.json().catch(()=>null); expect(response.ok(), JSON.stringify(value)).toBeTruthy(); return value; }
async function signIn(browser: Browser, persona: string, viewport={width:1280,height:800}) {
  const context=await browser.newContext({ viewport });
  const page=await context.newPage();
  await page.goto(`${baseURL}/login?returnTo=%2Fworkspace%2Fbuild`);
  const skip=page.locator('section[aria-label="DeployIQ product introduction"] button',{hasText:"Skip"});
  await skip.waitFor({state:"visible",timeout:1500}).then(()=>skip.click()).catch(()=>undefined);
  await page.locator('input[name="email"]').fill(manifest.identities[persona].email);
  await page.locator('input[name="password"]').fill(password!);
  await page.getByRole("button",{name:"Sign in",exact:true}).click();
  await page.waitForURL((url)=>!url.pathname.startsWith("/login"),{timeout:20_000});
  return {context,page};
}
async function close(session:{context:BrowserContext}) { await session.context.close(); }
async function patchActivity(page:Page,id:string,payload:Record<string,unknown>){return body(await page.request.patch(`${baseURL}/api/build/runtime-activities/${id}`,{data:{...scope,...payload}}));}

test("E1C integrated construction workflow", async ({browser}) => {
  test.setTimeout(300_000);
  const admin=await signIn(browser,"customerAdmin");
  await expect(admin.page).toHaveURL(/\/workspace\/admin/);
  const created=await body(await admin.page.request.post(`${baseURL}/api/build/work-plans`,{data:scope}));
  expect(created.plan.activities).toHaveLength(7);
  const activities=Object.fromEntries(created.plan.activities.map((item:any)=>[item.code,item]));
  const baseline=await body(await admin.page.request.patch(`${baseURL}/api/build/work-plans`,{data:{...scope,action:"baseline-schedule",baselineStart:"2026-10-19T07:00:00.000Z"}}));
  expect(baseline.schedule.activities).toHaveLength(7);
  const notificationSettings=await body(await admin.page.request.get(`${baseURL}/api/workspace/build/projects/${scope.projectId}/notification-settings`));
  expect(notificationSettings.eligibleRecipients.some((item:any)=>item.userId===manifest.identities.projectManager.userId)).toBeTruthy();
  await body(await admin.page.request.put(`${baseURL}/api/workspace/build/projects/${scope.projectId}/notification-settings`,{data:{preferences:notificationSettings.preferences.map((item:any)=>({category:item.category,enabled:true,revision:item.revision,recipientUserIds:[manifest.identities.projectManager.userId]}))}}));
  await close(admin);

  const manager=await signIn(browser,"projectManager");
  await expect(manager.page).toHaveURL(/\/workspace\/build/);
  const fieldAssignment=await manager.page.request.patch(`${baseURL}/api/build/runtime-activities/${activities.A100.id}`,{data:{...scope,action:"assign_responsibility",ownerUserId:manifest.identities.fieldCoordinator.userId,supervisorUserId:manifest.identities.supervisor.userId}});
  expect(fieldAssignment.status()).toBe(200);
  for (const code of ["A110","A120","A130","A140"]) await patchActivity(manager.page,activities[code].id,{action:"assign_responsibility",ownerUserId:manifest.identities.supervisor.userId,supervisorUserId:manifest.identities.supervisor.userId});
  await close(manager);

  const field=await signIn(browser,"fieldCoordinator",{width:390,height:844});
  await patchActivity(field.page,activities.A100.id,{action:"start"});
  await field.context.grantPermissions(["geolocation"],{origin:baseURL});
  await field.context.setGeolocation({latitude:6.5244,longitude:3.3792,accuracy:12});
  await field.page.goto(`${baseURL}/workspace/build/projects/${scope.projectId}/activities/${activities.A100.id}?view=evidence`);
  await field.page.getByRole("button",{name:"Capture device location"}).click();
  await field.context.setOffline(true);
  await field.page.getByLabel("Choose from device").setInputFiles({name:"a100-progress.png",mimeType:"image/png",buffer:Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=","base64")});
  await field.page.getByRole("button",{name:"Save evidence safely"}).click();
  await expect(field.page.getByRole("status")).toContainText("pending synchronization");
  await field.context.setOffline(false);
  await expect.poll(async()=>{
    const {count}=await service.from("build_runtime_evidence").select("id",{count:"exact",head:true}).eq("project_id",scope.projectId).eq("runtime_activity_id",activities.A100.id);
    return count;
  },{timeout:30_000,message:"Reconnect should synchronize the retained A100 evidence before navigation."}).toBe(1);
  await field.page.goto(`${baseURL}/workspace/build/sync`);
  await expect(field.page.getByText("No evidence is waiting on this device.")).toBeVisible({timeout:30_000});
  await patchActivity(field.page,activities.A100.id,{action:"complete"});
  await close(field);

  const sequential=await signIn(browser,"supervisor",{width:390,height:844});
  for (const code of ["A110","A120","A130"]) { await patchActivity(sequential.page,activities[code].id,{action:"start"}); await patchActivity(sequential.page,activities[code].id,{action:"complete"}); }
  await close(sequential);

  const supervisor=await signIn(browser,"supervisor",{width:430,height:844});
  await patchActivity(supervisor.page,activities.A140.id,{action:"start"});
  await supervisor.page.goto(`${baseURL}/workspace/build/projects/${scope.projectId}/activities/${activities.A140.id}?view=evidence`);
  await supervisor.page.getByLabel("Choose from device").setInputFiles({name:"a140-concrete-pour.png",mimeType:"image/png",buffer:Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=","base64")});
  await supervisor.page.getByRole("button",{name:"Save evidence safely"}).click();
  await expect(supervisor.page.getByRole("status")).toContainText("Evidence synchronized and confirmed by the server.",{timeout:30_000});
  const execution=await body(await supervisor.page.request.get(`${baseURL}/api/build/runtime-activities/${activities.A140.id}?${new URLSearchParams(scope)}`));
  const checklistId=execution.execution.checklistItems[0].id;
  await body(await supervisor.page.request.patch(`${baseURL}/api/build/runtime-activities/${activities.A140.id}/checklist`,{data:{...scope,checklistItemId:checklistId,result:"passed",note:"Reinforcement spacing and concrete cover verified."}}));
  const operationId=crypto.randomUUID();
  const notePayload={...scope,action:"note",evidenceType:"note",note:"Concrete pour evidence recorded for integrated UAT.",operationId,deviceCapturedAt:new Date().toISOString(),deviceTimezoneOffsetMinutes:-60,gpsSource:"unavailable",locationStatus:"unavailable"};
  const evidence=await body(await supervisor.page.request.post(`${baseURL}/api/build/runtime-activities/${activities.A140.id}/evidence`,{data:notePayload}));
  const duplicate=await body(await supervisor.page.request.post(`${baseURL}/api/build/runtime-activities/${activities.A140.id}/evidence`,{data:notePayload}));
  expect(duplicate.id).toBe(evidence.id);
  await body(await supervisor.page.request.post(`${baseURL}/api/build/runtime-activities/${activities.A140.id}/inspection`,{data:{...scope,action:"submit"}}));
  await close(supervisor);

  const reviewer=await signIn(browser,"projectManager");
  const changed=await body(await reviewer.page.request.post(`${baseURL}/api/build/runtime-activities/${activities.A140.id}/inspection`,{data:{...scope,action:"inspect",outcome:"changes_required",comments:"Concrete cover requires corrective verification."}}));
  const inspectionId=changed.execution.inspections.at(-1).id;
  const exceptionCreated=await body(await reviewer.page.request.post(`${baseURL}/api/build/runtime-activities/${activities.A140.id}/exceptions`,{data:{...scope,action:"create",inspectionId,title:"Insufficient concrete cover",description:"Correct cover blocks and submit remediation evidence.",severity:"high",ownerUserId:manifest.identities.supervisor.userId,dueAt:"2026-12-01T12:00:00.000Z"}}));
  const exceptionId=exceptionCreated.execution.exceptions.at(-1).id;
  await reviewer.page.goto(`${baseURL}/workspace/build/projects/${scope.projectId}/attention`);
  await expect(reviewer.page.getByRole("heading",{name:"Management Attention"})).toBeVisible();
  await expect(reviewer.page.getByRole("link",{name:"Open Activity"}).first()).toBeVisible();
  const notificationFeed=await body(await reviewer.page.request.get(`${baseURL}/api/workspace/notifications`));
  const notification=notificationFeed.notifications.find((item:any)=>item.projectId===scope.projectId && item.destination?.available);
  expect(notification).toBeTruthy();
  await reviewer.page.goto(`${baseURL}/workspace/notifications/${encodeURIComponent(notification.id)}`);
  await expect(reviewer.page.getByText("Authorized notification destination")).toBeVisible();
  await close(reviewer);

  const remediation=await signIn(browser,"supervisor");
  await body(await remediation.page.request.post(`${baseURL}/api/build/runtime-activities/${activities.A140.id}/exceptions`,{data:{...scope,action:"start_remediation",exceptionId}}));
  await body(await remediation.page.request.post(`${baseURL}/api/build/runtime-activities/${activities.A140.id}/evidence`,{data:{...scope,action:"note",evidenceType:"note",exceptionId,note:"Cover blocks corrected and independently measurable."}}));
  await body(await remediation.page.request.post(`${baseURL}/api/build/runtime-activities/${activities.A140.id}/exceptions`,{data:{...scope,action:"resolve",exceptionId,note:"Correct cover blocks installed and checked."}}));
  await close(remediation);

  const verifier=await signIn(browser,"projectManager");
  const verified=await body(await verifier.page.request.post(`${baseURL}/api/build/runtime-activities/${activities.A140.id}/exceptions`,{data:{...scope,action:"verify",exceptionId,note:"Independent verification complete."}}));
  expect(verified.execution.exceptions.find((item:any)=>item.id===exceptionId).status).toBe("verified");
  await close(verifier);

  const intelligence=await signIn(browser,"customerAdmin");
  await intelligence.page.goto(`${baseURL}/workspace/admin/projects/${scope.projectId}/reports`);
  await expect(intelligence.page.getByText("Management Attention",{exact:true}).first()).toBeVisible();
  await intelligence.page.goto(`${baseURL}/workspace/admin/projects/${scope.projectId}/executive-intelligence`);
  await expect(intelligence.page.getByRole("heading",{name:"Executive Intelligence",exact:true})).toBeVisible();
  await close(intelligence);

  const viewer=await signIn(browser,"viewer",{width:360,height:800});
  await viewer.page.goto(`${baseURL}/workspace/build/projects/${scope.projectId}/activities/${activities.A140.id}`);
  await expect(viewer.page.getByText("Read-only Activity")).toBeVisible();
  const denied=await viewer.page.request.patch(`${baseURL}/api/build/runtime-activities/${activities.A140.id}`,{data:{...scope,action:"resume"}});
  expect([403,404]).toContain(denied.status());
  await close(viewer);

  for (const persona of ["unassigned","crossTenant","retailInstaller","ambiguousManager"]) {
    const session=await signIn(browser,persona);
    const response=await session.page.request.get(`${baseURL}/api/build/runtime-activities/${activities.A140.id}?${new URLSearchParams(scope)}`);
    expect([403,404]).toContain(response.status());
    await close(session);
  }

  const [{count:evidenceCount},{count:eventCount},{count:exceptionCount}]=await Promise.all([
    service.from("build_runtime_evidence").select("id",{count:"exact",head:true}).eq("project_id",scope.projectId).eq("runtime_activity_id",activities.A140.id),
    service.from("build_runtime_activity_events").select("id",{count:"exact",head:true}).eq("project_id",scope.projectId),
    service.from("build_runtime_exceptions").select("id",{count:"exact",head:true}).eq("project_id",scope.projectId),
  ]);
  expect(evidenceCount).toBe(3);
  expect(eventCount).toBeGreaterThan(10);
  expect(exceptionCount).toBe(1);
});
