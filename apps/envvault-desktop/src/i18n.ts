export type Locale = "fr" | "en";

type MessageValue = string | ((...args: never[]) => string);

export const fr = {
  productName: "EnvVault",
  brandMonogram: "AQ",
  brandSignature: "par Antoine Quarroz",
  loadingApp: "Ouverture d’EnvVault…",
  activity: "Opération en cours…",
  onboardingTitle: "Vos fichiers d’environnement, sous votre contrôle.",
  onboardingBody:
    "EnvVault chiffre localement les fichiers .env sélectionnés avant leur entrée dans le coffre. La clé privée reste dans le trousseau du système.",
  onboardingAction: "Créer le coffre local",
  navOverview: "Vue d’ensemble",
  navProjects: "Projets",
  navAddProject: "Ajouter un projet",
  navSecrets: "Secrets",
  navServers: "Serveurs",
  navHistory: "Historique",
  navSettings: "Réglages",
  navRestore: "Restaurer",
  privacyTitle: "Local par défaut",
  privacyBody: "Aucune valeur secrète affichée",
  eyebrow: "COFFRE LOCAL CHIFFRÉ",
  refresh: "Actualiser",
  vaultReady: "Coffre prêt",
  protectedProjects: (count: number) =>
    count === 1 ? "1 projet protégé" : `${count} projets protégés`,
  lastBackup: (date: string) => `Dernière sauvegarde : ${date}`,
  noBackupSummary:
    "Aucune sauvegarde pour le moment. Ajoutez un projet pour commencer.",
  addProject: "Ajouter un projet",
  statBackups: "SAUVEGARDES",
  statVersions: "Versions immuables",
  statSync: "SYNCHRONISATION",
  statReady: "Prêt",
  statLocal: "Local",
  statRemoteConfigured: "Stockage SFTP configuré",
  statNoRemote: "Aucun stockage distant configuré",
  statIntegrity: "INTÉGRITÉ",
  statusNotChecked: "Non vérifiée",
  statusHealthy: "Intègre",
  statusIncomplete: "Incomplète",
  statusCorrupt: "Altérée",
  statusWrongKey: "Clé incorrecte",
  verifyNow: "Vérifier l’intégrité",
  projectsTitle: "Projets",
  projectsEmptyTitle: "Aucun projet protégé",
  projectsEmptyBody:
    "Ajoutez un dossier, vérifiez les fichiers .env détectés, puis créez sa première sauvegarde.",
  filesCount: (count: number) =>
    count === 1 ? "1 fichier" : `${count} fichiers`,
  bytesCount: (count: number) => `${count.toLocaleString("fr-CH")} octets`,
  createBackup: "Créer une sauvegarde",
  addProjectTitle: "Ajouter un projet",
  addProjectHelp:
    "Seuls les fichiers .env détectés et confirmés seront ajoutés au projet.",
  projectFolder: "Dossier du projet",
  projectFolderExample: "/chemin/vers/le/projet",
  chooseProjectFolder: "Choisir un dossier",
  chooseProjectFolderTitle: "Choisir le dossier du projet",
  scanFolder: "Analyser le dossier",
  projectName: "Nom du projet",
  projectNameExample: "Site vitrine",
  detectedFiles: "Fichiers détectés",
  detectedFilesHelp:
    "Vérifiez la sélection. Les modèles restent désactivés par défaut.",
  candidateFile: "Candidat sélectionné",
  templateFile: "Modèle désactivé par défaut",
  confirmProjectSelection: "Ajouter le projet sélectionné",
  secretsTitle: "Clés SSH privées",
  secretsHelp: "Les clés importées sont validées puis chiffrées dans le coffre. Leur contenu n’est jamais renvoyé à l’interface.",
  keysCount: (count: number) => count === 1 ? "1 clé" : `${count} clés`,
  secretsEmptyTitle: "Aucune clé SSH stockée",
  secretsEmptyBody: "Importez une clé privée OpenSSH pour l’associer ensuite à vos serveurs.",
  importSshKeyTitle: "Importer une clé",
  importSshKeyHelp: "Le fichier source est lu localement. EnvVault conserve une copie chiffrée et ne modifie pas l’original.",
  sshKeyName: "Nom de la clé",
  sshKeyNameExample: "Déploiement production",
  sshKeyFile: "Fichier de clé privée",
  sshKeyFileExample: "/Users/vous/.ssh/id_ed25519",
  sshKeyFallbackName: "Clé SSH",
  chooseFile: "Choisir un fichier",
  chooseSshKeyTitle: "Choisir une clé privée OpenSSH",
  importAndEncrypt: "Importer et chiffrer la clé",
  sourceKeyEncrypted: "protégée par une phrase à la source",
  sourceKeyPlain: "non chiffrée à la source",
  serversTitle: "Serveurs VPS",
  serversHelp: "Associez chaque serveur à une clé chiffrée et conservez l’empreinte d’hôte vérifiée séparément.",
  serversCount: (count: number) => count === 1 ? "1 serveur" : `${count} serveurs`,
  serversEmptyTitle: "Aucun serveur enregistré",
  serversEmptyBody: "Ajoutez une clé SSH, puis créez une fiche pour chaque VPS.",
  addServerTitle: "Ajouter un serveur",
  addServerHelp: "L’empreinte d’hôte doit être obtenue par un canal fiable avant la première connexion.",
  serverName: "Nom du serveur",
  serverNameExample: "Production Suisse",
  serverSshKey: "Clé SSH associée",
  chooseStoredKey: "Choisir une clé stockée",
  serverNeedsKey: "Importez d’abord une clé SSH dans la section Secrets.",
  saveServer: "Enregistrer le serveur",
  missingKey: "Clé introuvable",
  delete: "Supprimer",
  cancel: "Annuler",
  deletePermanently: "Supprimer définitivement",
  deleteKeyTitle: "Supprimer cette clé SSH ?",
  deleteKeyHelp: "Cette action retire définitivement la clé chiffrée. Une clé associée à un serveur ne peut pas être supprimée.",
  deleteServerTitle: "Supprimer ce serveur ?",
  deleteServerHelp: "La fiche du serveur sera supprimée. La clé SSH associée restera dans le coffre.",
  historyTitle: "Historique des sauvegardes",
  historyEmptyTitle: "Aucune sauvegarde créée",
  historyEmptyBody:
    "Créez une sauvegarde depuis un projet pour retrouver ici chaque version immuable.",
  historyEmptyAction: "Voir les projets",
  restoreVersion: "Restaurer cette version",
  restoreTitle: "Restaurer une sauvegarde",
  restoreHelp:
    "EnvVault prévisualise uniquement les chemins. Les valeurs restaurées ne sont ni affichées ni exécutées.",
  destinationFolder: "Dossier de destination",
  destinationExample: "/chemin/vers/un/dossier/vide",
  previewRestore: "Prévisualiser la restauration",
  restoreFilesTitle: "Fichiers à restaurer",
  existingFile: "Fichier existant",
  replaceFiles:
    "Remplacer les fichiers existants signalés dans cette liste",
  confirmPaths: "J’ai vérifié chaque chemin de destination",
  confirmOriginalPaths:
    "J’ai vérifié chaque chemin et je confirme la restauration dans le projet d’origine",
  restoreBackup: "Restaurer cette sauvegarde",
  restoreAndReplace: "Restaurer et remplacer les fichiers existants",
  settingsTitle: "Sécurité et récupération",
  languageTitle: "Langue de l’interface",
  languageHelp:
    "Ce choix est enregistré sur cet appareil et reste prioritaire au prochain démarrage.",
  languageFrench: "Français",
  languageEnglish: "English",
  privateIdentity: "Clé privée",
  privateIdentityBody: "Stockée dans le trousseau du système d’exploitation",
  recoveryTitle: "Clé de récupération",
  recoveryHelp:
    "La phrase secrète est transmise uniquement au processus Rust local, puis effacée du formulaire après chaque tentative.",
  recoveryPath: "Fichier de récupération",
  recoveryPathExample: "/support/séparé/envvault-recovery.age",
  passphrase: "Phrase secrète",
  passphraseHelp: "Utilisez au moins 12 caractères et conservez-la séparément.",
  confirmPassphrase: "Confirmer la phrase pour l’export",
  importRecovery: "Importer la clé de récupération",
  exportRecovery: "Exporter la clé de récupération",
  remoteTitle: "Stockage distant SFTP",
  remoteHelp:
    "Seuls des objets chiffrés sont transférés. Toute clé d’hôte inconnue ou modifiée est refusée.",
  remoteHost: "Hôte",
  remoteHostExample: "backup.exemple.test",
  remotePort: "Port",
  remoteUsername: "Nom d’utilisateur",
  remoteUsernameExample: "envvault",
  remoteFolder: "Dossier distant",
  remoteFolderExample: "/srv/envvault",
  privateKeyPath: "Clé SSH privée dédiée",
  privateKeyPathExample: "/chemin/vers/id_envvault_ed25519",
  hostFingerprint: "Empreinte de la clé d’hôte approuvée",
  hostFingerprintExample: "SHA256:empreinte-vérifiée-hors-bande",
  syncPull: "Récupérer les objets chiffrés",
  syncPush: "Envoyer les objets chiffrés",
  saveRemote: "Enregistrer la configuration",
  securityWarning:
    "EnvVault protège une copie volée du coffre ou du VPS. Il ne peut pas protéger les secrets si cet ordinateur est entièrement compromis pendant que le coffre est déverrouillé.",
  successInitialized:
    "Coffre créé. Exportez maintenant une clé de récupération chiffrée depuis les réglages.",
  successBackup: "Sauvegarde chiffrée créée.",
  successProject:
    "Projet ajouté. Créez sa première sauvegarde lorsque les fichiers sont prêts.",
  successSshKeyImport: "Clé SSH validée et chiffrée dans le coffre.",
  successSshKeyDelete: "Clé SSH supprimée du coffre.",
  successServer: "Serveur enregistré avec sa clé et son empreinte d’hôte.",
  successServerDelete: "Fiche serveur supprimée.",
  successVerify: "Vérification d’intégrité terminée.",
  successRestore:
    "Restauration terminée avec des permissions de fichier restrictives.",
  successRecoveryExport:
    "Fichier de récupération chiffré créé. Conservez-le séparément du coffre.",
  successRecoveryImport:
    "Clé de récupération importée dans le trousseau du système.",
  successRemote:
    "Stockage distant enregistré avec vérification stricte de la clé d’hôte.",
  successPull: "Objets chiffrés récupérés.",
  successPush: "Objets chiffrés envoyés.",
  errorLoad:
    "Impossible de charger l’état du coffre. Fermez puis rouvrez l’application. Si le problème persiste, vérifiez les permissions du dossier de données.",
  errorInitialize:
    "Impossible de créer le coffre. Vérifiez l’accès au trousseau et l’espace disponible, puis réessayez.",
  errorScan:
    "Impossible d’analyser ce dossier. Vérifiez que le chemin existe et que vous avez l’autorisation de le lire.",
  errorChooseProjectFolder:
    "Impossible d’ouvrir le sélecteur de dossiers. Réessayez ou saisissez le chemin manuellement.",
  errorChooseSshKey:
    "Impossible d’ouvrir le sélecteur de fichiers. Réessayez ou saisissez le chemin manuellement.",
  errorSshKeyImport:
    "Impossible d’importer cette clé. Utilisez une clé privée au format OpenSSH, lisible et inférieure à 128 Ko.",
  errorSshKeyDelete:
    "Impossible de supprimer cette clé. Supprimez d’abord les serveurs qui l’utilisent.",
  errorServer:
    "Impossible d’enregistrer ce serveur. Vérifiez les champs, la clé choisie et l’empreinte SHA256.",
  errorServerDelete: "Impossible de supprimer cette fiche serveur.",
  errorProject:
    "Impossible d’ajouter ce projet. Vérifiez le dossier et la sélection, puis réessayez.",
  errorBackup:
    "Impossible de créer la sauvegarde. Vérifiez que les fichiers sélectionnés sont encore lisibles.",
  errorVerify:
    "Impossible de vérifier le coffre. Vérifiez que la clé locale est disponible, puis réessayez.",
  errorRestorePreview:
    "Impossible de préparer la restauration. Vérifiez la destination et la version sélectionnée.",
  errorRestore:
    "Impossible de restaurer cette version. Vérifiez les collisions et les permissions du dossier de destination.",
  errorRecoveryExport:
    "Impossible d’exporter la clé. Vérifiez le chemin, confirmez une phrase d’au moins 12 caractères, puis réessayez.",
  errorRecoveryImport:
    "Impossible d’importer la clé. Vérifiez le fichier et la phrase secrète, puis réessayez.",
  errorRemote:
    "Impossible d’enregistrer le stockage distant. Vérifiez chaque champ et le chemin de la clé SSH.",
  errorPull:
    "Impossible de récupérer les objets chiffrés. Vérifiez la connexion, l’empreinte et les permissions distantes.",
  errorPush:
    "Impossible d’envoyer les objets chiffrés. Vérifiez la connexion, l’empreinte et les permissions distantes.",
  fieldProjectPath:
    "Indiquez un dossier de projet existant avant de lancer l’analyse.",
  fieldProjectSelection:
    "Choisissez un nom et au moins un fichier avant d’ajouter le projet.",
  fieldSshKey: "Choisissez un fichier de clé privée et donnez-lui un nom.",
  fieldServer: "Renseignez le nom, l’hôte, le port, l’utilisateur, la clé et une empreinte SHA256 vérifiée.",
  fieldRestoreDestination:
    "Indiquez un dossier de destination avant de prévisualiser la restauration.",
  fieldRecovery:
    "Indiquez un fichier et une phrase secrète d’au moins 12 caractères.",
  fieldRecoveryConfirmation:
    "Saisissez deux phrases secrètes identiques d’au moins 12 caractères.",
  fieldRemote:
    "Renseignez l’hôte, le port, l’utilisateur, les chemins et une empreinte SHA256 vérifiée.",
} satisfies Record<string, MessageValue>;

type CatalogShape<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => string
    ? (...args: A) => string
    : string;
};

export type Messages = CatalogShape<typeof fr>;
export type MessageKey = keyof Messages;

export const en: Messages = {
  productName: "EnvVault",
  brandMonogram: "AQ",
  brandSignature: "by Antoine Quarroz",
  loadingApp: "Opening EnvVault…",
  activity: "Operation in progress…",
  onboardingTitle: "Your environment files, under your control.",
  onboardingBody:
    "EnvVault encrypts selected .env files locally before they enter the vault. The private key stays in the operating-system keyring.",
  onboardingAction: "Create local vault",
  navOverview: "Overview",
  navProjects: "Projects",
  navAddProject: "Add project",
  navSecrets: "Secrets",
  navServers: "Servers",
  navHistory: "History",
  navSettings: "Settings",
  navRestore: "Restore",
  privacyTitle: "Local by default",
  privacyBody: "No secret values displayed",
  eyebrow: "LOCAL ENCRYPTED VAULT",
  refresh: "Refresh",
  vaultReady: "Vault ready",
  protectedProjects: (count: number) =>
    count === 1 ? "1 protected project" : `${count} protected projects`,
  lastBackup: (date: string) => `Last backup: ${date}`,
  noBackupSummary: "No backup yet. Add a project to begin.",
  addProject: "Add project",
  statBackups: "BACKUPS",
  statVersions: "Immutable versions",
  statSync: "SYNC",
  statReady: "Ready",
  statLocal: "Local",
  statRemoteConfigured: "SFTP storage configured",
  statNoRemote: "No remote storage configured",
  statIntegrity: "INTEGRITY",
  statusNotChecked: "Not checked",
  statusHealthy: "Healthy",
  statusIncomplete: "Incomplete",
  statusCorrupt: "Corrupt",
  statusWrongKey: "Wrong key",
  verifyNow: "Verify integrity",
  projectsTitle: "Projects",
  projectsEmptyTitle: "No protected projects",
  projectsEmptyBody:
    "Add a folder, review the detected .env files, then create its first backup.",
  filesCount: (count: number) => (count === 1 ? "1 file" : `${count} files`),
  bytesCount: (count: number) => `${count.toLocaleString("en-CH")} bytes`,
  createBackup: "Create backup",
  addProjectTitle: "Add a project",
  addProjectHelp:
    "Only detected .env files that you confirm will be added to the project.",
  projectFolder: "Project folder",
  projectFolderExample: "/path/to/project",
  chooseProjectFolder: "Choose folder",
  chooseProjectFolderTitle: "Choose the project folder",
  scanFolder: "Scan folder",
  projectName: "Project name",
  projectNameExample: "Marketing site",
  detectedFiles: "Detected files",
  detectedFilesHelp:
    "Review the selection. Templates stay off by default.",
  candidateFile: "Selected candidate",
  templateFile: "Template off by default",
  confirmProjectSelection: "Add selected project",
  secretsTitle: "Private SSH keys",
  secretsHelp: "Imported keys are validated, then encrypted inside the vault. Their contents are never returned to the interface.",
  keysCount: (count: number) => count === 1 ? "1 key" : `${count} keys`,
  secretsEmptyTitle: "No stored SSH keys",
  secretsEmptyBody: "Import an OpenSSH private key, then associate it with your servers.",
  importSshKeyTitle: "Import a key",
  importSshKeyHelp: "The source file is read locally. EnvVault stores an encrypted copy and does not modify the original.",
  sshKeyName: "Key name",
  sshKeyNameExample: "Production deployment",
  sshKeyFile: "Private-key file",
  sshKeyFileExample: "/Users/you/.ssh/id_ed25519",
  sshKeyFallbackName: "SSH key",
  chooseFile: "Choose file",
  chooseSshKeyTitle: "Choose an OpenSSH private key",
  importAndEncrypt: "Import and encrypt key",
  sourceKeyEncrypted: "passphrase-protected at source",
  sourceKeyPlain: "unencrypted at source",
  serversTitle: "VPS servers",
  serversHelp: "Associate each server with an encrypted key and retain its independently verified host fingerprint.",
  serversCount: (count: number) => count === 1 ? "1 server" : `${count} servers`,
  serversEmptyTitle: "No saved servers",
  serversEmptyBody: "Add an SSH key, then create a profile for each VPS.",
  addServerTitle: "Add a server",
  addServerHelp: "Obtain the host fingerprint through a trusted channel before the first connection.",
  serverName: "Server name",
  serverNameExample: "Swiss production",
  serverSshKey: "Associated SSH key",
  chooseStoredKey: "Choose a stored key",
  serverNeedsKey: "Import an SSH key in Secrets first.",
  saveServer: "Save server",
  missingKey: "Missing key",
  delete: "Delete",
  cancel: "Cancel",
  deletePermanently: "Delete permanently",
  deleteKeyTitle: "Delete this SSH key?",
  deleteKeyHelp: "This permanently removes the encrypted key. A key associated with a server cannot be deleted.",
  deleteServerTitle: "Delete this server?",
  deleteServerHelp: "The server profile will be deleted. Its associated SSH key will remain in the vault.",
  historyTitle: "Backup history",
  historyEmptyTitle: "No backups created",
  historyEmptyBody:
    "Create a backup from a project to keep each immutable version here.",
  historyEmptyAction: "View projects",
  restoreVersion: "Restore this version",
  restoreTitle: "Restore a backup",
  restoreHelp:
    "EnvVault previews paths only. It never displays or executes restored values.",
  destinationFolder: "Destination folder",
  destinationExample: "/path/to/an/empty/folder",
  previewRestore: "Preview restore",
  restoreFilesTitle: "Files to restore",
  existingFile: "Existing file",
  replaceFiles: "Replace the existing files identified in this list",
  confirmPaths: "I reviewed every destination path",
  confirmOriginalPaths:
    "I reviewed every path and confirm restoration into the original project",
  restoreBackup: "Restore this backup",
  restoreAndReplace: "Restore and replace existing files",
  settingsTitle: "Security and recovery",
  languageTitle: "Interface language",
  languageHelp:
    "This choice is saved on this device and remains in effect after restart.",
  languageFrench: "Français",
  languageEnglish: "English",
  privateIdentity: "Private key",
  privateIdentityBody: "Stored in the operating-system keyring",
  recoveryTitle: "Recovery key",
  recoveryHelp:
    "The passphrase is sent only to the local Rust process, then cleared from this form after every attempt.",
  recoveryPath: "Recovery file",
  recoveryPathExample: "/separate/media/envvault-recovery.age",
  passphrase: "Passphrase",
  passphraseHelp: "Use at least 12 characters and store it separately.",
  confirmPassphrase: "Confirm passphrase for export",
  importRecovery: "Import recovery key",
  exportRecovery: "Export recovery key",
  remoteTitle: "Remote SFTP storage",
  remoteHelp:
    "Only encrypted objects are transferred. Unknown or changed host keys are rejected.",
  remoteHost: "Host",
  remoteHostExample: "backup.example.test",
  remotePort: "Port",
  remoteUsername: "Username",
  remoteUsernameExample: "envvault",
  remoteFolder: "Remote folder",
  remoteFolderExample: "/srv/envvault",
  privateKeyPath: "Dedicated SSH private key",
  privateKeyPathExample: "/path/to/id_envvault_ed25519",
  hostFingerprint: "Trusted host-key fingerprint",
  hostFingerprintExample: "SHA256:verified-out-of-band",
  syncPull: "Pull encrypted objects",
  syncPush: "Push encrypted objects",
  saveRemote: "Save configuration",
  securityWarning:
    "EnvVault protects a stolen vault or VPS copy. It cannot protect secrets if this computer is fully compromised while the vault is unlocked.",
  successInitialized:
    "Vault created. Export an encrypted recovery key from Settings now.",
  successBackup: "Encrypted backup created.",
  successProject:
    "Project added. Create its first backup when the files are ready.",
  successSshKeyImport: "SSH key validated and encrypted inside the vault.",
  successSshKeyDelete: "SSH key deleted from the vault.",
  successServer: "Server saved with its key and host fingerprint.",
  successServerDelete: "Server profile deleted.",
  successVerify: "Integrity verification complete.",
  successRestore: "Restore completed with restrictive file permissions.",
  successRecoveryExport:
    "Encrypted recovery file created. Store it separately from the vault.",
  successRecoveryImport:
    "Recovery key imported into the operating-system keyring.",
  successRemote:
    "Remote storage saved with strict host-key verification.",
  successPull: "Encrypted objects pulled.",
  successPush: "Encrypted objects pushed.",
  errorLoad:
    "Unable to load the vault status. Close and reopen the app. If the problem continues, check the data-folder permissions.",
  errorInitialize:
    "Unable to create the vault. Check keyring access and available storage, then try again.",
  errorScan:
    "Unable to scan this folder. Check that the path exists and that you can read it.",
  errorChooseProjectFolder:
    "Unable to open the folder picker. Try again or enter the path manually.",
  errorChooseSshKey:
    "Unable to open the file picker. Try again or enter the path manually.",
  errorSshKeyImport:
    "Unable to import this key. Use a readable OpenSSH private key smaller than 128 KB.",
  errorSshKeyDelete:
    "Unable to delete this key. Delete the servers using it first.",
  errorServer:
    "Unable to save this server. Check the fields, selected key, and SHA256 fingerprint.",
  errorServerDelete: "Unable to delete this server profile.",
  errorProject:
    "Unable to add this project. Check the folder and selection, then try again.",
  errorBackup:
    "Unable to create the backup. Check that the selected files are still readable.",
  errorVerify:
    "Unable to verify the vault. Check that the local key is available, then try again.",
  errorRestorePreview:
    "Unable to prepare the restore. Check the destination and selected version.",
  errorRestore:
    "Unable to restore this version. Check collisions and destination-folder permissions.",
  errorRecoveryExport:
    "Unable to export the key. Check the path, confirm a passphrase of at least 12 characters, then try again.",
  errorRecoveryImport:
    "Unable to import the key. Check the file and passphrase, then try again.",
  errorRemote:
    "Unable to save remote storage. Check every field and the SSH key path.",
  errorPull:
    "Unable to pull encrypted objects. Check the connection, fingerprint, and remote permissions.",
  errorPush:
    "Unable to push encrypted objects. Check the connection, fingerprint, and remote permissions.",
  fieldProjectPath: "Enter an existing project folder before scanning.",
  fieldProjectSelection:
    "Choose a name and at least one file before adding the project.",
  fieldSshKey: "Choose a private-key file and give it a name.",
  fieldServer: "Enter the name, host, port, username, key, and a verified SHA256 fingerprint.",
  fieldRestoreDestination:
    "Enter a destination folder before previewing the restore.",
  fieldRecovery:
    "Enter a file and a passphrase containing at least 12 characters.",
  fieldRecoveryConfirmation:
    "Enter two matching passphrases containing at least 12 characters.",
  fieldRemote:
    "Enter the host, port, username, paths, and a verified SHA256 fingerprint.",
};

export const catalogs: Record<Locale, Messages> = { fr, en };
export const LANGUAGE_STORAGE_KEY = "envvault.locale";

type ArgsFor<K extends MessageKey> = Messages[K] extends (
  ...args: infer A
) => string
  ? A
  : [];

export type Translator = <K extends MessageKey>(
  key: K,
  ...args: ArgsFor<K>
) => string;

export function createTranslator(locale: Locale): Translator {
  return ((key: MessageKey, ...args: never[]) => {
    const message = catalogs[locale][key];
    return typeof message === "function" ? message(...args) : message;
  }) as Translator;
}

export type LanguageStorage = Pick<Storage, "getItem" | "setItem">;

export function loadLocale(storage?: LanguageStorage): Locale {
  try {
    const saved = storage?.getItem(LANGUAGE_STORAGE_KEY);
    return saved === "en" || saved === "fr" ? saved : "fr";
  } catch {
    return "fr";
  }
}

export function saveLocale(locale: Locale, storage?: LanguageStorage): void {
  try {
    storage?.setItem(LANGUAGE_STORAGE_KEY, locale);
  } catch {
    // The UI still switches for this session when storage is unavailable.
  }
}

export function dateLocale(locale: Locale): string {
  return locale === "fr" ? "fr-CH" : "en-CH";
}
