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

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileAlreadyExistsException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.PosixFileAttributes;
import java.nio.file.attribute.PosixFilePermission;
import java.nio.file.attribute.PosixFilePermissions;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

import org.apache.hugegraph.config.HugeConfig;
import org.apache.hugegraph.exception.ExternalException;
import org.apache.hugegraph.options.HubbleOptions;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/** Keeps the encryption root outside the H2 database and creates it only for new secrets. */
@Component
public class Text2GqlSecretStore {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final byte[] CONTEXT = "hubble-text2gql:v1".getBytes(StandardCharsets.UTF_8);
    private final Path keyFile;
    private final Function<String, String> environment;

    @Autowired
    public Text2GqlSecretStore(HugeConfig config) {
        this(Path.of(config.get(HubbleOptions.TEXT2GQL_SHARED_MASTER_KEY_FILE)), System::getenv);
    }

    Text2GqlSecretStore(Path keyFile, Function<String, String> environment) {
        this.keyFile = keyFile;
        this.environment = environment;
    }

    public synchronized String encrypt(String plaintext) {
        byte[] key = this.masterKey(true);
        try {
            byte[] nonce = new byte[12];
            RANDOM.nextBytes(nonce);
            Cipher cipher = cipher(Cipher.ENCRYPT_MODE, key, nonce);
            byte[] encrypted = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
            return "v1:" + Base64.getEncoder().encodeToString(
                    ByteBuffer.allocate(nonce.length + encrypted.length).put(nonce).put(encrypted).array());
        } catch (GeneralSecurityException exception) {
            throw unavailable();
        } finally {
            Arrays.fill(key, (byte) 0);
        }
    }

    public synchronized String decrypt(String encrypted) {
        byte[] key = this.masterKey(false);
        try {
            if (encrypted == null || !encrypted.startsWith("v1:") || encrypted.length() > 8192) {
                throw unavailable();
            }
            byte[] packed = Base64.getDecoder().decode(encrypted.substring(3));
            if (packed.length < 28) {
                throw unavailable();
            }
            byte[] nonce = Arrays.copyOf(packed, 12);
            return new String(cipher(Cipher.DECRYPT_MODE, key, nonce)
                    .doFinal(packed, 12, packed.length - 12), StandardCharsets.UTF_8);
        } catch (GeneralSecurityException | IllegalArgumentException exception) {
            throw unavailable();
        } finally {
            Arrays.fill(key, (byte) 0);
        }
    }

    private static Cipher cipher(int mode, byte[] key, byte[] nonce) throws GeneralSecurityException {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(mode, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, nonce));
        cipher.updateAAD(CONTEXT);
        return cipher;
    }

    private byte[] masterKey(boolean create) {
        try {
            String supplied = this.environment.apply("HUBBLE_TEXT2GQL_MASTER_KEY");
            if (supplied != null && !supplied.isBlank()) {
                return decodeKey(supplied.trim());
            }
            if (Files.notExists(this.keyFile, LinkOption.NOFOLLOW_LINKS)) {
                if (!create) {
                    throw unavailable();
                }
                this.createKeyFile();
            }
            return this.readKeyFile();
        } catch (IOException | IllegalArgumentException | UnsupportedOperationException | SecurityException exception) {
            throw unavailable();
        }
    }

    private byte[] readKeyFile() throws IOException {
        PosixFileAttributes before = secureAttributes(this.keyFile);
        byte[] encoded = new byte[129];
        try {
            int length;
            try (FileChannel channel = FileChannel.open(this.keyFile,
                    StandardOpenOption.READ, LinkOption.NOFOLLOW_LINKS)) {
                ByteBuffer buffer = ByteBuffer.wrap(encoded);
                while (buffer.hasRemaining() && channel.read(buffer) != -1) {
                    // Bound the read even if another process changes the file after the attribute check.
                }
                length = buffer.position();
                if (length > 128) {
                    throw unavailable();
                }
            }
            PosixFileAttributes after = secureAttributes(this.keyFile);
            if (!Objects.equals(before.fileKey(), after.fileKey()) ||
                !before.lastModifiedTime().equals(after.lastModifiedTime()) || before.size() != after.size()) {
                throw unavailable();
            }
            return decodeKey(new String(encoded, 0, length, StandardCharsets.US_ASCII).trim());
        } finally {
            Arrays.fill(encoded, (byte) 0);
        }
    }

    private static PosixFileAttributes secureAttributes(Path file) throws IOException {
        PosixFileAttributes attributes = Files.readAttributes(
                file, PosixFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
        Set<PosixFilePermission> allowed = Set.of(PosixFilePermission.OWNER_READ, PosixFilePermission.OWNER_WRITE);
        if (!attributes.isRegularFile() || attributes.size() > 128 ||
            !attributes.permissions().contains(PosixFilePermission.OWNER_READ) ||
            !allowed.containsAll(attributes.permissions())) {
            throw unavailable();
        }
        return attributes;
    }

    private void createKeyFile() throws IOException {
        Path parent = this.keyFile.toAbsolutePath().getParent();
        Files.createDirectories(parent);
        byte[] key = new byte[32];
        RANDOM.nextBytes(key);
        byte[] encoded = Base64.getEncoder().encode(key);
        Arrays.fill(key, (byte) 0);
        Path temporary = null;
        try {
            temporary = Files.createTempFile(parent, "." + this.keyFile.getFileName() + "-", ".tmp",
                    PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rw-------")));
            try (FileChannel channel = FileChannel.open(temporary,
                    StandardOpenOption.WRITE, LinkOption.NOFOLLOW_LINKS)) {
                ByteBuffer buffer = ByteBuffer.wrap(encoded);
                while (buffer.hasRemaining()) {
                    channel.write(buffer);
                }
                channel.force(true);
            }
            // A hard link publishes the complete inode atomically and never replaces an existing winner.
            // Unlike ATOMIC_MOVE, this has create-if-absent semantics across concurrent processes.
            Files.createLink(this.keyFile, temporary);
        } catch (FileAlreadyExistsException ignored) {
            // Another initializer published first. Read and validate its key instead of using ours.
        } finally {
            Arrays.fill(encoded, (byte) 0);
            if (temporary != null) {
                Files.deleteIfExists(temporary);
            }
        }
    }

    private static byte[] decodeKey(String encoded) {
        byte[] key = Base64.getDecoder().decode(encoded);
        if (key.length != 32) {
            Arrays.fill(key, (byte) 0);
            throw unavailable();
        }
        return key;
    }

    private static ExternalException unavailable() {
        return new ExternalException(503, "text2gql.shared.secret-unavailable");
    }
}
