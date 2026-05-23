#!/usr/bin/env python3
"""Create TechnoTrixx agent hierarchy in Paperclip."""

import subprocess, json, sys

BASE = "http://localhost:3101/api"
COMPANY = "a6667983-c6f2-4212-90d3-dd30e897ecd7"  # TechnoTrixx

def api(method, path, body=None):
    args = ["curl", "-s", "-X", method, f"{BASE}{path}", "-H", "Content-Type: application/json"]
    if body:
        args += ["-d", json.dumps(body)]
    result = subprocess.run(args, capture_output=True, text=True)
    try:
        data = json.loads(result.stdout)
    except:
        data = {"_raw": result.stdout, "_status": result.returncode}
    return data

def create_agent(name, role="general", title=None, reports_to=None, permissions=None):
    body = {"name": name, "role": role, "adapterType": "process"}
    if title: body["title"] = title
    if reports_to: body["reportsTo"] = reports_to
    if permissions: body["permissions"] = permissions
    
    # Use agent-hires endpoint which also creates in company context
    path = f"/companies/{COMPANY}/agent-hires"
    result = api("POST", path, body)
    
    if "id" in result:
        return {"id": result["id"], "name": result.get("name", name)}
    elif "error" in result:
        print(f"  ERROR creating {name}: {result['error']}", file=sys.stderr)
        return None
    else:
        print(f"  UNEXPECTED creating {name}: {json.dumps(result)[:200]}", file=sys.stderr)
        return None

agents = {}

print("=== Creating KRYPTON (CTO) ===")
krypton = create_agent("KRYPTON", "cto", "CEO & CTO", permissions={"canCreateAgents": True})
if krypton:
    agents["KRYPTON"] = krypton["id"]
    print(f"  KRYPTON: {krypton['id']}")

print("\n=== Creating Product Leads ===")
products = [
    ("PCMS-LEAD", "pm", "PCMS Product Lead"),
    ("BOS-LEAD", "pm", "Business OS Product Lead"),
    ("STUDIO-LEAD", "pm", "Kyros Studio Product Lead"),
    ("CONNECT-LEAD", "pm", "Kyros Connect Product Lead"),
    ("LEGACY-LEAD", "pm", "Legacy Systems Product Lead"),
    ("CLIP-LEAD", "pm", "Paperclip Product Lead"),
]
for name, role, title in products:
    agent = create_agent(name, role, title, reports_to=agents.get("KRYPTON"))
    if agent:
        agents[name] = agent["id"]
        print(f"  {name}: {agent['id']}")

print("\n=== Creating GUARDIAN (QA Lead) ===")
guardian = create_agent("GUARDIAN", "qa", "QA Lead & Quality Gatekeeper", reports_to=agents.get("KRYPTON"))
if guardian:
    agents["GUARDIAN"] = guardian["id"]
    print(f"  GUARDIAN: {guardian['id']}")

print("\n=== Creating ARCH (Chief Architect) ===")
arch = create_agent("ARCH", "engineer", "Chief Architect, Standards & Documentation", reports_to=agents.get("KRYPTON"), permissions={"canCreateAgents": True})
if arch:
    agents["ARCH"] = arch["id"]
    print(f"  ARCH: {arch['id']}")

print("\n=== Creating SENTINEL Security Agents ===")
sentinels = [
    ("SENTINEL-platform", "qa", "Platform Security Auditor"),
    ("SENTINEL-app", "qa", "Application Security Auditor"),
    ("SENTINEL-framework", "qa", "Framework Security Auditor"),
    ("SENTINEL-infra", "qa", "Infrastructure Security Auditor"),
]
for name, role, title in sentinels:
    agent = create_agent(name, role, title, reports_to=agents.get("ARCH"))
    if agent:
        agents[name] = agent["id"]
        print(f"  {name}: {agent['id']}")

print("\n=== Creating Workers ===")

# PCMS workers
if "PCMS-LEAD" in agents:
    print("--- PCMS Workers ---")
    for name, role, title in [
        ("forge-backend", "engineer", "PCMS Backend Engineer"),
        ("forge-frontend", "engineer", "PCMS Frontend Engineer"),
        ("forge-ops", "devops", "PCMS DevOps Engineer"),
    ]:
        agent = create_agent(name, role, title, reports_to=agents["PCMS-LEAD"])
        if agent:
            agents[name] = agent["id"]
            print(f"  {name}: {agent['id']}")

# BOS workers
if "BOS-LEAD" in agents:
    print("--- BOS Workers ---")
    for name, role, title in [
        ("bos-platform-eng", "engineer", "BOS Platform Engineer"),
        ("bos-frontend-eng", "engineer", "BOS Frontend Engineer"),
        ("bos-modules-eng", "engineer", "BOS Modules Engineer"),
        ("bos-ops", "devops", "BOS DevOps Engineer"),
    ]:
        agent = create_agent(name, role, title, reports_to=agents["BOS-LEAD"])
        if agent:
            agents[name] = agent["id"]
            print(f"  {name}: {agent['id']}")

# Studio workers
if "STUDIO-LEAD" in agents:
    print("--- Studio Workers ---")
    for name, role, title in [
        ("studio-ai", "researcher", "Studio AI Engineer"),
        ("studio-engines", "engineer", "Studio Engines Engineer"),
        ("studio-frontend", "engineer", "Studio Frontend Engineer"),
        ("studio-integrations", "engineer", "Studio Integrations Engineer"),
    ]:
        agent = create_agent(name, role, title, reports_to=agents["STUDIO-LEAD"])
        if agent:
            agents[name] = agent["id"]
            print(f"  {name}: {agent['id']}")

# QA worker
if "GUARDIAN" in agents:
    print("--- QA Worker ---")
    agent = create_agent("qa-engineer", "qa", "QA Engineer", reports_to=agents["GUARDIAN"])
    if agent:
        agents["qa-engineer"] = agent["id"]
        print(f"  qa-engineer: {agent['id']}")

print(f"\n=== SUMMARY: Created {len(agents)} agents ===")
for name, aid in sorted(agents.items()):
    print(f"  {name}: {aid}")
