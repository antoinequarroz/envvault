import type { CommandBridge, Dashboard, RestorePlan, Scanned, Tab } from "./App";

export type PreviewMode = "normal" | "empty" | "loading" | "error";

const project = {
  id: "project-1",
  name: "Site Antoine Quarroz",
  root: "/Users/antoine/Projects/antoinequarroz.ch",
  included: [".env", "apps/web/.env.local"],
};

const dashboard: Dashboard = {
  initialized: true,
  projects: [project],
  backups: [
    {
      id: "01J8AQENVVAULT2026B4C9D3",
      project_id: project.id,
      project_name: project.name,
      created_at: "2026-09-23T08:42:00.000Z",
      file_count: 2,
    },
    {
      id: "01J8AQENVVAULT2025A7F1E8",
      project_id: project.id,
      project_name: project.name,
      created_at: "2026-09-22T17:16:00.000Z",
      file_count: 2,
    },
  ],
  remote_configured: true,
  ssh_keys: [
    {
      id: "ssh-key-1",
      name: "Déploiement production",
      algorithm: "ssh-ed25519",
      fingerprint: "SHA256:9nY4PreviewFingerprintOnly",
      encrypted_at_source: false,
      created_at: "2026-09-23T09:00:00.000Z",
    },
  ],
  servers: [
    {
      id: "server-1",
      name: "Production Suisse",
      host: "vps.exemple.test",
      port: 22,
      username: "deploy",
      host_key_sha256: "SHA256:PreviewHostFingerprintOnly",
      ssh_key_id: "ssh-key-1",
      created_at: "2026-09-23T09:05:00.000Z",
    },
  ],
};

const scanned: Scanned[] = [
  { relative_path: ".env", size: 842, selected_by_default: true },
  { relative_path: "apps/web/.env.local", size: 1284, selected_by_default: true },
  { relative_path: ".env.example", size: 530, selected_by_default: false },
];

const restorePlan: RestorePlan = {
  project_name: project.name,
  backup_id: dashboard.backups[0].id,
  destination: project.root,
  paths: [".env", "apps/web/.env.local"],
  collisions: [".env"],
  restoring_to_original: true,
};

export function previewFromLocation(): { command?: CommandBridge; initialTab?: Tab } {
  if (!import.meta.env.DEV) return {};
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("preview") as PreviewMode | null;
  const requestedTab = params.get("tab") as Tab | null;
  if (!mode) return {};
  return {
    command: createPreviewBridge(mode),
    initialTab: requestedTab && ["home", "projects", "add", "secrets", "servers", "history", "restore", "settings"].includes(requestedTab) ? requestedTab : "home",
  };
}

export function createPreviewBridge(mode: PreviewMode): CommandBridge {
  return async <T,>(command: string): Promise<T> => {
    if (command === "dashboard") {
      if (mode === "loading") return new Promise<T>(() => undefined);
      if (mode === "error") throw new Error("Preview dashboard failure");
      if (mode === "empty") return { initialized: true, projects: [], backups: [], remote_configured: false, ssh_keys: [], servers: [] } as T;
      return dashboard as T;
    }
    if (command === "scan_project") return scanned as T;
    if (command === "plan_restore") return restorePlan as T;
    if (command === "verify_vault") return { status: "healthy", backups_checked: 2, blobs_checked: 4, failures: 0 } as T;
    return undefined as T;
  };
}
