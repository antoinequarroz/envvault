import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App, { type CommandBridge, type Dashboard } from "./App";

const dashboard: Dashboard = {
  initialized: true,
  projects: [{ id: "p1", name: "Site", root: "/work/site", included: [".env"] }],
  backups: [{ id: "backup-123456789", project_id: "p1", project_name: "Site", created_at: "2026-09-23T08:00:00Z", file_count: 1 }],
  remote_configured: false,
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
