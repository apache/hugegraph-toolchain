# Metadata storage

Hubble 1.8 requires Java 17 and uses Spring Boot 3 with H2 2.x only. MySQL remains available as a Loader source, but is no longer a Hubble metadata database. The default metadata URL is `jdbc:h2:file:./data/hubble-v2;DB_CLOSE_ON_EXIT=FALSE`. Schema initialization is idempotent, and restarting with this same database retains metadata.

## Upgrading

Start with a new H2 database when upgrading. Existing Hubble databases are not migrated, deleted or rewritten automatically. Keep the old database and its matching Hubble release together if you need to access old metadata; do not point the new release at the old database. For database-open errors, first verify the database version, credentials and file access; do not delete the old files. Before SQL initialization, Hubble opens an existing local database read-only and checks the release schema marker. Databases without that marker or with another schema version are refused without initializing or modifying them. The marker is written only after the complete new schema initializes successfully.

## Troubleshooting H2 error 90097

H2 error `90097` means an operation required a write while the database was open read-only. Hubble refuses startup when its read-only metadata check encounters this error. An interrupted first initialization is one possible cause, but the error alone does not prove that the database is empty or safe to remove.

1. Stop processes using this metadata database before investigating. Preserve the original database files and make a complete backup.
2. Check the Hubble/H2 versions, configured credentials, file permissions and whether the previous initialization completed. Do not put credentials or database contents into support logs.
3. If recovery is needed, have the operator evaluate it on an isolated backup copy with the matching H2 version. Opening a copy for writing may change it; Hubble does not switch the original database to write mode or recover it automatically. Keep the original files until recovery has been verified.
4. If the operator chooses to initialize fresh metadata instead, configure a new database path and retain the original database and its matching release. Existing metadata is not imported into the new database automatically.

## Connection settings

Metadata connections accept local H2 file and named memory URLs. Use a name such as `jdbc:h2:mem:metadata` for disposable tests; `jdbc:h2:mem` and `jdbc:h2:mem:` are rejected before opening a connection. With the default `DB_CLOSE_DELAY=0`, named memory metadata disappears when the last connection closes. Use a file URL to retain metadata across restarts. The file prefix can be omitted, for example `jdbc:h2:./data/hubble-v2`. Encrypted files using `CIPHER=AES` retain their cipher setting during the read-only compatibility check; configure the H2 file and user passwords through the password property. Other URL settings are excluded from that probe so they cannot run SQL or change the database before validation. Hikari pool settings are applied before validating the final connection. Use the JDBC URL, username and password directly; alternative DataSource/JNDI factories and DataSource properties are unsupported. URLs containing `INIT` are refused so connection creation cannot execute SQL before the compatibility check.
