# HugeGraph-Tools

HugeGraph-Tools is a customizable command line utility for deploying, managing and backing up/restoring graphs from HugeGraph database.

## Main Functions

- Deploy and clear HugeGraph-Server and HugeGraph-Studio automatically.
- Manage graphs and query with Gremlin from multiple HugeGraph databases easily.
- Backup/restore graph schema and graph data from/to HugeGraph databases conveniently, also support backup periodically

## Learn More

The [tools homepage](https://hugegraph.apache.org/docs/quickstart/hugegraph-tools/) contains more information about it. 

## Testing

The `BackupRestoreTest` functional tests clear the `hugegraph` graph. Run them only against a disposable server instance, explicitly selected with `-Dtools.test.disposable=true`. This applies even when `tools.test.url` is set. Without that opt-in, these tests skip before creating a client. Their default backup path uses Hadoop's `file:///` filesystem; `tools.test.hdfs` can select a separate filesystem fixture.

## License

HugeGraph-Tools is licensed under Apache 2.0 License.
