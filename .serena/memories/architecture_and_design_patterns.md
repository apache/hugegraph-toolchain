# Architecture and extension points

```text
HugeGraph Server
       ▲
       │ REST APIs
HugeGraph Java Client
  ├─ Loader pipeline
  ├─ Hubble backend and frontend
  ├─ Tools commands
  └─ Spark connector
```

## Start points

- Client managers and builders: `hugegraph-client/src/main/java/`
- Loader sources, readers and mapping pipeline: `hugegraph-loader/src/main/java/`
- Hubble backend: `hugegraph-hubble/hubble-be/`
- Hubble frontend: `hugegraph-hubble/hubble-fe/`
- CLI command managers: `hugegraph-tools/src/main/java/`
- Spark DataSource implementation: `hugegraph-spark-connector/src/main/`

Follow existing interfaces and factories within the owning module. Do not infer a universal pattern from one component or copy a complete class inventory into this memory; search the current source before designing an extension.
