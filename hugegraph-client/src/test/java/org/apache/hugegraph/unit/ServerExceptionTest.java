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

package org.apache.hugegraph.unit;

import java.util.List;

import org.apache.hugegraph.exception.ServerException;
import org.apache.hugegraph.testutil.Assert;
import org.junit.Test;

import okhttp3.MediaType;
import okhttp3.Protocol;
import okhttp3.Request;
import okhttp3.ResponseBody;

public class ServerExceptionTest extends BaseUnitTest {

    @Test
    public void testFromResponseWithStandardKeys() {
        String body = "{\"exception\": \"java.lang.IllegalArgumentException\"," +
                      "\"message\": \"Invalid vertex id\"," +
                      "\"cause\": \"caused by bad input\"," +
                      "\"trace\": [\"a.b.C.method(C.java:1)\"]}";

        ServerException e = ServerException.fromResponse(response(400, body));

        Assert.assertEquals(400, e.status());
        Assert.assertEquals("java.lang.IllegalArgumentException", e.exception());
        Assert.assertEquals("Invalid vertex id", e.message());
        Assert.assertEquals("Invalid vertex id", e.getMessage());
        Assert.assertEquals("caused by bad input", e.cause());
        Assert.assertEquals("caused by bad input", e.getCause().toString());
        Assert.assertEquals("a.b.C.method(C.java:1)", ((List<?>) e.trace()).get(0));
        Assert.assertEquals("java.lang.IllegalArgumentException: Invalid vertex id",
                            e.toString());
    }

    @Test
    public void testFromResponseWithAlternativeKeys() {
        String body = "{\"Exception-Class\": \"NotFoundException\"," +
                      "\"message\": \"Not found\"," +
                      "\"exceptions\": \"nested\"," +
                      "\"stackTrace\": \"trace text\"}";

        ServerException e = ServerException.fromResponse(response(404, body));

        Assert.assertEquals(404, e.status());
        Assert.assertEquals("NotFoundException", e.exception());
        Assert.assertEquals("Not found", e.message());
        Assert.assertEquals("nested", e.cause());
        Assert.assertEquals("trace text", e.trace());
    }

    @Test
    public void testFromResponseWithNonJsonBody() {
        String body = "<html><body>502 Bad Gateway</body></html>";

        ServerException e = ServerException.fromResponse(response(502, body));

        // The raw body is kept as message when it can't be parsed as json
        Assert.assertEquals(502, e.status());
        Assert.assertEquals(body, e.getMessage());
        Assert.assertNull(e.exception());
        Assert.assertNull(e.cause());
        Assert.assertNull(e.getCause());
        Assert.assertNull(e.trace());
    }

    @Test
    public void testFromResponseWithEmptyBody() {
        ServerException e = ServerException.fromResponse(response(500, ""));

        Assert.assertEquals(500, e.status());
        Assert.assertEquals("", e.getMessage());
        Assert.assertNull(e.exception());
        Assert.assertNull(e.getCause());
    }

    @Test
    public void testFromResponseWithEmptyCause() {
        String body = "{\"exception\": \"E\", \"message\": \"m\", \"cause\": \"\"}";

        ServerException e = ServerException.fromResponse(response(400, body));

        Assert.assertEquals("", e.cause());
        Assert.assertNull(e.getCause());
    }

    @Test
    public void testFromResponseWithoutKnownKeys() {
        ServerException e = ServerException.fromResponse(response(400, "{\"k\": 1}"));

        // Pins current behavior: a json body without "message" leaves no message

        Assert.assertEquals(400, e.status());
        Assert.assertNull(e.exception());
        Assert.assertNull(e.message());
        Assert.assertNull(e.cause());
        Assert.assertNull(e.trace());
    }

    @Test
    public void testFormattedMessage() {
        ServerException e = new ServerException("Invalid %s '%s'", "id", 1);

        Assert.assertEquals("Invalid id '1'", e.getMessage());
        Assert.assertEquals(0, e.status());
        Assert.assertNull(e.getCause());
    }

    private static okhttp3.Response response(int code, String body) {
        Request request = new Request.Builder().url("http://127.0.0.1:1/graphs")
                                               .build();
        return new okhttp3.Response.Builder()
                .request(request)
                .protocol(Protocol.HTTP_1_1)
                .code(code)
                .message("status")
                .body(ResponseBody.create(MediaType.parse("application/json"), body))
                .build();
    }
}
