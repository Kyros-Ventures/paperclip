# HEARTBEAT.md — What to do on each invocation

This runs every time Paperclip triggers your heartbeat. You must complete these steps in order.

## 1. Check In
Read `$PAPERCLIP_WORKSPACE_DIR/CLAUDE.md` and `$PAPERCLIP_WORKSPACE_DIR/AGENTS.md` to refresh project context. Skip if already read in the current session.

## 2. Check for Assigned Work
```bash
curl -s "$PAPERCLIP_API_URL/api/issues?assigneeAgentId=$PAPERCLIP_AGENT_ID&status=todo" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY"
```

Pick the highest priority issue from the results.

## 3. If No Issues Assigned
If you have no TODO issues assigned and you are a **lead or supervisor**:
- Check your direct reports' work by querying their issues
- Review any completed work that needs your sign-off
- Decompose any backlog issues into smaller tasks and assign them
- Check for new issues in your project that need triage

If you have no TODO issues assigned and you are an **engineer**:
- Report idle status — there is nothing to do right now
- Suggest: ask your lead for work if you've been idle for multiple heartbeats

## 4. If You Have Issues — Execute

For each TODO issue assigned to you:

### 4a. Checkout the Issue
```bash
curl -s -X POST "$PAPERCLIP_API_URL/api/issues/{ISSUE_ID}/checkout" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID" \
  -H "Content-Type: application/json" -d '{}'
```

### 4b. Understand the Task
Read the issue title and description. What is being asked? What project/module/file does it touch?

### 4c. Plan
For complex tasks: write a brief plan before coding. For simple tasks: proceed directly.

### 4d. Execute
Follow your project's workflow:
1. Read relevant files
2. Write code following project conventions
3. Run build: follow `CLAUDE.md` build commands
4. Run tests: `pnpm test` or `./mvnw test` or equivalent
5. Fix any failures

### 4e. Report Results
```bash
# Add a comment with what you did
curl -s -X POST "$PAPERCLIP_API_URL/api/issues/{ISSUE_ID}/comments" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"body": "SUMMARY: what was done, files changed, test results"}'

# Mark as done if complete
curl -s -X PATCH "$PAPERCLIP_API_URL/api/issues/{ISSUE_ID}" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"status": "done"}'
```

## 5. Role-Specific Actions

### If you are a PRODUCT LEAD (pm):
- After completing your own tasks, check your direct reports' issues
- Triage new issues in your project: assign to the right engineer
- Update sprint/backlog priorities

### If you are a SUPERVISOR (pm):
- Review work from engineers under you
- Check for PRs needing review
- Update BOS-LEAD/CONNECT-LEAD on progress

### If you are an ENGINEER:
- Focus on completing your assigned issues
- Report blockers immediately as issue comments
- Update issue status after each significant step

### If you are QA:
- Check for issues marked as needing review
- Run test suites and report coverage
- Flag quality issues as new Paperclip issues

### If you are SENTINEL (security auditor):
- Run security audits per your specialization
- Report findings as new issues assigned to the relevant product lead
- Check for resolved security issues that need verification

### If you are DEVOPS:
- Check CI/CD pipeline status
- Verify deployments and server health
- Address infrastructure issues

## 6. Before Exiting
- Ensure all issue statuses are accurate
- Leave comments on any blocked issues explaining what's needed
- If you couldn't complete work, leave a status update so the next heartbeat can continue
