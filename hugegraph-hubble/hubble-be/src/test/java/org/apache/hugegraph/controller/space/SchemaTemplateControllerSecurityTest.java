/*
 *
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with this
 * work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with the
 * License. You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package org.apache.hugegraph.controller.space;

import java.util.Collections;

import org.junit.Test;
import org.mockito.Mockito;

import org.apache.hugegraph.config.HugeConfig;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.exception.ForbiddenException;
import org.apache.hugegraph.options.HubbleOptions;
import org.apache.hugegraph.service.auth.AuthModeService;
import org.apache.hugegraph.service.auth.UserService;
import org.apache.hugegraph.service.space.SchemaTemplateService;
import org.apache.hugegraph.structure.space.SchemaTemplate;
import org.apache.hugegraph.testutil.Assert;

public class SchemaTemplateControllerSecurityTest {

    @Test
    public void testCreateRequiresGraphSpaceWrite() {
        TestController controller = controller(true);
        controller.denyWrite();

        Assert.assertThrows(ForbiddenException.class, () ->
                controller.create("space", Mockito.mock(SchemaTemplate.class)));
    }

    @Test
    public void testUpdateRequiresGraphSpaceWrite() {
        TestController controller = controller(true);
        controller.denyWrite();

        Assert.assertThrows(ForbiddenException.class, () ->
                controller.update("space", "template",
                                  Mockito.mock(SchemaTemplate.class)));
    }

    @Test
    public void testDeleteRequiresGraphSpaceWrite() {
        TestController controller = controller(true);
        controller.denyWrite();

        Assert.assertThrows(ForbiddenException.class, () ->
                controller.delete("space", "template"));
    }

    @Test
    public void testOwnerCanUpdateAndDeleteTemplate() {
        TestController controller = controller(true);
        SchemaTemplate template = new SchemaTemplate("template", "schema");
        Mockito.when(controller.schemaTemplateService.get(
                     controller.client, "template"))
               .thenReturn(Collections.singletonMap("creator", "alice"));

        controller.update("space", "template", template);
        controller.delete("space", "template");

        Mockito.verify(controller.schemaTemplateService)
               .update(controller.client, template);
        Mockito.verify(controller.schemaTemplateService)
               .delete(controller.client, "template");
    }

    @Test
    public void testWriterCannotMutateAnotherUsersTemplate() {
        TestController controller = controller(true);
        Mockito.when(controller.schemaTemplateService.get(
                     controller.client, "template"))
               .thenReturn(Collections.singletonMap("creator", "bob"));

        Assert.assertThrows(ForbiddenException.class, () ->
                controller.update("space", "template",
                                  Mockito.mock(SchemaTemplate.class)));
        Assert.assertThrows(ForbiddenException.class, () ->
                controller.delete("space", "template"));
        Mockito.verify(controller.schemaTemplateService, Mockito.never())
               .update(Mockito.any(), Mockito.any());
        Mockito.verify(controller.schemaTemplateService, Mockito.never())
               .delete(Mockito.any(), Mockito.anyString());
    }

    @Test
    public void testGraphSpaceManagerCanMutateAnyTemplate() {
        TestController controller = controller(true);
        Mockito.when(controller.users.isAssignSpaceAdmin(
                     controller.client, "space"))
               .thenReturn(true);

        controller.delete("space", "template");

        Mockito.verify(controller.schemaTemplateService)
               .delete(controller.client, "template");
        Mockito.verify(controller.schemaTemplateService, Mockito.never())
               .get(Mockito.any(), Mockito.anyString());
    }

    @Test
    public void testGlobalAdministratorCanMutateAnyTemplate() {
        TestController controller = controller(true);
        Mockito.when(controller.users.isSuperAdmin(controller.client))
               .thenReturn(true);

        controller.delete("space", "template");

        Mockito.verify(controller.schemaTemplateService)
               .delete(controller.client, "template");
        Mockito.verify(controller.schemaTemplateService, Mockito.never())
               .get(Mockito.any(), Mockito.anyString());
    }

    @Test
    public void testAnonymousModeKeepsTemplateMutationAvailable() {
        TestController controller = controller(false);

        controller.delete("space", "template");

        Mockito.verify(controller.schemaTemplateService)
               .delete(controller.client, "template");
        Mockito.verifyNoInteractions(controller.users);
    }

    private static TestController controller(boolean authEnabled) {
        TestController controller = new TestController();
        HugeConfig config = Mockito.mock(HugeConfig.class);
        Mockito.when(config.get(HubbleOptions.PD_ENABLED)).thenReturn(true);
        controller.config = config;
        AuthModeService authMode = Mockito.mock(AuthModeService.class);
        Mockito.when(authMode.enabled()).thenReturn(authEnabled);
        Mockito.when(authMode.anonymous()).thenReturn(!authEnabled);
        controller.setAuthMode(authMode);
        controller.schemaTemplateService =
                Mockito.mock(SchemaTemplateService.class);
        return controller;
    }

    private static class TestController extends SchemaTemplateController {

        private final HugeClient client = Mockito.mock(HugeClient.class);
        private final UserService users = Mockito.mock(UserService.class);
        private boolean writeAllowed = true;

        private TestController() {
            this.userService = this.users;
        }

        public void setAuthMode(AuthModeService authMode) {
            this.authMode = authMode;
        }

        public void denyWrite() {
            this.writeAllowed = false;
        }

        @Override
        protected HugeClient requireGraphSpaceWrite(String graphSpace) {
            if (!this.writeAllowed) {
                throw new ForbiddenException(
                        "Permission denied: write graphspace resources");
            }
            return this.client;
        }

        @Override
        protected String getUser() {
            return "alice";
        }
    }
}
