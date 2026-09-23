import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App, { type CommandBridge, type Dashboard } from "./App";

const dashboard: Dashboard = {
  initialized: true,
  projects: [{ id: "p1", name: "Site", root: "/work/site", included: [".env"] }],
  backups: [{ id: "backup-123456789", project_id: "p1", project_name: "Site", created_at: "2026-09-23T08:00:00Z", file_count: 1 }],
  remote_configured: false,
  ssh_keys: [],
  servers: [],
};

function bridge(overrides: Record<string, unknown> = {}): CommandBridge {
  return async <T,>(command: string): Promise<T> => {
    if (command in overrides) {
      const value = overrides[command];
      if (value instanceof Error) throw value;
      return value as T;
    }
    if (command === "dashboard") return dashboard as T;
    return undefined as T;
  };
}

describe("EnvVault interface flows", () => {
  it("renders in French by default and persists English", async () => {
    const user = userEvent.setup();
    render(<App command={bridge()} />);
    expect(await screen.findByRole("heading", { name: "Vue d’ensemble" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Réglages" }));
    await user.click(screen.getByRole("button", { name: "English" }));
    expect(await screen.findByRole("heading", { name: "Security and recovery" })).toBeInTheDocument();
    expect(window.localStorage.getItem("envvault.locale")).toBe("en");
    expect(document.documentElement.lang).toBe("en");
  });

  it("shows a repairable localized dashboard error", async () => {
    render(<App command={bridge({ dashboard: new Error("backend detail") })} />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Impossible de charger l’état du coffre");
    expect(alert).not.toHaveTextContent("backend detail");
  });

  it("scans a folder and exposes a reviewed selection", async () => {
    const user = userEvent.setup();
    const command = bridge({
      scan_project: [
        { relative_path: ".env", size: 42, selected_by_default: true },
        { relative_path: ".env.example", size: 24, selected_by_default: false },
      ],
    });
    render(<App command={command} initialTab="add" />);
    await screen.findByRole("heading", { name: "Ajouter un projet", level: 2 });
    await user.type(screen.getByLabelText("Dossier du projet"), "/work/site");
    await user.click(screen.getByRole("button", { name: "Analyser le dossier" }));
    expect(await screen.findByText(".env.example")).toBeInTheDocument();
    expect(screen.getByText("Modèle désactivé par défaut", { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /^\.env 42 octets/ })).toBeChecked();
  });

  it("chooses and scans a project folder with the native picker", async () => {
    const user = userEvent.setup();
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const command: CommandBridge = async <T,>(commandName: string, args?: Record<string, unknown>) => {
      calls.push({ command: commandName, args });
      if (commandName === "dashboard") return dashboard as T;
      if (commandName === "scan_project") {
        return [{ relative_path: ".env", size: 42, selected_by_default: true }] as T;
      }
      return undefined as T;
    };

    render(<App command={command} directoryPicker={async () => "/work/chosen-site"} initialTab="add" />);
    await screen.findByRole("heading", { name: "Ajouter un projet", level: 2 });
    await user.click(screen.getByRole("button", { name: "Choisir un dossier" }));

    expect(await screen.findByDisplayValue("/work/chosen-site")).toBeInTheDocument();
    expect(await screen.findByText(".env")).toBeInTheDocument();
    expect(screen.getByLabelText("Nom du projet")).toHaveValue("chosen-site");
    expect(calls).toContainEqual({ command: "scan_project", args: { path: "/work/chosen-site" } });
  });

  it("imports an SSH key through the native file picker without exposing its contents", async () => {
    const user = userEvent.setup();
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const command: CommandBridge = async <T,>(commandName: string, args?: Record<string, unknown>) => {
      calls.push({ command: commandName, args });
      if (commandName === "dashboard") return dashboard as T;
      return undefined as T;
    };

    render(<App command={command} filePicker={async () => "/Users/test/.ssh/id_ed25519"} initialTab="secrets" />);
    await screen.findByRole("heading", { name: "Clés SSH privées" });
    await user.click(screen.getByRole("button", { name: "Choisir un fichier" }));
    expect(screen.getByLabelText("Fichier de clé privée")).toHaveValue("/Users/test/.ssh/id_ed25519");
    expect(screen.getByLabelText("Nom de la clé")).toHaveValue("id_ed25519");
    await user.click(screen.getByRole("button", { name: "Importer et chiffrer la clé" }));
    await waitFor(() => expect(calls).toContainEqual({
      command: "import_ssh_key",
      args: { name: "id_ed25519", path: "/Users/test/.ssh/id_ed25519" },
    }));
    expect(document.body).not.toHaveTextContent("BEGIN OPENSSH PRIVATE KEY");
  });

  it("stores a server profile by encrypted SSH-key identifier", async () => {
    const user = userEvent.setup();
    const storedKey = {
      id: "key-1",
      name: "Production",
      algorithm: "ssh-ed25519",
      fingerprint: "SHA256:test",
      encrypted_at_source: false,
      created_at: "2026-09-23T09:00:00Z",
    };
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const command: CommandBridge = async <T,>(commandName: string, args?: Record<string, unknown>) => {
      calls.push({ command: commandName, args });
      if (commandName === "dashboard") return { ...dashboard, ssh_keys: [storedKey] } as T;
      return undefined as T;
    };

    render(<App command={command} initialTab="servers" />);
    await user.type(await screen.findByLabelText("Nom du serveur"), "VPS Suisse");
    await user.type(screen.getByLabelText("Hôte"), "vps.example.test");
    await user.type(screen.getByLabelText("Nom d’utilisateur"), "deploy");
    await user.selectOptions(screen.getByLabelText("Clé SSH associée"), "key-1");
    await user.type(screen.getByLabelText("Empreinte de la clé d’hôte approuvée"), "SHA256:verified-host");
    await user.click(screen.getByRole("button", { name: "Enregistrer le serveur" }));
    await waitFor(() => expect(calls).toContainEqual({
      command: "add_server_profile",
      args: {
        name: "VPS Suisse",
        host: "vps.example.test",
        port: 22,
        username: "deploy",
        hostKeySha256: "SHA256:verified-host",
        sshKeyId: "key-1",
      },
    }));
  });

  it("requires explicit collision confirmation before restore", async () => {
    const user = userEvent.setup();
    const command = bridge({
      plan_restore: {
        project_name: "Site",
        backup_id: "backup-123456789",
        destination: "/work/site",
        paths: [".env"],
        collisions: [".env"],
        restoring_to_original: true,
      },
    });
    render(<App command={command} initialTab="history" />);
    await user.click(await screen.findByRole("button", { name: "Restaurer cette version" }));
    await user.click(screen.getByRole("button", { name: "Prévisualiser la restauration" }));
    const restore = await screen.findByRole("button", { name: "Restaurer et remplacer les fichiers existants" });
    expect(restore).toBeDisabled();
    const checks = screen.getAllByRole("checkbox");
    await user.click(checks[0]);
    await user.click(checks[1]);
    await waitFor(() => expect(restore).toBeEnabled());
  });
});
