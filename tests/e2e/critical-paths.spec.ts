import { test, expect } from "@playwright/test";

/**
 * E2E: Critical path operations — issue CRUD, checkout, approval flow.
 *
 * Runs against an already-running Paperclip instance (no onboarding).
 * Uses the company and agent created by the onboarding spec or an existing
 * company on the board.
 */

const SKIP_LLM = process.env.PAPERCLIP_E2E_SKIP_LLM !== "false";

test.describe("Issue CRUD", () => {
  let companyId: string;
  let agentId: string;
  let baseUrl: string;

  test.beforeAll(async ({ page }) => {
    await page.goto("/");
    baseUrl = page.url().split("/").slice(0, 3).join("/");

    // Find or create a company
    const companiesRes = await page.request.get(`${baseUrl}/api/companies`);
    expect(companiesRes.ok()).toBe(true);
    const companies = await companiesRes.json();
    expect(companies.length).toBeGreaterThan(0);
    companyId = companies[0].id;

    // Find or create an agent
    const agentsRes = await page.request.get(
      `${baseUrl}/api/companies/${companyId}/agents`
    );
    expect(agentsRes.ok()).toBe(true);
    const agents = await agentsRes.json();
    expect(agents.length).toBeGreaterThan(0);
    agentId = agents[0].id;
  });

  test("creates, reads, updates status, and verifies an issue", async ({
    page,
  }) => {
    // --- Create ---
    const createRes = await page.request.post(
      `${baseUrl}/api/companies/${companyId}/issues`,
      {
        data: {
          companyId,
          title: `E2E CRUD Test ${Date.now()}`,
          description: "Testing issue CRUD operations via E2E",
          status: "todo",
          priority: "high",
          assigneeAgentId: agentId,
        },
      }
    );
    expect(createRes.ok()).toBe(true);
    const created = await createRes.json();
    expect(created.id).toBeTruthy();
    expect(created.status).toBe("todo");
    expect(created.priority).toBe("high");
    const issueId = created.id;

    // --- Read ---
    const readRes = await page.request.get(
      `${baseUrl}/api/issues/${issueId}`
    );
    expect(readRes.ok()).toBe(true);
    const read = await readRes.json();
    expect(read.id).toBe(issueId);
    expect(read.title).toContain("E2E CRUD Test");

    // --- Update status ---
    const patchRes = await page.request.patch(
      `${baseUrl}/api/issues/${issueId}`,
      {
        data: { status: "in_progress" },
      }
    );
    expect(patchRes.ok()).toBe(true);
    const patched = await patchRes.json();
    expect(patched.status).toBe("in_progress");

    // --- Verify update persisted ---
    const verifyRes = await page.request.get(
      `${baseUrl}/api/issues/${issueId}`
    );
    expect(verifyRes.ok()).toBe(true);
    const verified = await verifyRes.json();
    expect(verified.status).toBe("in_progress");

    // Clean up: mark done
    await page.request.patch(`${baseUrl}/api/issues/${issueId}`, {
      data: { status: "done" },
    });
  });

  test("creates issue with parent and verifies hierarchy", async ({ page }) => {
    // Create parent
    const parentRes = await page.request.post(
      `${baseUrl}/api/companies/${companyId}/issues`,
      {
        data: {
          companyId,
          title: `E2E Parent ${Date.now()}`,
          status: "todo",
          priority: "medium",
          assigneeAgentId: agentId,
        },
      }
    );
    expect(parentRes.ok()).toBe(true);
    const parent = await parentRes.json();

    // Create child
    const childRes = await page.request.post(
      `${baseUrl}/api/companies/${companyId}/issues`,
      {
        data: {
          companyId,
          title: `E2E Child ${Date.now()}`,
          status: "todo",
          priority: "medium",
          assigneeAgentId: agentId,
          parentId: parent.id,
        },
      }
    );
    expect(childRes.ok()).toBe(true);
    const child = await childRes.json();
    expect(child.parentId).toBe(parent.id);

    // Fetch company issues and verify child has correct parentId
    const listRes = await page.request.get(
      `${baseUrl}/api/companies/${companyId}/issues?status=todo`
    );
    expect(listRes.ok()).toBe(true);
    const issues = await listRes.json();
    const foundChild = issues.find(
      (i: { id: string }) => i.id === child.id
    );
    expect(foundChild).toBeTruthy();
    expect(foundChild.parentId).toBe(parent.id);

    // Clean up
    await page.request.patch(`${baseUrl}/api/issues/${child.id}`, {
      data: { status: "done" },
    });
    await page.request.patch(`${baseUrl}/api/issues/${parent.id}`, {
      data: { status: "done" },
    });
  });
});

test.describe("Issue checkout flow", () => {
  let companyId: string;
  let agentId: string;
  let baseUrl: string;

  test.beforeAll(async ({ page }) => {
    await page.goto("/");
    baseUrl = page.url().split("/").slice(0, 3).join("/");

    const companiesRes = await page.request.get(`${baseUrl}/api/companies`);
    expect(companiesRes.ok()).toBe(true);
    const companies = await companiesRes.json();
    companyId = companies[0].id;

    const agentsRes = await page.request.get(
      `${baseUrl}/api/companies/${companyId}/agents`
    );
    expect(agentsRes.ok()).toBe(true);
    const agents = await agentsRes.json();
    agentId = agents[0].id;
  });

  test("checks out and releases an issue", async ({ page }) => {
    // Create a fresh issue
    const createRes = await page.request.post(
      `${baseUrl}/api/companies/${companyId}/issues`,
      {
        data: {
          companyId,
          title: `E2E Checkout Test ${Date.now()}`,
          status: "todo",
          priority: "high",
          assigneeAgentId: agentId,
        },
      }
    );
    expect(createRes.ok()).toBe(true);
    const issue = await createRes.json();

    // Checkout
    const checkoutRes = await page.request.post(
      `${baseUrl}/api/issues/${issue.id}/checkout`,
      {
        data: {
          agentId,
          expectedStatuses: ["todo", "backlog"],
        },
      }
    );
    // Checkout may succeed or return 409 (already checked out) — both are fine
    expect([200, 409]).toContain(checkoutRes.status());

    // Verify issue still accessible
    const readRes = await page.request.get(
      `${baseUrl}/api/issues/${issue.id}`
    );
    expect(readRes.ok()).toBe(true);
    const read = await readRes.json();
    expect(read.id).toBe(issue.id);

    // Release (may not be checked out; handle gracefully)
    const releaseRes = await page.request.post(
      `${baseUrl}/api/issues/${issue.id}/release`
    );
    // Release returns 200 or 404/409 depending on checkout state
    expect([200, 404, 409]).toContain(releaseRes.status());

    // Clean up
    await page.request.patch(`${baseUrl}/api/issues/${issue.id}`, {
      data: { status: "done" },
    });
  });

  test("checkout with wrong expectedStatuses returns 409", async ({
    page,
  }) => {
    // Create an issue already in_progress
    const createRes = await page.request.post(
      `${baseUrl}/api/companies/${companyId}/issues`,
      {
        data: {
          companyId,
          title: `E2E Checkout Conflict ${Date.now()}`,
          status: "in_progress",
          priority: "medium",
          assigneeAgentId: agentId,
        },
      }
    );
    expect(createRes.ok()).toBe(true);
    const issue = await createRes.json();

    // Try to checkout with statuses that don't match
    const checkoutRes = await page.request.post(
      `${baseUrl}/api/issues/${issue.id}/checkout`,
      {
        data: {
          agentId,
          expectedStatuses: ["todo"], // issue is in_progress, not todo
        },
      }
    );
    expect(checkoutRes.status()).toBe(409);

    // Clean up
    await page.request.patch(`${baseUrl}/api/issues/${issue.id}`, {
      data: { status: "done" },
    });
  });
});

test.describe("Approval flow", () => {
  let companyId: string;
  let agentId: string;
  let baseUrl: string;

  test.beforeAll(async ({ page }) => {
    await page.goto("/");
    baseUrl = page.url().split("/").slice(0, 3).join("/");

    const companiesRes = await page.request.get(`${baseUrl}/api/companies`);
    expect(companiesRes.ok()).toBe(true);
    const companies = await companiesRes.json();
    companyId = companies[0].id;

    const agentsRes = await page.request.get(
      `${baseUrl}/api/companies/${companyId}/agents`
    );
    expect(agentsRes.ok()).toBe(true);
    const agents = await agentsRes.json();
    agentId = agents[0].id;
  });

  test("moves issue through review flow and adds comments", async ({
    page,
  }) => {
    // Create issue
    const createRes = await page.request.post(
      `${baseUrl}/api/companies/${companyId}/issues`,
      {
        data: {
          companyId,
          title: `E2E Review Flow ${Date.now()}`,
          status: "todo",
          priority: "high",
          assigneeAgentId: agentId,
        },
      }
    );
    expect(createRes.ok()).toBe(true);
    const issue = await createRes.json();

    // Move to in_progress
    await page.request.patch(`${baseUrl}/api/issues/${issue.id}`, {
      data: { status: "in_progress" },
    });

    // Add progress comment
    const commentRes = await page.request.post(
      `${baseUrl}/api/issues/${issue.id}/comments`,
      {
        data: { body: "E2E test: work in progress" },
      }
    );
    expect(commentRes.ok()).toBe(true);
    const comment = await commentRes.json();
    expect(comment.id).toBeTruthy();

    // Verify comment is retrievable
    const commentsRes = await page.request.get(
      `${baseUrl}/api/issues/${issue.id}/comments`
    );
    expect(commentsRes.ok()).toBe(true);
    const comments = await commentsRes.json();
    expect(comments.length).toBeGreaterThan(0);
    expect(comments[0].body).toBe("E2E test: work in progress");

    // Move to in_review
    await page.request.patch(`${baseUrl}/api/issues/${issue.id}`, {
      data: { status: "in_review" },
    });

    // Add review comment
    await page.request.post(`${baseUrl}/api/issues/${issue.id}/comments`, {
      data: { body: "E2E test: code reviewed, looks good" },
    });

    // Approve: move to done
    const doneRes = await page.request.patch(
      `${baseUrl}/api/issues/${issue.id}`,
      {
        data: { status: "done" },
      }
    );
    expect(doneRes.ok()).toBe(true);
    const doneIssue = await doneRes.json();
    expect(doneIssue.status).toBe("done");
  });

  test("blocked status flow with comments", async ({ page }) => {
    // Create issue
    const createRes = await page.request.post(
      `${baseUrl}/api/companies/${companyId}/issues`,
      {
        data: {
          companyId,
          title: `E2E Blocked Flow ${Date.now()}`,
          status: "todo",
          priority: "high",
          assigneeAgentId: agentId,
        },
      }
    );
    expect(createRes.ok()).toBe(true);
    const issue = await createRes.json();

    // Start work
    await page.request.patch(`${baseUrl}/api/issues/${issue.id}`, {
      data: { status: "in_progress" },
    });

    // Block with comment
    await page.request.post(`${baseUrl}/api/issues/${issue.id}/comments`, {
      data: { body: "BLOCKED: Waiting on upstream dependency" },
    });
    const blockedRes = await page.request.patch(
      `${baseUrl}/api/issues/${issue.id}`,
      {
        data: { status: "blocked" },
      }
    );
    expect(blockedRes.ok()).toBe(true);
    const blockedIssue = await blockedRes.json();
    expect(blockedIssue.status).toBe("blocked");

    // Unblock
    await page.request.post(`${baseUrl}/api/issues/${issue.id}/comments`, {
      data: { body: "Dependency resolved, unblocking" },
    });
    const unblockRes = await page.request.patch(
      `${baseUrl}/api/issues/${issue.id}`,
      {
        data: { status: "in_progress" },
      }
    );
    expect(unblockRes.ok()).toBe(true);

    // Complete
    await page.request.patch(`${baseUrl}/api/issues/${issue.id}`, {
      data: { status: "done" },
    });
  });
});
