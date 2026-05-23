#!/usr/bin/env python3
"""Clean duplicates and fix minor hierarchy issues in TechnoTrixx."""
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
    except: return []

def patch(agent_id, updates):
    return api("PATCH", f"/agents/{agent_id}", updates)

# Get all agents
all_agents = api("GET", f"/companies/{COMPANY}/agents")
agent_map = {a["name"]: a for a in all_agents}
print(f"Total: {len(all_agents)} agents")

# Show current state
for a in sorted(all_agents, key=lambda x: (x.get("status",""), x["name"])):
    parent_id = a.get("reportsTo")
    parent_name = ""
    if parent_id:
        for name, ag in agent_map.items():
            if ag["id"] == parent_id:
                parent_name = name
                break
    print(f"  {a['name']:25s} {a.get('status','?'):16s} → {parent_name or '-'}")

print("\n=== DUPLICATES TO REMOVE ===")
# Find duplicates: " 2" suffix + pending_approval
dupes = [a for a in all_agents if a["name"].endswith(" 2") and a.get("status") == "pending_approval"]
# Also SENTINEL-* pending_approval (we keep singular SENTINEL which already reports to ARCH)
sentinels = [a for a in all_agents if a["name"].startswith("SENTINEL-") and a.get("status") == "pending_approval"]

to_remove = dupes + sentinels
print(f"Removing {len(to_remove)} duplicates...")
for a in to_remove:
    r = api("POST", f"/agents/{a['id']}/terminate")
    ok = "ok" if "error" not in str(r) else r
    print(f"  Terminated {a['name']}: {ok}")

print("\n=== FIX HIERARCHY ===")
# Refresh
all_agents = api("GET", f"/companies/{COMPANY}/agents")
agent_map = {a["name"]: a for a in all_agents}

fixes = [
    # child → correct parent
    ("CLIP-QA", "CLIP-LEAD"),       # was reporting to KRYPTON
    ("STUDIO-BUILDER", "STUDIO-LEAD"), # was reporting to COMMS-ENGINE
]

for child_name, parent_name in fixes:
    child = agent_map.get(child_name)
    parent = agent_map.get(parent_name)
    if not child or not parent:
        print(f"  SKIP {child_name}: not found")
        continue
    current_parent = child.get("reportsTo", "")
    if current_parent == parent["id"]:
        print(f"  {child_name} → {parent_name}: already correct")
        continue
    r = patch(child["id"], {"reportsTo": parent["id"]})
    ok = "id" in str(r) or "agent" in str(r)
    print(f"  {child_name} → {parent_name}: {'✓' if ok else r}")

print("\n=== FINAL STATE ===")
all_agents = api("GET", f"/companies/{COMPANY}/agents")
agent_map = {a["name"]: a for a in all_agents}

# Count
active = sum(1 for a in all_agents if a.get("status") == "active")
idle = sum(1 for a in all_agents if a.get("status") == "idle")
error = sum(1 for a in all_agents if a.get("status") == "error")
pending = sum(1 for a in all_agents if "pending" in str(a.get("status","")))
orphans = sum(1 for a in all_agents if not a.get("reportsTo"))

print(f"Total: {len(all_agents)} | active={active} idle={idle} error={error} pending={pending} | orphans={orphans}")
print("\nHierarchy tree:")
# Build tree
def build_tree():
    by_id = {a["id"]: a for a in all_agents}
    children = {}
    for a in all_agents:
        pid = a.get("reportsTo") or "ROOT"
        children.setdefault(pid, []).append(a)
    
    def show(pid, depth=0):
        prefix = "  " * depth + ("├─ " if depth > 0 else "")
        for a in sorted(children.get(pid, []), key=lambda x: x["name"]):
            status = a.get("status","?")
            name = a["name"]
            print(f"{prefix}{name} ({status})")
            show(a["id"], depth + 1)
    
    show("ROOT")

build_tree()
