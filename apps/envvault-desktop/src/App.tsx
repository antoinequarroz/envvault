import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type Project = { id: string; name: string; root: string; included: string[] };
type Backup = {
  id: string;
  project_id: string;
  project_name: string;
  created_at: string;
  file_count: number;
};
type Scanned = {
  relative_path: string;
  size: number;
  modified?: string;
  selected_by_default: boolean;
};
type Dashboard = {
  initialized: boolean;
  projects: Project[];
  backups: Backup[];
  remote_configured: boolean;
};
type Verify = {
  status: string;
  backups_checked: number;
  blobs_checked: number;
  failures: number;
};
type RestorePlan = {
  project_name: string;
  backup_id: string;
  destination: string;
  paths: string[];
  collisions: string[];
  restoring_to_original: boolean;
};

const empty: Dashboard = {
  initialized: false,
  projects: [],
  backups: [],
  remote_configured: false,
};

export default function App() {
  const [data, setData] = useState<Dashboard>(empty);
  const [tab, setTab] = useState("home");
  const [busy, setBusy] = useState(true);
  const [notice, setNotice] = useState("");
  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  const [found, setFound] = useState<Scanned[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [verification, setVerification] = useState<Verify | null>(null);
  const [restoreProject, setRestoreProject] = useState("");
  const [restoreBackup, setRestoreBackup] = useState("");
  const [restoreDestination, setRestoreDestination] = useState("");
  const [restorePlan, setRestorePlan] = useState<RestorePlan | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setData(await invoke<Dashboard>("dashboard"));
    } catch {
      setNotice("The vault status could not be loaded.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function action(work: () => Promise<unknown>, success: string) {
    setBusy(true);
    setNotice("");
    try {
      await work();
      setNotice(success);
      await refresh();
    } catch (error) {
      setNotice(String(error));
    } finally {
      setBusy(false);
    }
  }

  async function scanPath() {
    setBusy(true);
    setNotice("");
    try {
      const result = await invoke<Scanned[]>("scan_project", { path });
      setFound(result);
      setSelected(
        result
          .filter((file) => file.selected_by_default)
          .map((file) => file.relative_path),
      );
      if (!name)
        setName(path.split(/[\\/]/).filter(Boolean).at(-1) ?? "Project");
    } catch (error) {
      setNotice(String(error));
    } finally {
      setBusy(false);
    }
  }

  function beginRestore(backup: Backup) {
    const source = data.projects.find(
      (project) => project.id === backup.project_id,
    );
    setRestoreProject(backup.project_id);
    setRestoreBackup(backup.id);
    setRestoreDestination(source?.root ?? "");
    setRestorePlan(null);
    setOverwrite(false);
    setConfirmed(false);
    setTab("restore");
  }

  async function previewRestore() {
    setBusy(true);
    setNotice("");
    try {
      setRestorePlan(
        await invoke<RestorePlan>("plan_restore", {
          projectId: restoreProject,
          backupId: restoreBackup,
          destination: restoreDestination,
        }),
      );
    } catch (error) {
      setNotice(String(error));
    } finally {
      setBusy(false);
    }
  }

  if (busy && !data.initialized)
    return (
      <main className="center">
        <div className="spinner" />
        <p>Opening EnvVault…</p>
      </main>
    );

  if (!data.initialized)
    return (
      <main className="onboarding">
        <div className="mark">EV</div>
        <h1>Your environment files, under your control.</h1>
        <p>
          EnvVault encrypts selected .env files locally before they enter the
          vault. The private identity stays in your system keyring.
        </p>
        <button
          onClick={() =>
            void action(
              () => invoke("init_vault"),
              "Vault created. Export a recovery key from the CLI settings.",
            )
          }
        >
          Create local vault
        </button>
        {notice && <div className="notice">{notice}</div>}
      </main>
    );

  const latest = data.backups[0];
  return (
    <div className="shell">
      <aside>
        <div className="brand">
          <span>EV</span>
          <strong>EnvVault</strong>
        </div>
        <nav>
          {[
            ["home", "Overview"],
            ["projects", "Projects"],
            ["add", "Add project"],
            ["history", "History"],
            ["settings", "Settings"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="privacy">
          <i />
          Local-first
          <br />
          <small>No secret values displayed</small>
        </div>
      </aside>
      <main className="content">
        <header>
          <div>
            <p className="eyebrow">LOCAL ENCRYPTED VAULT</p>
            <h1>
              {tab === "home"
                ? "Overview"
                : tab[0].toUpperCase() + tab.slice(1)}
            </h1>
          </div>
          <button className="secondary" onClick={() => void refresh()}>
            Refresh
          </button>
        </header>
        {notice && <div className="notice">{notice}</div>}
        {tab === "home" && (
          <>
            <section className="hero">
              <div>
                <span className="healthy">● Vault ready</span>
                <h2>
                  {data.projects.length} protected project
                  {data.projects.length === 1 ? "" : "s"}
                </h2>
                <p>
                  {latest
                    ? `Last backup ${new Date(latest.created_at).toLocaleString()}`
                    : "No backup yet. Add a project to begin."}
                </p>
              </div>
              <button onClick={() => setTab("add")}>Add project</button>
            </section>
            <div className="stats">
              <article>
                <small>BACKUPS</small>
                <strong>{data.backups.length}</strong>
                <span>Immutable versions</span>
              </article>
              <article>
                <small>SYNC</small>
                <strong>{data.remote_configured ? "Ready" : "Local"}</strong>
                <span>
                  {data.remote_configured
                    ? "SFTP configured"
                    : "No remote configured"}
                </span>
              </article>
              <article>
                <small>INTEGRITY</small>
                <strong>{verification?.status ?? "Not checked"}</strong>
                <button
                  className="link"
                  onClick={() =>
                    void action(
                      async () =>
                        setVerification(await invoke<Verify>("verify_vault")),
                      "Verification complete.",
                    )
                  }
                >
                  Verify now
                </button>
              </article>
            </div>
          </>
        )}
        {tab === "projects" && (
          <section className="panel">
            <h2>Projects</h2>
            {data.projects.length === 0 ? (
              <p className="muted">No projects configured.</p>
            ) : (
              data.projects.map((project) => (
                <div className="row" key={project.id}>
                  <div>
                    <strong>{project.name}</strong>
                    <small>
                      {project.root} · {project.included.length} file(s)
                    </small>
                  </div>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void action(
                        () =>
                          invoke("backup_project", { projectId: project.id }),
                        "Encrypted backup created.",
                      )
                    }
                  >
                    Back up
                  </button>
                </div>
              ))
            )}
          </section>
        )}
        {tab === "add" && (
          <section className="panel form">
            <h2>Add a project</h2>
            <p className="muted">
              Only detected .env files you confirm will be selected.
            </p>
            <label>
              Project folder
              <input
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="/path/to/project"
              />
            </label>
            <button
              className="secondary"
              disabled={!path || busy}
              onClick={() => void scanPath()}
            >
              Scan folder
            </button>
            {found.length > 0 && (
              <>
                <label>
                  Project name
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <div className="files">
                  {found.map((file) => (
                    <label key={file.relative_path}>
                      <input
                        type="checkbox"
                        checked={selected.includes(file.relative_path)}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [...selected, file.relative_path]
                              : selected.filter(
                                  (p) => p !== file.relative_path,
                                ),
                          )
                        }
                      />
                      <span>
                        <strong>{file.relative_path}</strong>
                        <small>
                          {file.size} bytes ·{" "}
                          {file.selected_by_default
                            ? "candidate"
                            : "template, off by default"}
                        </small>
                      </span>
                    </label>
                  ))}
                </div>
                <button
                  disabled={!name || selected.length === 0 || busy}
                  onClick={() =>
                    void action(
                      () => invoke("add_project", { name, path, selected }),
                      "Project added. No backup has been created yet.",
                    )
                  }
                >
                  Confirm selection
                </button>
              </>
            )}
          </section>
        )}
        {tab === "history" && (
          <section className="panel">
            <h2>Backup history</h2>
            {data.backups.map((backup) => (
              <div className="row" key={backup.id}>
                <div>
                  <strong>{backup.project_name}</strong>
                  <small>
                    {new Date(backup.created_at).toLocaleString()} ·{" "}
                    {backup.file_count} file(s)
                  </small>
                </div>
                <div className="row-actions">
                  <code>{backup.id.slice(0, 10)}…</code>
                  <button
                    className="secondary"
                    onClick={() => beginRestore(backup)}
                  >
                    Restore
                  </button>
                </div>
              </div>
            ))}
          </section>
        )}
        {tab === "restore" && (
          <section className="panel form">
            <h2>Restore backup</h2>
            <p className="muted">
              EnvVault previews paths only. It never displays or executes
              restored values.
            </p>
            <label>
              Destination folder
              <input
                value={restoreDestination}
                onChange={(e) => {
                  setRestoreDestination(e.target.value);
                  setRestorePlan(null);
                }}
              />
            </label>
            <button
              className="secondary"
              disabled={!restoreDestination || busy}
              onClick={() => void previewRestore()}
            >
              Preview restore
            </button>
            {restorePlan && (
              <>
                <div className="files">
                  {restorePlan.paths.map((path) => (
                    <div className="restore-file" key={path}>
                      <span>{path}</span>
                      {restorePlan.collisions.includes(path) && (
                        <strong>Existing file</strong>
                      )}
                    </div>
                  ))}
                </div>
                {restorePlan.collisions.length > 0 && (
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={overwrite}
                      onChange={(e) => setOverwrite(e.target.checked)}
                    />{" "}
                    Replace the listed existing files
                  </label>
                )}
                <label className="check">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />{" "}
                  I reviewed every path
                  {restorePlan.restoring_to_original
                    ? " and confirm restoration into the original project"
                    : ""}
                </label>
                <button
                  disabled={
                    !confirmed ||
                    (restorePlan.collisions.length > 0 && !overwrite) ||
                    busy
                  }
                  onClick={() =>
                    void action(
                      () =>
                        invoke("execute_restore", {
                          projectId: restoreProject,
                          backupId: restoreBackup,
                          destination: restoreDestination,
                          overwrite,
                          confirmed,
                        }),
                      "Restore completed with restrictive file permissions.",
                    )
                  }
                >
                  Restore encrypted backup
                </button>
              </>
            )}
          </section>
        )}
        {tab === "settings" && (
          <section className="panel">
            <h2>Security & recovery</h2>
            <div className="setting">
              <strong>Private identity</strong>
              <span>Stored in the operating-system keyring</span>
            </div>
            <div className="setting">
              <strong>Recovery</strong>
              <span>
                Use <code>envvault recovery export</code> to create a
                passphrase-protected recovery file.
              </span>
            </div>
            <div className="setting">
              <strong>VPS storage</strong>
              <span>
                {data.remote_configured
                  ? "Configured with strict host-key verification."
                  : "Not configured. The local vault is fully functional."}
              </span>
            </div>
            <div className="warning">
              EnvVault protects a stolen vault or VPS copy. It cannot protect
              secrets while this computer is fully compromised and the vault is
              unlocked.
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
