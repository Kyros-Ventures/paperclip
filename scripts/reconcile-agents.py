#!/usr/bin/env python3
"""Stage 1: Create 5 missing agents + configure all agents with claude_local adapter."""

import subprocess, json, sys

BASE = "http://localhost:3101/api"
COMPANY = "a6667983-c6f2-4212-90d3-dd30e897ecd7"

def api(method, path, body=None):
    args = ["curl", "-s", "-X", method, f"{BASE}{path}", "-H", "Content-Type: application/json"]
    if body: args += ["-d", json.dumps(body)]
    r = subprocess.run(args, capture_output=True, text=True)
    try:
        data = json.loads(r.stdout)
        return data.get("data", data)
    except: return {}

def get_agents():
    return api("GET", f"/companies/{COMPANY}/agents")

def create_agent(name, role, title, parent_name, agent_map, adapter="claude_local", model="claude-sonnet-4-6", workdir=None, permissions=None):
    parent_id = agent_map.get(parent_name, {}).get("id") if parent_name else None
    body = {
        "name": name,
        "role": role,
        "title": title,
        "adapterType": adapter,
        "adapterConfig": {"model": model} | ({"cwd": workdir} if workdir else {}),
    }
    if parent_id: body["reportsTo"] = parent_id
    if permissions: body["permissions"] = permissions
    
    result = api("POST", f"/companies/{COMPANY}/agent-hires", body)
    if "agent" in result:
        agent = result["agent"]
        print(f"  ✓ {agent['name']} ({agent['id'][:8]}...) role={agent['role']}")
        return agent
    elif "error" in result:
        print(f"  ✗ {name}: {result['error']}")
        return None
    else:
        # Might have succeeded but response format differs
        if "id" in result:
            print(f"  ✓ {result.get('name', name)} ({result['id'][:8]}...)")
            return result
        print(f"  ? {name}: {json.dumps(result)[:200]}")
        return None

def patch_agent(agent_id, updates):
    return api("PATCH", f"/agents/{agent_id}", updates)

# Get current state
all_agents = get_agents()
agent_map = {a["name"]: a for a in all_agents}
print(f"Current: {len(all_agents)} agents\n")

# === STEP 1: Create 5 missing agents ===
print("=== Creating 5 missing agents ===")

new_agents = [
    ("forge-ops", "devops", "PCMS DevOps Engineer", "PCMS-LEAD", "~/Documents/Github/PCMS/"),
    ("SENTINEL-app", "qa", "Application Security Auditor", "ARCH", "~/Documents/Github/"),
    ("SENTINEL-framework", "qa", "Framework Security Auditor", "ARCH", "~/Documents/Github/"),
    ("SENTINEL-infra", "qa", "Infrastructure Security Auditor", "ARCH", "~/Documents/Github/"),
    ("qa-engineer", "qa", "QA Test Execution Engineer", "GUARDIAN", "~/Documents/Github/Kyros-Business-OS/"),
]

for name, role, title, parent, workdir in new_agents:
    create_agent(name, role, title, parent, agent_map, workdir=workdir)

# Refresh
all_agents = get_agents()
agent_map = {a["name"]: a for a in all_agents}

# === STEP 2: Configure all agents with claude_local ===
print(f"\n=== Configuring {len(all_agents)} agents ===")

# Working directories per agent
WORKDIRS = {
    "KRYPTON": "~/Documents/Github/",
    "ARCH": "~/Documents/Github/",
    "GUARDIAN": "~/Documents/Github/",
    "OPS": "~/Documents/Github/",
    "REVIEWER": "~/Documents/Github/",
    "PCMS-LEAD": "~/Documents/Github/PCMS/",
    "PCMS-BE": "~/Documents/Github/PCMS/",
    "PCMS-FE": "~/Documents/Github/PCMS/",
    "forge-ops": "~/Documents/Github/PCMS/",
    "BOS-LEAD": "~/Documents/Github/Kyros-Business-OS/",
    "PLATFORM-SUP": "~/Documents/Github/Kyros-Business-OS/",
    "BUSINESS-SUP": "~/Documents/Github/Kyros-Business-OS/",
    "EXPERIENCE-SUP": "~/Documents/Github/Kyros-Business-OS/",
    "VERTICALS-SUP": "~/Documents/Github/Kyros-Business-OS/",
    "MODULE-SUP": "~/Documents/Github/Kyros-Business-OS/",
    "BOS-BE": "~/Documents/Github/Kyros-Business-OS/",
    "BOS-FE": "~/Documents/Github/Kyros-Business-OS/",
    "STUDIO-LEAD": "~/Documents/Github/kyros-studio/",
    "DATA-ENGINE": "~/Documents/Github/kyros-studio/",
    "UI-ENGINE": "~/Documents/Github/kyros-studio/",
    "LOGIC-ENGINE": "~/Documents/Github/kyros-studio/",
    "AUTH-ENGINE": "~/Documents/Github/kyros-studio/",
    "COMMS-ENGINE": "~/Documents/Github/kyros-studio/",
    "STUDIO-BUILDER": "~/Documents/Github/kyros-studio/",
    "CONNECT-LEAD": "~/Documents/Github/kyros-connect/",
    "TELEPHONY-SUP": "~/Documents/Github/kyros-connect/",
    "WHATSAPP-SUP": "~/Documents/Github/kyros-connect/",
    "GATEWAY-SUP": "~/Documents/Github/kyros-connect/",
    "INFRA-SUP": "~/Documents/Github/kyros-connect/",
    "CONNECT-ADMIN-LEAD": "~/Documents/Github/kyros-connect/",
    "CONNECT-TELEPHONY-LEAD": "~/Documents/Github/kyros-connect/",
    "CONNECT-WHATSAPP-LEAD": "~/Documents/Github/kyros-connect/",
    "CONNECT-GATEWAY-LEAD": "~/Documents/Github/kyros-connect/",
    "CONNECT-INFRA-LEAD": "~/Documents/Github/kyros-connect/",
    "CLIP-LEAD": "~/Documents/Github/paperclip/",
    "CLIP-BE": "~/Documents/Github/paperclip/",
    "CLIP-FE": "~/Documents/Github/paperclip/",
    "CLIP-INT": "~/Documents/Github/paperclip/",
    "CLIP-QA": "~/Documents/Github/paperclip/",
    "LEGACY-LEAD": "~/Documents/Github/legacy/",
    "SENTINEL": "~/Documents/Github/",
    "SENTINEL-platform": "~/Documents/Github/",
    "SENTINEL-app": "~/Documents/Github/",
    "SENTINEL-framework": "~/Documents/Github/",
    "SENTINEL-infra": "~/Documents/Github/",
    "qa-engineer": "~/Documents/Github/Kyros-Business-OS/",
}

# Agents to skip (mobile devs - keep as process, too many for Claude instances)
SKIP_CONFIGURE = set(f"PCMS-FE-{i:02d}" for i in range(1, 13))
SKIP_CONFIGURE.update(["CONNECT-BE-01", "CONNECT-BE-02", "CONNECT-BE-03", "CONNECT-BE-04", "CONNECT-BE-05",
                        "CONNECT-FE-01", "CONNECT-FE-02", "CONNECT-FE-03",
                        "CONNECT-INFRA-01", "CONNECT-INFRA-02"])

configured = 0
skipped = 0
errors = 0

for agent in all_agents:
    name = agent["name"]
    aid = agent["id"]
    current_adapter = agent.get("adapterType", "process")
    current_config = agent.get("adapterConfig", {})
    current_model = current_config.get("model", "") if isinstance(current_config, dict) else ""
    
    if name in SKIP_CONFIGURE:
        skipped += 1
        continue
    
    workdir = WORKDIRS.get(name)
    if not workdir:
        print(f"  ? {name}: no workdir mapping")
        skipped += 1
        continue
    
    # Only update if adapter is "process" or model is missing
    needs_update = current_adapter == "process" or not current_model
    
    if not needs_update:
        configured += 1
        continue
    
    updates = {
        "adapterType": "claude_local",
        "adapterConfig": {"model": "claude-sonnet-4-6", "cwd": workdir}
    }
    
    result = patch_agent(aid, updates)
    if isinstance(result, dict) and "error" in result:
        err = str(result.get("error", ""))[:100]
        print(f"  ✗ {name}: {err}")
        errors += 1
    else:
        configured += 1

print(f"\nConfigured: {configured} | Skipped (mobile/connect workers): {skipped} | Errors: {errors}")

# === STEP 3: Final counts ===
all_agents = get_agents()
active = sum(1 for a in all_agents if a.get("status") == "active")
idle = sum(1 for a in all_agents if a.get("status") == "idle")
error = sum(1 for a in all_agents if a.get("status") == "error")
pending = sum(1 for a in all_agents if "pending" in str(a.get("status", "")))
claude = sum(1 for a in all_agents if a.get("adapterType") == "claude_local")

print(f"\nFinal: {len(all_agents)} agents | active={active} idle={idle} error={error} pending={pending}")
print(f"Claude Local: {claude} | Process: {len(all_agents) - claude}")
