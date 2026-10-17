/*
 *
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

package org.apache.hugegraph.service.query;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.LinkOption;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;

import org.apache.hugegraph.exception.ExternalException;
import org.junit.Assume;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

public class Text2GqlSecretStoreTest {

    @Rule
    public TemporaryFolder temporary = new TemporaryFolder();

    @Test
    public void testKeyIsLazyOwnerOnlyPersistentAndEncryptionUsesFreshNonces() throws Exception {
        Path file = this.temporary.getRoot().toPath().resolve("data/text2gql-master.key");
        Text2GqlSecretStore store = new Text2GqlSecretStore(file, ignored -> null);
        assertFalse(Files.exists(file));
        String encrypted = store.encrypt("private-model-key");
        assertFalse(encrypted.contains("private-model-key"));
        assertNotEquals(encrypted, store.encrypt("private-model-key"));
        assertEquals("private-model-key", store.decrypt(encrypted));
        assertEquals(32, Base64.getDecoder().decode(Files.readString(file)).length);
        if (Files.getFileStore(file).supportsFileAttributeView("posix")) {
            assertEquals(PosixFilePermissions.fromString("rw-------"), Files.getPosixFilePermissions(file));
        }
        byte[] master = Files.readAllBytes(file);
        Text2GqlSecretStore restarted = new Text2GqlSecretStore(file, ignored -> null);
        assertEquals("private-model-key", restarted.decrypt(encrypted));
        org.junit.Assert.assertArrayEquals(master, Files.readAllBytes(file));
    }

    @Test
    public void testMissingMasterNeverCreatesReplacementDuringDecryption() throws Exception {
        Path file = this.temporary.getRoot().toPath().resolve("master.key");
        Text2GqlSecretStore store = new Text2GqlSecretStore(file, ignored -> null);
        String encrypted = store.encrypt("private-model-key");
        Files.delete(file);
        assertUnavailable(() -> store.decrypt(encrypted));
        assertFalse(Files.exists(file));
    }

    @Test
    public void testEnvironmentKeyNeedsNoFileAndRejectsWrongKeyOrModifiedCiphertext() {
        Path file = this.temporary.getRoot().toPath().resolve("unused.key");
        String firstKey = Base64.getEncoder().encodeToString(new byte[32]);
        byte[] second = new byte[32];
        second[0] = 1;
        String secondKey = Base64.getEncoder().encodeToString(second);
        Text2GqlSecretStore first = new Text2GqlSecretStore(file, ignored -> firstKey);
        String encrypted = first.encrypt("private-model-key");
        assertFalse(Files.exists(file));
        Text2GqlSecretStore wrong = new Text2GqlSecretStore(file, ignored -> secondKey);
        assertUnavailable(() -> wrong.decrypt(encrypted));
        byte[] packed = Base64.getDecoder().decode(encrypted.substring(3));
        packed[packed.length - 1] ^= 1;
        assertUnavailable(() -> first.decrypt("v1:" + Base64.getEncoder().encodeToString(packed)));
        assertUnavailable(() -> new Text2GqlSecretStore(file, ignored -> "invalid-base64-key")
                .encrypt("private-model-key"));
        assertTrue(encrypted.startsWith("v1:"));
    }

    @Test
    public void testExistingKeyAllowsOwnerReadOnlyAndRejectsBroaderPermissions() throws Exception {
        Path file = this.temporary.getRoot().toPath().resolve("existing.key");
        Assume.assumeTrue(Files.getFileStore(this.temporary.getRoot().toPath()).supportsFileAttributeView("posix"));
        Files.writeString(file, Base64.getEncoder().encodeToString(new byte[32]));
        Files.setPosixFilePermissions(file, PosixFilePermissions.fromString("r--------"));
        Text2GqlSecretStore store = new Text2GqlSecretStore(file, ignored -> null);
        String encrypted = store.encrypt("private-model-key");
        assertEquals("private-model-key", store.decrypt(encrypted));
        for (String permissions : new String[]{"rw-r--r--", "rw-r-----", "rw----r--", "rwx------"}) {
            Files.setPosixFilePermissions(file, PosixFilePermissions.fromString(permissions));
            assertUnavailable(() -> store.encrypt("private-model-key"));
            assertUnavailable(() -> store.decrypt(encrypted));
        }
    }

    @Test
    public void testExistingAndDanglingSymbolicLinksAreNeverFollowed() throws Exception {
        Path directory = this.temporary.getRoot().toPath();
        Assume.assumeTrue(Files.getFileStore(directory).supportsFileAttributeView("posix"));
        Path target = directory.resolve("real.key");
        Files.writeString(target, Base64.getEncoder().encodeToString(new byte[32]));
        Files.setPosixFilePermissions(target, PosixFilePermissions.fromString("rw-------"));
        Path linked = directory.resolve("linked.key");
        Files.createSymbolicLink(linked, target);
        Text2GqlSecretStore linkedStore = new Text2GqlSecretStore(linked, ignored -> null);
        assertUnavailable(() -> linkedStore.encrypt("private-model-key"));
        assertTrue(Files.isSymbolicLink(linked));
        Path missing = directory.resolve("missing.key");
        Path dangling = directory.resolve("dangling.key");
        Files.createSymbolicLink(dangling, missing);
        assertUnavailable(() -> new Text2GqlSecretStore(dangling, ignored -> null).encrypt("private-model-key"));
        assertTrue(Files.isSymbolicLink(dangling));
        assertFalse(Files.exists(missing, LinkOption.NOFOLLOW_LINKS));
    }

    @Test
    public void testInterruptedInitializationDoesNotPublishPartialKeyOrLeaveTemporaryFile() throws Exception {
        Path directory = this.temporary.getRoot().toPath();
        Path file = directory.resolve("master.key");
        Text2GqlSecretStore store = new Text2GqlSecretStore(file, ignored -> null);
        Thread.currentThread().interrupt();
        try {
            assertUnavailable(() -> store.encrypt("private-model-key"));
        } finally {
            Thread.interrupted();
        }
        assertFalse(Files.exists(file, LinkOption.NOFOLLOW_LINKS));
        assertNoTemporaryFiles(directory);
        String encrypted = store.encrypt("private-model-key");
        assertEquals("private-model-key", store.decrypt(encrypted));
    }

    @Test
    public void testConcurrentProcessesPublishOneCompleteKeyWithoutOverwritingEachOther() throws Exception {
        Path directory = this.temporary.getRoot().toPath();
        Path master = directory.resolve("master.key");
        Path start = directory.resolve("start");
        List<Process> processes = new ArrayList<>();
        List<Path> readyFiles = new ArrayList<>();
        List<Path> results = new ArrayList<>();
        String classpath = System.getProperty("surefire.test.class.path", System.getProperty("java.class.path"));
        try {
            for (int i = 0; i < 3; i++) {
                Path ready = directory.resolve("ready-" + i);
                Path result = directory.resolve("ciphertext-" + i);
                readyFiles.add(ready);
                results.add(result);
                processes.add(new ProcessBuilder(Path.of(System.getProperty("java.home"), "bin", "java").toString(),
                        "-Xmx64m", "-XX:ActiveProcessorCount=2", "-cp", classpath,
                        Initializer.class.getName(), master.toString(), ready.toString(), start.toString(),
                        result.toString(), Integer.toString(i))
                        .redirectErrorStream(true).redirectOutput(directory.resolve("child-" + i + ".log").toFile())
                        .start());
            }
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(15);
            while (readyFiles.stream().anyMatch(path -> !Files.exists(path)) && System.nanoTime() < deadline) {
                Thread.sleep(10);
            }
            assertTrue("Child initializers must reach the common start gate",
                       readyFiles.stream().allMatch(Files::exists));
            assertFalse(Files.exists(master));
            Files.createFile(start);
            for (int i = 0; i < processes.size(); i++) {
                assertTrue("Child initialization must finish", processes.get(i).waitFor(20, TimeUnit.SECONDS));
                assertEquals(Files.readString(directory.resolve("child-" + i + ".log")),
                             0, processes.get(i).exitValue());
            }
            Text2GqlSecretStore reader = new Text2GqlSecretStore(master, ignored -> null);
            for (int i = 0; i < results.size(); i++) {
                assertEquals("child-secret-" + i, reader.decrypt(Files.readString(results.get(i))));
            }
            assertEquals(32, Base64.getDecoder().decode(Files.readString(master)).length);
            assertNoTemporaryFiles(directory);
        } finally {
            for (Process process : processes) {
                if (process.isAlive()) {
                    process.destroyForcibly();
                }
            }
        }
    }

    private static void assertNoTemporaryFiles(Path directory) throws Exception {
        try (Stream<Path> files = Files.list(directory)) {
            assertFalse(files.anyMatch(path -> path.getFileName().toString().endsWith(".tmp")));
        }
    }

    public static final class Initializer {

        public static void main(String[] args) throws Exception {
            Path master = Path.of(args[0]);
            Path ready = Path.of(args[1]);
            Path start = Path.of(args[2]);
            Path result = Path.of(args[3]);
            Files.createFile(ready);
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(20);
            while (!Files.exists(start)) {
                if (System.nanoTime() > deadline) {
                    throw new IllegalStateException("Initializer start gate timed out");
                }
                Thread.sleep(5);
            }
            Text2GqlSecretStore store = new Text2GqlSecretStore(master, ignored -> null);
            Files.writeString(result, store.encrypt("child-secret-" + args[4]));
        }
    }

    private static void assertUnavailable(Runnable action) {
        try {
            action.run();
            fail("Expected a safe secret-store failure");
        } catch (ExternalException exception) {
            assertEquals(503, exception.status());
            assertEquals("text2gql.shared.secret-unavailable", exception.getMessage());
            assertNull(exception.getCause());
        }
    }
}
