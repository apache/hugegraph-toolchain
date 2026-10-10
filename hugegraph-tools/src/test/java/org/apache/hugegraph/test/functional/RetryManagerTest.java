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

package org.apache.hugegraph.test.functional;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import org.apache.hugegraph.base.RetryManager;
import org.apache.hugegraph.base.ToolClient;
import org.apache.hugegraph.exception.ToolsException;
import org.junit.After;
import org.junit.Assert;
import org.junit.Before;
import org.junit.Test;

import com.sun.net.httpserver.HttpServer;

public class RetryManagerTest {

    private RetryManager manager;
    private HttpServer server;

    @Before
    public void setup() throws Exception {
        this.server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        this.server.createContext("/versions", exchange -> {
            byte[] body = "{\"versions\":{\"core\":\"1.8.0\",\"api\":\"0.71\"}}"
                          .getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            try (java.io.OutputStream output = exchange.getResponseBody()) {
                output.write(body);
            }
        });
        this.server.start();
        String url = "http://127.0.0.1:" + this.server.getAddress().getPort();
        ToolClient.ConnectionInfo info = new ToolClient.ConnectionInfo(
                url, "hugegraph", null, null, 1000, null, null);
        this.manager = new RetryManager(info, "test");
        this.manager.threadsNum(1);
        this.manager.initExecutors();
    }

    @After
    public void teardown() {
        if (this.manager != null) {
            this.manager.shutdown("test");
            this.manager.close();
        }
        this.server.stop(0);
    }

    @Test(timeout = 10000)
    public void testFailuresWaitForRemainingTasks() {
        IllegalArgumentException first = new IllegalArgumentException("first failure");
        IllegalStateException second = new IllegalStateException("second failure");
        AtomicBoolean completed = new AtomicBoolean();
        this.manager.submit(() -> {
            throw first;
        });
        this.manager.submit(() -> {
            throw second;
        });
        this.manager.submit(() -> completed.set(true));
        try {
            this.manager.awaitTasks();
            Assert.fail("Task failures must reach the caller");
        } catch (ToolsException e) {
            Assert.assertSame(first, e.getCause());
            Assert.assertArrayEquals(new Throwable[]{second}, e.getSuppressed());
            Assert.assertTrue(completed.get());
        }
        this.manager.awaitTasks();
    }

    @Test(timeout = 10000)
    public void testInterruptedWaitDrainsTasksAndPreservesInterrupt() throws Exception {
        CountDownLatch release = new CountDownLatch(1);
        CountDownLatch started = new CountDownLatch(1);
        AtomicBoolean completed = new AtomicBoolean();
        AtomicBoolean interrupted = new AtomicBoolean();
        AtomicReference<Throwable> failure = new AtomicReference<>();
        this.manager.submit(() -> {
            started.countDown();
            try {
                release.await();
                completed.set(true);
            } catch (InterruptedException e) {
                throw new AssertionError(e);
            }
        });
        Assert.assertTrue(started.await(5, TimeUnit.SECONDS));
        Thread waiter = new Thread(() -> {
            Thread.currentThread().interrupt();
            try {
                this.manager.awaitTasks();
            } catch (Throwable e) {
                failure.set(e);
            } finally {
                this.manager.shutdown("test");
                interrupted.set(Thread.currentThread().isInterrupted());
            }
        });
        waiter.start();
        try {
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
            while (waiter.getState() != Thread.State.WAITING &&
                   waiter.isAlive() && System.nanoTime() < deadline) {
                Thread.yield();
            }
            Assert.assertEquals(Thread.State.WAITING, waiter.getState());
        } finally {
            release.countDown();
            waiter.join(5000);
        }
        Assert.assertFalse(waiter.isAlive());
        Assert.assertTrue(completed.get());
        Assert.assertTrue(interrupted.get());
        Assert.assertTrue(failure.get() instanceof ToolsException);
        Assert.assertTrue(failure.get().getCause() instanceof InterruptedException);
        this.manager.awaitTasks();
    }

    @Test
    public void testRetrySucceedsAfterTransientFailures() {
        AtomicInteger attempts = new AtomicInteger();
        this.manager.retry(2);

        String result = this.manager.retry(() -> {
            if (attempts.incrementAndGet() < 3) {
                throw new IllegalStateException("transient failure");
            }
            return "done";
        }, "testing retry");

        Assert.assertEquals("done", result);
        Assert.assertEquals(3, attempts.get());
    }

    @Test
    public void testRetryFailsAfterExhaustingRetries() {
        AtomicInteger attempts = new AtomicInteger();
        IllegalStateException failure = new IllegalStateException("permanent failure");
        this.manager.retry(2);

        try {
            this.manager.retry(() -> {
                attempts.incrementAndGet();
                throw failure;
            }, "testing retry");
            Assert.fail("Exhausted retries must fail");
        } catch (ToolsException e) {
            Assert.assertSame(failure, e.getCause());
            Assert.assertTrue(e.getMessage(),
                              e.getMessage().contains("testing retry(after 2 retries)"));
        }
        Assert.assertEquals(3, attempts.get());
    }

    @Test
    public void testNoRetryByDefault() {
        AtomicInteger attempts = new AtomicInteger();
        Assert.assertEquals(0, this.manager.retry());

        try {
            this.manager.retry(() -> {
                attempts.incrementAndGet();
                throw new IllegalStateException("failure");
            }, "testing retry");
            Assert.fail("Failure without retry must fail");
        } catch (ToolsException e) {
            Assert.assertTrue(e.getCause() instanceof IllegalStateException);
        }
        Assert.assertEquals(1, attempts.get());
    }

    @Test
    public void testThreadsNumIgnoresNonPositiveValues() {
        Assert.assertEquals(1, this.manager.threadsNum());
        this.manager.threadsNum(0);
        Assert.assertEquals(1, this.manager.threadsNum());
        this.manager.threadsNum(-1);
        Assert.assertEquals(1, this.manager.threadsNum());
        this.manager.threadsNum(3);
        Assert.assertEquals(3, this.manager.threadsNum());
    }
}
