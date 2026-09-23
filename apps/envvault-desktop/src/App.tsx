import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Icon } from "./Icons";
import {
  createTranslator,
  dateLocale,
  loadLocale,
  saveLocale,
  type Locale,
  type MessageKey,
} from "./i18n";

export type Project = { id: string; name: string; root: string; included: string[] };
export type Backup = {
  id: string;
  project_id: string;
  project_name: string;
  created_at: string;
  file_count: number;
};
export type Scanned = {
  relative_path: string;
  size: number;
  modified?: string;
  selected_by_default: boolean;
};
export type Dashboard = {
  initialized: boolean;
  projects: Project[];
  backups: Backup[];
  remote_configured: boolean;
  ssh_keys: SshKey[];
  servers: ServerProfile[];
};
export type SshKey = {
  id: string;
  name: string;
  algorithm: string;
  fingerprint: string;
  encrypted_at_source: boolean;
  created_at: string;
};
export type ServerProfile = {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  remote_path: string;
  host_key_sha256: string;
  ssh_key_id: string;
  created_at: string;
};
export type Verify = {
  status: string;
  backups_checked: number;
  blobs_checked: number;
  failures: number;
};
export type RestorePlan = {
  project_name: string;
  backup_id: string;
  destination: string;
  paths: string[];
  collisions: string[];
  restoring_to_original: boolean;
};

export type CommandBridge = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
export type DirectoryPicker = (title: string) => Promise<string | null>;
export type FilePicker = (title: string) => Promise<string | null>;
export type Tab = "home" | "projects" | "add" | "secrets" | "servers" | "history" | "restore" | "settings";

const openDirectory: DirectoryPicker = async (title) => {
  const selection = await open({ directory: true, multiple: false, title });
  return typeof selection === "string" ? selection : null;
};

const openFile: FilePicker = async (title) => {
  const selection = await open({ directory: false, multiple: false, title });
  return typeof selection === "string" ? selection : null;
};

const empty: Dashboard = {
  initialized: false,
  projects: [],
  backups: [],
  remote_configured: false,
  ssh_keys: [],
  servers: [],
};

const navItems: Array<{ id: Exclude<Tab, "restore">; icon: Parameters<typeof Icon>[0]["name"]; label: MessageKey }> = [
  { id: "home", icon: "home", label: "navOverview" },
  { id: "projects", icon: "projects", label: "navProjects" },
  { id: "add", icon: "plus", label: "navAddProject" },
  { id: "secrets", icon: "key", label: "navSecrets" },
  { id: "servers", icon: "server", label: "navServers" },
  { id: "history", icon: "history", label: "navHistory" },
  { id: "settings", icon: "settings", label: "navSettings" },
];

const tabLabels: Record<Tab, MessageKey> = {
  home: "navOverview",
  projects: "navProjects",
  add: "navAddProject",
  secrets: "navSecrets",
  servers: "navServers",
  history: "navHistory",
  restore: "navRestore",
  settings: "navSettings",
};

const verifyLabels: Record<string, MessageKey> = {
  healthy: "statusHealthy",
  incomplete: "statusIncomplete",
  corrupt: "statusCorrupt",
  wrong_key: "statusWrongKey",
};

function EmptyState({
  icon,
  title,
  body,
  action,
  onAction,
}: {
  icon: Parameters<typeof Icon>[0]["name"];
  title: string;
  body: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon"><Icon name={icon} /></span>
      <h3>{title}</h3>
      <p>{body}</p>
      <button type="button" onClick={onAction}>{action}</button>
    </div>
  );
}

export default function App({
  command = invoke as CommandBridge,
  directoryPicker = openDirectory,
  filePicker = openFile,
  initialTab = "home",
}: {
  command?: CommandBridge;
  directoryPicker?: DirectoryPicker;
  filePicker?: FilePicker;
  initialTab?: Tab;
}) {
  const [locale, setLocale] = useState<Locale>(() => loadLocale(window.localStorage));
  const t = useMemo(() => createTranslator(locale), [locale]);
  const [data, setData] = useState<Dashboard>(empty);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [busy, setBusy] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [fieldError, setFieldError] = useState("");
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
  const [recoveryPath, setRecoveryPath] = useState("");
  const [recoveryPassphrase, setRecoveryPassphrase] = useState("");
  const [recoveryConfirmation, setRecoveryConfirmation] = useState("");
  const [remoteHost, setRemoteHost] = useState("");
  const [remotePort, setRemotePort] = useState("22");
  const [remoteUsername, setRemoteUsername] = useState("");
  const [remotePath, setRemotePath] = useState("");
  const [remotePrivateKey, setRemotePrivateKey] = useState("");
  const [remoteHostKey, setRemoteHostKey] = useState("");
  const [sshKeyName, setSshKeyName] = useState("");
  const [sshKeyPath, setSshKeyPath] = useState("");
  const [serverName, setServerName] = useState("");
  const [serverHost, setServerHost] = useState("");
  const [serverPort, setServerPort] = useState("22");
  const [serverUsername, setServerUsername] = useState("");
  const [serverRemotePath, setServerRemotePath] = useState("");
  const [serverHostKey, setServerHostKey] = useState("");
  const [serverSshKey, setServerSshKey] = useState("");
  const [pendingDelete, setPendingDelete] = useState<{ kind: "key" | "server"; id: string } | null>(null);
  const [serverOperation, setServerOperation] = useState<{ id: string; operation: "test" | "push" | "pull" } | null>(null);
  const [serverPassphrase, setServerPassphrase] = useState("");

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = t("productName");
  }, [locale, t]);

  useEffect(() => {
    if (pendingDelete) document.getElementById("delete-confirm-button")?.focus();
  }, [pendingDelete]);

  useEffect(() => {
    if (serverOperation) document.getElementById("server-key-passphrase")?.focus();
  }, [serverOperation]);

  const refresh = useCallback(async () => {
    try {
      setData(await command<Dashboard>("dashboard"));
      setNotice((current) => current?.kind === "error" ? null : current);
    } catch {
      setNotice({ kind: "error", text: t("errorLoad") });
    } finally {
      setBusy(false);
      setLoaded(true);
    }
  }, [command, t]);

  useEffect(() => { void refresh(); }, [refresh]);

  function chooseLocale(next: Locale) {
    saveLocale(next, window.localStorage);
    setLocale(next);
  }

  async function action(work: () => Promise<unknown>, successKey: MessageKey, errorKey: MessageKey) {
    setBusy(true);
    setNotice(null);
    try {
      await work();
      setNotice({ kind: "success", text: t(successKey) });
      await refresh();
    } catch {
      setNotice({ kind: "error", text: t(errorKey) });
    } finally {
      setBusy(false);
    }
  }

  async function scanPath(targetPath = path) {
    const projectPath = targetPath.trim();
    if (!projectPath) {
      setFieldError(t("fieldProjectPath"));
      return;
    }
    setBusy(true);
    setFieldError("");
    setNotice(null);
    try {
      const result = await command<Scanned[]>("scan_project", { path: projectPath });
      setFound(result);
      setSelected(result.filter((file) => file.selected_by_default).map((file) => file.relative_path));
      if (!name) setName(projectPath.split(/[\\/]/).filter(Boolean).at(-1) ?? t("projectName"));
    } catch {
      setNotice({ kind: "error", text: t("errorScan") });
    } finally {
      setBusy(false);
    }
  }

  async function chooseProjectFolder() {
    setBusy(true);
    setFieldError("");
    setNotice(null);
    try {
      const selection = await directoryPicker(t("chooseProjectFolderTitle"));
      if (!selection) return;
      setPath(selection);
      setName("");
      setFound([]);
      setSelected([]);
      await scanPath(selection);
    } catch {
      setNotice({ kind: "error", text: t("errorChooseProjectFolder") });
    } finally {
      setBusy(false);
    }
  }

  async function chooseSshKeyFile() {
    setBusy(true);
    setFieldError("");
    setNotice(null);
    try {
      const selection = await filePicker(t("chooseSshKeyTitle"));
      if (!selection) return;
      setSshKeyPath(selection);
      if (!sshKeyName) setSshKeyName(selection.split(/[\\/]/).filter(Boolean).at(-1) ?? t("sshKeyFallbackName"));
    } catch {
      setNotice({ kind: "error", text: t("errorChooseSshKey") });
    } finally {
      setBusy(false);
    }
  }

  function importSshKey() {
    if (!sshKeyName.trim() || !sshKeyPath.trim()) {
      setFieldError(t("fieldSshKey"));
      return;
    }
    setFieldError("");
    void action(
      async () => {
        await command("import_ssh_key", { name: sshKeyName, path: sshKeyPath });
        setSshKeyName("");
        setSshKeyPath("");
      },
      "successSshKeyImport",
      "errorSshKeyImport",
    );
  }

  function addServer() {
    if (!serverName.trim() || !serverHost.trim() || !serverUsername.trim() || !serverRemotePath.startsWith("/") || !serverSshKey || !serverHostKey.startsWith("SHA256:")) {
      setFieldError(t("fieldServer"));
      return;
    }
    setFieldError("");
    void action(
      async () => {
        await command("add_server_profile", {
          name: serverName,
          host: serverHost,
          port: Number(serverPort),
          username: serverUsername,
          remotePath: serverRemotePath,
          hostKeySha256: serverHostKey,
          sshKeyId: serverSshKey,
        });
        setServerName("");
        setServerHost("");
        setServerPort("22");
        setServerUsername("");
        setServerRemotePath("");
        setServerHostKey("");
        setServerSshKey("");
      },
      "successServer",
      "errorServer",
    );
  }

  function requestServerOperation(server: ServerProfile, operation: "test" | "push" | "pull") {
    setFieldError("");
    const key = data.ssh_keys.find((item) => item.id === server.ssh_key_id);
    if (key?.encrypted_at_source) {
      setServerPassphrase("");
      setServerOperation({ id: server.id, operation });
      return;
    }
    void executeServerOperation(server.id, operation, "");
  }

  async function executeServerOperation(id: string, operation: "test" | "push" | "pull", passphrase: string) {
    if (serverOperation && !passphrase) {
      setFieldError(t("fieldSshPassphrase"));
      return;
    }
    setServerOperation(null);
    setServerPassphrase("");
    const successKey: MessageKey = operation === "test" ? "successServerTest" : operation === "push" ? "successServerPush" : "successServerPull";
    const errorKey: MessageKey = operation === "test" ? "errorServerTest" : operation === "push" ? "errorServerPush" : "errorServerPull";
    await action(
      () => command("server_operation", { id, operation, passphrase: passphrase || null }),
      successKey,
      errorKey,
    );
  }

  function confirmDelete() {
    if (!pendingDelete) return;
    const deleting = pendingDelete;
    setPendingDelete(null);
    void action(
      () => command(deleting.kind === "key" ? "delete_ssh_key" : "delete_server_profile", { id: deleting.id }),
      deleting.kind === "key" ? "successSshKeyDelete" : "successServerDelete",
      deleting.kind === "key" ? "errorSshKeyDelete" : "errorServerDelete",
    );
  }

  function addProject() {
    if (!name.trim() || selected.length === 0) {
      setFieldError(t("fieldProjectSelection"));
      return;
    }
    setFieldError("");
    void action(
      () => command("add_project", { name, path, selected }),
      "successProject",
      "errorProject",
    );
  }

  function beginRestore(backup: Backup) {
    const source = data.projects.find((project) => project.id === backup.project_id);
    setRestoreProject(backup.project_id);
    setRestoreBackup(backup.id);
    setRestoreDestination(source?.root ?? "");
    setRestorePlan(null);
    setOverwrite(false);
    setConfirmed(false);
    setFieldError("");
    setTab("restore");
  }

  async function previewRestore() {
    if (!restoreDestination.trim()) {
      setFieldError(t("fieldRestoreDestination"));
      return;
    }
    setBusy(true);
    setFieldError("");
    setNotice(null);
    try {
      setRestorePlan(await command<RestorePlan>("plan_restore", {
        projectId: restoreProject,
        backupId: restoreBackup,
        destination: restoreDestination,
      }));
    } catch {
      setNotice({ kind: "error", text: t("errorRestorePreview") });
    } finally {
      setBusy(false);
    }
  }

  async function recoveryAction(mode: "export" | "import") {
    const valid = recoveryPath.trim() && recoveryPassphrase.length >= 12;
    const exportValid = mode === "import" || recoveryPassphrase === recoveryConfirmation;
    if (!valid || !exportValid) {
      setFieldError(t(mode === "export" ? "fieldRecoveryConfirmation" : "fieldRecovery"));
      return;
    }
    setBusy(true);
    setFieldError("");
    setNotice(null);
    try {
      if (mode === "export") {
        await command("export_recovery", {
          path: recoveryPath,
          passphrase: recoveryPassphrase,
          passphraseConfirmation: recoveryConfirmation,
        });
        setNotice({ kind: "success", text: t("successRecoveryExport") });
      } else {
        await command("import_recovery", { path: recoveryPath, passphrase: recoveryPassphrase });
        setNotice({ kind: "success", text: t("successRecoveryImport") });
      }
      await refresh();
    } catch {
      setNotice({ kind: "error", text: t(mode === "export" ? "errorRecoveryExport" : "errorRecoveryImport") });
    } finally {
      setRecoveryPassphrase("");
      setRecoveryConfirmation("");
      setBusy(false);
    }
  }

  function configureRemote() {
    const complete = remoteHost && remotePort && remoteUsername && remotePath && remotePrivateKey && remoteHostKey.startsWith("SHA256:");
    if (!complete) {
      setFieldError(t("fieldRemote"));
      return;
    }
    setFieldError("");
    void action(
      () => command("configure_remote", {
        host: remoteHost,
        port: Number(remotePort),
        username: remoteUsername,
        remotePath,
        privateKey: remotePrivateKey,
        hostKeySha256: remoteHostKey,
      }),
      "successRemote",
      "errorRemote",
    );
  }

  if (!loaded) {
    return (
      <main className="center loading-screen" aria-live="polite">
        <div className="brand-orbit"><span>{t("brandMonogram")}</span></div>
        <div className="spinner" />
        <p>{t("loadingApp")}</p>
      </main>
    );
  }

  if (!data.initialized) {
    return (
      <main className="onboarding">
        <div className="onboarding-card">
          <div className="brand-lockup">
            <span className="aq-mark">{t("brandMonogram")}</span>
            <span><strong>{t("productName")}</strong><small>{t("brandSignature")}</small></span>
          </div>
          <span className="onboarding-icon"><Icon name="shield" /></span>
          <p className="eyebrow">{t("eyebrow")}</p>
          <h1>{t("onboardingTitle")}</h1>
          <p className="lede">{t("onboardingBody")}</p>
          <button type="button" disabled={busy} onClick={() => notice?.kind === "error" ? void refresh() : void action(() => command("init_vault"), "successInitialized", "errorInitialize")}>
            {t(notice?.kind === "error" ? "refresh" : "onboardingAction")}
          </button>
          {notice && <div className={`notice ${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>{notice.text}</div>}
        </div>
      </main>
    );
  }

  const latest = data.backups[0];
  const verificationLabel = verification ? t(verifyLabels[verification.status] ?? "statusNotChecked") : t("statusNotChecked");
  const fieldErrorNode = fieldError ? <p className="field-error" role="alert">{fieldError}</p> : null;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand-lockup sidebar-brand">
          <span className="aq-mark">{t("brandMonogram")}</span>
          <span><strong>{t("productName")}</strong><small>{t("brandSignature")}</small></span>
        </div>
        <nav aria-label={t("productName")}>
          {navItems.map((item) => (
            <button key={item.id} type="button" className={tab === item.id ? "active" : ""} aria-current={tab === item.id ? "page" : undefined} onClick={() => { setTab(item.id); setFieldError(""); }}>
              <Icon name={item.icon} /><span>{t(item.label)}</span>
            </button>
          ))}
        </nav>
        <div className="privacy-card">
          <span className="status-dot" />
          <div><strong>{t("privacyTitle")}</strong><small>{t("privacyBody")}</small></div>
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div><p className="eyebrow">{t("eyebrow")}</p><h1>{t(tabLabels[tab])}</h1></div>
          <div className="header-actions">
            {busy && <span className="busy-label"><span className="mini-spinner" />{t("activity")}</span>}
            <button type="button" className="secondary compact" disabled={busy} onClick={() => void refresh()}><Icon name="refresh" />{t("refresh")}</button>
          </div>
        </header>

        {notice && <div className={`notice ${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>{notice.text}</div>}

        {tab === "home" && (
          <>
            <section className="hero">
              <div>
                <span className="healthy"><Icon name="check" />{t("vaultReady")}</span>
                <h2>{t("protectedProjects", data.projects.length)}</h2>
                <p>{latest ? t("lastBackup", new Date(latest.created_at).toLocaleString(dateLocale(locale))) : t("noBackupSummary")}</p>
              </div>
              <button type="button" onClick={() => setTab("add")}><Icon name="plus" />{t("addProject")}</button>
            </section>
            <div className="stats">
              <article><span className="stat-icon"><Icon name="archive" /></span><small>{t("statBackups")}</small><strong>{data.backups.length}</strong><p>{t("statVersions")}</p></article>
              <article><span className="stat-icon"><Icon name="server" /></span><small>{t("statSync")}</small><strong>{t(data.remote_configured ? "statReady" : "statLocal")}</strong><p>{t(data.remote_configured ? "statRemoteConfigured" : "statNoRemote")}</p></article>
              <article><span className="stat-icon"><Icon name="shield" /></span><small>{t("statIntegrity")}</small><strong>{verificationLabel}</strong><button type="button" className="link" disabled={busy} onClick={() => void action(async () => setVerification(await command<Verify>("verify_vault")), "successVerify", "errorVerify")}>{t("verifyNow")}</button></article>
            </div>
          </>
        )}

        {tab === "projects" && (
          <section className="panel">
            <div className="section-heading"><div><p className="eyebrow">{t("eyebrow")}</p><h2>{t("projectsTitle")}</h2></div></div>
            {data.projects.length === 0 ? (
              <EmptyState icon="projects" title={t("projectsEmptyTitle")} body={t("projectsEmptyBody")} action={t("addProject")} onAction={() => setTab("add")} />
            ) : data.projects.map((project) => (
              <div className="row" key={project.id}>
                <div><strong>{project.name}</strong><small><code>{project.root}</code><span className="separator">·</span>{t("filesCount", project.included.length)}</small></div>
                <button type="button" disabled={busy} onClick={() => void action(() => command("backup_project", { projectId: project.id }), "successBackup", "errorBackup")}><Icon name="archive" />{t("createBackup")}</button>
              </div>
            ))}
          </section>
        )}

        {tab === "add" && (
          <section className="panel form">
            <div className="section-heading"><div><h2>{t("addProjectTitle")}</h2><p>{t("addProjectHelp")}</p></div></div>
            <div className="form-row action-field">
              <label htmlFor="project-path">{t("projectFolder")}</label>
              <div>
                <input id="project-path" value={path} onChange={(event) => { setPath(event.target.value); setName(""); setFound([]); setSelected([]); setFieldError(""); }} placeholder={t("projectFolderExample")} spellCheck={false} />
                <button type="button" className="secondary" disabled={busy} onClick={() => void chooseProjectFolder()}><Icon name="folderOpen" />{t("chooseProjectFolder")}</button>
                <button type="button" className="secondary" disabled={busy} onClick={() => void scanPath()}>{t("scanFolder")}</button>
              </div>
              {found.length === 0 && fieldErrorNode}
            </div>
            {found.length > 0 && (
              <div className="selection-card">
                <label htmlFor="project-name">{t("projectName")}</label>
                <input id="project-name" value={name} onChange={(event) => { setName(event.target.value); setFieldError(""); }} placeholder={t("projectNameExample")} />
                <div className="selection-heading"><div><h3>{t("detectedFiles")}</h3><p>{t("detectedFilesHelp")}</p></div><span>{t("filesCount", selected.length)}</span></div>
                <div className="files">
                  {found.map((file) => (
                    <label className="file-choice" key={file.relative_path}>
                      <input type="checkbox" checked={selected.includes(file.relative_path)} onChange={(event) => { setFieldError(""); setSelected(event.target.checked ? [...selected, file.relative_path] : selected.filter((item) => item !== file.relative_path)); }} />
                      <span><strong>{file.relative_path}</strong><small>{t("bytesCount", file.size)} · {t(file.selected_by_default ? "candidateFile" : "templateFile")}</small></span>
                    </label>
                  ))}
                </div>
                {fieldErrorNode}
                <button type="button" disabled={busy} onClick={addProject}>{t("confirmProjectSelection")}</button>
              </div>
            )}
          </section>
        )}

        {tab === "history" && (
          <section className="panel">
            <div className="section-heading"><div><h2>{t("historyTitle")}</h2></div></div>
            {data.backups.length === 0 ? (
              <EmptyState icon="history" title={t("historyEmptyTitle")} body={t("historyEmptyBody")} action={t("historyEmptyAction")} onAction={() => setTab("projects")} />
            ) : data.backups.map((backup) => (
              <div className="row" key={backup.id}>
                <div><strong>{backup.project_name}</strong><small>{new Date(backup.created_at).toLocaleString(dateLocale(locale))}<span className="separator">·</span>{t("filesCount", backup.file_count)}</small></div>
                <div className="row-actions"><code>{backup.id.slice(0, 10)}…</code><button type="button" className="secondary" onClick={() => beginRestore(backup)}>{t("restoreVersion")}</button></div>
              </div>
            ))}
          </section>
        )}

        {tab === "secrets" && (
          <section className="panel form">
            <div className="section-heading"><div><h2>{t("secretsTitle")}</h2><p>{t("secretsHelp")}</p></div><span className="count-badge">{t("keysCount", data.ssh_keys.length)}</span></div>
            <div className="secret-layout">
              <div className="secret-list">
                {data.ssh_keys.length === 0 ? <div className="inline-empty"><span className="empty-icon"><Icon name="key" /></span><div><h3>{t("secretsEmptyTitle")}</h3><p>{t("secretsEmptyBody")}</p></div></div> : data.ssh_keys.map((key) => (
                  <article className="secret-row" key={key.id}>
                    <span className="setting-icon"><Icon name="key" /></span>
                    <div><strong>{key.name}</strong><small>{key.algorithm} · {key.encrypted_at_source ? t("sourceKeyEncrypted") : t("sourceKeyPlain")}</small><code>{key.fingerprint}</code></div>
                    <button type="button" className="danger-button compact" disabled={busy} onClick={() => setPendingDelete({ kind: "key", id: key.id })}>{t("delete")}</button>
                  </article>
                ))}
              </div>
              <div className="selection-card import-card">
                <div><h3>{t("importSshKeyTitle")}</h3><p>{t("importSshKeyHelp")}</p></div>
                <label htmlFor="ssh-key-name">{t("sshKeyName")}</label><input id="ssh-key-name" value={sshKeyName} onChange={(event) => { setSshKeyName(event.target.value); setFieldError(""); }} placeholder={t("sshKeyNameExample")} />
                <label htmlFor="ssh-key-path">{t("sshKeyFile")}</label>
                <div className="file-picker-field"><input id="ssh-key-path" value={sshKeyPath} onChange={(event) => { setSshKeyPath(event.target.value); setFieldError(""); }} placeholder={t("sshKeyFileExample")} spellCheck={false} /><button type="button" className="secondary" disabled={busy} onClick={() => void chooseSshKeyFile()}><Icon name="folderOpen" />{t("chooseFile")}</button></div>
                {fieldErrorNode}
                <button type="button" disabled={busy} onClick={importSshKey}>{t("importAndEncrypt")}</button>
              </div>
            </div>
          </section>
        )}

        {tab === "servers" && (
          <section className="panel form">
            <div className="section-heading"><div><h2>{t("serversTitle")}</h2><p>{t("serversHelp")}</p></div><span className="count-badge">{t("serversCount", data.servers.length)}</span></div>
            <div className="secret-layout">
              <div className="secret-list">
                {data.servers.length === 0 ? <div className="inline-empty"><span className="empty-icon"><Icon name="server" /></span><div><h3>{t("serversEmptyTitle")}</h3><p>{t("serversEmptyBody")}</p></div></div> : data.servers.map((server) => {
                  const linkedKey = data.ssh_keys.find((key) => key.id === server.ssh_key_id);
                  return <article className="secret-row server-row" key={server.id}><span className="setting-icon"><Icon name="server" /></span><div><strong>{server.name}</strong><small>{server.username}@{server.host}:{server.port} · {server.remote_path}</small><code>{linkedKey?.name ?? t("missingKey")}</code></div><div className="row-actions"><button type="button" className="secondary compact" disabled={busy} onClick={() => requestServerOperation(server, "test")}>{t("testConnection")}</button><button type="button" className="secondary compact" disabled={busy} onClick={() => requestServerOperation(server, "pull")}>{t("serverPull")}</button><button type="button" className="secondary compact" disabled={busy} onClick={() => requestServerOperation(server, "push")}>{t("serverPush")}</button><button type="button" className="danger-button compact" disabled={busy} onClick={() => setPendingDelete({ kind: "server", id: server.id })}>{t("delete")}</button></div></article>;
                })}
              </div>
              <div className="selection-card import-card">
                <div><h3>{t("addServerTitle")}</h3><p>{t("addServerHelp")}</p></div>
                <label htmlFor="server-name">{t("serverName")}</label><input id="server-name" value={serverName} onChange={(event) => { setServerName(event.target.value); setFieldError(""); }} placeholder={t("serverNameExample")} />
                <div className="settings-grid remote-grid"><div><label htmlFor="server-host">{t("remoteHost")}</label><input id="server-host" value={serverHost} onChange={(event) => { setServerHost(event.target.value); setFieldError(""); }} placeholder={t("remoteHostExample")} spellCheck={false} /></div><div><label htmlFor="server-port">{t("remotePort")}</label><input id="server-port" type="number" min="1" max="65535" value={serverPort} onChange={(event) => setServerPort(event.target.value)} /></div></div>
                <label htmlFor="server-username">{t("remoteUsername")}</label><input id="server-username" value={serverUsername} onChange={(event) => { setServerUsername(event.target.value); setFieldError(""); }} placeholder={t("remoteUsernameExample")} spellCheck={false} />
                <label htmlFor="server-remote-path">{t("remoteFolder")}</label><input id="server-remote-path" value={serverRemotePath} onChange={(event) => { setServerRemotePath(event.target.value); setFieldError(""); }} placeholder={t("remoteFolderExample")} spellCheck={false} />
                <label htmlFor="server-key">{t("serverSshKey")}</label><select id="server-key" value={serverSshKey} onChange={(event) => { setServerSshKey(event.target.value); setFieldError(""); }}><option value="">{t("chooseStoredKey")}</option>{data.ssh_keys.map((key) => <option value={key.id} key={key.id}>{key.name} · {key.fingerprint}</option>)}</select>
                <label htmlFor="server-fingerprint">{t("hostFingerprint")}</label><input id="server-fingerprint" value={serverHostKey} onChange={(event) => { setServerHostKey(event.target.value); setFieldError(""); }} placeholder={t("hostFingerprintExample")} spellCheck={false} />
                {data.ssh_keys.length === 0 && <p className="field-hint">{t("serverNeedsKey")}</p>}{fieldErrorNode}
                <button type="button" disabled={busy || data.ssh_keys.length === 0} onClick={addServer}>{t("saveServer")}</button>
              </div>
            </div>
          </section>
        )}

        {tab === "restore" && (
          <section className="panel form">
            <div className="section-heading"><div><h2>{t("restoreTitle")}</h2><p>{t("restoreHelp")}</p></div></div>
            <div className="form-row action-field">
              <label htmlFor="restore-destination">{t("destinationFolder")}</label>
              <div><input id="restore-destination" value={restoreDestination} onChange={(event) => { setRestoreDestination(event.target.value); setRestorePlan(null); setFieldError(""); }} placeholder={t("destinationExample")} spellCheck={false} /><button type="button" className="secondary" disabled={busy} onClick={() => void previewRestore()}>{t("previewRestore")}</button></div>
              {!restorePlan && fieldErrorNode}
            </div>
            {restorePlan && (
              <div className="confirmation-card">
                <div className="selection-heading"><div><h3>{t("restoreFilesTitle")}</h3><p><code>{restorePlan.destination}</code></p></div><span>{t("filesCount", restorePlan.paths.length)}</span></div>
                <div className="files restore-files">
                  {restorePlan.paths.map((item) => <div className="restore-file" key={item}><code>{item}</code>{restorePlan.collisions.includes(item) && <strong>{t("existingFile")}</strong>}</div>)}
                </div>
                {restorePlan.collisions.length > 0 && <label className="check"><input type="checkbox" checked={overwrite} onChange={(event) => setOverwrite(event.target.checked)} /><span>{t("replaceFiles")}</span></label>}
                <label className="check"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>{t(restorePlan.restoring_to_original ? "confirmOriginalPaths" : "confirmPaths")}</span></label>
                <button type="button" disabled={!confirmed || (restorePlan.collisions.length > 0 && !overwrite) || busy} onClick={() => void action(() => command("execute_restore", { projectId: restoreProject, backupId: restoreBackup, destination: restoreDestination, overwrite, confirmed }), "successRestore", "errorRestore")}>{t(restorePlan.collisions.length > 0 ? "restoreAndReplace" : "restoreBackup")}</button>
              </div>
            )}
          </section>
        )}

        {tab === "settings" && (
          <section className="panel settings-panel">
            <div className="section-heading"><div><h2>{t("settingsTitle")}</h2></div></div>
            <div className="setting language-setting">
              <div><span className="setting-icon"><Icon name="globe" /></span><span><strong>{t("languageTitle")}</strong><small>{t("languageHelp")}</small></span></div>
              <div className="language-switch" role="group" aria-label={t("languageTitle")}><button type="button" className={locale === "fr" ? "active" : ""} aria-pressed={locale === "fr"} onClick={() => chooseLocale("fr")}>{t("languageFrench")}</button><button type="button" className={locale === "en" ? "active" : ""} aria-pressed={locale === "en"} onClick={() => chooseLocale("en")}>{t("languageEnglish")}</button></div>
            </div>
            <div className="setting"><div><span className="setting-icon"><Icon name="key" /></span><span><strong>{t("privateIdentity")}</strong><small>{t("privateIdentityBody")}</small></span></div></div>

            <div className="settings-section">
              <div><h3>{t("recoveryTitle")}</h3><p>{t("recoveryHelp")}</p></div>
              <div className="settings-form">
                <label htmlFor="recovery-path">{t("recoveryPath")}</label><input id="recovery-path" value={recoveryPath} onChange={(event) => { setRecoveryPath(event.target.value); setFieldError(""); }} placeholder={t("recoveryPathExample")} spellCheck={false} />
                <div className="settings-grid"><div><label htmlFor="passphrase">{t("passphrase")}</label><input id="passphrase" type="password" value={recoveryPassphrase} onChange={(event) => { setRecoveryPassphrase(event.target.value); setFieldError(""); }} autoComplete="new-password" /><small>{t("passphraseHelp")}</small></div><div><label htmlFor="passphrase-confirm">{t("confirmPassphrase")}</label><input id="passphrase-confirm" type="password" value={recoveryConfirmation} onChange={(event) => { setRecoveryConfirmation(event.target.value); setFieldError(""); }} autoComplete="new-password" /></div></div>
                {fieldErrorNode}
                <div className="button-row"><button type="button" disabled={busy} onClick={() => void recoveryAction("import")} className="secondary">{t("importRecovery")}</button><button type="button" disabled={busy} onClick={() => void recoveryAction("export")}>{t("exportRecovery")}</button></div>
              </div>
            </div>

            <div className="settings-section">
              <div><h3>{t("remoteTitle")}</h3><p>{t("remoteHelp")}</p></div>
              <div className="settings-form">
                <div className="settings-grid remote-grid"><div><label htmlFor="remote-host">{t("remoteHost")}</label><input id="remote-host" value={remoteHost} onChange={(event) => { setRemoteHost(event.target.value); setFieldError(""); }} placeholder={t("remoteHostExample")} spellCheck={false} /></div><div><label htmlFor="remote-port">{t("remotePort")}</label><input id="remote-port" type="number" min="1" max="65535" value={remotePort} onChange={(event) => setRemotePort(event.target.value)} /></div><div><label htmlFor="remote-user">{t("remoteUsername")}</label><input id="remote-user" value={remoteUsername} onChange={(event) => setRemoteUsername(event.target.value)} placeholder={t("remoteUsernameExample")} spellCheck={false} /></div><div><label htmlFor="remote-folder">{t("remoteFolder")}</label><input id="remote-folder" value={remotePath} onChange={(event) => setRemotePath(event.target.value)} placeholder={t("remoteFolderExample")} spellCheck={false} /></div></div>
                <label htmlFor="private-key">{t("privateKeyPath")}</label><input id="private-key" value={remotePrivateKey} onChange={(event) => setRemotePrivateKey(event.target.value)} placeholder={t("privateKeyPathExample")} spellCheck={false} />
                <label htmlFor="fingerprint">{t("hostFingerprint")}</label><input id="fingerprint" value={remoteHostKey} onChange={(event) => { setRemoteHostKey(event.target.value); setFieldError(""); }} placeholder={t("hostFingerprintExample")} spellCheck={false} />
                {fieldErrorNode}
                <div className="button-row"><button type="button" className="secondary" disabled={!data.remote_configured || busy} onClick={() => void action(() => command("sync_remote", { direction: "pull" }), "successPull", "errorPull")}>{t("syncPull")}</button><button type="button" className="secondary" disabled={!data.remote_configured || busy} onClick={() => void action(() => command("sync_remote", { direction: "push" }), "successPush", "errorPush")}>{t("syncPush")}</button><button type="button" disabled={busy} onClick={configureRemote}>{t("saveRemote")}</button></div>
              </div>
            </div>
            <div className="warning"><Icon name="shield" /><p>{t("securityWarning")}</p></div>
          </section>
        )}

        {pendingDelete && (
          <div className="delete-confirmation" role="alertdialog" aria-labelledby="delete-confirmation-title" aria-describedby="delete-confirmation-description">
            <div><strong id="delete-confirmation-title">{t(pendingDelete.kind === "key" ? "deleteKeyTitle" : "deleteServerTitle")}</strong><p id="delete-confirmation-description">{t(pendingDelete.kind === "key" ? "deleteKeyHelp" : "deleteServerHelp")}</p></div>
            <div className="button-row"><button type="button" className="secondary" onClick={() => setPendingDelete(null)}>{t("cancel")}</button><button id="delete-confirm-button" type="button" className="danger-button" disabled={busy} onClick={confirmDelete}>{t("deletePermanently")}</button></div>
          </div>
        )}

        {serverOperation && (
          <div className="delete-confirmation operation-confirmation" role="dialog" aria-labelledby="server-operation-title" aria-describedby="server-operation-description">
            <div><strong id="server-operation-title">{t("unlockSshKeyTitle")}</strong><p id="server-operation-description">{t("unlockSshKeyHelp")}</p></div>
            <label htmlFor="server-key-passphrase">{t("sourceKeyPassphrase")}</label><input id="server-key-passphrase" type="password" value={serverPassphrase} onChange={(event) => { setServerPassphrase(event.target.value); setFieldError(""); }} autoComplete="current-password" />
            {fieldErrorNode}
            <div className="button-row"><button type="button" className="secondary" onClick={() => { setServerOperation(null); setServerPassphrase(""); setFieldError(""); }}>{t("cancel")}</button><button type="button" disabled={busy} onClick={() => void executeServerOperation(serverOperation.id, serverOperation.operation, serverPassphrase)}>{t("continueOperation")}</button></div>
          </div>
        )}
      </main>
    </div>
  );
}
