/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with this
 * work for additional information regarding copyright ownership. The ASF
 * licenses this file to You under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations
 * under the License.
 */

package org.apache.hugegraph.loader.test.unit;

import java.io.File;
import java.io.IOException;
import java.lang.reflect.Field;
import java.util.Collections;
import java.util.HashMap;

import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.driver.HugeClientBuilder;
import org.apache.hugegraph.loader.builder.SchemaCache;
import org.apache.hugegraph.loader.constant.ElemType;
import org.apache.hugegraph.loader.exception.LoadException;
import org.apache.hugegraph.loader.executor.LoadContext;
import org.apache.hugegraph.loader.executor.LoadOptions;
import org.apache.hugegraph.loader.failure.FailLogger;
import org.apache.hugegraph.loader.mapping.InputStruct;
import org.apache.hugegraph.loader.metrics.LoadSummary;
import org.apache.hugegraph.loader.progress.LoadProgress;
import org.apache.hugegraph.loader.source.file.FileSource;
import org.junit.Assert;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class LoadContextTest {

    @Rule
    public TemporaryFolder folder = new TemporaryFolder();

    @Test
    public void testOfflineContextDoesNotCreateClientsOrSaveProgress() throws IOException {
        LoadOptions options = new LoadOptions();
        options.host = null;
        options.direct = true;
        options.file = this.folder.newFile("offline.json").getAbsolutePath();
        SchemaCache schemaCache = new SchemaCache(Collections.emptyList(),
                                                  Collections.emptyList(),
                                                  Collections.emptyList());
        LoadContext context = LoadContext.forOffline(options, schemaCache);
        Assert.assertSame(schemaCache, context.schemaCache());
        Assert.assertNull(context.client());
        Assert.assertNull(context.indirectClient());
        Assert.assertNotNull(context.filterGroup());
        context.close();
        context.close();
        Assert.assertTrue(context.closed());
        Assert.assertFalse(new File(LoadProgress.format(options, context.timestamp())).exists());
    }

    @Test
    public void testCloseDistinctClientsOnce() throws Exception {
        RecordingClient client = allocate(RecordingClient.class);
        RecordingClient indirect = allocate(RecordingClient.class);
        LoadContext context = this.context(client, indirect);
        context.close();
        context.close();
        Assert.assertEquals(1, client.closeCalls);
        Assert.assertEquals(1, indirect.closeCalls);
        Assert.assertTrue(context.closed());
    }

    @Test
    public void testCloseSharedClientOnce() throws Exception {
        RecordingClient client = allocate(RecordingClient.class);
        LoadContext context = this.context(client, client);
        context.close();
        context.close();
        Assert.assertEquals(1, client.closeCalls);
    }

    @Test
    public void testCloseIndirectClientWhenPrimaryCloseFails() throws Exception {
        RecordingClient client = allocate(RecordingClient.class);
        RecordingClient indirect = allocate(RecordingClient.class);
        client.closeFailure = "Primary close failed";
        LoadContext context = this.context(client, indirect);
        try {
            context.close();
            Assert.fail("Expected primary close failure");
        } catch (IllegalStateException expected) {
            Assert.assertEquals("Primary close failed", expected.getMessage());
            Assert.assertEquals(0, expected.getSuppressed().length);
        }
        assertClosedWithoutRetrying(context, client, indirect);
    }

    @Test
    public void testCloseRemainsClosedWhenSecondaryCloseFails() throws Exception {
        RecordingClient client = allocate(RecordingClient.class);
        RecordingClient indirect = allocate(RecordingClient.class);
        indirect.closeFailure = "Indirect close failed";
        LoadContext context = this.context(client, indirect);
        try {
            context.close();
            Assert.fail("Expected indirect close failure");
        } catch (IllegalStateException expected) {
            Assert.assertEquals("Indirect close failed", expected.getMessage());
            Assert.assertEquals(0, expected.getSuppressed().length);
        }
        assertClosedWithoutRetrying(context, client, indirect);
    }

    @Test
    public void testPreservePrimaryFailureWhenBothClosesFail() throws Exception {
        RecordingClient client = allocate(RecordingClient.class);
        RecordingClient indirect = allocate(RecordingClient.class);
        client.closeFailure = "Primary close failed";
        indirect.closeFailure = "Indirect close failed";
        LoadContext context = this.context(client, indirect);
        try {
            context.close();
            Assert.fail("Expected primary close failure");
        } catch (IllegalStateException expected) {
            Assert.assertEquals("Primary close failed", expected.getMessage());
            Assert.assertEquals(1, expected.getSuppressed().length);
            Assert.assertEquals("Indirect close failed", expected.getSuppressed()[0].getMessage());
        }
        assertClosedWithoutRetrying(context, client, indirect);
    }

    @Test
    public void testLoggerFailureClosesClientsWithoutSavingProgress() throws Exception {
        RecordingClient client = allocate(RecordingClient.class);
        RecordingClient indirect = allocate(RecordingClient.class);
        client.closeFailure = "Primary close failed";
        indirect.closeFailure = "Indirect close failed";
        LoadContext context = this.context(client, indirect);
        FileSource source = new FileSource();
        source.header(new String[]{"name"});
        InputStruct struct = new InputStruct(null, null);
        struct.id("broken");
        struct.input(source);
        FailLogger logger = allocate(FailLogger.class);
        set(logger, "struct", struct);
        set(logger, "file", this.folder.newFile("broken.error"));
        // A directory at the header's file path makes the actual header write fail.
        this.folder.newFolder("broken.header");
        HashMap<String, FailLogger> loggers = new HashMap<>();
        loggers.put("broken", logger);
        set(context, "loggers", loggers);
        try {
            context.close();
            Assert.fail("Expected failure logger close failure");
        } catch (LoadException expected) {
            Assert.assertTrue(expected.getMessage().contains("Failed to write header"));
            Assert.assertTrue(expected.getCause() instanceof IOException);
            Assert.assertEquals(2, expected.getSuppressed().length);
            Assert.assertEquals("Primary close failed", expected.getSuppressed()[0].getMessage());
            Assert.assertEquals("Indirect close failed", expected.getSuppressed()[1].getMessage());
        }
        Assert.assertTrue(context.closed());
        context.close();
        Assert.assertEquals(1, client.closeCalls);
        Assert.assertEquals(1, indirect.closeCalls);
        Assert.assertEquals(0L, context.newProgress().vertexLoaded());
        Assert.assertEquals(0L, context.newProgress().edgeLoaded());
        Assert.assertFalse(new File(LoadProgress.format(context.options(), "test")).exists());
    }

    @Test
    public void testProgressFailureStillClosesBothClients() throws Exception {
        RecordingClient client = allocate(RecordingClient.class);
        RecordingClient indirect = allocate(RecordingClient.class);
        client.closeFailure = "Primary close failed";
        indirect.closeFailure = "Indirect close failed";
        LoadContext context = this.context(client, indirect);
        context.options().file = "invalid-mapping-suffix";
        try {
            context.close();
            Assert.fail("Expected invalid mapping filename");
        } catch (IllegalArgumentException expected) {
            Assert.assertTrue(expected.getMessage().contains("mapping description file name"));
            Assert.assertEquals(2, expected.getSuppressed().length);
            Assert.assertEquals("Primary close failed", expected.getSuppressed()[0].getMessage());
            Assert.assertEquals("Indirect close failed", expected.getSuppressed()[1].getMessage());
        }
        assertClosedWithoutRetrying(context, client, indirect);
    }

    private static void assertClosedWithoutRetrying(LoadContext context, RecordingClient client,
                                                  RecordingClient indirect) {
        Assert.assertTrue(context.closed());
        context.close();
        Assert.assertEquals(1, client.closeCalls);
        Assert.assertEquals(1, indirect.closeCalls);
        Assert.assertEquals(2L, context.newProgress().vertexLoaded());
        Assert.assertEquals(3L, context.newProgress().edgeLoaded());
    }

    private LoadContext context(HugeClient client, HugeClient indirect) throws Exception {
        // Match the existing TaskManagerTest allocation seam: no network clients.
        LoadContext context = allocate(LoadContext.class);
        LoadOptions options = new LoadOptions();
        options.file = this.folder.newFile("mapping.json").getAbsolutePath();
        set(context, "timestamp", "test");
        set(context, "options", options);
        LoadSummary summary = new LoadSummary();
        summary.plusLoaded(ElemType.VERTEX, 2);
        summary.plusLoaded(ElemType.EDGE, 3);
        set(context, "summary", summary);
        set(context, "newProgress", new LoadProgress());
        set(context, "loggers", new HashMap<>());
        set(context, "client", client);
        set(context, "indirectClient", indirect);
        return context;
    }

    private static <T> T allocate(Class<T> type) throws Exception {
        Class<?> unsafeClass = Class.forName("sun.misc.Unsafe");
        Field field = unsafeClass.getDeclaredField("theUnsafe");
        field.setAccessible(true);
        return type.cast(unsafeClass.getMethod("allocateInstance", Class.class)
                                    .invoke(field.get(null), type));
    }

    private static void set(Object target, String name, Object value) throws Exception {
        Field field = target.getClass().getDeclaredField(name);
        field.setAccessible(true);
        field.set(target, value);
    }

    private static class RecordingClient extends HugeClient {

        private int closeCalls;
        private String closeFailure;

        private RecordingClient() {
            super((HugeClientBuilder) null);
        }

        @Override
        public void close() {
            this.closeCalls++;
            if (this.closeFailure != null) {
                throw new IllegalStateException(this.closeFailure);
            }
        }
    }
}
