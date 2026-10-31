# hugegraph-client

[![License](https://img.shields.io/badge/license-Apache%202-0E78BA.svg)](https://www.apache.org/licenses/LICENSE-2.0.html)
[![Build Status](https://github.com/apache/hugegraph-toolchain/actions/workflows/client-ci.yml/badge.svg)](https://github.com/apache/hugegraph-toolchain/actions/workflows/client-ci.yml)
[![codecov](https://codecov.io/gh/hugegraph/hugegraph-client/branch/master/graph/badge.svg)](https://codecov.io/gh/hugegraph/hugegraph-client)
[![Maven Central](https://img.shields.io/maven-central/v/org.apache.hugegraph/hugegraph-client)](https://mvnrepository.com/artifact/org.apache.hugegraph/hugegraph-client)

hugegraph-client is a Java-written client of [HugeGraph](https://github.com/apache/hugegraph), providing operations of graph, schema, gremlin, variables and traversals etc. All these operations are interpreted and translated into RESTful requests to HugeGraph Server. Besides, hugegraph-client also checks arguments, serializes and deserializes structures and encapsulates server exceptions.

## Features

- Graph Operation, CRUD of vertexes and edges, batch load of vertexes and edges
- Schema Operation, CRUD of vertex label, edge label, index label and property key
- Gremlin Traversal Statements
- RESTful Traversals, shortest path, k-out, k-neighbor, paths and crosspoints etc.
- Variables, CRUD of variables

## JSON lists

`JsonUtil.fromJson2List(json, Element.class)` deserializes a JSON array into a
`List<Element>` using the client's shared Jackson mapper. For example,
`JsonUtil.fromJson2List("[1, 2]", Integer.class)` returns a list of integers.
An empty array returns an empty list, JSON `null` returns Java `null`, and null
array elements are preserved. A null input string throws `IllegalArgumentException`;
malformed JSON, non-array input, or incompatible element values throw
`SerializeException` with the original Jackson exception as the cause.

## Doc

The [client homepage](https://hugegraph.apache.org/docs/quickstart/hugegraph-client/) contains more information about it.

## Licence
The same as HugeGraph, hugegraph-client is also licensed under Apache 2.0 License.

### Copy a graph Schema

`client.graphs().cloneSchema(target, source, nickname)` creates a graph in the
current GraphSpace and copies its Schema on a Server supporting the synchronous
`schema-clone` endpoint (API 0.73 or later). Sources with any edge labels are
currently rejected before target creation. It does not copy graph data or cross GraphSpaces.
Older Servers reject the endpoint. After an error, inspect the target before
retrying because a partially initialized graph may remain.
